import type { Project, TimeRange } from "@/domain/types";
import { enumerateBuckets, RANGE_PRESETS, resolveRange, type Bucket, type RangeKey } from "@/lib/time";
import type { MentionFilter } from "../repositories/mentions";
import {
  breakdown,
  platformToneSeries,
  summarize,
  timeSeries,
  weekdayHourHeatmap,
  type BreakdownRow,
  type HeatmapCell,
  type SeriesPoint,
  type Summary,
} from "../repositories/metrics";
import { getProject, listProjects } from "../repositories/projects";
import { scoreTopics, type TopicScore } from "./overview";

/** Analiz ekranı: konu karnesi, yoğunluk haritası, duygu, niyet, kaynak ve yazar dağılımları. */

export interface Analysis {
  range: TimeRange;
  summary: Summary;
  /** Konu grubuna göre karneler: "Konu", "Hizmet", "Mahalle" … */
  topicGroups: Array<{ groupName: string; topics: TopicScore[] }>;
  heatmap: HeatmapCell[];
  emotions: BreakdownRow[];
  intents: BreakdownRow[];
  sources: BreakdownRow[];
  authors: BreakdownRow[];
  bucket: Bucket;
  /** Platform başına, dönemin her kovası için içerik ve olumsuz sayısı. */
  platformTrend: Array<{ key: string; label: string; total: number; points: Array<{ bucketStart: number; total: number; negative: number }> }>;
}

export async function getAnalysis(project: Project, rangeKey: RangeKey, now: number): Promise<Analysis> {
  const range = resolveRange(rangeKey, now);
  const filter: MentionFilter = { projectId: project.id, range };

  const groups = new Map<string, TopicScore[]>();
  for (const topic of await scoreTopics(project.id, filter)) {
    const list = groups.get(topic.groupName) ?? [];
    list.push(topic);
    groups.set(topic.groupName, list);
  }

  const bucket = RANGE_PRESETS[rangeKey].bucket;
  const starts = enumerateBuckets(range, bucket);
  const series = await platformToneSeries(filter, bucket);
  const platformTrend = [...new Set(series.map((point) => point.platform))]
    .map((platform) => {
      const byStart = new Map(series.filter((point) => point.platform === platform).map((point) => [point.bucketStart, point]));
      const points = starts.map((bucketStart) => ({ bucketStart, total: byStart.get(bucketStart)?.total ?? 0, negative: byStart.get(bucketStart)?.negative ?? 0 }));
      return { key: platform, label: platform === "__news" ? "Haber siteleri" : platform, total: points.reduce((sum, point) => sum + point.total, 0), points };
    })
    .sort((a, b) => b.total - a.total);

  return {
    range,
    bucket,
    platformTrend,
    summary: await summarize(filter),
    topicGroups: [...groups.entries()].map(([groupName, topics]) => ({ groupName, topics })),
    heatmap: await weekdayHourHeatmap(filter),
    emotions: await breakdown(filter, "emotion", 10),
    intents: await breakdown(filter, "intent", 10),
    sources: await breakdown(filter, "sourceName", 12),
    authors: await breakdown(filter, "author", 12),
  };
}

/* ── Karşılaştırma ────────────────────────────────────────────────────── */

export interface ComparedProject {
  project: Project;
  summary: Summary;
  /** Karşılaştırılan projeler içindeki ses payı (0–1). */
  shareOfVoice: number;
  series: SeriesPoint[];
}

export interface Comparison {
  range: TimeRange;
  bucket: Bucket;
  projects: ComparedProject[];
  total: number;
}

/** Çalışma alanındaki projeleri aynı dönem için yan yana getirir. */
export async function getComparison(workspaceId: string, projectIds: string[] | null, rangeKey: RangeKey, now: number): Promise<Comparison> {
  const range = resolveRange(rangeKey, now);
  const bucket = RANGE_PRESETS[rangeKey].bucket;
  const candidates = await listProjects(workspaceId);
  const selected = projectIds
    ? (await Promise.all(projectIds.map(async (id) => getProject(id)))).filter((project): project is Project => project?.workspaceId === workspaceId)
    : candidates;

  const starts = enumerateBuckets(range, bucket);
  const rows = (await Promise.all(selected.map(async (project) => {
      const filter: MentionFilter = { projectId: project.id, range };
      const byStart = new Map((await timeSeries(filter, bucket)).map((point) => [point.bucketStart, point]));
      return {
        project,
        summary: await summarize(filter),
        series: starts.map(
          (bucketStart) => byStart.get(bucketStart) ?? { bucketStart, total: 0, positive: 0, negative: 0, neutral: 0 },
        ),
      };
    })));

  const total = rows.reduce((sum, row) => sum + row.summary.total, 0);
  return {
    range,
    bucket,
    total,
    projects: rows.map((row) => ({ ...row, shareOfVoice: total === 0 ? 0 : row.summary.total / total })),
  };
}
