import Link from "next/link";
import type { ReactNode } from "react";
import type { MetricId } from "@/domain/metrics";
import type { TimeRange } from "@/domain/types";
import { mentionsHref } from "@/lib/links";
import type { RangeKey } from "@/lib/time";
import type { BriefingPart, BriefingSentence } from "@/server/services/overview";
import { MetricInfo } from "./metric-info";

/**
 * Genel bakışın üst bölümü: ölçüm kartları ve dönemin yazılı özeti.
 * Özetteki her ölçüm kanıtına (süzülmüş bahsetme listesine) bağlanır.
 */

interface BriefingProps {
  sentences: BriefingSentence[];
  projectId: string;
  rangeKey: RangeKey;
  selectedRange: TimeRange;
}

function isSameRange(a: TimeRange, b: TimeRange): boolean {
  return a.from === b.from && a.to === b.to;
}

function Part({ part, projectId, rangeKey, selectedRange }: { part: BriefingPart } & Omit<BriefingProps, "sentences">) {
  if (part.kind === "text") return <>{part.text}</>;

  const className = part.style === "number" ? "briefing-reading" : "briefing-label";
  const linksSomewhere = part.query !== undefined || part.range !== undefined;
  if (!linksSomewhere) {
    return (
      <span className={className} data-tone={part.tone}>
        {part.text}
      </span>
    );
  }
  const narrowRange = part.range && !isSameRange(part.range, selectedRange) ? part.range : undefined;
  return (
    <Link href={mentionsHref(projectId, { query: part.query, range: narrowRange, rangeKey })} className={className} data-tone={part.tone}>
      {part.text}
    </Link>
  );
}

export function Briefing({ sentences, projectId, rangeKey, selectedRange }: BriefingProps) {
  return (
    <p className="max-w-[90ch] text-[1.0625rem] leading-[1.75] text-ink">
      {sentences.map((sentence, sentenceIndex) => (
        <span key={sentenceIndex}>
          {sentence.map((part, partIndex) => (
            <Part key={partIndex} part={part} projectId={projectId} rangeKey={rangeKey} selectedRange={selectedRange} />
          ))}{" "}
        </span>
      ))}
    </p>
  );
}

export interface ReadoutItem {
  label: string;
  value: string;
  /** Değerin altındaki kısa bağlam: değişim, kapsam. */
  note?: ReactNode;
  metric?: MetricId;
  href?: string;
}

/** Ölçüm kartları: sayfanın en üstünde, dönemin dört temel sayısı. */
export function Readouts({ items }: { items: ReadoutItem[] }) {
  return (
    <dl className="grid grid-cols-2 gap-4 xl:grid-cols-4">
      {items.map((item) => (
        <div key={item.label} className="rounded-xl border border-line bg-surface p-4 shadow-[var(--shadow-card)]">
          <dt className="flex items-center gap-1 text-[0.8125rem] font-medium text-ink-soft">
            {item.label}
            {item.metric ? <MetricInfo metric={item.metric} align="left" /> : null}
          </dt>
          <dd className="mt-2">
            {item.href ? (
              <Link href={item.href} className="text-[1.75rem] font-semibold leading-none tracking-[-0.02em] hover:text-brand-strong">
                {item.value}
              </Link>
            ) : (
              <span className="text-[1.75rem] font-semibold leading-none tracking-[-0.02em]">{item.value}</span>
            )}
            {item.note ? <span className="mt-1.5 block text-[0.8125rem] text-ink-muted">{item.note}</span> : null}
          </dd>
        </div>
      ))}
    </dl>
  );
}
