import { SOURCE_TYPE_LABELS } from "@/domain/labels";
import type { Project } from "@/domain/types";
import { RANGE_PRESETS, resolveRange, type RangeKey } from "@/lib/time";
import { clipText } from "../ai/prompt";
import { getAiProvider } from "../ai/provider";
import { AiError, type AiProvider } from "../ai/types";
import { saveAiSummary, type AiSummary } from "../repositories/ai-summaries";
import { countMentions, listMentions, type MentionFilter } from "../repositories/mentions";

/**
 * Yapay zekâ özeti: seçili dönemin en yeni içeriklerini etkin sağlayıcıya
 * gönderir ve sonucu, kaç içerikten üretildiğiyle birlikte saklar.
 * Yalnızca kullanıcı istediğinde çalışır; sayfa açılışında çağrılmaz.
 */

/** Tek özette modele gönderilen en çok içerik (maliyet ve bağlam tavanı). */
export const SUMMARY_MENTION_LIMIT = 120;

export type AiSummaryOutcome = { ok: true; summary: AiSummary } | { ok: false; reason: "disabled" | "empty" | "failed"; message: string };

export async function generateAiSummary(project: Project, rangeKey: RangeKey, now: number, provider: AiProvider | null = getAiProvider()): Promise<AiSummaryOutcome> {
  if (!provider) return { ok: false, reason: "disabled", message: "Yapay zekâ özeti bu kurulumda kapalı." };

  const range = resolveRange(rangeKey, now);
  const filter: MentionFilter = { projectId: project.id, range };
  const mentions = await listMentions(filter, { limit: SUMMARY_MENTION_LIMIT, offset: 0 }, "recent");
  if (mentions.length === 0) return { ok: false, reason: "empty", message: "Bu dönemde özetlenecek içerik yok." };

  const items = mentions.map((mention, index) => ({
    number: index + 1,
    source: SOURCE_TYPE_LABELS[mention.sourceType],
    publishedAt: mention.publishedAt,
    text: clipText(mention.content.startsWith(mention.title) ? mention.content : `${mention.title}. ${mention.content}`),
  }));

  try {
    const draft = await provider.summarize({
      projectName: project.name,
      query: project.query,
      rangeLabel: RANGE_PRESETS[rangeKey].label,
      items,
    });
    const summary = await saveAiSummary({
      workspaceId: project.workspaceId,
      projectId: project.id,
      rangeKey,
      range,
      provider: provider.id,
      model: provider.model,
      summary: draft.summary.trim(),
      // Model, gönderilmeyen bir numarayı kanıt gösterirse o gönderme atılır.
      themes: draft.themes.map((theme) => ({
        title: theme.title.trim(),
        description: theme.description.trim(),
        mentionIds: [...new Set(theme.mentionNumbers)].flatMap((number) => {
          const mention = Number.isInteger(number) ? mentions[number - 1] : undefined;
          return mention ? [mention.id] : [];
        }),
      })),
      mentionsSent: mentions.length,
      mentionsTotal: await countMentions(filter),
      inputTokens: draft.inputTokens,
      outputTokens: draft.outputTokens,
      createdAt: now,
    });
    return { ok: true, summary };
  } catch (error) {
    const message = error instanceof AiError ? error.message : "Özet oluşturulurken beklenmeyen bir hata oluştu.";
    return { ok: false, reason: "failed", message };
  }
}
