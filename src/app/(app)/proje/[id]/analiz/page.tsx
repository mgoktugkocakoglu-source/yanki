import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Heatmap, RankedBars } from "@/components/charts/bars";
import { PlatformTrend } from "@/components/charts/platform-trend";
import { MetricInfo } from "@/components/metric-info";
import { EmptyState, PageContainer, PageHeading, Panel, ToneLegend } from "@/components/ui";
import { EMOTION_LABELS, EMOTION_QUERY, INTENT_LABELS, INTENT_QUERY } from "@/domain/labels";
import { netTone, share } from "@/domain/metrics";
import type { Emotion, Intent } from "@/domain/types";
import { formatCompact, formatNumber, formatPercent, formatSigned } from "@/lib/format";
import { mentionsHref } from "@/lib/links";
import { RANGE_PRESETS, type RangeKey } from "@/lib/time";
import { loadProjectContext, readRange } from "@/server/context";
import { getAnalysis } from "@/server/services/analysis";
import type { TopicScore } from "@/server/services/overview";

export const metadata: Metadata = { title: "Analiz" };

/** Olumsuz oranı ancak yeterli içerik varsa yorumlanabilir. */
const MIN_SCORED_VOLUME = 10;

interface ScorecardProps {
  projectId: string;
  rangeKey: RangeKey;
  topics: TopicScore[];
  nameHeader: string;
}

/**
 * Karne: her satır bir konu (ya da mahalle); hacim, olumsuz oranı ve net ton
 * yan yana. Olumsuz oranı çubuğu tüm satırlarda aynı ölçektedir (0–%100).
 */
