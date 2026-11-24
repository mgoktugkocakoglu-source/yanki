import { SOURCE_TYPE_LABELS } from "@/domain/labels";
import { SENTIMENTS, type Mention, type Project, type Sentiment } from "@/domain/types";
import { resolveRange, type RangeKey } from "@/lib/time";
import { clipText } from "../ai/prompt";
import { getAiProvider } from "../ai/provider";
import { AiError, type AiProvider, type ClassifyDraft } from "../ai/types";
import { countAiClassified, countMentions, listUnclassified, saveAiClassifications, type AiClassification, type MentionFilter } from "../repositories/mentions";
import { listTopics } from "../repositories/projects";

/**
 * Dil modeliyle ton ve konu sınıflandırması. Seçili dönemin henüz
 * sınıflandırılmamış içeriklerini gruplar hâlinde etkin sağlayıcıya gönderir.
 * Yalnızca kullanıcı istediğinde çalışır. Kural tabanlı sonuç ve insan
 * düzeltmesi silinmez; geçerli ton sırası `effectiveSentiment` içindedir.
 */

/** Tek çalıştırmada gönderilen en çok içerik (maliyet ve süre tavanı). */
export const CLASSIFY_RUN_LIMIT = 300;
/** Tek istekteki içerik sayısı. */
export const CLASSIFY_BATCH_SIZE = 30;
/** Aynı anda süren istek sayısı. */
const CONCURRENCY = 3;

export type ClassifyOutcome =
  | {
      ok: true;
      model: string;
      /** Modele gönderilen içerik sayısı. */
      sent: number;
      classified: number;
      /** Dil modelinin tonu kural tabanlı sonuçtan farklı çıkan içerik sayısı. */
      toneChanged: number;
      /** Kural tabanlı eşleşmede olmayan, yeni eklenen konu eşleşmeleri. */
      topicsAdded: number;
      failedBatches: number;
      /** Dönemde hâlâ sınıflandırılmamış içerik sayısı. */
      remaining: number;
      inputTokens: number | null;
      outputTokens: number | null;
    }
  | { ok: false; reason: "disabled" | "empty" | "failed"; message: string };

function isSentiment(value: string): value is Sentiment {
  return (SENTIMENTS as readonly string[]).includes(value);
}

function chunk<Item>(items: Item[], size: number): Item[][] {
  const chunks: Item[][] = [];
  for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size));
  return chunks;
}

/** Model yanıtını doğrular: bilinmeyen numara, geçersiz ton ve yinelenen sonuç atılır. */
function readResults(draft: ClassifyDraft, batch: Mention[], topicIds: string[]): AiClassification[] {
  const seen = new Set<string>();
  const classifications: AiClassification[] = [];
  for (const result of draft.results) {
    const mention = Number.isInteger(result.number) ? batch[result.number - 1] : undefined;
    if (!mention || seen.has(mention.id) || !isSentiment(result.sentiment)) continue;
    seen.add(mention.id);
    const topics = [...new Set(result.topicNumbers)].flatMap((number) => {
      const topicId = Number.isInteger(number) ? topicIds[number - 1] : undefined;
      return topicId ? [topicId] : [];
    });
    classifications.push({ mentionId: mention.id, sentiment: result.sentiment, topicIds: topics });
  }
  return classifications;
}

export async function classifyMentions(project: Project, rangeKey: RangeKey, now: number, provider: AiProvider | null = getAiProvider()): Promise<ClassifyOutcome> {
  if (!provider) return { ok: false, reason: "disabled", message: "Yapay zekâ sınıflandırması bu kurulumda kapalı." };

  const filter: MentionFilter = { projectId: project.id, range: resolveRange(rangeKey, now) };
  const mentions = await listUnclassified(filter, CLASSIFY_RUN_LIMIT);
  if (mentions.length === 0) return { ok: false, reason: "empty", message: "Bu dönemde sınıflandırılmamış içerik kalmadı." };

  const topics = await listTopics(project.id);
  const topicIds = topics.map((topic) => topic.id);
  const byId = new Map(mentions.map((mention) => [mention.id, mention]));
  const batches = chunk(mentions, CLASSIFY_BATCH_SIZE);

  let classified = 0;
  let toneChanged = 0;
  let topicsAdded = 0;
  let failedBatches = 0;
  let inputTokens: number | null = 0;
  let outputTokens: number | null = 0;
  let lastError = "";

  const runBatch = async (batch: Mention[]): Promise<void> => {
    try {
      const draft = await provider.classify({
        projectName: project.name,
        query: project.query,
        topics: topics.map((topic, index) => ({ number: index + 1, group: topic.groupName, name: topic.name })),
        items: batch.map((mention, index) => ({
          number: index + 1,
          source: SOURCE_TYPE_LABELS[mention.sourceType],
          text: clipText(mention.content.startsWith(mention.title) ? mention.content : `${mention.title}. ${mention.content}`),
        })),
      });
      const results = readResults(draft, batch, topicIds);
      await saveAiClassifications(results, provider.classifyModel, now);
      for (const result of results) {
        const mention = byId.get(result.mentionId)!;
        classified += 1;
        if (result.sentiment !== mention.sentiment) toneChanged += 1;
        topicsAdded += result.topicIds.filter((topicId) => !mention.topicIds.includes(topicId)).length;
      }
      inputTokens = inputTokens === null || draft.inputTokens === null ? null : inputTokens + draft.inputTokens;
      outputTokens = outputTokens === null || draft.outputTokens === null ? null : outputTokens + draft.outputTokens;
    } catch (error) {
      failedBatches += 1;
      lastError = error instanceof AiError ? error.message : "Sınıflandırma sırasında beklenmeyen bir hata oluştu.";
    }
  };

  for (const group of chunk(batches, CONCURRENCY)) {
    await Promise.all(group.map(runBatch));
  }

  if (classified === 0) return { ok: false, reason: "failed", message: lastError || "Model hiçbir içerik için geçerli sonuç döndürmedi." };

  return {
    ok: true,
    model: provider.classifyModel,
    sent: mentions.length,
    classified,
    toneChanged,
    topicsAdded,
    failedBatches,
    remaining: (await countMentions(filter)) - (await countAiClassified(filter)),
    inputTokens,
    outputTokens,
  };
}
