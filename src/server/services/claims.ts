import { SOURCE_TYPE_LABELS } from "@/domain/labels";
import type { Mention, Project } from "@/domain/types";
import { RANGE_PRESETS, resolveRange, type RangeKey } from "@/lib/time";
import { clipText } from "../ai/prompt";
import { getAiProvider } from "../ai/provider";
import { AiError, type AiProvider } from "../ai/types";
import { FactCheckUnavailableError, isFactCheckConfigured, searchFactChecks, type FactCheck, type FactCheckSearch } from "../factcheck/google";
import { saveClaimRun, type Claim, type ClaimRun, type FactCheckStatus } from "../repositories/claims";
import { countMentions, listMentions, type MentionFilter } from "../repositories/mentions";

/**
 * İddia taraması (dezenformasyonla mücadele, ilk adım).
 *
 * 1. Dil modeli, dönemin içeriklerinden kontrol edilebilir olgusal iddiaları
 *    çıkarır ve aynı iddianın farklı anlatımlarını tek başlıkta toplar.
 * 2. Her iddia için yayımlanmış doğrulamalar aranır (Google Fact Check Tools).
 * 3. Dil modeli, bulunan adaylardan gerçekten aynı iddiayı inceleyenleri seçer.
 *
 * Yankı "doğru" ya da "yanlış" hükmü vermez. Hükmü veren, adı ve bağlantısı
 * gösterilen doğrulama kuruluşudur; eşleşme yoksa karar analisttedir.
 */

/** Tek taramada modele gönderilen en çok içerik. */
export const CLAIM_MENTION_LIMIT = 150;
/** Tek taramada tutulan en çok iddia. */
export const CLAIM_LIMIT = 12;
/** İddia başına en çok doğrulama araması. */
const SEARCHES_PER_CLAIM = 2;

export type ClaimScanOutcome = { ok: true; run: ClaimRun } | { ok: false; reason: "disabled" | "empty" | "failed"; message: string };

function platformOf(mention: Mention): string {
  return mention.sourceType === "news" ? "Haber siteleri" : mention.sourceName;
}

export async function scanClaims(
  project: Project,
  rangeKey: RangeKey,
  now: number,
  provider: AiProvider | null = getAiProvider(),
  search: FactCheckSearch | null = isFactCheckConfigured() ? searchFactChecks : null,
): Promise<ClaimScanOutcome> {
  if (!provider) return { ok: false, reason: "disabled", message: "İddia taraması bu kurulumda kapalı." };

  const range = resolveRange(rangeKey, now);
  const filter: MentionFilter = { projectId: project.id, range };
  const mentions = await listMentions(filter, { limit: CLAIM_MENTION_LIMIT, offset: 0 }, "recent");
  if (mentions.length === 0) return { ok: false, reason: "empty", message: "Bu dönemde taranacak içerik yok." };

  try {
    const draft = await provider.extractClaims({
      projectName: project.name,
      query: project.query,
      rangeLabel: RANGE_PRESETS[rangeKey].label,
      items: mentions.map((mention, index) => ({
        number: index + 1,
        source: SOURCE_TYPE_LABELS[mention.sourceType],
        publishedAt: mention.publishedAt,
        text: clipText(mention.content.startsWith(mention.title) ? mention.content : `${mention.title}. ${mention.content}`),
      })),
    });

    // Model, gönderilmeyen bir numarayı dayanak gösterirse o gönderme atılır; dayanağı kalmayan iddia tutulmaz.
    const extracted = draft.claims
      .map((claim) => ({
        text: claim.text.trim(),
        queries: claim.searchQueries.map((query) => query.trim()).filter(Boolean).slice(0, SEARCHES_PER_CLAIM),
        mentions: [...new Set(claim.mentionNumbers)].flatMap((number) => {
          const mention = Number.isInteger(number) ? mentions[number - 1] : undefined;
          return mention ? [mention] : [];
        }),
      }))
      .filter((claim) => claim.text.length > 0 && claim.mentions.length > 0)
      .sort((a, b) => b.mentions.length - a.mentions.length)
      .slice(0, CLAIM_LIMIT);

    // Yayımlanmış doğrulama adayları.
    let status: FactCheckStatus = search ? "ok" : "disabled";
    let message: string | null = null;
    const candidates: FactCheck[][] = extracted.map(() => []);
    if (search) {
      outer: for (const [index, claim] of extracted.entries()) {
        for (const query of claim.queries) {
          try {
            for (const check of await search(query)) {
              if (!candidates[index].some((entry) => entry.url === check.url)) candidates[index].push(check);
            }
          } catch (error) {
            status = "error";
            message = error instanceof FactCheckUnavailableError ? error.message : "Doğrulama araması sırasında bir hata oluştu.";
            // Kalıcı bir sorunda (API kapalı, kota) kalan aramalar da başarısız olur; durulur.
            if (error instanceof FactCheckUnavailableError) break outer;
          }
        }
      }
    }

    // Adaylardan gerçekten aynı iddiayı inceleyenler.
    const matched: FactCheck[][] = extracted.map(() => []);
    if (candidates.some((list) => list.length > 0)) {
      const matchDraft = await provider.matchFactChecks({
        claims: extracted.flatMap((claim, index) =>
          candidates[index].length === 0
            ? []
            : [
                {
                  number: index + 1,
                  text: claim.text,
                  candidates: candidates[index].map((check, candidateIndex) => ({
                    number: candidateIndex + 1,
                    claimText: clipText(check.claimText, 300),
                    title: clipText(check.title, 200),
                    publisher: check.publisherName,
                    rating: clipText(check.rating, 80),
                  })),
                },
              ],
        ),
      });
      for (const match of matchDraft.matches) {
        const list = Number.isInteger(match.claimNumber) ? candidates[match.claimNumber - 1] : undefined;
        if (!list) continue;
        for (const number of new Set(match.candidateNumbers)) {
          const check = Number.isInteger(number) ? list[number - 1] : undefined;
          if (check && !matched[match.claimNumber - 1].includes(check)) matched[match.claimNumber - 1].push(check);
        }
      }
    }

    const claims: Array<Omit<Claim, "id">> = extracted.map((claim, index) => {
      const platforms: Record<string, number> = {};
      for (const mention of claim.mentions) platforms[platformOf(mention)] = (platforms[platformOf(mention)] ?? 0) + 1;
      return {
        text: claim.text,
        mentionIds: claim.mentions.map((mention) => mention.id),
        firstSeenAt: Math.min(...claim.mentions.map((mention) => mention.publishedAt)),
        platforms,
        checks: matched[index],
      };
    });

    const run = await saveClaimRun({
          workspaceId: project.workspaceId,
          projectId: project.id,
          rangeKey,
          range,
          model: provider.model,
          mentionsSent: mentions.length,
          mentionsTotal: await countMentions(filter),
          factCheckStatus: status,
          factCheckMessage: message,
          createdAt: now,
          claims,
        });
    return { ok: true, run };
  } catch (error) {
    const message = error instanceof AiError ? error.message : "İddia taraması sırasında beklenmeyen bir hata oluştu.";
    return { ok: false, reason: "failed", message };
  }
}
