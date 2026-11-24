import type { ReactNode } from "react";
import { EMOTION_LABELS, INTENT_LABELS, SENTIMENT_LABELS } from "@/domain/labels";
import type { Emotion, Intent, Sentiment } from "@/domain/types";

/** Küçük, durumsuz arayüz parçaları. */

export function PageContainer({ children }: { children: ReactNode }) {
  return <div className="mx-auto max-w-[1280px] px-4 pb-20 pt-6 sm:px-8">{children}</div>;
}

interface PageHeadingProps {
  title: string;
  /** Başlığın altındaki tek cümlelik bağlam. */
  lead?: ReactNode;
  actions?: ReactNode;
}

export function PageHeading({ title, lead, actions }: PageHeadingProps) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="min-w-0">
        <h1 className="text-[1.5rem] font-semibold leading-tight tracking-[-0.02em]">{title}</h1>
        {lead ? <p className="mt-1 max-w-[68ch] text-ink-soft">{lead}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

interface PanelProps {
  title?: string;
  /** Başlığın yanındaki kısa açıklama. */
  hint?: ReactNode;
  /** Başlık satırının sağ ucu: lejant, eylem, bilgi düğmesi. */
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
  id?: string;
}

export function Panel({ title, hint, aside, children, className, id }: PanelProps) {
  return (
    <section id={id} className={`rounded-xl border border-line bg-surface shadow-[var(--shadow-card)] ${className ?? ""}`}>
      {title ? (
        <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-5 pt-4">
          <div className="min-w-0">
            <h2 className="text-[0.9375rem] font-semibold leading-snug">{title}</h2>
            {hint ? <p className="mt-0.5 text-[0.8125rem] text-ink-muted">{hint}</p> : null}
          </div>
          {aside ? <div className="flex items-center gap-3 text-[0.8125rem] text-ink-soft">{aside}</div> : null}
        </header>
      ) : null}
      <div className="px-5 pb-5 pt-4">{children}</div>
    </section>
  );
}

const TONE_STYLE: Record<Sentiment, { dot: string; chip: string; sign: string }> = {
  positive: { dot: "bg-positive", chip: "bg-positive-wash text-positive-ink", sign: "+" },
  negative: { dot: "bg-negative", chip: "bg-negative-wash text-negative-ink", sign: "−" },
  neutral: { dot: "bg-neutral", chip: "bg-neutral-wash text-ink-soft", sign: "○" },
};

/** Ton etiketi: renk + işaret + yazı; renk hiçbir zaman tek başına bilgi taşımaz. */
export function ToneChip({ sentiment, corrected = false }: { sentiment: Sentiment; corrected?: boolean }) {
  const style = TONE_STYLE[sentiment];
  return (
    <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[0.75rem] font-semibold ${style.chip}`}>
      <span aria-hidden="true" className="font-mono leading-none">
        {style.sign}
      </span>
      {SENTIMENT_LABELS[sentiment]}
      {corrected ? <span className="font-normal opacity-80">· düzeltildi</span> : null}
    </span>
  );
}

export function Tag({ children, title }: { children: ReactNode; title?: string }) {
  return (
    <span title={title} className="inline-flex items-center rounded border border-line bg-sunken px-1.5 py-0.5 text-[0.75rem] text-ink-soft">
      {children}
    </span>
  );
}

export function emotionLabel(emotion: Emotion): string | null {
  return emotion === "none" ? null : EMOTION_LABELS[emotion];
}

export function intentLabel(intent: Intent): string | null {
  return intent === "general" ? null : INTENT_LABELS[intent];
}

/** Lejant girişi: renk örneği + yazı. Yazı her zaman mürekkep rengindedir. */
export function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <span className="h-2.5 w-2.5 rounded-[2px]" style={{ background: color }} aria-hidden="true" />
      {label}
    </span>
  );
}

export function ToneLegend() {
  return (
    <>
      <LegendItem color="var(--negative)" label="Olumsuz" />
      <LegendItem color="var(--neutral)" label="Nötr" />
      <LegendItem color="var(--positive)" label="Olumlu" />
    </>
  );
}

interface EmptyStateProps {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}

/** Boş ekran bir çıkmaz değil, bir sonraki adımın daveti olmalı. */
export function EmptyState({ title, children, action }: EmptyStateProps) {
  return (
    <div className="rounded-lg border border-dashed border-line-strong bg-surface px-6 py-12 text-center">
      <p className="font-display text-[1.35rem] font-medium">{title}</p>
      {children ? <div className="mx-auto mt-2 max-w-[56ch] text-ink-soft">{children}</div> : null}
      {action ? <div className="mt-5 flex justify-center gap-2">{action}</div> : null}
    </div>
  );
}

export const BUTTON_PRIMARY =
  "inline-flex h-9 items-center justify-center gap-1.5 rounded-md bg-brand px-3.5 text-[0.875rem] font-semibold text-[var(--on-brand)] transition-colors hover:bg-brand-strong disabled:cursor-not-allowed disabled:opacity-60";

export const BUTTON_SECONDARY =
  "inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-line-strong bg-surface px-3.5 text-[0.875rem] font-semibold text-ink transition-colors hover:border-ink-muted disabled:cursor-not-allowed disabled:opacity-60";

export const INPUT = "w-full rounded-md border border-line-strong bg-surface px-3 py-2 text-[0.9375rem] text-ink placeholder:text-ink-muted hover:border-ink-muted";
