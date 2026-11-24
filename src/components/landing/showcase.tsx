import Link from "next/link";
import { cache, type ReactNode } from "react";
import { AnomalyCard } from "@/components/anomaly-card";
import { Briefing } from "@/components/briefing";
import { RankedBars, ToneBar } from "@/components/charts/bars";
import { Ridgeline } from "@/components/charts/ridgeline";
import { VolumeChart } from "@/components/charts/volume-chart";
import { MentionCard } from "@/components/mentions/mention-card";
import { DemoBadge } from "@/components/shell/app-shell";
import { ToneLegend } from "@/components/ui";
import type { SolutionDemo, SolutionPreviewKind, SolutionTarget } from "@/domain/solutions";
import { formatDateTime, formatNumber } from "@/lib/format";
import { mentionsHref, projectHref } from "@/lib/links";
import { tryParseQuery } from "@/lib/query";
import { DEFAULT_RANGE, RANGE_PRESETS, resolveRange } from "@/lib/time";
import { requestStart } from "@/server/context";
import { summarize } from "@/server/repositories/metrics";
import { listProjects, listTopics } from "@/server/repositories/projects";
import { listWorkspaces } from "@/server/repositories/workspaces";
import { getOverview } from "@/server/services/overview";

/**
 * Tanıtım sitesinin canlı önizlemeleri. Hepsi panelin kendi bileşenleriyle ve
 * demo çalışma alanlarının o anki verisiyle çizilir; elle yazılmış sayı yoktur.
 */

/** Vitrin verisi: kurgusal demo alanının ilk projesi, son 30 gün. İstek başına bir kez okunur. */
export const loadShowcase = cache(async () => {
  const now = await requestStart();
  const workspaces = listWorkspaces();
  const workspace = workspaces.find((entry) => entry.kind === "demo");
  const projects = workspace ? listProjects(workspace.id) : [];
  const project = projects[0];
  if (!workspace || !project) return null;

  const overview = getOverview(project, DEFAULT_RANGE, now);
  const parsed = tryParseQuery(project.query);
  return {
    now,
    workspace,
    workspaces,
    project,
    projects,
    overview,
    queries: parsed.ok ? [parsed.ast] : [],
    topicNames: new Map(listTopics(project.id).map((topic) => [topic.id, topic.name])),
  };
});

export function PreviewFrame({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-paper shadow-[var(--shadow-preview)]">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line bg-surface px-4 py-2.5">
        <p className="text-[0.875rem] font-semibold">{title}</p>
        <DemoBadge />
        <span className="ml-auto text-[0.8125rem] text-ink-muted">{RANGE_PRESETS[DEFAULT_RANGE].label}</span>
      </div>
      <div className="p-3 sm:p-4">{children}</div>
    </div>
  );
}

export function PreviewCard({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="text-[0.875rem] font-semibold">{title}</p>
        {aside ? <div className="flex items-center gap-3 text-[0.75rem] text-ink-soft">{aside}</div> : null}
      </div>
      {children}
    </div>
  );
}

export function PreviewSkeleton({ tall = false }: { tall?: boolean }) {
  return <div className={`skeleton rounded-2xl ${tall ? "h-[34rem]" : "h-80"}`} aria-hidden="true" />;
}

/** Çözüm hedefinin, demo projesine göre çözülmüş adresi. */
export async function resolveTargetHref(demo: SolutionDemo, target: SolutionTarget): Promise<string> {
  if (target.kind === "workspace") return target.path;
  const showcase = await loadShowcase();
  if (!showcase) return "/panel";
  if (target.section === "bahsetmeler") return mentionsHref(showcase.project.id, { query: target.query });
  return projectHref(showcase.project.id, target.section);
}

