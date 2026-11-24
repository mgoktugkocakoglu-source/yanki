import type { Metadata } from "next";
import Link from "next/link";
import { MultiLineChart, seriesColor } from "@/components/charts/multi-line";
import { Tooltip, TooltipRow } from "@/components/charts/primitives";
import { MetricInfo } from "@/components/metric-info";
import { EmptyState, LegendItem, PageContainer, PageHeading, Panel, ToneLegend } from "@/components/ui";
import { netTone, share } from "@/domain/metrics";
import { formatCompact, formatNumber, formatPercent, formatSigned } from "@/lib/format";
import { projectHref } from "@/lib/links";
import { RANGE_PRESETS } from "@/lib/time";
import { loadWorkspaceContext, readRange } from "@/server/context";
import { getComparison, type ComparedProject } from "@/server/services/analysis";

export const metadata: Metadata = { title: "Rakipler" };

/** Etiket ancak dilime rahatça sığıyorsa içine yazılır. */
const MIN_LABELLED_SHARE = 0.08;

function ShareOfVoiceBar({ projects }: { projects: ComparedProject[] }) {
  return (
    <div className="flex h-7 gap-0.5" role="img" aria-label={projects.map((entry) => `${entry.project.name} ${formatPercent(entry.shareOfVoice)}`).join(", ")}>
      {projects.map((entry) =>
        entry.summary.total === 0 ? null : (
          <span
            key={entry.project.id}
            tabIndex={0}
            className="group relative flex min-w-1 items-center rounded px-2 text-[0.8125rem] font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink"
            style={{ flex: entry.summary.total, background: seriesColor(entry.project.colorSlot) }}
          >
            {entry.shareOfVoice >= MIN_LABELLED_SHARE ? <span className="reading">{formatPercent(entry.shareOfVoice)}</span> : null}
            <Tooltip align="center" side="bottom">
              <span className="block font-semibold">{entry.project.name}</span>
              <TooltipRow label="Bahsetme" value={formatNumber(entry.summary.total)} />
              <TooltipRow label="Ses payı" value={formatPercent(entry.shareOfVoice)} />
            </Tooltip>
          </span>
        ),
      )}
    </div>
  );
}

export default async function ComparisonPage({ searchParams }: PageProps<"/karsilastirma">) {
  const { workspace, projects, now } = await loadWorkspaceContext();
  const rangeKey = readRange(await searchParams);

  if (projects.length < 2) {
    return (
      <PageContainer>
        <PageHeading title="Karşılaştırma" />
        <EmptyState
          title="Karşılaştırmak için en az iki proje gerekir"
          action={
            <Link href="/projeler/yeni" className="font-semibold text-brand-strong hover:underline">
              Yeni proje aç
            </Link>
          }
        >
          Kendi kurumunuz için bir proje, karşılaştırmak istediğiniz her kurum ya da konu için de birer proje açın; ses payı ve ton burada yan yana gelir.
        </EmptyState>
      </PageContainer>
    );
  }

  const comparison = getComparison(
    workspace.id,
    // Yalnızca kullanıcının görebildiği konular karşılaştırılır.
    projects.map((project) => project.id),
    rangeKey,
    now,
  );
  const ranked = [...comparison.projects].sort((a, b) => b.summary.total - a.summary.total);

  return (
    <PageContainer>
      <PageHeading
        title="Rakipler"
        lead={`${workspace.name} · ${RANGE_PRESETS[rangeKey].label} · ${formatNumber(comparison.total)} bahsetme, ${projects.length} proje`}
      />

      <Panel
        title="Ses payı"
        hint="Her projenin, karşılaştırılan projelerin toplamı içindeki payı."
        aside={
          <>
            {ranked.map((entry) => (
              <LegendItem key={entry.project.id} color={seriesColor(entry.project.colorSlot)} label={entry.project.name} />
            ))}
            <MetricInfo metric="shareOfVoice" />
          </>
        }
      >
        {comparison.total === 0 ? <p className="text-ink-muted">Bu dönemde hiçbir projede içerik yok.</p> : <ShareOfVoiceBar projects={ranked} />}
      </Panel>

      <Panel
        title="Zaman içinde hacim"
        className="mt-5"
        aside={ranked.map((entry) => (
          <LegendItem key={entry.project.id} color={seriesColor(entry.project.colorSlot)} label={entry.project.name} />
        ))}
      >
        <MultiLineChart
          bucket={comparison.bucket}
          series={ranked.map((entry) => ({
            key: entry.project.id,
            label: entry.project.name,
            colorSlot: entry.project.colorSlot,
            points: entry.series.map((point) => ({ bucketStart: point.bucketStart, value: point.total })),
          }))}
        />
      </Panel>

      <Panel title="Yan yana" hint="Ses payı yüksekliği tek başına iyi haber değildir; tonla birlikte okuyun." className="mt-5" aside={<ToneLegend />}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[44rem] border-collapse text-left text-[0.875rem]">
            <thead>
              <tr className="text-[0.75rem] text-ink-muted">
                <th scope="col" className="pb-2 pr-4 font-medium">
                  Proje
                </th>
                <th scope="col" className="pb-2 pr-4 text-right font-medium">
                  Bahsetme
                </th>
                <th scope="col" className="pb-2 pr-4 text-right font-medium">
                  Ses payı
                </th>
                <th scope="col" className="w-[26%] pb-2 pr-4 font-medium">
                  Ton dağılımı
                </th>
                <th scope="col" className="pb-2 pr-4 text-right font-medium">
                  Olumsuz oranı
                </th>
                <th scope="col" className="pb-2 pr-4 text-right font-medium">
                  Net ton
                </th>
                <th scope="col" className="pb-2 text-right font-medium">
                  Etkileşim
                </th>
              </tr>
            </thead>
            <tbody>
              {ranked.map(({ project, summary, shareOfVoice }) => {
                const net = netTone(summary.positive, summary.negative);
                return (
                  <tr key={project.id} className="border-t border-line">
                    <th scope="row" className="py-2.5 pr-4 font-medium">
                      <Link href={projectHref(project.id)} className="inline-flex items-center gap-2 hover:text-brand-strong hover:underline">
                        <span className="h-2.5 w-2.5 rounded-[2px]" style={{ background: seriesColor(project.colorSlot) }} aria-hidden="true" />
                        {project.name}
                      </Link>
                    </th>
                    <td className="reading py-2.5 pr-4 text-right">{formatNumber(summary.total)}</td>
                    <td className="reading py-2.5 pr-4 text-right">{formatPercent(shareOfVoice)}</td>
                    <td className="py-2.5 pr-4">
                      {summary.total > 0 ? (
                        <span className="flex h-3 gap-0.5 overflow-hidden rounded">
                          {summary.negative > 0 ? <span className="bg-negative" style={{ flex: summary.negative }} /> : null}
                          {summary.neutral > 0 ? <span className="bg-neutral" style={{ flex: summary.neutral }} /> : null}
                          {summary.positive > 0 ? <span className="bg-positive" style={{ flex: summary.positive }} /> : null}
                        </span>
                      ) : (
                        <span className="text-ink-muted">—</span>
                      )}
                    </td>
                    <td className="reading py-2.5 pr-4 text-right">{summary.total > 0 ? formatPercent(share(summary.negative, summary.total)) : "—"}</td>
                    <td className="reading py-2.5 pr-4 text-right">{net === null ? "—" : formatSigned(net)}</td>
                    <td className="reading py-2.5 text-right">{summary.engagementKnown > 0 ? formatCompact(summary.engagement) : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>
    </PageContainer>
  );
}
