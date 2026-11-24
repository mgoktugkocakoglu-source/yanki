import { curveMonotoneX, line } from "d3-shape";
import { formatDateTime, formatFullDate, formatNumber } from "@/lib/format";
import type { Bucket } from "@/lib/time";
import { DataTable, GridLines, niceScale, TimeAxis, Tooltip, tooltipAlign, TooltipRow } from "./primitives";

/**
 * Çok serili çizgi grafiği: karşılaştırılan projeler. Renk projeye sabit
 * atanır (yuva numarası), sıralamaya göre değişmez; lejant her zaman vardır.
 */

export interface LineSeries {
  key: string;
  label: string;
  /** Kategorik palet yuvası (0 tabanlı). */
  colorSlot: number;
  points: Array<{ bucketStart: number; value: number }>;
}

export function seriesColor(slot: number): string {
  return `var(--series-${(slot % 5) + 1})`;
}

const VIEW_HEIGHT = 100;

export function MultiLineChart({ series, bucket, height = 240 }: { series: LineSeries[]; bucket: Bucket; height?: number }) {
  if (series.length === 0) return <p className="text-ink-muted">Karşılaştırılacak proje yok.</p>;

  const buckets = series[0].points.map((point) => point.bucketStart);
  const scale = niceScale(Math.max(...series.flatMap((entry) => entry.points.map((point) => point.value)), 0));
  const lastIndex = Math.max(1, buckets.length - 1);
  const path = line<{ value: number }>()
    .x((_, index) => (index / lastIndex) * 100)
    .y((point) => VIEW_HEIGHT - (point.value / scale.max) * VIEW_HEIGHT)
    .curve(curveMonotoneX);
  const title = (bucketStart: number) => (bucket === "day" ? formatFullDate(bucketStart) : formatDateTime(bucketStart));

  return (
    <div>
      <div className="relative" style={{ height }}>
        <GridLines scale={scale} />
        <div className="absolute inset-y-0 left-9 right-0">
          <svg viewBox={`0 0 100 ${VIEW_HEIGHT}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible" aria-hidden="true">
            {series.map((entry) => (
              <path
                key={entry.key}
                d={path(entry.points) ?? ""}
                fill="none"
                stroke={seriesColor(entry.colorSlot)}
                strokeWidth="2"
                strokeLinejoin="round"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
            ))}
          </svg>
          <div className="absolute inset-0 flex">
            {buckets.map((bucketStart, index) => (
              <span
                key={bucketStart}
                tabIndex={0}
                aria-label={`${title(bucketStart)}: ${series.map((entry) => `${entry.label} ${entry.points[index].value}`).join(", ")}`}
                className="group relative min-w-0 flex-1 focus-visible:outline-none"
              >
                <span className="absolute inset-y-0 left-1/2 hidden w-px bg-ink-muted/50 group-hover:block group-focus-visible:block" />
                <Tooltip align={tooltipAlign(index, buckets.length)}>
                  <span className="mb-1.5 block font-semibold">{title(bucketStart)}</span>
                  <span className="flex min-w-44 flex-col gap-0.5">
                    {series.map((entry) => (
                      <TooltipRow key={entry.key} color={seriesColor(entry.colorSlot)} label={entry.label} value={formatNumber(entry.points[index].value)} />
                    ))}
                  </span>
                </Tooltip>
              </span>
            ))}
          </div>
        </div>
      </div>

      <TimeAxis buckets={buckets} bucket={bucket} maxLabels={8} className="ml-9" />

      <DataTable
        caption="Projelere göre zaman içinde bahsetme sayısı"
        columns={[bucket === "day" ? "Gün" : "Saat", ...series.map((entry) => entry.label)]}
        rows={buckets.map((bucketStart, index) => [title(bucketStart), ...series.map((entry) => formatNumber(entry.points[index].value))])}
      />
    </div>
  );
}
