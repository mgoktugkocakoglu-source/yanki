import { SOURCE_TYPE_LABELS } from "@/domain/labels";
import { netTone, share } from "@/domain/metrics";
import type { Mention, Project, SourceType, TimeRange } from "@/domain/types";
import { formatChange, formatDateTime, formatDayLong, formatDecimal, formatNumber, formatPercent, formatSigned } from "@/lib/format";
import { bucketSizeMs, enumerateBuckets, previousRange, RANGE_PRESETS, resolveRange, type Bucket, type RangeKey } from "@/lib/time";
import { earliestPublishedAt, latestCollectedAt, listMentions, type MentionFilter } from "../repositories/mentions";
import {
  breakdown,
  type BreakdownRow,  summarize,
  timeSeries,
  timeSeriesBySourceType,
  topicBreakdown,
  topStories,
  type SeriesPoint,
  type StoryRow,
  type Summary,
  type ToneCounts,
} from "../repositories/metrics";
import { listTopics } from "../repositories/projects";
import type { Anomaly } from "@/lib/stats/anomaly";
import { explainAnomaly, findAnomalies, rankAnomalies, type ExplainedAnomaly } from "./alerts";

/**
 * Genel bakış ekranının verisi. Ekran bir "pano" değil bir "bülten" olarak
 * tasarlandı: önce ne değişti ve neden, sonra kanıt.
 */

/** Bülten cümlesinin parçası: düz metin ya da kanıta bağlanan bir ölçüm. */
export type BriefingPart =
  | { kind: "text"; text: string }
  | {
      kind: "reading";
      text: string;
      /** Sayı mı (ölçüm) yoksa ad mı (konu, tarih)? Yazı biçimini belirler. */
      style: "number" | "label";
      tone?: "positive" | "negative";
      query?: string;
      range?: TimeRange;
    };

export type BriefingSentence = BriefingPart[];

export interface TopicScore extends ToneCounts {
  id: string;
  name: string;
  groupName: string;
}

export interface SourceSeries {
  sourceType: SourceType;
  label: string;
  total: number;
  points: Array<{ bucketStart: number; total: number }>;
}

export interface Overview {
  rangeKey: RangeKey;
  range: TimeRange;
  bucket: Bucket;
  summary: Summary;
  /** Önceki eşit uzunluktaki dönem; kapsam o dönemi içermiyorsa null. */
  previousSummary: Summary | null;
  series: SeriesPoint[];
  /** Dönemdeki tüm olağan dışı hareketler (grafik işaretleri için). */
  anomalies: Anomaly[];
  /** En ciddi olanların açıklamaları. */
  explained: ExplainedAnomaly[];
  sourceSeries: SourceSeries[];
  /** Platforma göre ton sayıları; hacme göre azalan sırada. */
  platforms: BreakdownRow[];
  topics: TopicScore[];
  stories: StoryRow[];
  highlights: Mention[];
  briefing: BriefingSentence[];
  lastCollectedAt: number | null;
}

const text = (value: string): BriefingPart => ({ kind: "text", text: value });

function fillSeries(points: SeriesPoint[], range: TimeRange, bucket: Bucket): SeriesPoint[] {
  const byStart = new Map(points.map((point) => [point.bucketStart, point]));
  return enumerateBuckets(range, bucket).map(
    (bucketStart) => byStart.get(bucketStart) ?? { bucketStart, total: 0, positive: 0, negative: 0, neutral: 0 },
  );
}

async function buildSourceSeries(filter: MentionFilter, range: TimeRange, bucket: Bucket): Promise<SourceSeries[]> {
  const starts = enumerateBuckets(range, bucket);
  const bySource = new Map<string, Map<number, number>>();
  for (const point of await timeSeriesBySourceType(filter, bucket)) {
    const buckets = bySource.get(point.sourceType) ?? new Map<number, number>();
    buckets.set(point.bucketStart, point.total);
    bySource.set(point.sourceType, buckets);
  }

  return [...bySource.entries()]
    .map(([sourceType, buckets]) => ({
      sourceType: sourceType as SourceType,
      label: SOURCE_TYPE_LABELS[sourceType as SourceType] ?? sourceType,
      total: [...buckets.values()].reduce((sum, value) => sum + value, 0),
      points: starts.map((bucketStart) => ({ bucketStart, total: buckets.get(bucketStart) ?? 0 })),
    }))
    .sort((a, b) => b.total - a.total);
}

