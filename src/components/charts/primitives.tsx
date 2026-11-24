import { scaleLinear } from "d3-scale";
import type { ReactNode } from "react";
import { formatBucket, formatCompact } from "@/lib/format";
import type { Bucket } from "@/lib/time";

/**
 * Grafiklerin ortak parçaları.
 *
 * Grafikler sunucuda HTML/CSS ve SVG olarak çizilir; tarayıcıda betik
 * çalışmaz. İpucu kutuları fareyle üzerine gelince de klavye odağıyla da
 * açılır (CSS `group-hover` / `group-focus-visible`), her grafiğin altında
 * aynı verinin tablo karşılığı bulunur.
 */

export interface AxisScale {
  /** Eksenin üst sınırı (yuvarlanmış). */
  max: number;
  ticks: number[];
}

/** 0'dan başlayan, yuvarlak sayılarda biten dikey eksen. */
export function niceScale(maxValue: number, tickCount = 4): AxisScale {
  const scale = scaleLinear()
    .domain([0, Math.max(1, maxValue)])
    .nice(tickCount);
  const ticks = scale.ticks(tickCount).filter(Number.isInteger);
  return { max: scale.domain()[1], ticks };
}

/** Yatay kılavuz çizgileri ve değer etiketleri. Kapsayıcı `relative` olmalıdır. */
export function GridLines({ scale }: { scale: AxisScale }) {
  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden="true">
      {scale.ticks.map((tick) => (
        <div key={tick} className="absolute inset-x-0 flex items-center" style={{ bottom: `${(tick / scale.max) * 100}%`, transform: "translateY(50%)" }}>
          <span className="reading w-9 shrink-0 pr-2 text-right text-[0.6875rem] text-ink-muted">{formatCompact(tick)}</span>
          <span className="h-px flex-1" style={{ background: tick === 0 ? "var(--axis)" : "var(--grid)" }} />
        </div>
      ))}
    </div>
  );
}

interface TooltipProps {
  children: ReactNode;
  /** İpucu kutusunun hizası; sağ kenara yakın işaretlerde taşmayı önler. */
  align: "left" | "center" | "right";
  /** Kutunun işaretin üstünde mi altında mı açılacağı. */
  side?: "top" | "bottom";
}

const ALIGN_CLASS = { left: "left-0", center: "left-1/2 -translate-x-1/2", right: "right-0" } as const;

/**
 * İpucu kutusu. Üst öğesi `group relative` olmalıdır; kutu o öğenin üzerine
 * gelindiğinde ya da klavye odağı aldığında görünür.
 */
export function Tooltip({ children, align, side = "top" }: TooltipProps) {
  return (
    <span
      role="tooltip"
      className={`pointer-events-none invisible absolute z-20 w-max max-w-[18rem] rounded-md border border-line bg-surface px-3 py-2 text-left text-[0.8125rem] leading-snug text-ink opacity-0 shadow-pop transition-opacity duration-100 group-hover:visible group-hover:opacity-100 group-focus-visible:visible group-focus-visible:opacity-100 ${
        ALIGN_CLASS[align]
      } ${side === "top" ? "bottom-full mb-2" : "top-full mt-2"}`}
    >
      {children}
    </span>
  );
}

/** İpucu hizası: işaretin yatay konumuna göre. */
export function tooltipAlign(index: number, count: number): TooltipProps["align"] {
  const position = count <= 1 ? 0.5 : index / (count - 1);
  if (position < 0.18) return "left";
  if (position > 0.82) return "right";
  return "center";
}

export function TooltipRow({ color, label, value }: { color?: string; label: string; value: string }) {
  return (
    <span className="flex items-center justify-between gap-5">
      <span className="flex items-center gap-1.5 text-ink-soft">
        {color ? <span className="h-2 w-2 rounded-[2px]" style={{ background: color }} aria-hidden="true" /> : null}
        {label}
      </span>
      <span className="reading font-medium">{value}</span>
    </span>
  );
}

interface DataTableProps {
  caption: string;
  columns: string[];
  rows: Array<Array<string | number>>;
}

/** Grafiğin tablo karşılığı: ekran okuyucu ve "sayıyı görmek isteyen" için. */
export function DataTable({ caption, columns, rows }: DataTableProps) {
  return (
    <details className="group/table mt-3 text-[0.8125rem]">
      <summary className="inline-flex cursor-pointer select-none items-center gap-1 rounded text-ink-muted hover:text-ink">
        <span className="group-open/table:hidden">Tablo olarak göster</span>
        <span className="hidden group-open/table:inline">Tabloyu gizle</span>
      </summary>
      <div className="mt-2 max-h-72 overflow-auto rounded border border-line">
        <table className="w-full border-collapse text-left">
          <caption className="sr-only">{caption}</caption>
          <thead className="sticky top-0 bg-sunken">
            <tr>
              {columns.map((column, index) => (
                <th key={column} scope="col" className={`px-3 py-1.5 font-semibold ${index > 0 ? "text-right" : ""}`}>
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={rowIndex} className="border-t border-line">
                {row.map((cell, index) => (
                  <td key={index} className={`px-3 py-1.5 ${index > 0 ? "reading text-right" : ""}`}>
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

interface TimeAxisProps {
  buckets: readonly number[];
  bucket: Bucket;
  maxLabels: number;
  className?: string;
}

/**
 * Zaman ekseni etiketleri. Kovalarla aynı esnek ızgarayı kullanır, böylece
 * her etiket kendi sütununun tam altına düşer. Dar ekranda etiketlerin
 * yarısı gizlenir; en güncel kova her zaman etiketli kalır.
 */
export function TimeAxis({ buckets, bucket, maxLabels, className = "" }: TimeAxisProps) {
  const indexes = axisLabelIndexes(buckets.length, maxLabels);
  const orderByIndex = new Map(indexes.map((index, order) => [index, order]));

  return (
    <div className={`relative mt-1.5 flex h-4 ${className}`} aria-hidden="true">
      {buckets.map((bucketStart, index) => {
        const order = orderByIndex.get(index);
        const hiddenOnNarrow = order !== undefined && (indexes.length - 1 - order) % 2 === 1;
        return (
          <span key={bucketStart} className="relative min-w-0 flex-1">
            {order === undefined ? null : (
              <span className={`reading absolute left-1/2 -translate-x-1/2 whitespace-nowrap text-[0.6875rem] text-ink-muted ${hiddenOnNarrow ? "max-sm:hidden" : ""}`}>
                {formatBucket(bucketStart, bucket)}
              </span>
            )}
          </span>
        );
      })}
    </div>
  );
}

/** Zaman ekseninde gösterilecek etiketlerin dizinleri: sık değil, eşit aralıklı. */
function axisLabelIndexes(count: number, maxLabels: number): number[] {
  if (count <= maxLabels) return Array.from({ length: count }, (_, index) => index);
  const step = Math.ceil(count / maxLabels);
  const indexes: number[] = [];
  // Sondan başa: en güncel kova her zaman etiketlenir.
  for (let index = count - 1; index >= 0; index -= step) indexes.unshift(index);
  return indexes;
}
