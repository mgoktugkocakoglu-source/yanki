import { bucketSizeMs, TIMEZONE_OFFSET_MS, type Bucket } from "@/lib/time";
import { queryAll, queryOne } from "../db/client";
import { buildWhere, EFFECTIVE_SENTIMENT, type MentionFilter } from "./mentions";

/**
 * Analitik toplamlar. Buradaki her sorgu `buildWhere` ile aynı süzgeci
 * kullanır; boyut ve kova ifadeleri sabit bir listeden seçilir, kullanıcı
 * girdisi SQL metnine girmez.
 */

/** Ton sayıları; birçok sorguda aynı üçlü tekrarlandığı için tek yerde. */
const SENTIMENT_COUNTS = `
  COUNT(*) AS total,
  SUM(CASE WHEN ${EFFECTIVE_SENTIMENT} = 'positive' THEN 1 ELSE 0 END) AS positive,
  SUM(CASE WHEN ${EFFECTIVE_SENTIMENT} = 'negative' THEN 1 ELSE 0 END) AS negative,
  SUM(CASE WHEN ${EFFECTIVE_SENTIMENT} = 'neutral' THEN 1 ELSE 0 END) AS neutral`;

export interface ToneCounts {
  total: number;
  positive: number;
  negative: number;
  neutral: number;
}

export interface Summary extends ToneCounts {
  /** Gözlenen etkileşim toplamı ve bu verinin bulunduğu bahsetme sayısı. */
  engagement: number;
  engagementKnown: number;
  /** Erişim tahmini toplamı ve dayanağı bulunan bahsetme sayısı. */
  reach: number;
  reachKnown: number;
  sources: number;
  authors: number;
  stories: number;
  sarcastic: number;
}

interface SummaryRow extends ToneCounts {
  engagement: number | null;
  engagement_known: number;
  reach: number | null;
  reach_known: number;
  sources: number;
  authors: number;
  stories: number;
  sarcastic: number | null;
}

export function summarize(filter: MentionFilter): Summary {
  const where = buildWhere(filter);
  const row = queryOne<SummaryRow>(
    `SELECT ${SENTIMENT_COUNTS},
       SUM(m.engagement) AS engagement,
       COUNT(m.engagement) AS engagement_known,
       SUM(m.reach) AS reach,
       COUNT(m.reach) AS reach_known,
       COUNT(DISTINCT m.source_name) AS sources,
       COUNT(DISTINCT COALESCE(m.author_handle, m.author_name)) AS authors,
       COUNT(DISTINCT m.story_key) AS stories,
       SUM(m.is_sarcastic) AS sarcastic
     FROM mentions m WHERE ${where.sql}`,
    where.params,
  );
  return {
    total: row?.total ?? 0,
    positive: row?.positive ?? 0,
    negative: row?.negative ?? 0,
    neutral: row?.neutral ?? 0,
    engagement: row?.engagement ?? 0,
    engagementKnown: row?.engagement_known ?? 0,
    reach: row?.reach ?? 0,
    reachKnown: row?.reach_known ?? 0,
    sources: row?.sources ?? 0,
    authors: row?.authors ?? 0,
    stories: row?.stories ?? 0,
    sarcastic: row?.sarcastic ?? 0,
  };
}

/** Yerel saate hizalı kova başlangıcı (UTC ms) üreten SQL ifadesi. */
function bucketExpression(bucket: Bucket): string {
  const size = bucketSizeMs(bucket);
  return `((m.published_at + ${TIMEZONE_OFFSET_MS}) / ${size}) * ${size} - ${TIMEZONE_OFFSET_MS}`;
}

export interface SeriesPoint extends ToneCounts {
  bucketStart: number;
}

/** Yalnızca veri bulunan kovalar döner; boş kovaları çağıran doldurur. */
export function timeSeries(filter: MentionFilter, bucket: Bucket): SeriesPoint[] {
  const where = buildWhere(filter);
  return queryAll<ToneCounts & { bucket_start: number }>(
    `SELECT ${bucketExpression(bucket)} AS bucket_start, ${SENTIMENT_COUNTS}
     FROM mentions m WHERE ${where.sql} GROUP BY bucket_start ORDER BY bucket_start`,
    where.params,
  ).map(({ bucket_start, ...counts }) => ({ bucketStart: bucket_start, ...counts }));
}

export interface SourceSeriesPoint {
  bucketStart: number;
  sourceType: string;
  total: number;
}

export function timeSeriesBySourceType(filter: MentionFilter, bucket: Bucket): SourceSeriesPoint[] {
  const where = buildWhere(filter);
  return queryAll<{ bucket_start: number; source_type: string; total: number }>(
    `SELECT ${bucketExpression(bucket)} AS bucket_start, m.source_type, COUNT(*) AS total
     FROM mentions m WHERE ${where.sql} GROUP BY bucket_start, m.source_type ORDER BY bucket_start`,
    where.params,
  ).map((row) => ({ bucketStart: row.bucket_start, sourceType: row.source_type, total: row.total }));
}

