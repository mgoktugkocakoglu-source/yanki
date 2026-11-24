import { ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AiClassifyNote } from "@/components/ai-classify";
import { AiSummaryPanel } from "@/components/ai-summary";
import { AnomalyCard } from "@/components/anomaly-card";
import { Briefing, Readouts, type ReadoutItem } from "@/components/briefing";
import { RankedBars, ToneBar } from "@/components/charts/bars";
import { PlatformTone } from "@/components/charts/platform-tone";
import { Ridgeline } from "@/components/charts/ridgeline";
import { VolumeChart } from "@/components/charts/volume-chart";
import { AskBox } from "@/components/forms/ask-box";
import { MentionCard } from "@/components/mentions/mention-card";
import { MetricInfo } from "@/components/metric-info";
import { EmptyState, PageContainer, PageHeading, Panel, ToneLegend } from "@/components/ui";
import { share } from "@/domain/metrics";
import { formatChange, formatCompact, formatDateTime, formatNumber, formatPercent, formatRelative } from "@/lib/format";
import { mentionsHref, phraseQuery, projectHref } from "@/lib/links";
import { tryParseQuery } from "@/lib/query";
import { RANGE_PRESETS } from "@/lib/time";
import { getAiProvider } from "@/server/ai/provider";
import { loadProjectContext, readRange } from "@/server/context";
import { listTopics } from "@/server/repositories/projects";
import { getOverview, type Overview } from "@/server/services/overview";

export const metadata: Metadata = { title: "Genel Bakış" };

const TOPIC_ROWS = 8;

function readouts(projectId: string, overview: Overview): ReadoutItem[] {
  const { summary, previousSummary, rangeKey, anomalies } = overview;
  const change = previousSummary ? formatChange(summary.total, previousSummary.total) : null;
  const critical = anomalies.filter((anomaly) => anomaly.level === "critical").length;
  return [
    {
      label: "Toplam bahsedilme",
      value: formatNumber(summary.total),
      note: change ? `önceki ${RANGE_PRESETS[rangeKey].shortLabel} göre ${change}` : "önceki dönem kapsam dışında",
      metric: "mentions",
      href: mentionsHref(projectId, { rangeKey }),
    },
    {
      label: "Tahmini erişim",
      value: summary.reachKnown > 0 ? `≈ ${formatCompact(summary.reach)}` : "—",
      note:
        summary.reachKnown > 0
          ? `tahmin; içeriğin ${formatPercent(share(summary.reachKnown, summary.total))} kadarında veri var`
          : "kaynaklar takipçi ya da görüntülenme vermiyor",
      metric: "reach",
    },
    {
      label: "Olumlu içerik oranı",
      value: formatPercent(share(summary.positive, summary.total)),
      note: previousSummary
        ? `önceki dönemde ${formatPercent(share(previousSummary.positive, previousSummary.total))}`
        : `${formatNumber(summary.positive)} olumlu içerik`,
      metric: "netTone",
    },
    {
      label: "Aktif uyarı",
      value: formatNumber(anomalies.length),
      note: anomalies.length > 0 ? `${formatNumber(critical)} tanesi kritik · seçili dönemde` : "olağan dışı hareket yok",
      metric: "anomaly",
      href: projectHref(projectId, "uyarilar"),
    },
  ];
}

