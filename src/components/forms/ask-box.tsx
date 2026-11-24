"use client";

import { MessageCircleQuestion } from "lucide-react";
import Link from "next/link";
import { useActionState } from "react";
import type { RangeKey } from "@/lib/time";
import { askQuestionAction, type AskState } from "@/server/actions";
import { BUTTON_SECONDARY, INPUT } from "../ui";

const INITIAL: AskState = { status: "idle" };

const EXAMPLES = ["Bu dönemde en çok ne konuşuldu?", "Olumsuz içerikler hangi konuda yoğunlaşıyor?", "Platformlar arasında ton nasıl farklılaşıyor?"];

/** Düz yazıyla soru: yanıt dil modelinden gelir, altında dayanak içerikler bağlanır. */
export function AskBox({ projectId, rangeKey, evidenceBase }: { projectId: string; rangeKey: RangeKey; evidenceBase: string }) {
  const [state, action, pending] = useActionState(askQuestionAction, INITIAL);
  const separator = evidenceBase.includes("?") ? "&" : "?";

  return (
    <div>
      <form action={action} className="flex flex-col gap-3 sm:flex-row">
        <input type="hidden" name="projectId" value={projectId} />
        <input type="hidden" name="rangeKey" value={rangeKey} />
        <label htmlFor="soru" className="sr-only">
          Sorunuz
        </label>
        <input id="soru" name="question" type="text" required minLength={3} maxLength={300} autoComplete="off" placeholder={`Örn. ${EXAMPLES[0]}`} className={INPUT} />
        <button type="submit" disabled={pending} className={`${BUTTON_SECONDARY} shrink-0`}>
          <MessageCircleQuestion className="h-4 w-4" aria-hidden="true" />
          {pending ? "Yanıtlanıyor…" : "Sor"}
        </button>
      </form>

      <div role="status" aria-live="polite" className="mt-3">
        {pending ? <p className="text-[0.875rem] text-ink-muted">Dönemin ölçümleri ve içerikleri inceleniyor…</p> : null}
        {!pending && state.status === "error" ? <p className="text-[0.875rem] text-negative-ink">{state.message}</p> : null}
        {!pending && state.status === "answered" ? (
          <div className="rounded-lg border border-line bg-paper p-4">
            <p className="text-[0.8125rem] font-semibold text-ink-soft">{state.question}</p>
            <p className="mt-2 whitespace-pre-line leading-relaxed text-ink">{state.answer}</p>
            {state.evidenceIds.length > 0 ? (
              <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.8125rem] text-ink-muted">
                <span>Dayanak içerikler:</span>
                {state.evidenceIds.slice(0, 6).map((mentionId, index) => (
                  <Link key={mentionId} href={`${evidenceBase}${separator}secili=${encodeURIComponent(mentionId)}`} className="font-medium text-brand-strong hover:underline">
                    {index + 1}. içerik
                  </Link>
                ))}
              </p>
            ) : null}
            <p className="mt-3 border-t border-line pt-2 text-[0.75rem] text-ink-muted">
              Dil modeli çıktısıdır (<span className="reading">{state.model}</span>); hata içerebilir. Dönemin ölçümleri ve en yeni {state.mentionsSent} içerik gönderildi. Yanıt
              saklanmaz.
            </p>
          </div>
        ) : null}
        {!pending && state.status === "idle" ? (
          <p className="text-[0.8125rem] text-ink-muted">Örnek sorular: {EXAMPLES.slice(1).join(" · ")}</p>
        ) : null}
      </div>
    </div>
  );
}
