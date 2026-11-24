import { area, curveMonotoneX, line } from "d3-shape";
import { formatDateTime, formatFullDate, formatNumber } from "@/lib/format";
import type { Bucket } from "@/lib/time";
import { DataTable, TimeAxis, Tooltip, tooltipAlign, TooltipRow } from "./primitives";

/**
 * Yankı sırtları: her kaynak türü kendi taban çizgisinde, üst üste binen
 * sırtlar halinde. Çok serili tek bir çizgi grafiği yerine küçük çoğullar
 * kullanılır; renk tek (marka mürdümü), kimliği etiket taşır.
 * Tüm sırtlar aynı dikey ölçeği paylaşır, yükseklikler karşılaştırılabilir.
 */

export interface Ridge {
  key: string;
  label: string;
  total: number;
  points: Array<{ bucketStart: number; total: number }>;
}

interface RidgelineProps {
  ridges: Ridge[];
  bucket: Bucket;
}

const ROW_HEIGHT = 46;
/** Sırtın kendi satırının üstüne taşabildiği yükseklik (satır yüksekliğinin katı). */
const RISE = 2.1;
const VIEW_HEIGHT = 100;

function ridgePaths(values: number[], max: number): { fill: string; stroke: string } {
  const lastIndex = Math.max(1, values.length - 1);
  const x = (_: number, index: number) => (index / lastIndex) * 100;
  const y = (value: number) => VIEW_HEIGHT - (value / max) * VIEW_HEIGHT;
  return {
    fill: area<number>().x(x).y0(VIEW_HEIGHT).y1(y).curve(curveMonotoneX)(values) ?? "",
    stroke: line<number>().x(x).y(y).curve(curveMonotoneX)(values) ?? "",
  };
}

export function Ridgeline({ ridges, bucket }: RidgelineProps) {
  const visible = ridges.filter((ridge) => ridge.total > 0);
  if (visible.length === 0) return <p className="text-ink-muted">Bu dönemde içerik yok.</p>;

  const buckets = visible[0].points.map((point) => point.bucketStart);
  const max = Math.max(1, ...visible.flatMap((ridge) => ridge.points.map((point) => point.total)));
  const plotHeight = ROW_HEIGHT * RISE;
  const title = (bucketStart: number) => (bucket === "day" ? formatFullDate(bucketStart) : formatDateTime(bucketStart));

  return (
    <div>
      <div className="grid grid-cols-[minmax(7.5rem,auto)_1fr] gap-x-4">
        {/* Etiket sütunu */}
        <div style={{ paddingTop: plotHeight - ROW_HEIGHT }}>
          {visible.map((ridge) => (
            <div key={ridge.key} className="flex flex-col justify-end pb-1" style={{ height: ROW_HEIGHT }}>
              <span className="text-[0.8125rem] font-medium leading-tight">{ridge.label}</span>
              <span className="reading text-[0.75rem] text-ink-muted">{formatNumber(ridge.total)}</span>
            </div>
          ))}
        </div>

        {/* Sırtlar */}
        <div className="relative" style={{ height: plotHeight + ROW_HEIGHT * (visible.length - 1) }}>
          {visible.map((ridge, index) => {
            const paths = ridgePaths(ridge.points.map((point) => point.total), max);
            return (
              <svg
                key={ridge.key}
                viewBox={`0 0 100 ${VIEW_HEIGHT}`}
                preserveAspectRatio="none"
                className="absolute inset-x-0 w-full overflow-visible"
                style={{ top: index * ROW_HEIGHT, height: plotHeight }}
                aria-hidden="true"
              >
                {/* Öndeki sırt arkadakini kapatırken okunabilir kalsın diye yüzey rengiyle zeminlenir. */}
                <path d={paths.fill} fill="var(--surface)" />
                <path d={paths.fill} fill="var(--brand)" opacity="0.14" />
                <path d={paths.stroke} fill="none" stroke="var(--brand)" strokeWidth="1.6" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
                <line x1="0" x2="100" y1={VIEW_HEIGHT} y2={VIEW_HEIGHT} stroke="var(--axis)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
              </svg>
            );
          })}

          {/* Üzerine gelme katmanı: her kova için bir sütun */}
          <div className="absolute inset-0 flex">
            {buckets.map((bucketStart, index) => (
              <span
                key={bucketStart}
                tabIndex={0}
                aria-label={`${title(bucketStart)}: ${visible.map((ridge) => `${ridge.label} ${ridge.points[index].total}`).join(", ")}`}
                className="group relative min-w-0 flex-1 focus-visible:outline-none"
              >
                <span className="absolute inset-y-0 left-1/2 hidden w-px bg-ink-muted/50 group-hover:block group-focus-visible:block" />
                <Tooltip align={tooltipAlign(index, buckets.length)}>
                  <span className="mb-1.5 block font-semibold">{title(bucketStart)}</span>
                  <span className="flex min-w-40 flex-col gap-0.5">
                    {visible.map((ridge) => (
                      <TooltipRow key={ridge.key} label={ridge.label} value={formatNumber(ridge.points[index].total)} />
                    ))}
                  </span>
                </Tooltip>
              </span>
            ))}
          </div>
        </div>

        <span />
        <TimeAxis buckets={buckets} bucket={bucket} maxLabels={6} />
      </div>

      <DataTable
        caption="Kaynak türüne göre zaman içinde bahsetme sayısı"
        columns={[bucket === "day" ? "Gün" : "Saat", ...visible.map((ridge) => ridge.label)]}
        rows={buckets.map((bucketStart, index) => [title(bucketStart), ...visible.map((ridge) => formatNumber(ridge.points[index].total))])}
      />
    </div>
  );
}
