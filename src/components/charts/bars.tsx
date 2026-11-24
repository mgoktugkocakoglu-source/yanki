import Link from "next/link";
import { WEEKDAY_LABELS, WEEKDAY_SHORT_LABELS } from "@/domain/labels";
import { share } from "@/domain/metrics";
import { formatNumber, formatPercent } from "@/lib/format";
import { DataTable, Tooltip, TooltipRow } from "./primitives";

/** Çubuk tabanlı grafikler: ton şeridi, sıralı çubuklar ve yoğunluk haritası. */

export interface ToneValues {
  total: number;
  positive: number;
  negative: number;
  neutral: number;
}

const TONE_SEGMENTS = [
  { key: "negative", label: "Olumsuz", color: "var(--negative)", query: "ton:olumsuz" },
  { key: "neutral", label: "Nötr", color: "var(--neutral)", query: "ton:nötr" },
  { key: "positive", label: "Olumlu", color: "var(--positive)", query: "ton:olumlu" },
] as const;

/** Etiket ancak dilime rahatça sığıyorsa içine yazılır. */
const MIN_LABELLED_SHARE = 0.09;

interface ToneBarProps {
  values: ToneValues;
  /** Dilime tıklanınca gidilen liste; `q` parametresi eklenir. */
  mentionsHref: string;
}