export default async function OverviewPage({ params, searchParams }: PageProps<"/proje/[id]">) {
  const { id } = await params;
  const context = await loadProjectContext(id);
  if (!context) notFound();

  const { project, workspace, now } = context;
  const rangeKey = readRange(await searchParams);
  const overview = getOverview(project, rangeKey, now);
  const listHref = projectHref(project.id, "bahsetmeler");
  const rangedListHref = mentionsHref(project.id, { rangeKey });

  if (overview.summary.total === 0 && (overview.previousSummary?.total ?? 0) === 0) {
    return (
      <PageContainer>
        <EmptyState
          title={`${project.name} için henüz içerik yok`}
          action={
            <Link href={projectHref(project.id, "kaynaklar")} className="font-semibold text-brand-strong hover:underline">
              Kaynak durumuna bak
            </Link>
          }
        >
          {workspace.kind === "live"
            ? "İlk tarama birkaç saniye sürer. Kaynaklar ekranından taramanın sonucunu görebilir ya da hemen yeniden başlatabilirsiniz."
            : `${RANGE_PRESETS[rangeKey].label} içinde eşleşen içerik bulunmuyor.`}
        </EmptyState>
      </PageContainer>
    );
  }

  const parsedQuery = tryParseQuery(project.query);
  const highlightQueries = parsedQuery.ok ? [parsedQuery.ast] : [];
  const topicNames = new Map(listTopics(project.id).map((topic) => [topic.id, topic.name]));
  const hasSeveralGroups = new Set(overview.topics.map((topic) => topic.groupName)).size > 1;
  const topicRows = overview.topics
    .filter((topic) => topic.total > 0)
    .slice(0, TOPIC_ROWS)
    .map((topic) => ({
      key: topic.id,
      label: topic.name,
      detail: hasSeveralGroups ? topic.groupName : undefined,
      total: topic.total,
      positive: topic.positive,
      negative: topic.negative,
      neutral: topic.neutral,
      href: mentionsHref(project.id, { query: `konu:"${topic.name}"`, rangeKey }),
    }));

  return (
    <PageContainer>
      <PageHeading
        title="Genel Bakış"
        lead={
          <>
            <span className="font-medium text-ink">{project.name}</span> · {RANGE_PRESETS[rangeKey].label}
            {overview.lastCollectedAt ? (
              <span title={formatDateTime(overview.lastCollectedAt)}>
                {" · "}
                {workspace.kind === "demo" ? "demo verisi (kurgusal)" : `son içerik ${formatRelative(overview.lastCollectedAt, now)} toplandı`}
              </span>
            ) : null}
          </>
        }
      />

      <div className="rise-in flex flex-col gap-5">
        <Readouts items={readouts(project.id, overview)} />

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <Panel
            title="Zaman içinde bahsedilmeler"
            hint={`${overview.bucket === "day" ? "Her sütun bir gün" : "Her sütun bir saat"}; içerikleri görmek için sütuna tıklayın.`}
            aside={
              <>
                <ToneLegend />
                <MetricInfo metric="anomaly" />
              </>
            }
          >
            <VolumeChart
              points={overview.series}
              bucket={overview.bucket}
              markers={overview.anomalies.map((anomaly) => ({ bucketStart: anomaly.bucketStart, level: anomaly.level }))}
              mentionsHref={listHref}
            />
          </Panel>

          <Panel title="Duygu dağılımı" hint="Yüzdeler şeritte, adetler altında." aside={<MetricInfo metric="netTone" />}>
            <ToneBar values={overview.summary} mentionsHref={rangedListHref} />
            {overview.summary.sarcastic > 0 ? (
              <p className="mt-4 text-[0.8125rem] text-ink-muted">
                <Link href={mentionsHref(project.id, { query: "ironi:evet", rangeKey })} className="font-medium text-brand-strong hover:underline">
                  {formatNumber(overview.summary.sarcastic)} içerikte
                </Link>{" "}
                kural tabanlı çözümleyici ironi şüphesi buldu.
              </p>
            ) : null}
            <AiClassifyNote projectId={project.id} rangeKey={rangeKey} range={overview.range} total={overview.summary.total} />
          </Panel>
        </div>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="flex flex-col gap-5">
            <Panel title="Dönemin özeti" hint="Bu cümleler yukarıdaki ölçümlerden hesaplanır; bir dil modeli çıktısı değildir.">
              <Briefing sentences={overview.briefing} projectId={project.id} rangeKey={rangeKey} selectedRange={overview.range} />
            </Panel>
            {getAiProvider() ? (
              <Panel title="Soru sor" hint="Dönem hakkında düz yazıyla soru sorun; yanıt dönemin ölçümlerine ve içeriklerine dayanır.">
                <AskBox projectId={project.id} rangeKey={rangeKey} evidenceBase={rangedListHref} />
              </Panel>
            ) : null}
            <AiSummaryPanel projectId={project.id} rangeKey={rangeKey} now={now} />
            <Panel title="Platforma göre duygu dağılımı" hint="Her satır kendi içinde %100'e ölçeklenir; genel dağılım en üsttedir.">
              <PlatformTone
                overall={overview.summary}
                rows={overview.platforms.map((row) => ({
                  ...row,
                  label: row.key === "__news" ? "Haber siteleri" : row.key,
                  href: mentionsHref(project.id, { query: row.key === "__news" ? "kaynak:haber" : `site:"${row.key}"`, rangeKey }),
                }))}
              />
            </Panel>
            <Panel title="Platformlara göre dağılım" hint="Her satır bir kaynak türü; tümü aynı ölçekte.">
              <Ridgeline
                bucket={overview.bucket}
                ridges={overview.sourceSeries.map((series) => ({ key: series.sourceType, label: series.label, total: series.total, points: series.points }))}
              />
            </Panel>
          </div>

          <section aria-labelledby="gelismeler-basligi" className="flex flex-col gap-3">
            <div className="flex items-baseline justify-between">
              <h2 id="gelismeler-basligi" className="text-[0.9375rem] font-semibold">
                Öne çıkan gelişmeler
              </h2>
              <Link href={projectHref(project.id, "uyarilar")} className="text-[0.8125rem] font-medium text-brand-strong hover:underline">
                Tüm uyarılar
              </Link>
            </div>
            {overview.explained.length === 0 ? (
              <p className="rounded-xl border border-line bg-surface p-4 text-ink-soft">
                Bu dönemde hacim ve ton olağan sınırlar içinde kaldı. Bir sıçrama olduğunda nedenini burada göreceksiniz.
              </p>
            ) : (
              overview.explained.map((anomaly) => <AnomalyCard key={anomaly.bucketStart} anomaly={anomaly} mentionsHref={listHref} compact />)
            )}
          </section>
        </div>

        <div className="grid gap-5 lg:grid-cols-2">
          <Panel title="Konular" hint="Çubuğun uzunluğu hacim, renkleri ton.">
            <RankedBars
              rows={topicRows}
              splitByTone
              caption="Konulara göre bahsedilme sayısı ve ton"
              labelHeader="Konu"
              emptyText="Bu projede konu tanımlı değil ya da hiçbir içerik konularla eşleşmedi. Konuları Ayarlar bölümünden tanımlayabilirsiniz."
            />
          </Panel>
          <Panel title="En çok yayılan hikâyeler" hint="Aynı başlığın farklı yayınları tek satırda." aside={<MetricInfo metric="stories" />}>
            <ol className="flex flex-col divide-y divide-line">
              {overview.stories.map((story) => (
                <li key={story.storyKey} className="py-2.5 first:pt-0 last:pb-0">
                  <Link href={mentionsHref(project.id, { query: phraseQuery(story.title), rangeKey })} className="group flex items-baseline gap-3">
                    <span className="reading w-9 shrink-0 text-right text-[1.0625rem] font-medium">{formatNumber(story.publications)}</span>
                    <span className="min-w-0">
                      <span className="block font-medium leading-snug group-hover:text-brand-strong">{story.title}</span>
                      <span className="text-[0.8125rem] text-ink-muted">
                        {formatNumber(story.sources)} kaynak · ilk görülme {formatDateTime(story.firstSeenAt)}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
          </Panel>
        </div>

        <section aria-labelledby="son-bahsedilmeler-basligi">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 id="son-bahsedilmeler-basligi" className="text-[0.9375rem] font-semibold">
              Son bahsedilmeler
            </h2>
            <Link href={rangedListHref} className="inline-flex items-center gap-1 text-[0.875rem] font-semibold text-brand-strong hover:underline">
              Tümünü gör
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            {overview.highlights.map((mention) => (
              <MentionCard key={mention.id} mention={mention} queries={highlightQueries} topicNames={topicNames} now={now} editable={false} />
            ))}
          </div>
        </section>
      </div>
    </PageContainer>
  );
}
