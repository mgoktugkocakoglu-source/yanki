import { share } from "@/domain/metrics";
import { formatNumber, formatPercent } from "@/lib/format";

/**
 * Platforma göre olumsuz oranının zaman içindeki seyri: her platform için
 * aynı ölçekte (0–%100) küçük bir çizgi. İçeriği az olan kovalar çizilmez;
 * az veriyle hesaplanan oran yanıltıcı olur.
 */

export interface PlatformTrendPoint {
  bucketStart: number;
  total: number;
  negative: number;
}

export interface PlatformTrendRow {
  key: string;
  label: string;
  total: number;
  points: PlatformTrendPoint[];
}

/** Bir kovanın oranı bu sayının altındaki içerikle hesaplanmaz. */
export const MIN_BUCKET_VOLUME = 5;

const WIDTH = 240;
const HEIGHT = 44;

/** Dönemin ilk ve son yarısındaki olumsuz oranı; yeterli içerik yoksa null. */
export function halves(points: PlatformTrendPoint[]): { first: number | null; second: number | null } {
  const middle = Math.floor(points.length / 2);
  const rate = (slice: PlatformTrendPoint[]) => {
    const total = slice.reduce((sum, point) => sum + point.total, 0);
    return total >= MIN_BUCKET_VOLUME
      ? share(
          slice.reduce((sum, point) => sum + point.negative, 0),
          total,
        )
      : null;
  };
  return { first: rate(points.slice(0, middle)), second: rate(points.slice(middle)) };
}

export function PlatformTrend({ rows }: { rows: PlatformTrendRow[] }) {
  const visible = rows.filter((row) => row.total > 0);
  if (visible.length === 0) return <p className="text-ink-muted">Bu dönemde içerik yok.</p>;

  return (
    <ul className="flex flex-col divide-y divide-line">
      {visible.map((row) => {
        const step = row.points.length > 1 ? WIDTH / (row.points.length - 1) : 0;
        const drawn = row.points.flatMap((point, index) =>
          point.total >= MIN_BUCKET_VOLUME ? [{ x: index * step, y: HEIGHT - share(point.negative, point.total) * HEIGHT }] : [],
        );
        const { first, second } = halves(row.points);
        return (
          <li
            key={row.key}
            className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 py-3 first:pt-0 last:pb-0 sm:grid-cols-[minmax(0,10rem)_minmax(0,1fr)_minmax(0,14rem)]"
          >
            <div className="min-w-0">
              <p className="truncate text-[0.875rem] font-medium">{row.label}</p>
              <p className="reading text-[0.75rem] text-ink-muted">{formatNumber(row.total)} içerik</p>
            </div>
            <svg
              viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
              className="hidden h-11 w-full sm:block"
              preserveAspectRatio="none"
              role="img"
              aria-label={`${row.label}: olumsuz oranının seyri`}
            >
              <line x1="0" y1={HEIGHT} x2={WIDTH} y2={HEIGHT} stroke="var(--line)" strokeWidth="1" />
              <line x1="0" y1={HEIGHT / 2} x2={WIDTH} y2={HEIGHT / 2} stroke="var(--line)" strokeWidth="1" strokeDasharray="2 4" />
              {drawn.length > 1 ? (
                <polyline
                  points={drawn.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ")}
                  fill="none"
                  stroke="var(--negative)"
                  strokeWidth="2"
                  vectorEffect="non-scaling-stroke"
                />
              ) : null}
              {drawn.map((point) => (
                <circle key={point.x} cx={point.x} cy={point.y} r="1.6" fill="var(--negative)" />
              ))}
            </svg>
            <p className="text-right text-[0.8125rem] text-ink-soft sm:text-left">
              {first === null || second === null ? (
                <span className="text-ink-muted">dönemin bir yarısında içerik az; karşılaştırma yapılmadı</span>
              ) : (
                <>
                  olumsuz: ilk yarı <span className="reading text-ink">{formatPercent(first)}</span> → son yarı <span className="reading text-ink">{formatPercent(second)}</span>
                </>
              )}
            </p>
          </li>
        );
      })}
    </ul>
  );
}