/** Çözüm sayfasındaki önizleme: türüne göre panelin ilgili bileşeni. */
export async function SolutionPreview({ kind }: { demo: SolutionDemo; kind: SolutionPreviewKind }) {
  const showcase = await loadShowcase();
  if (!showcase) return null;
  const { project, projects, workspaces, overview, queries, topicNames, now } = showcase;
  const listHref = projectHref(project.id, "bahsetmeler");

  return <PreviewFrame title={kind === "compare" || kind === "workspaces" ? showcase.workspace.name : project.name}>{body()}</PreviewFrame>;

  function body(): ReactNode {
    switch (kind) {
      case "alerts": {
        if (overview.explained.length === 0) {
          return <p className="rounded-xl border border-line bg-surface p-4 text-ink-soft">Demo projesinde bu dönem olağan dışı bir hareket yok.</p>;
        }
        return (
          <div className="flex flex-col gap-3">
            {overview.explained.map((anomaly) => (
              <AnomalyCard key={anomaly.bucketStart} anomaly={anomaly} mentionsHref={listHref} compact />
            ))}
          </div>
        );
      }
      case "tone":
        return (
          <div className="flex flex-col gap-3">
            <PreviewCard title="Duygu dağılımı">
              <ToneBar values={overview.summary} mentionsHref={mentionsHref(project.id, { rangeKey: overview.rangeKey })} />
            </PreviewCard>
            <PreviewCard title="Zaman içinde bahsedilmeler" aside={<ToneLegend />}>
              <VolumeChart points={overview.series} bucket={overview.bucket} mentionsHref={listHref} height={170} />
            </PreviewCard>
          </div>
        );
      case "compare": {
        const range = resolveRange(DEFAULT_RANGE, now);
        const rows = projects
          .map((entry) => {
            const summary = summarize({ projectId: entry.id, range });
            return { key: entry.id, label: entry.name, total: summary.total, positive: summary.positive, negative: summary.negative, neutral: summary.neutral, href: projectHref(entry.id) };
          })
          .sort((a, b) => b.total - a.total);
        return (
          <PreviewCard title="Projelere göre hacim ve ton" aside={<ToneLegend />}>
            <RankedBars rows={rows} splitByTone caption="Projelere göre bahsedilme sayısı ve ton" labelHeader="Proje" />
          </PreviewCard>
        );
      }
      case "stories":
        return (
          <div className="flex flex-col gap-3">
            <PreviewCard title="Zaman içinde bahsedilmeler" aside={<ToneLegend />}>
              <VolumeChart
                points={overview.series}
                bucket={overview.bucket}
                markers={overview.anomalies.map((anomaly) => ({ bucketStart: anomaly.bucketStart, level: anomaly.level }))}
                mentionsHref={listHref}
                height={170}
              />
            </PreviewCard>
            <PreviewCard title="En çok yayılan hikâyeler">
              <ol className="flex flex-col divide-y divide-line">
                {overview.stories.slice(0, 4).map((story) => (
                  <li key={story.storyKey} className="flex items-baseline gap-3 py-2 first:pt-0 last:pb-0">
                    <span className="reading w-8 shrink-0 text-right font-medium">{formatNumber(story.publications)}</span>
                    <span className="min-w-0">
                      <span className="block font-medium leading-snug">{story.title}</span>
                      <span className="text-[0.8125rem] text-ink-muted">
                        {formatNumber(story.sources)} kaynak · ilk görülme {formatDateTime(story.firstSeenAt)}
                      </span>
                    </span>
                  </li>
                ))}
              </ol>
            </PreviewCard>
          </div>
        );
      case "topics": {
        const hasGroups = new Set(overview.topics.map((topic) => topic.groupName)).size > 1;
        const rows = overview.topics
          .filter((topic) => topic.total > 0)
          .slice(0, 8)
          .map((topic) => ({
            key: topic.id,
            label: topic.name,
            detail: hasGroups ? topic.groupName : undefined,
            total: topic.total,
            positive: topic.positive,
            negative: topic.negative,
            neutral: topic.neutral,
          }));
        return (
          <PreviewCard title="Konu karnesi" aside={<ToneLegend />}>
            <RankedBars rows={rows} splitByTone caption="Konulara göre bahsedilme sayısı ve ton" labelHeader="Konu" />
          </PreviewCard>
        );
      }
      case "briefing":
        return (
          <PreviewCard title="Dönemin özeti" aside="ölçümlerden hesaplanır">
            <Briefing sentences={overview.briefing} projectId={project.id} rangeKey={overview.rangeKey} selectedRange={overview.range} />
          </PreviewCard>
        );
      case "sources":
        return (
          <PreviewCard title="Platformlara göre dağılım">
            <Ridgeline
              bucket={overview.bucket}
              ridges={overview.sourceSeries.map((series) => ({ key: series.sourceType, label: series.label, total: series.total, points: series.points }))}
            />
          </PreviewCard>
        );
      case "mentions":
        return (
          <div className="flex flex-col gap-3">
            {overview.highlights.slice(0, 3).map((mention) => (
              <MentionCard key={mention.id} mention={mention} queries={queries} topicNames={topicNames} now={now} editable={false} />
            ))}
          </div>
        );
      case "workspaces":
        return (
          <PreviewCard title="Çalışma alanları">
            <ul className="flex flex-col divide-y divide-line">
              {workspaces.map((workspace) => {
                const names = listProjects(workspace.id).map((entry) => entry.name);
                return (
                  <li key={workspace.id} className="py-2.5 first:pt-0 last:pb-0">
                    <p className="font-medium">{workspace.name}</p>
                    <p className="text-[0.8125rem] text-ink-muted">
                      {names.length > 0 ? `${formatNumber(names.length)} proje: ${names.join(", ")}` : "henüz proje yok"}
                    </p>
                  </li>
                );
              })}
            </ul>
            <p className="mt-3 text-[0.8125rem] text-ink-muted">
              Yeni proje yalnızca canlı çalışma alanında açılır:{" "}
              <Link href="/projeler/yeni" className="font-medium text-brand-strong hover:underline">
                proje oluştur
              </Link>
            </p>
          </PreviewCard>
        );
    }
  }
}