function Scorecard({ projectId, rangeKey, topics, nameHeader }: ScorecardProps) {
  const rows = topics.filter((topic) => topic.total > 0);
  if (rows.length === 0) return <p className="text-ink-muted">Bu dönemde bu gruptaki konularla eşleşen içerik yok.</p>;
  const maxTotal = Math.max(...rows.map((topic) => topic.total));

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[34rem] border-collapse text-left text-[0.875rem]">
        <thead>
          <tr className="text-[0.75rem] text-ink-muted">
            <th scope="col" className="pb-2 pr-3 font-medium">
              {nameHeader}
            </th>
            <th scope="col" className="w-[34%] pb-2 pr-3 font-medium">
              Hacim ve ton
            </th>
            <th scope="col" className="w-[24%] pb-2 pr-3 font-medium">
              Olumsuz oranı
            </th>
            <th scope="col" className="pb-2 text-right font-medium">
              Net ton
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((topic) => {
            const negativeShare = share(topic.negative, topic.total);
            const net = netTone(topic.positive, topic.negative);
            const scored = topic.total >= MIN_SCORED_VOLUME;
            return (
              <tr key={topic.id} className="border-t border-line">
                <th scope="row" className="py-2 pr-3 font-medium">
                  <Link href={mentionsHref(projectId, { query: `konu:"${topic.name}"`, rangeKey })} className="hover:text-brand-strong hover:underline">
                    {topic.name}
                  </Link>
                </th>
                <td className="py-2 pr-3">
                  <span className="flex items-center gap-2">
                    <span className="flex h-3 gap-0.5 overflow-hidden rounded-r" style={{ width: `${Math.max(2, (topic.total / maxTotal) * 100)}%` }}>
                      {topic.negative > 0 ? <span className="bg-negative" style={{ flex: topic.negative }} /> : null}
                      {topic.neutral > 0 ? <span className="bg-neutral" style={{ flex: topic.neutral }} /> : null}
                      {topic.positive > 0 ? <span className="bg-positive" style={{ flex: topic.positive }} /> : null}
                    </span>
                    <span className="reading shrink-0">{formatNumber(topic.total)}</span>
                  </span>
                </td>
                <td className="py-2 pr-3">
                  {scored ? (
                    <span className="flex items-center gap-2">
                      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-negative-wash">
                        <span className="block h-full rounded-full bg-negative" style={{ width: `${negativeShare * 100}%` }} />
                      </span>
                      <span className="reading w-10 shrink-0 text-right">{formatPercent(negativeShare)}</span>
                    </span>
                  ) : (
                    <span className="text-[0.8125rem] text-ink-muted" title={`Yorumlamak için en az ${MIN_SCORED_VOLUME} içerik gerekir.`}>
                      az veri
                    </span>
                  )}
                </td>
                <td className="reading py-2 text-right">{scored && net !== null ? formatSigned(net) : "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default async function AnalysisPage({ params, searchParams }: PageProps<"/proje/[id]/analiz">) {
  const { id } = await params;
  const context = await loadProjectContext(id);
  if (!context) notFound();

  const { project, now } = context;
  const rangeKey = readRange(await searchParams);
  const analysis = await getAnalysis(project, rangeKey, now);
  const { summary } = analysis;

  if (summary.total === 0) {
    return (
      <PageContainer>
        <PageHeading title="Analiz" />
        <EmptyState title="Çözümlenecek içerik yok">{RANGE_PRESETS[rangeKey].label} içinde bu projeyle eşleşen içerik bulunmuyor. Daha geniş bir dönem seçmeyi deneyin.</EmptyState>
      </PageContainer>
    );
  }

  const link = (query: string) => mentionsHref(project.id, { query, rangeKey });
  const emotions = analysis.emotions.filter((row) => row.key !== "none");
  const withoutEmotion = analysis.emotions.find((row) => row.key === "none")?.total ?? 0;
  const intents = analysis.intents.filter((row) => row.key !== "general");

  return (
    <PageContainer>
      <PageHeading
        title="Analiz"
        lead={
          <>
            {RANGE_PRESETS[rangeKey].label} · <span className="reading text-ink">{formatNumber(summary.total)}</span> içerik,{" "}
            <span className="reading text-ink">{formatNumber(summary.sources)}</span> kaynak, <span className="reading text-ink">{formatNumber(summary.authors)}</span> yazar
          </>
        }
      />

      <div className="grid gap-5 lg:grid-cols-2">
        {analysis.topicGroups.map((group) => (
          <Panel
            key={group.groupName}
            title={`${group.groupName} karnesi`}
            hint="Satıra tıklayınca o konunun içerikleri açılır."
            className={analysis.topicGroups.length === 1 ? "lg:col-span-2" : undefined}
            aside={
              <>
                <ToneLegend />
                <MetricInfo metric="netTone" />
              </>
            }
          >
            <Scorecard projectId={project.id} rangeKey={rangeKey} topics={group.topics} nameHeader={group.groupName} />
          </Panel>
        ))}
        {analysis.topicGroups.length === 0 ? (
          <Panel title="Konu karnesi" className="lg:col-span-2">
            <p className="text-ink-soft">
              Bu projede konu tanımlı değil. Ayarlar bölümünden “Teslimat”, “Fiyat” ya da mahalle adları gibi konular tanımladığınızda her birinin hacmi ve tonu burada karne olarak
              görünür.
            </p>
          </Panel>
        ) : null}
      </div>

      <div className="mt-5">
        <Panel
          title="Platforma göre olumsuz oranının seyri"
          hint={`Her çizgi 0–%100 ölçeğindedir; kesikli çizgi %50. ${analysis.bucket === "day" ? "Günde" : "Saatte"} 5'ten az içerik olan noktalar çizilmez.`}
        >
          <PlatformTrend rows={analysis.platformTrend} />
        </Panel>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <Panel title="Yankı ne zaman yükseliyor?" hint="Haftanın günü ve saatine göre içerik yoğunluğu (Türkiye saati)." className="lg:col-span-2">
          <Heatmap cells={analysis.heatmap} />
        </Panel>
        <Panel title="Niyet" hint="Şikâyet, övgü, satın alma, ayrılma ve destek sinyalleri.">
          <RankedBars
            caption="Niyete göre içerik sayısı"
            labelHeader="Niyet"
            emptyText="Bu dönemde belirgin bir niyet sinyali yok."
            rows={intents.map((row) => ({
              key: row.key,
              label: INTENT_LABELS[row.key as Intent] ?? row.key,
              total: row.total,
              href: link(`niyet:${INTENT_QUERY[row.key as Intent]}`),
            }))}
          />
        </Panel>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <Panel title="Duygu" hint={`${formatNumber(withoutEmotion)} içerikte belirgin duygu yok.`}>
          <RankedBars
            caption="Baskın duyguya göre içerik sayısı"
            labelHeader="Duygu"
            emptyText="Bu dönemde belirgin bir duygu sinyali yok."
            rows={emotions.map((row) => ({
              key: row.key,
              label: EMOTION_LABELS[row.key as Emotion] ?? row.key,
              total: row.total,
              href: link(`duygu:${EMOTION_QUERY[row.key as Emotion]}`),
            }))}
          />
        </Panel>
        <Panel title="En çok yazan kaynaklar" aside={<ToneLegend />}>
          <RankedBars
            caption="Kaynağa göre içerik sayısı ve ton"
            labelHeader="Kaynak"
            splitByTone
            rows={analysis.sources.map((row) => ({ ...row, label: row.key, href: link(`site:"${row.key}"`) }))}
          />
        </Panel>
        <Panel title="En çok yazan hesaplar" hint="Erişim tabanı: takipçi sayısı." aside={<MetricInfo metric="reach" />}>
          <RankedBars
            caption="Yazara göre içerik sayısı"
            labelHeader="Yazar"
            splitByTone
            emptyText="Bu dönemde yazar bilgisi olan içerik yok."
            rows={analysis.authors.map((row) => ({
              ...row,
              label: row.key,
              detail: row.reach > 0 ? `${formatCompact(row.reach)} takipçi` : undefined,
              href: link(`yazar:"${row.key}"`),
            }))}
          />
        </Panel>
      </div>
    </PageContainer>
  );
}
