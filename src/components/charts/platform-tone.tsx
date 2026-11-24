import Link from "next/link";
import { share } from "@/domain/metrics";
import { formatNumber, formatPercent } from "@/lib/format";
import type { ToneValues } from "./bars";

/**
 * Platforma göre duygu dağılımı. Her satır kendi içinde %100'e ölçeklenir;
 * böylece hacmi farklı platformların ton dengesi yan yana okunabilir.
 * Yüzdeler işaret ve yazıyla da verilir; renk tek başına bilgi taşımaz.
 */

export interface PlatformToneRow extends ToneValues {
  key: string;
  label: string;
  href?: string;
}

const SEGMENTS = [
  { key: "negative", label: "olumsuz", sign: "−", color: "var(--negative)" },
  { key: "neutral", label: "nötr", sign: "○", color: "var(--neutral)" },
  { key: "positive", label: "olumlu", sign: "+", color: "var(--positive)" },
] as const;

/** Bu sayının altındaki platformlarda yüzdeler yanıltıcı olur; uyarı gösterilir. */
const SMALL_SAMPLE = 20;

export function PlatformTone({ rows, overall }: { rows: PlatformToneRow[]; overall: ToneValues }) {
  const visible = rows.filter((row) => row.total > 0);
  if (visible.length === 0) return <p className="text-ink-muted">Bu dönemde içerik yok.</p>;

  const all: PlatformToneRow[] = [{ key: "__genel", label: "Tüm platformlar", ...overall }, ...visible];
  return (
    <ul className="flex flex-col divide-y divide-line">
      {all.map((row, index) => (
        <li key={row.key} className="py-3 first:pt-0 last:pb-0">
          <div className="flex items-baseline justify-between gap-3">
            {row.href ? (
              <Link href={row.href} className="truncate text-[0.875rem] font-medium hover:text-brand-strong hover:underline">
                {row.label}
              </Link>
            ) : (
              <span className={`truncate text-[0.875rem] ${index === 0 ? "font-semibold" : "font-medium"}`}>{row.label}</span>
            )}
            <span className="reading shrink-0 text-[0.8125rem] text-ink-soft">{formatNumber(row.total)} içerik</span>
          </div>
          <div className="mt-1.5 flex h-2.5 gap-0.5 overflow-hidden rounded" aria-hidden="true">
            {SEGMENTS.map((segment) => (row[segment.key] > 0 ? <span key={segment.key} style={{ flex: row[segment.key], background: segment.color }} /> : null))}
          </div>
          <p className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 text-[0.8125rem] text-ink-soft">
            {SEGMENTS.map((segment) => (
              <span key={segment.key}>
                <span aria-hidden="true">{segment.sign} </span>
                {segment.label} <span className="reading text-ink">{formatPercent(share(row[segment.key], row.total))}</span>
              </span>
            ))}
            {row.total < SMALL_SAMPLE ? <span className="text-ink-muted">az içerik; oranlar yön gösterir</span> : null}
          </p>
        </li>
      ))}
    </ul>
  );
}
