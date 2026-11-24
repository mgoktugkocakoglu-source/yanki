import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AnomalyCard } from "@/components/anomaly-card";
import { MetricInfo } from "@/components/metric-info";
import { EmptyState, PageContainer, PageHeading } from "@/components/ui";
import { formatNumber } from "@/lib/format";
import { projectHref } from "@/lib/links";
import { SENSITIVITIES, type Sensitivity } from "@/lib/stats/anomaly";
import { DEFAULT_RANGE, RANGE_PRESETS, resolveRange } from "@/lib/time";
import { loadProjectContext, readRange, readString } from "@/server/context";
import { explainAnomaly, findAnomalies } from "@/server/services/alerts";

export const metadata: Metadata = { title: "Uyarılar" };

const SENSITIVITY_LABELS: Record<Sensitivity, { label: string; hint: string }> = {
  low: { label: "Düşük", hint: "yalnızca belirgin sıçramalar" },
  medium: { label: "Orta", hint: "varsayılan" },
  high: { label: "Yüksek", hint: "küçük hareketler de" },
};
const SENSITIVITY_PARAM = "hassasiyet";
const SENSITIVITY_VALUES: Record<Sensitivity, string> = { low: "dusuk", medium: "orta", high: "yuksek" };

function readSensitivity(value: string): Sensitivity {
  return SENSITIVITIES.find((entry) => SENSITIVITY_VALUES[entry] === value) ?? "medium";
}

/** Bir sayfada açıklaması hesaplanan en çok hareket. */
const MAX_EXPLAINED = 12;

export default async function AlertsPage({ params, searchParams }: PageProps<"/proje/[id]/uyarilar">) {
  const { id } = await params;
  const context = await loadProjectContext(id);
  if (!context) notFound();

  const { project, now } = context;
  const rawParams = await searchParams;
  const rangeKey = readRange(rawParams);
  const sensitivity = readSensitivity(readString(rawParams, SENSITIVITY_PARAM));
  const range = resolveRange(rangeKey, now);
  const bucket = RANGE_PRESETS[rangeKey].bucket;

  const anomalies = (await findAnomalies(project.id, range, bucket, sensitivity)).sort((a, b) => b.bucketStart - a.bucketStart);
  const explained = await Promise.all(anomalies.slice(0, MAX_EXPLAINED).map(async (anomaly) => explainAnomaly(project, anomaly, bucket)));
  const critical = anomalies.filter((anomaly) => anomaly.level === "critical").length;

  return (
    <PageContainer>
      <PageHeading
        title="Uyarılar"
        lead={
          <span className="inline-flex flex-wrap items-center gap-x-1.5">
            {RANGE_PRESETS[rangeKey].label} içinde hacmi ya da tonu olağan sınırların dışına çıkan {bucket === "day" ? "günler" : "saatler"}.
            {anomalies.length > 0 ? (
              <>
                <span className="reading text-ink">{formatNumber(anomalies.length)}</span> hareket
                {critical > 0 ? (
                  <>
                    , <span className="reading text-ink">{formatNumber(critical)}</span> tanesi kritik
                  </>
                ) : null}
                .
              </>
            ) : null}
            <MetricInfo metric="anomaly" align="left" />
          </span>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-3 text-[0.8125rem]">
        <span className="font-medium text-ink-soft">Duyarlılık</span>
        <div role="group" aria-label="Uyarı duyarlılığı" className="inline-flex rounded-lg border border-line bg-sunken p-0.5">
          {SENSITIVITIES.map((entry) => {
            const params = new URLSearchParams();
            if (rangeKey !== DEFAULT_RANGE) params.set("d", rangeKey);
            if (entry !== "medium") params.set(SENSITIVITY_PARAM, SENSITIVITY_VALUES[entry]);
            const query = params.toString();
            return (
              <Link
                key={entry}
                href={`${projectHref(project.id, "uyarilar")}${query ? `?${query}` : ""}`}
                aria-current={entry === sensitivity ? "true" : undefined}
                title={SENSITIVITY_LABELS[entry].hint}
                className={`rounded px-2.5 py-1 font-medium transition-colors ${
                  entry === sensitivity ? "bg-surface text-brand-strong shadow-[0_0_0_1px_var(--line)]" : "text-ink-soft hover:text-ink"
                }`}
              >
                {SENSITIVITY_LABELS[entry].label}
              </Link>
            );
          })}
        </div>
        <span className="text-ink-muted">{SENSITIVITY_LABELS[sensitivity].hint} · Genel Bakış her zaman orta duyarlılığı kullanır</span>
      </div>

      {explained.length === 0 ? (
        <EmptyState title="Olağan dışı bir hareket yok">
          Bu dönemde hacim ve olumsuz oranı, önceki haftaların düzeyine yakın seyretti. Bir sıçrama olduğunda burada nedenini; hangi kaynaktan, hangi başlıkla ve hangi konuda
          büyüdüğünü göreceksiniz.
        </EmptyState>
      ) : (
        <div className="flex max-w-[60rem] flex-col gap-3">
          {explained.map((anomaly) => (
            <AnomalyCard key={anomaly.bucketStart} anomaly={anomaly} mentionsHref={projectHref(project.id, "bahsetmeler")} />
          ))}
          {anomalies.length > explained.length ? (
            <p className="text-[0.875rem] text-ink-muted">En yeni {MAX_EXPLAINED} hareket gösteriliyor; daha eskileri için dönemi daraltın.</p>
          ) : null}
        </div>
      )}
    </PageContainer>
  );
}
