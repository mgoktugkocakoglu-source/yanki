import Link from "next/link";
import { formatDateTime, formatFullDate, formatNumber } from "@/lib/format";
import { bucketSizeMs, type Bucket } from "@/lib/time";
import { DataTable, GridLines, niceScale, TimeAxis, Tooltip, tooltipAlign, TooltipRow } from "./primitives";

/**
 * Hacim ve ton grafiği: her kova bir sütun, sütun tonlara bölünmüş.
 * Olumsuz dilim tabana oturur; böylece yüksekliği doğrudan eksenden okunur.
 * İki ölçek kullanılmaz: tek eksen, tek birim (bahsetme sayısı).
 */

export interface VolumePoint {
  bucketStart: number;
  total: number;
  positive: number;
  negative: number;
  neutral: number;
}

export interface VolumeMarker {
  bucketStart: number;
  level: "info" | "attention" | "critical";
}

interface VolumeChartProps {
  points: VolumePoint[];
  bucket: Bucket;
  markers?: VolumeMarker[];
  /** Sütuna tıklanınca gidilen liste: `bas` ve `bit` parametreleri eklenir. */
  mentionsHref: string;
  height?: number;
}

const MARKER_STYLE = {
  critical: { color: "var(--critical)", label: "Kritik: olağan dışı hareket" },
  attention: { color: "var(--warning)", label: "Dikkat: olağan dışı hareket" },
  info: { color: "var(--brand)", label: "Bilgi: olağan dışı artış" },
} as const;

/** Sütunun üstünde duran yankı halkası: bu kovada olağan dışı bir şey oldu. */
function AnomalyRing({ level }: { level: VolumeMarker["level"] }) {
  const { color } = MARKER_STYLE[level];
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden="true">
      <circle cx="8" cy="8" r="6.5" fill="none" stroke={color} strokeWidth="1.2" opacity="0.4" />
      <circle cx="8" cy="8" r="3.6" fill="var(--surface)" stroke={color} strokeWidth="1.8" />
      <circle cx="8" cy="8" r="1.3" fill={color} />
    </svg>
  );
}

function bucketTitle(point: VolumePoint, bucket: Bucket): string {
  return bucket === "day" ? formatFullDate(point.bucketStart) : formatDateTime(point.bucketStart);
}

export function VolumeChart({ points, bucket, markers = [], mentionsHref, height = 232 }: VolumeChartProps) {
  const scale = niceScale(Math.max(...points.map((point) => point.total), 0));
  const markerByStart = new Map(markers.map((marker) => [marker.bucketStart, marker]));
  const size = bucketSizeMs(bucket);
  const separator = mentionsHref.includes("?") ? "&" : "?";

  return (
    <div>
      <div className="relative" style={{ height }}>
        <GridLines scale={scale} />
        <div className="absolute inset-0 flex items-end pl-9">
          {points.map((point, index) => {
            const marker = markerByStart.get(point.bucketStart);
            const heightPercent = (point.total / scale.max) * 100;
            const title = bucketTitle(point, bucket);
            return (
              <Link
                key={point.bucketStart}
                href={`${mentionsHref}${separator}bas=${point.bucketStart}&bit=${point.bucketStart + size}`}
                aria-label={`${title}: ${formatNumber(point.total)} bahsetme, ${formatNumber(point.negative)} olumsuz${marker ? `. ${MARKER_STYLE[marker.level].label}` : ""}`}
                className="group relative flex h-full min-w-0 flex-1 items-end justify-center rounded-sm px-px hover:bg-brand-wash/70 focus-visible:bg-brand-wash/70"
              >
                {marker ? (
                  <span className="absolute left-1/2 -translate-x-1/2" style={{ bottom: `calc(${heightPercent}% + 5px)` }}>
                    <AnomalyRing level={marker.level} />
                  </span>
                ) : null}
                <span className="flex w-full max-w-6 flex-col gap-0.5 overflow-hidden rounded-t" style={{ height: `${heightPercent}%`, minHeight: point.total > 0 ? 3 : 0 }}>
                  {point.positive > 0 ? <span className="bg-positive" style={{ flex: point.positive }} /> : null}
                  {point.neutral > 0 ? <span className="bg-neutral" style={{ flex: point.neutral }} /> : null}
                  {point.negative > 0 ? <span className="bg-negative" style={{ flex: point.negative }} /> : null}
                </span>
                <Tooltip align={tooltipAlign(index, points.length)}>
                  <span className="mb-1.5 block font-semibold">{title}</span>
                  <span className="flex min-w-44 flex-col gap-0.5">
                    <TooltipRow label="Bahsetme" value={formatNumber(point.total)} />
                    <TooltipRow color="var(--positive)" label="Olumlu" value={formatNumber(point.positive)} />
                    <TooltipRow color="var(--neutral)" label="Nötr" value={formatNumber(point.neutral)} />
                    <TooltipRow color="var(--negative)" label="Olumsuz" value={formatNumber(point.negative)} />
                  </span>
                  {marker ? (
                    <span className="mt-1.5 block font-medium" style={{ color: MARKER_STYLE[marker.level].color }}>
                      {MARKER_STYLE[marker.level].label}
                    </span>
                  ) : null}
                  <span className="mt-1.5 block text-ink-muted">İçerikleri görmek için tıklayın</span>
                </Tooltip>
              </Link>
            );
          })}
        </div>
      </div>

      <TimeAxis buckets={points.map((point) => point.bucketStart)} bucket={bucket} maxLabels={8} className="ml-9" />

      <DataTable
        caption="Zamana göre bahsetme sayısı ve ton dağılımı"
        columns={[bucket === "day" ? "Gün" : "Saat", "Bahsetme", "Olumlu", "Nötr", "Olumsuz"]}
        rows={points.map((point) => [
          bucket === "day" ? formatFullDate(point.bucketStart) : formatDateTime(point.bucketStart),
          formatNumber(point.total),
          formatNumber(point.positive),
          formatNumber(point.neutral),
          formatNumber(point.negative),
        ])}
      />
    </div>
  );
}
