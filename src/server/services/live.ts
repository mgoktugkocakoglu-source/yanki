import { effectiveSentiment, type Project, type Sentiment, type SourceType, type TimeRange, type Workspace } from "@/domain/types";
import type { AnomalyLevel } from "@/lib/stats/anomaly";
import { enumerateBuckets, previousRange, resolveRange } from "@/lib/time";
import { earliestPublishedAt, listMentions, type MentionFilter } from "../repositories/mentions";
import { summarize, timeSeries, type ToneCounts } from "../repositories/metrics";
import { explainAnomaly, findAnomalies, rankAnomalies } from "./alerts";
import { scoreTopics } from "./overview";

/** Komuta merkezinin anlık görüntüsü: son 24 saat, saat saat. */

export interface LiveMention {
  id: string;
  sourceType: SourceType;
  sourceName: string;
  author: string | null;
  text: string;
  publishedAt: number;
  sentiment: Sentiment;
  reach: number | null;
  engagement: number | null;
}

export interface LiveSnapshot {
  projectId: string;
  projectName: string;
  isDemo: boolean;
  generatedAt: number;
  range: TimeRange;
  series: Array<ToneCounts & { bucketStart: number }>;
  markers: Array<{ bucketStart: number; level: AnomalyLevel }>;
  summary: ToneCounts;
  /** Önceki 24 saatin toplamı; kapsam o dönemi içermiyorsa null. */
  previousTotal: number | null;
  alerts: Array<{ bucketStart: number; level: AnomalyLevel; headline: string; story: string | null }>;
  topics: Array<{ name: string; total: number; negative: number }>;
  mentions: LiveMention[];
}

const FEED_SIZE = 14;
const TEXT_LIMIT = 220;
const MAX_ALERTS = 2;
const MAX_TOPICS = 5;

function clip(text: string): string {
  return text.length > TEXT_LIMIT ? `${text.slice(0, TEXT_LIMIT).trimEnd()}…` : text;
}

export function getLiveSnapshot(project: Project, workspace: Workspace, now: number): LiveSnapshot {
  const range = resolveRange("24s", now);
  const filter: MentionFilter = { projectId: project.id, range };

  const observed = new Map(timeSeries(filter, "hour").map((point) => [point.bucketStart, point]));
  const series = enumerateBuckets(range, "hour").map(
    (bucketStart) => observed.get(bucketStart) ?? { bucketStart, total: 0, positive: 0, negative: 0, neutral: 0 },
  );

  const anomalies = findAnomalies(project.id, range, "hour");
  const alerts = rankAnomalies(anomalies)
    .slice(0, MAX_ALERTS)
    .map((anomaly) => explainAnomaly(project, anomaly, "hour"))
    .map((anomaly) => {
      const leadStory = anomaly.explanation.stories.at(0);
      return {
        bucketStart: anomaly.bucketStart,
        level: anomaly.level,
        headline: anomaly.explanation.headline,
        story: leadStory && leadStory.publications >= 2 ? leadStory.title : null,
      };
    });

  const previous = previousRange(range);
  const coverageStart = earliestPublishedAt(project.id);
  const isPreviousCovered = coverageStart !== null && coverageStart <= previous.from;
  const { total, positive, negative, neutral } = summarize(filter);
  return {
    projectId: project.id,
    projectName: project.name,
    isDemo: workspace.kind === "demo",
    generatedAt: now,
    range,
    series,
    markers: anomalies.map((anomaly) => ({ bucketStart: anomaly.bucketStart, level: anomaly.level })),
    summary: { total, positive, negative, neutral },
    previousTotal: isPreviousCovered ? summarize({ projectId: project.id, range: previous }).total : null,
    alerts,
    topics: scoreTopics(project.id, filter)
      .filter((topic) => topic.total > 0)
      .slice(0, MAX_TOPICS)
      .map((topic) => ({ name: topic.name, total: topic.total, negative: topic.negative })),
    mentions: listMentions(filter, { limit: FEED_SIZE, offset: 0 }).map((mention) => ({
      id: mention.id,
      sourceType: mention.sourceType,
      sourceName: mention.sourceName,
      author: mention.authorHandle ? `@${mention.authorHandle}` : mention.authorName,
      text: clip(mention.title || mention.content),
      publishedAt: mention.publishedAt,
      sentiment: effectiveSentiment(mention),
      reach: mention.reach,
      engagement: mention.engagement,
    })),
  };
}
