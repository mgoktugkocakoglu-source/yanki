"use client";

import { Info } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { METRICS, type MetricId } from "@/domain/metrics";

/**
 * "Nasıl hesaplanır?" düğmesi. Arayüzdeki her bileşik sayının formülü ve
 * sınırları bir tık ötededir; kapalı kutu skor yoktur.
 */
export function MetricInfo({ metric, align = "right" }: { metric: MetricId; align?: "left" | "right" }) {
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLSpanElement>(null);
  const panelId = useId();
  const definition = METRICS[metric];

  useEffect(() => {
    if (!open) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <span ref={container} className="relative inline-flex">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={`${definition.name} nasıl hesaplanır?`}
        onClick={() => setOpen((value) => !value)}
        className="inline-flex h-5 w-5 items-center justify-center rounded-full text-ink-muted hover:bg-brand-wash hover:text-brand-strong"
      >
        <Info className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
      {open ? (
        <span
          id={panelId}
          role="note"
          className={`absolute top-full z-30 mt-2 block w-80 max-w-[80vw] rounded-md border border-line bg-surface p-3.5 text-left text-[0.8125rem] font-normal leading-relaxed text-ink shadow-pop ${
            align === "right" ? "right-0" : "left-0"
          }`}
        >
          <span className="block font-semibold">{definition.name}</span>
          <span className="reading mt-1.5 block rounded bg-sunken px-2 py-1.5 text-[0.75rem] leading-snug">{definition.formula}</span>
          <span className="mt-2 block text-ink-soft">{definition.notes}</span>
        </span>
      ) : null}
    </span>
  );
}