export async function scoreTopics(projectId: string, filter: MentionFilter): Promise<TopicScore[]> {
  const counts = new Map((await topicBreakdown(filter)).map((row) => [row.topicId, row]));
  return (await listTopics(projectId))
    .map((topic) => {
      const row = counts.get(topic.id);
      return {
        id: topic.id,
        name: topic.name,
        groupName: topic.groupName,
        total: row?.total ?? 0,
        positive: row?.positive ?? 0,
        negative: row?.negative ?? 0,
        neutral: row?.neutral ?? 0,
      };
    })
    .sort((a, b) => b.total - a.total);
}

/** Olumsuz oranına göre sıralamada küçük örneklemler yanıltmasın. */
const MIN_TOPIC_VOLUME = 20;
/** Genel bakışta açıklaması hesaplanan hareket sayısı. */
const EXPLAINED_ANOMALIES = 2;

function buildBriefing(
  rangeKey: RangeKey,
  range: TimeRange,
  summary: Summary,
  previous: Summary | null,
  anomalies: ExplainedAnomaly[],
  topics: TopicScore[],
): BriefingSentence[] {
  const period = RANGE_PRESETS[rangeKey].label.toLocaleLowerCase("tr-TR");
  if (summary.total === 0) {
    return [[text(`${RANGE_PRESETS[rangeKey].label} içinde bu projeyle eşleşen içerik bulunmuyor.`)]];
  }

  const sentences: BriefingSentence[] = [];

  // 1. Hacim
  const change = previous ? formatChange(summary.total, previous.total) : null;
  const volume: BriefingSentence = [
    text(`${RANGE_PRESETS[rangeKey].label} içinde `),
    { kind: "reading", style: "number", text: formatNumber(summary.total), range },
    text(" bahsetme toplandı"),
  ];
  if (change === null) {
    volume.push(text("; önceki dönem bu projenin kapsamı dışında kaldığı için karşılaştırma yapılmadı."));
  } else if (change === "değişmedi") {
    volume.push(text("; önceki dönemle aynı düzeyde."));
  } else {
    volume.push(text("; önceki döneme göre "), { kind: "reading", style: "number", text: change }, text("."));
  }
  sentences.push(volume);

  // 2. Ton
  const net = netTone(summary.positive, summary.negative);
  const previousNet = previous ? netTone(previous.positive, previous.negative) : null;
  const tone: BriefingSentence = [
    text("İçeriğin "),
    { kind: "reading", style: "number", text: formatPercent(share(summary.negative, summary.total)), tone: "negative", query: "ton:olumsuz", range },
    text(" kadarı olumsuz, "),
    { kind: "reading", style: "number", text: formatPercent(share(summary.positive, summary.total)), tone: "positive", query: "ton:olumlu", range },
    text(" kadarı olumlu"),
  ];
  if (net !== null) {
    tone.push(text("; net ton "), { kind: "reading", style: "number", text: formatSigned(net) });
    if (previousNet !== null && previousNet !== net) tone.push(text(` (önceki dönem ${formatSigned(previousNet)})`));
  }
  tone.push(text("."));
  sentences.push(tone);

  // 3. Olağan dışı hareket
  const lead = anomalies.find((anomaly) => anomaly.level !== "info") ?? anomalies[0];
  if (lead) {
    const when = lead.bucket === "day" ? `${formatDayLong(lead.bucketStart)} günü` : `${formatDateTime(lead.bucketStart)} sularında`;
    const movement: BriefingSentence = [{ kind: "reading", style: "label", text: when, range: lead.range }, text(" ")];
    if (lead.kinds.includes("volume") && lead.baseline >= 1) {
      movement.push(text("hacim olağan düzeyin "), { kind: "reading", style: "number", text: `${formatDecimal(lead.observed / lead.baseline)} katına` }, text(" çıktı"));
    } else if (lead.kinds.includes("volume")) {
      movement.push(text("hacim belirgin biçimde arttı"));
    } else {
      movement.push(text("olumsuz içeriğin payı belirgin biçimde yükseldi"));
    }
    const story = lead.explanation.stories[0];
    if (story && story.publications >= 3) {
      movement.push(text(`; en çok yayılan başlık: “${story.title}”`));
    } else if (lead.explanation.topics[0]) {
      movement.push(text(`; öne çıkan konu: ${lead.explanation.topics[0].name}`));
    }
    movement.push(text("."));
    sentences.push(movement);
  } else {
    sentences.push([text(`Dönem boyunca olağan dışı bir sıçrama görülmedi; ${period} sakin geçti.`)]);
  }

  // 4. Konular
  const ranked = topics.filter((topic) => topic.total > 0);
  const busiest = ranked[0];
  if (busiest) {
    const sentence: BriefingSentence = [
      text("En çok konuşulan konu "),
      { kind: "reading", style: "label", text: busiest.name, query: `konu:"${busiest.name}"`, range },
      text(` (${formatNumber(busiest.total)})`),
    ];
    const sorest = ranked
      .filter((topic) => topic.total >= MIN_TOPIC_VOLUME && topic.id !== busiest.id)
      .sort((a, b) => share(b.negative, b.total) - share(a.negative, a.total))[0];
    if (sorest && share(sorest.negative, sorest.total) > share(busiest.negative, busiest.total)) {
      sentence.push(
        text("; olumsuz oranı en yüksek konu "),
        { kind: "reading", style: "label", text: sorest.name, tone: "negative", query: `konu:"${sorest.name}" ton:olumsuz`, range },
        text(` (${formatPercent(share(sorest.negative, sorest.total))})`),
      );
    }
    sentence.push(text("."));
    sentences.push(sentence);
  }

  return sentences;
}

