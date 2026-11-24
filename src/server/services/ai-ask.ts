import { SOURCE_TYPE_LABELS } from "@/domain/labels";
import { share } from "@/domain/metrics";
import type { Project } from "@/domain/types";
import { formatDateTime, formatPercent } from "@/lib/format";
import { RANGE_PRESETS, type RangeKey } from "@/lib/time";
import { clipText } from "../ai/prompt";
import { getAiProvider } from "../ai/provider";
import { AiError, type AiProvider } from "../ai/types";
import { listMentions } from "../repositories/mentions";
import { getOverview, type Overview } from "./overview";

/**
 * Düz yazıyla soru: kullanıcının sorusu, dönemin hesaplanmış ölçümleri ve en
 * yeni içerikleriyle birlikte dil modeline gönderilir. Model yalnızca verilen
 * ölçüm ve içeriklere dayanır; yanıt saklanmaz, dayanak içerikler bağlanır.
 */

/** Tek soruda modele gönderilen en çok içerik. */
export const ASK_MENTION_LIMIT = 100;
export const QUESTION_MAX_LENGTH = 300;

export type AskOutcome =
  { ok: true; answer: string; evidenceIds: string[]; model: string; mentionsSent: number } | { ok: false; reason: "disabled" | "empty" | "invalid" | "failed"; message: string };

/** Modele verilen ölçüm dökümü. Sayıların tek kaynağı budur; model başka sayı kullanmamalıdır. */
export function buildFacts(overview: Overview): string {
  const { summary, previousSummary } = overview;
  const lines = [
    `Toplam içerik: ${summary.total}${previousSummary ? ` (önceki eşit dönemde ${previousSummary.total})` : " (önceki dönem kapsam dışında)"}`,
    `Ton: olumsuz ${summary.negative} (${formatPercent(share(summary.negative, summary.total))}), nötr ${summary.neutral}, olumlu ${summary.positive} (${formatPercent(share(summary.positive, summary.total))})`,
    "Platformlar:",
    ...overview.platforms.map(
      (row) => `- ${row.key === "__news" ? "Haber siteleri" : row.key}: ${row.total} içerik; olumsuz ${row.negative}, nötr ${row.neutral}, olumlu ${row.positive}`,
    ),
  ];
  const topics = overview.topics.filter((topic) => topic.total > 0).slice(0, 10);
  if (topics.length > 0) {
    lines.push("Konular:", ...topics.map((topic) => `- ${topic.name}: ${topic.total} içerik; olumsuz ${topic.negative}, olumlu ${topic.positive}`));
  }
  if (overview.stories.length > 0) {
    lines.push("En çok yayılan başlıklar:", ...overview.stories.map((story) => `- ${story.title} (${story.publications} yayın, ${story.sources} kaynak)`));
  }
  lines.push(
    overview.anomalies.length > 0 ? "Olağan dışı hareketler:" : "Olağan dışı hareket: yok",
    ...overview.anomalies
      .slice(0, 8)
      .map(
        (anomaly) =>
          `- ${formatDateTime(anomaly.bucketStart)}: ${anomaly.observed} içerik (olağan düzey ${Math.round(anomaly.baseline)}), olumsuz oranı ${formatPercent(anomaly.negativeShare)}`,
      ),
  );
  return lines.join("\n");
}

export async function askQuestion(project: Project, rangeKey: RangeKey, question: string, now: number, provider: AiProvider | null = getAiProvider()): Promise<AskOutcome> {
  if (!provider) return { ok: false, reason: "disabled", message: "Soru sorma bu kurulumda kapalı." };
  const text = question.trim();
  if (text.length < 3) return { ok: false, reason: "invalid", message: "Sorunuzu yazın." };
  if (text.length > QUESTION_MAX_LENGTH) return { ok: false, reason: "invalid", message: `Soru en çok ${QUESTION_MAX_LENGTH} karakter olabilir.` };

  const overview = await getOverview(project, rangeKey, now);
  const mentions = await listMentions({ projectId: project.id, range: overview.range }, { limit: ASK_MENTION_LIMIT, offset: 0 }, "recent");
  if (mentions.length === 0) return { ok: false, reason: "empty", message: "Bu dönemde soruya dayanak olacak içerik yok." };

  try {
    const draft = await provider.answer({
      projectName: project.name,
      query: project.query,
      rangeLabel: RANGE_PRESETS[rangeKey].label,
      facts: buildFacts(overview),
      question: text,
      items: mentions.map((mention, index) => ({
        number: index + 1,
        source: SOURCE_TYPE_LABELS[mention.sourceType],
        publishedAt: mention.publishedAt,
        text: clipText(mention.content.startsWith(mention.title) ? mention.content : `${mention.title}. ${mention.content}`),
      })),
    });
    return {
      ok: true,
      answer: draft.answer.trim(),
      // Model, gönderilmeyen bir numarayı dayanak gösterirse o gönderme atılır.
      evidenceIds: [...new Set(draft.mentionNumbers)].flatMap((number) => {
        const mention = Number.isInteger(number) ? mentions[number - 1] : undefined;
        return mention ? [mention.id] : [];
      }),
      model: provider.model,
      mentionsSent: mentions.length,
    };
  } catch (error) {
    return { ok: false, reason: "failed", message: error instanceof AiError ? error.message : "Soru yanıtlanırken beklenmeyen bir hata oluştu." };
  }
}