/** Bütünün tonlara bölünüşü: tek, kalın, bölmeli bir şerit. */
export function ToneBar({ values, mentionsHref }: ToneBarProps) {
  if (values.total === 0) return <p className="text-ink-muted">Bu dönemde içerik yok.</p>;
  const separator = mentionsHref.includes("?") ? "&" : "?";

  return (
    <div>
      <div
        className="flex h-7 gap-0.5"
        role="img"
        aria-label={TONE_SEGMENTS.map((segment) => `${segment.label} ${formatPercent(share(values[segment.key], values.total))}`).join(", ")}
      >
        {TONE_SEGMENTS.map((segment) => {
          const value = values[segment.key];
          if (value === 0) return null;
          const ratio = share(value, values.total);
          return (
            <Link
              key={segment.key}
              href={`${mentionsHref}${separator}q=${encodeURIComponent(segment.query)}`}
              className="group relative flex min-w-1 items-center rounded px-2 text-[0.8125rem] font-semibold text-white"
              style={{ flex: value, background: segment.color }}
            >
              {ratio >= MIN_LABELLED_SHARE ? <span className="reading">{formatPercent(ratio)}</span> : null}
              <Tooltip align="center" side="bottom">
                <span className="block font-semibold">{segment.label}</span>
                <TooltipRow label="Bahsetme" value={formatNumber(value)} />
                <TooltipRow label="Pay" value={formatPercent(ratio)} />
              </Tooltip>
            </Link>
          );
        })}
      </div>
      <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-[0.8125rem] text-ink-soft">
        {TONE_SEGMENTS.map((segment) => (
          <span key={segment.key} className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-[2px]" style={{ background: segment.color }} aria-hidden="true" />
            {segment.label}
            <span className="reading text-ink">{formatNumber(values[segment.key])}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

export interface RankedRow extends Partial<Omit<ToneValues, "total">> {
  key: string;
  label: string;
  total: number;
  href?: string;
  /** Etiketin altındaki ikincil bilgi. */
  detail?: string;
}

interface RankedBarsProps {
  rows: RankedRow[];
  /** Çubuk tonlara bölünsün mü? Bölünmezse tek renk (marka) kullanılır. */
  splitByTone?: boolean;
  caption: string;
  labelHeader: string;
  emptyText?: string;
}

function RowBody({ row, max, splitByTone }: { row: RankedRow; max: number; splitByTone: boolean }) {
  const width = `${Math.max(1.5, (row.total / max) * 100)}%`;
  return (
    <>
      <span className="min-w-0">
        <span className="block truncate text-[0.875rem] font-medium group-hover:text-brand-strong">{row.label}</span>
        {row.detail ? <span className="block truncate text-[0.75rem] text-ink-muted">{row.detail}</span> : null}
      </span>
      <span className="flex items-center gap-2">
        <span className="flex h-3 gap-0.5 overflow-hidden rounded-r" style={{ width }}>
          {splitByTone ? (
            TONE_SEGMENTS.map((segment) => ((row[segment.key] ?? 0) > 0 ? <span key={segment.key} style={{ flex: row[segment.key], background: segment.color }} /> : null))
          ) : (
            <span className="flex-1 bg-brand" />
          )}
        </span>
        <span className="reading shrink-0 text-[0.8125rem]">{formatNumber(row.total)}</span>
      </span>
    </>
  );
}

/** Kategorileri büyükten küçüğe sıralı yatay çubuklarla gösterir. */
export function RankedBars({ rows, splitByTone = false, caption, labelHeader, emptyText = "Bu dönemde içerik yok." }: RankedBarsProps) {
  const visible = rows.filter((row) => row.total > 0);
  if (visible.length === 0) return <p className="text-ink-muted">{emptyText}</p>;
  const max = Math.max(...visible.map((row) => row.total));
  const rowClass = "group grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] items-center gap-3 rounded px-1.5 py-1.5";

  return (
    <div>
      <ul className="-mx-1.5 flex flex-col">
        {visible.map((row) => (
          <li key={row.key}>
            {row.href ? (
              <Link href={row.href} className={`${rowClass} hover:bg-brand-wash/60`}>
                <RowBody row={row} max={max} splitByTone={splitByTone} />
              </Link>
            ) : (
              <div className={rowClass}>
                <RowBody row={row} max={max} splitByTone={splitByTone} />
              </div>
            )}
          </li>
        ))}
      </ul>
      <DataTable
        caption={caption}
        columns={splitByTone ? [labelHeader, "Bahsetme", "Olumsuz", "Nötr", "Olumlu"] : [labelHeader, "Bahsetme"]}
        rows={visible.map((row) =>
          splitByTone
            ? [row.label, formatNumber(row.total), formatNumber(row.negative ?? 0), formatNumber(row.neutral ?? 0), formatNumber(row.positive ?? 0)]
            : [row.label, formatNumber(row.total)],
        )}
      />
    </div>
  );
}

export interface HeatCell {
  weekday: number;
  hour: number;
  total: number;
}

const SEQUENCE_STEPS = 7;
const HOURS = Array.from({ length: 24 }, (_, hour) => hour);

/**
 * Haftanın günü × günün saati yoğunluk haritası. Tek renk, açıktan koyuya;
 * en açık basamak "neredeyse hiç" demektir.
 */
export function Heatmap({ cells }: { cells: HeatCell[] }) {
  const byKey = new Map(cells.map((cell) => [`${cell.weekday}:${cell.hour}`, cell.total]));
  const max = Math.max(1, ...cells.map((cell) => cell.total));
  const stepOf = (value: number) => (value === 0 ? 0 : Math.max(1, Math.ceil((value / max) * SEQUENCE_STEPS)));

  return (
    <div>
      <div className="grid grid-cols-[2.25rem_repeat(24,minmax(0,1fr))] gap-0.5">
        {WEEKDAY_SHORT_LABELS.map((weekdayLabel, weekday) => (
          <div key={weekdayLabel} className="contents">
            <span className="flex items-center text-[0.75rem] text-ink-muted">{weekdayLabel}</span>
            {HOURS.map((hour) => {
              const value = byKey.get(`${weekday}:${hour}`) ?? 0;
              return (
                <span
                  key={hour}
                  tabIndex={0}
                  aria-label={`${WEEKDAY_LABELS[weekday]} ${String(hour).padStart(2, "0")}:00, ${value} bahsetme`}
                  className="group relative h-6 rounded-[3px] hover:ring-2 hover:ring-ink/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink"
                  style={{ background: `var(--seq-${stepOf(value)})` }}
                >
                  <Tooltip align={hour < 5 ? "left" : hour > 18 ? "right" : "center"}>
                    <span className="block font-semibold">
                      {WEEKDAY_LABELS[weekday]} {String(hour).padStart(2, "0")}:00–{String((hour + 1) % 24).padStart(2, "0")}:00
                    </span>
                    <TooltipRow label="Bahsetme" value={formatNumber(value)} />
                  </Tooltip>
                </span>
              );
            })}
          </div>
        ))}
        <span />
        {HOURS.map((hour) => (
          <span key={hour} className="reading text-center text-[0.6875rem] text-ink-muted" aria-hidden="true">
            {hour % 3 === 0 ? String(hour).padStart(2, "0") : ""}
          </span>
        ))}
      </div>

      <div className="mt-3 flex items-center gap-2 text-[0.75rem] text-ink-muted">
        <span>Az</span>
        <span className="flex gap-0.5" aria-hidden="true">
          {Array.from({ length: SEQUENCE_STEPS + 1 }, (_, step) => (
            <span key={step} className="h-2.5 w-5 rounded-[2px]" style={{ background: `var(--seq-${step})` }} />
          ))}
        </span>
        <span>Çok</span>
        <span className="reading ml-1">en yoğun saat: {formatNumber(max)}</span>
      </div>

      <DataTable
        caption="Haftanın gününe ve saate göre bahsetme sayısı"
        columns={["Gün", ...HOURS.map((hour) => String(hour).padStart(2, "0"))]}
        rows={WEEKDAY_LABELS.map((label, weekday) => [label, ...HOURS.map((hour) => byKey.get(`${weekday}:${hour}`) ?? 0)])}
      />
    </div>
  );
}
