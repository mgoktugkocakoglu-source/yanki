"use client";

import { Sparkles } from "lucide-react";
import { useActionState } from "react";
import { formatNumber } from "@/lib/format";
import type { RangeKey } from "@/lib/time";
import { classifyMentionsAction, type FormState } from "@/server/actions";
import { BUTTON_SECONDARY } from "../ui";

const INITIAL: FormState = { ok: false, message: "", errors: {} };

/** Dil modeliyle sınıflandırmayı kullanıcı isteğiyle başlatır ve sonucu altında bildirir. */
export function AiClassifyButton({ projectId, rangeKey, remaining }: { projectId: string; rangeKey: RangeKey; remaining: number }) {
  const [state, action, pending] = useActionState(classifyMentionsAction, INITIAL);

  return (
    <form action={action} className="mt-3 flex flex-col items-start gap-2">
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="rangeKey" value={rangeKey} />
      {remaining > 0 || pending ? (
        <button type="submit" disabled={pending} className={BUTTON_SECONDARY}>
          <Sparkles className="h-4 w-4" aria-hidden="true" />
          {pending ? "Sınıflandırılıyor…" : `Dil modeliyle sınıflandır (${formatNumber(remaining)} içerik sırada)`}
        </button>
      ) : null}
      <span role="status" aria-live="polite" className={state.ok ? "text-positive-ink" : "text-negative-ink"}>
        {pending ? "" : state.message}
      </span>
    </form>
  );
}
