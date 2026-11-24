"use client";

import { ChevronDown, EyeOff, Undo2 } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";
import { SENTIMENT_LABELS } from "@/domain/labels";
import { SENTIMENTS, type Sentiment } from "@/domain/types";
import { setIrrelevantAction, setToneAction } from "@/server/actions/mentions";

/**
 * İnsan düzeltmeleri: tonu değiştir, ilgisiz işaretle. Model sonucu silinmez;
 * düzeltme ayrı saklanır ve istenirse geri alınır.
 */

interface MentionActionsProps {
  mentionId: string;
  modelSentiment: Sentiment;
  override: Sentiment | null;
  isIrrelevant: boolean;
}

export function MentionActions({ mentionId, modelSentiment, override, isIrrelevant }: MentionActionsProps) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const container = useRef<HTMLDivElement>(null);
  const effective = override ?? modelSentiment;

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent ? event.key === "Escape" : !container.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  const chooseTone = (sentiment: Sentiment | null) => {
    setOpen(false);
    startTransition(async () => setToneAction(mentionId, sentiment));
  };

  const linkClass = "inline-flex items-center gap-1 rounded px-1.5 py-1 text-[0.8125rem] text-ink-soft hover:bg-sunken hover:text-ink disabled:opacity-50";

  return (
    <div ref={container} className={`relative flex items-center gap-1 ${pending ? "opacity-60" : ""}`}>
      <button type="button" className={linkClass} aria-haspopup="menu" aria-expanded={open} disabled={pending} onClick={() => setOpen((value) => !value)}>
        Tonu düzelt
        <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
      {open ? (
        <div role="menu" className="absolute bottom-full right-0 z-20 mb-1 w-52 rounded-md border border-line bg-surface p-1 shadow-pop">
          {SENTIMENTS.map((sentiment) => (
            <button
              key={sentiment}
              type="button"
              role="menuitemradio"
              aria-checked={sentiment === effective}
              onClick={() => chooseTone(sentiment)}
              className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-[0.875rem] hover:bg-sunken"
            >
              {SENTIMENT_LABELS[sentiment]}
              {sentiment === modelSentiment ? <span className="text-[0.75rem] text-ink-muted">model</span> : null}
            </button>
          ))}
          {override ? (
            <button
              type="button"
              role="menuitem"
              onClick={() => chooseTone(null)}
              className="mt-1 flex w-full items-center gap-1.5 rounded border-t border-line px-2 py-1.5 text-left text-[0.875rem] text-ink-soft hover:bg-sunken"
            >
              <Undo2 className="h-3.5 w-3.5" aria-hidden="true" />
              Model sonucuna dön
            </button>
          ) : null}
        </div>
      ) : null}

      <button
        type="button"
        className={linkClass}
        disabled={pending}
        onClick={() => startTransition(async () => setIrrelevantAction(mentionId, !isIrrelevant))}
        title={isIrrelevant ? "Bu içeriği yeniden sayımlara dahil et" : "Bu içerik projeyle ilgili değil; sayımlardan çıkar"}
      >
        {isIrrelevant ? <Undo2 className="h-3.5 w-3.5" aria-hidden="true" /> : <EyeOff className="h-3.5 w-3.5" aria-hidden="true" />}
        {isIrrelevant ? "İlgili say" : "İlgisiz"}
      </button>
    </div>
  );
}