const DIMENSIONS = {
  sourceType: "m.source_type",
  sourceName: "m.source_name",
  /** Platform: haber siteleri tek satırda toplanır, diğer kaynaklar kendi adıyla. */
  platform: "CASE WHEN m.source_type = 'news' THEN '__news' ELSE m.source_name END",
  emotion: "m.emotion",
  intent: "m.intent",
  language: "m.language",
  author: "COALESCE(m.author_handle, m.author_name)",
} as const;

export type Dimension = keyof typeof DIMENSIONS;

export interface PlatformSeriesPoint extends ToneCounts {
  bucketStart: number;
  platform: string;
}

/** Platform ve kova başına ton sayıları; zaman içindeki ton seyri için. */
export function platformToneSeries(filter: MentionFilter, bucket: Bucket): PlatformSeriesPoint[] {
  const where = buildWhere(filter);
  return queryAll<ToneCounts & { bucket_start: number; platform: string }>(
    `SELECT ${bucketExpression(bucket)} AS bucket_start, ${DIMENSIONS.platform} AS platform, ${SENTIMENT_COUNTS}
     FROM mentions m WHERE ${where.sql} GROUP BY bucket_start, platform ORDER BY bucket_start`,
    where.params,
  ).map(({ bucket_start, platform, ...counts }) => ({ bucketStart: bucket_start, platform, ...counts }));
}

export interface BreakdownRow extends ToneCounts {
  key: string;
  engagement: number;
  reach: number;
}

/** Bir boyuta göre dağılım; hacme göre azalan sırada. */
export function breakdown(filter: MentionFilter, dimension: Dimension, limit: number): BreakdownRow[] {
  const where = buildWhere(filter);
  const expression = DIMENSIONS[dimension];
  return queryAll<ToneCounts & { dimension_key: string; engagement: number | null; reach: number | null }>(
    `SELECT ${expression} AS dimension_key, ${SENTIMENT_COUNTS},
       SUM(m.engagement) AS engagement, MAX(m.reach) AS reach
     FROM mentions m WHERE ${where.sql} AND ${expression} IS NOT NULL
     GROUP BY dimension_key ORDER BY total DESC, dimension_key LIMIT ?`,
    [...where.params, limit],
  ).map(({ dimension_key, engagement, reach, ...counts }) => ({
    key: dimension_key,
    ...counts,
    engagement: engagement ?? 0,
    reach: reach ?? 0,
  }));
}

export interface TopicBreakdownRow extends ToneCounts {
  topicId: string;
}

export function topicBreakdown(filter: MentionFilter): TopicBreakdownRow[] {
  const where = buildWhere(filter);
  return queryAll<ToneCounts & { topic_id: string }>(
    `SELECT mt.topic_id, ${SENTIMENT_COUNTS}
     FROM mentions m JOIN mention_topics mt ON mt.mention_id = m.id
     WHERE ${where.sql} GROUP BY mt.topic_id ORDER BY total DESC`,
    where.params,
  ).map(({ topic_id, ...counts }) => ({ topicId: topic_id, ...counts }));
}

export interface HeatmapCell {
  /** 0 = Pazartesi … 6 = Pazar. */
  weekday: number;
  hour: number;
  total: number;
}

export function weekdayHourHeatmap(filter: MentionFilter): HeatmapCell[] {
  const where = buildWhere(filter);
  const localMs = `(m.published_at + ${TIMEZONE_OFFSET_MS})`;
  // 1 Ocak 1970 Perşembe'dir; +3 kaydırma Pazartesi'yi 0 yapar.
  return queryAll<HeatmapCell>(
    `SELECT ((${localMs} / 86400000) + 3) % 7 AS weekday, (${localMs} / 3600000) % 24 AS hour, COUNT(*) AS total
     FROM mentions m WHERE ${where.sql} GROUP BY weekday, hour`,
    where.params,
  );
}

export interface StoryRow {
  storyKey: string;
  title: string;
  publications: number;
  sources: number;
  firstSeenAt: number;
  negative: number;
  sampleMentionId: string;
}

/** En çok yayılan hikâyeler: aynı haberin farklı yayınları tek satırda. */
export function topStories(filter: MentionFilter, limit: number): StoryRow[] {
  const where = buildWhere(filter);
  return queryAll<{
    story_key: string;
    title: string;
    publications: number;
    sources: number;
    first_seen_at: number;
    negative: number;
    sample_mention_id: string;
  }>(
    `SELECT m.story_key,
       MIN(CASE WHEN m.title <> '' THEN m.title ELSE substr(m.content, 1, 140) END) AS title,
       COUNT(*) AS publications,
       COUNT(DISTINCT m.source_name) AS sources,
       MIN(m.published_at) AS first_seen_at,
       SUM(CASE WHEN ${EFFECTIVE_SENTIMENT} = 'negative' THEN 1 ELSE 0 END) AS negative,
       MIN(m.id) AS sample_mention_id
     FROM mentions m WHERE ${where.sql}
     GROUP BY m.story_key ORDER BY publications DESC, first_seen_at DESC LIMIT ?`,
    [...where.params, limit],
  ).map((row) => ({
    storyKey: row.story_key,
    title: row.title,
    publications: row.publications,
    sources: row.sources,
    firstSeenAt: row.first_seen_at,
    negative: row.negative,
    sampleMentionId: row.sample_mention_id,
  }));
}