export async function getOverview(project: Project, rangeKey: RangeKey, now: number): Promise<Overview> {
  const range = resolveRange(rangeKey, now);
  const bucket = RANGE_PRESETS[rangeKey].bucket;
  const filter: MentionFilter = { projectId: project.id, range };

  const summary = await summarize(filter);
  // Önceki dönem ancak kapsam o dönemin başına uzanıyorsa karşılaştırılabilir.
  const previous = previousRange(range);
  const coverageStart = await earliestPublishedAt(project.id);
  const isPreviousCovered = coverageStart !== null && coverageStart < previous.from + bucketSizeMs(bucket);
  const previousSummary = isPreviousCovered ? await summarize({ projectId: project.id, range: previous }) : null;
  const anomalies = await findAnomalies(project.id, range, bucket);
  const explained = (await Promise.all(rankAnomalies(anomalies)
      .slice(0, EXPLAINED_ANOMALIES)
      .map(async (anomaly) => explainAnomaly(project, anomaly, bucket))));
  const topics = await scoreTopics(project.id, filter);

  return {
    rangeKey,
    range,
    bucket,
    summary,
    previousSummary,
    series: fillSeries(await timeSeries(filter, bucket), range, bucket),
    anomalies,
    explained,
    sourceSeries: await buildSourceSeries(filter, range, bucket),
    platforms: await breakdown(filter, "platform", 12),
    topics,
    stories: await topStories(filter, 5),
    highlights: await listMentions(filter, { limit: 4, offset: 0 }),
    briefing: buildBriefing(rangeKey, range, summary, previousSummary, explained, topics),
    lastCollectedAt: await latestCollectedAt(project.id),
  };
}
