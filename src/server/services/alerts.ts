import { SOURCE_TYPE_LABELS } from "@/domain/labels";
import type { Project, SourceType, TimeRange } from "@/domain/types";
import { TURKISH_STOPWORDS } from "@/lib/analysis/language";
import { formatDecimal, formatNumber, formatPercent } from "@/lib/format";
import { tryParseQuery, type QueryNode } from "@/lib/query";
import { DAILY_OPTIONS, detectAnomalies, HOURLY_OPTIONS, type Anomaly, type Sensitivity } from "@/lib/stats/anomaly";
import { tokenizeWithSpans } from "@/lib/text/normalize";
import { bucketSizeMs, bucketStart, enumerateBuckets, type Bucket } from "@/lib/time";
import { earliestPublishedAt, listSearchTexts, listTexts, type MentionFilter } from "../repositories/mentions";
import { breakdown, timeSeries, topicBreakdown, topStories, type StoryRow } from "../repositories/metrics";
import { listTopics } from "../repositories/projects";

/**
 * Olağan dışı hareketler ve "neden oldu?" açıklaması.
 *
 * Açıklama bir dil modeli çıktısı değildir: sıçrama kovası ile önceki
 * dönemin karşılaştırılmasından hesaplanır ve her parçası listede
 * doğrulanabilir (kaynak payı, yayılan başlık, konu, ayırt edici kelimeler).
 */

export interface AnomalyExplanation {
  /** Artışa en çok katkı veren kaynak türleri. */
  sources: Array<{ sourceType: SourceType; label: string; count: number; excessShare: number }>;
  stories: StoryRow[];
  topics: Array<{ name: string; count: number; share: number }>;
  /** Olağan döneme göre belirgin biçimde öne çıkan kelimeler. */
  terms: string[];
  /** Tek cümlelik özet. */
  headline: string;
}

export interface ExplainedAnomaly extends Anomaly {
  bucket: Bucket;
  range: TimeRange;
  explanation: AnomalyExplanation;
}

const BASELINE_BUCKETS: Record<Bucket, number> = { day: 14, hour: 7 * 24 };
const MAX_TERMS = 5;
const MIN_TERM_LENGTH = 4;
const TERM_SAMPLE = 800;
const BASELINE_SAMPLE = 3000;

function anomalyOptions(bucket: Bucket) {
  return bucket === "day" ? DAILY_OPTIONS : HOURLY_OPTIONS;
}

/**
 * Seçili dönemdeki anomaliler. Taban çizgisi için dönemin öncesi de okunur,
 * ancak projenin kapsam başlangıcından geriye gidilmez: veri toplanmayan
 * günler "sıfır" sayılırsa yeni açılan her projede ilk günler sahte alarm verir.
 */
export async function findAnomalies(projectId: string, range: TimeRange, bucket: Bucket, sensitivity: Sensitivity = "medium"): Promise<Anomaly[]> {
  const coverageStart = await earliestPublishedAt(projectId);
  if (coverageStart === null) return [];

  const options = { ...anomalyOptions(bucket), sensitivity };
  const historyMs = options.window * options.seasonLength * bucketSizeMs(bucket);
  const extended: TimeRange = { from: Math.max(range.from - historyMs, bucketStart(coverageStart, bucket)), to: range.to };
  if (extended.from >= extended.to) return [];

  const observed = new Map((await timeSeries({ projectId, range: extended }, bucket)).map((point) => [point.bucketStart, point]));
  const series = enumerateBuckets(extended, bucket).map((bucketStart) => ({
    bucketStart,
    total: observed.get(bucketStart)?.total ?? 0,
    negative: observed.get(bucketStart)?.negative ?? 0,
  }));

  return detectAnomalies(series, options).filter((anomaly) => anomaly.bucketStart >= range.from);
}

function brandTokens(ast: QueryNode, into: Set<string> = new Set()): Set<string> {
  switch (ast.kind) {
    case "text":
      ast.tokens.forEach((token) => into.add(token));
      break;
    case "near":
      [...ast.left, ...ast.right].forEach((node) => node.tokens.forEach((token) => into.add(token)));
      break;
    case "and":
    case "or":
      ast.children.forEach((child) => brandTokens(child, into));
      break;
    case "not":
    case "field":
      break;
  }
  return into;
}

/** Kovada, olağan döneme göre belirgin biçimde daha sık geçen kelimeler. */
async function distinctiveTerms(project: Project, bucketFilter: MentionFilter, baselineFilter: MentionFilter): Promise<string[]> {
  const parsed = tryParseQuery(project.query);
  const excluded = parsed.ok ? brandTokens(parsed.ast) : new Set<string>();

  const documentFrequency = new Map<string, number>();
  const surfaceForms = new Map<string, Map<string, number>>();
  // Aynı haberin kırk yayını tek belge sayılır; yoksa tek bir başlığın
  // kelimeleri "öne çıkan" görünür.
  const documents = [...new Map((await listTexts(bucketFilter, TERM_SAMPLE)).map((entry) => [entry.storyKey, entry])).values()];

  for (const { title, content } of documents) {
    const text = `${title} ${content}`;
    const seen = new Set<string>();
    for (const span of tokenizeWithSpans(text)) {
      const { token } = span;
      if (token.length < MIN_TERM_LENGTH || /^\d+$/.test(token) || TURKISH_STOPWORDS.has(token) || excluded.has(token)) continue;
      if (!seen.has(token)) {
        seen.add(token);
        documentFrequency.set(token, (documentFrequency.get(token) ?? 0) + 1);
      }
      const surface = text.slice(span.start, span.end).toLocaleLowerCase("tr-TR");
      const forms = surfaceForms.get(token) ?? new Map<string, number>();
      forms.set(surface, (forms.get(surface) ?? 0) + 1);
      surfaceForms.set(token, forms);
    }
  }

  const baseline = await listSearchTexts(baselineFilter, BASELINE_SAMPLE);
  const baselineFrequency = new Map<string, number>();
  for (const { searchText } of baseline) {
    for (const token of new Set(searchText.split(" "))) {
      if (documentFrequency.has(token)) baselineFrequency.set(token, (baselineFrequency.get(token) ?? 0) + 1);
    }
  }

  const minimumFrequency = Math.max(3, Math.ceil(documents.length * 0.08));
  return [...documentFrequency.entries()]
    .filter(([, frequency]) => frequency >= minimumFrequency)
    .map(([token, frequency]) => {
      const rate = frequency / documents.length;
      const baselineRate = ((baselineFrequency.get(token) ?? 0) + 1) / (baseline.length + 1);
      return { token, lift: rate / baselineRate, weight: (rate / baselineRate) * Math.log(1 + frequency) };
    })
    .filter((entry) => entry.lift >= 2)
    .sort((a, b) => b.weight - a.weight)
    .slice(0, MAX_TERMS)
    .map(({ token }) => {
      const forms = [...(surfaceForms.get(token) ?? new Map<string, number>()).entries()];
      forms.sort((a, b) => b[1] - a[1]);
      return forms[0]?.[0] ?? token;
    });
}

function buildHeadline(anomaly: Anomaly, explanation: Omit<AnomalyExplanation, "headline">): string {
  const parts: string[] = [];

  if (anomaly.kinds.includes("volume")) {
    parts.push(
      anomaly.baseline >= 1
        ? `Hacim olağan düzeyin ${formatDecimal(anomaly.observed / anomaly.baseline)} katı (${formatNumber(anomaly.observed)}; olağan ${formatNumber(Math.round(anomaly.baseline))}).`
        : `Olağan dönemde neredeyse hiç bahsetme yokken ${formatNumber(anomaly.observed)} bahsetme geldi.`,
    );
  } else {
    parts.push(
      `Hacim olağan, ancak olumsuz oranı ${formatPercent(anomaly.baselineNegativeShare)} düzeyinden ${formatPercent(anomaly.negativeShare)} düzeyine çıktı.`,
    );
  }

  const leadSource = explanation.sources[0];
  if (leadSource && leadSource.excessShare >= 0.35) {
    parts.push(`Artışta en büyük pay: ${leadSource.label.toLocaleLowerCase("tr-TR")} (${formatPercent(leadSource.excessShare)}).`);
  }
  const leadStory = explanation.stories[0];
  if (leadStory && leadStory.publications >= 3) {
    parts.push(`En çok yayılan başlık ${formatNumber(leadStory.publications)} yayında yer aldı.`);
  } else if (explanation.topics[0]) {
    parts.push(`Öne çıkan konu: ${explanation.topics[0].name}.`);
  }
  return parts.join(" ");
}

export async function explainAnomaly(project: Project, anomaly: Anomaly, bucket: Bucket): Promise<ExplainedAnomaly> {
  const size = bucketSizeMs(bucket);
  const range: TimeRange = { from: anomaly.bucketStart, to: anomaly.bucketStart + size };
  const baselineRange: TimeRange = { from: range.from - BASELINE_BUCKETS[bucket] * size, to: range.from };
  const bucketFilter: MentionFilter = { projectId: project.id, range };
  const baselineFilter: MentionFilter = { projectId: project.id, range: baselineRange };

  // Kaynak türü katkısı: kovadaki sayı ile olağan dönemin kova başına ortalaması arasındaki fark.
  const baselineBySource = new Map((await breakdown(baselineFilter, "sourceType", 20)).map((row) => [row.key, row.total / BASELINE_BUCKETS[bucket]]));
  const excesses = (await breakdown(bucketFilter, "sourceType", 20)).map((row) => ({
    sourceType: row.key as SourceType,
    count: row.total,
    excess: Math.max(0, row.total - (baselineBySource.get(row.key) ?? 0)),
  }));
  const totalExcess = excesses.reduce((sum, entry) => sum + entry.excess, 0);
  const sources = excesses
    .map(({ sourceType, count, excess }) => ({
      sourceType,
      label: SOURCE_TYPE_LABELS[sourceType] ?? sourceType,
      count,
      excessShare: totalExcess > 0 ? excess / totalExcess : 0,
    }))
    .sort((a, b) => b.excessShare - a.excessShare)
    .slice(0, 3);

  const topicNames = new Map((await listTopics(project.id)).map((topic) => [topic.id, topic.name]));
  const topics = (await topicBreakdown(bucketFilter))
    .slice(0, 3)
    .map((row) => ({ name: topicNames.get(row.topicId) ?? "?", count: row.total, share: row.total / Math.max(1, anomaly.observed) }));

  const partial = {
    sources,
    stories: await topStories(bucketFilter, 3),
    topics,
    terms: await distinctiveTerms(project, bucketFilter, baselineFilter),
  };
  return { ...anomaly, bucket, range, explanation: { ...partial, headline: buildHeadline(anomaly, partial) } };
}

const LEVEL_ORDER = { critical: 0, attention: 1, info: 2 } as const;

/** En ciddi anomaliler önce; aynı düzeyde olağandan en çok sapan öne geçer. */
export function rankAnomalies(anomalies: Anomaly[]): Anomaly[] {
  return [...anomalies].sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level] || b.score - a.score);
}
