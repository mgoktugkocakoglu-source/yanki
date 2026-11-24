"use client";

import { Sparkles } from "lucide-react";
import { useActionState } from "react";
import type { RangeKey } from "@/lib/time";
import { generateAiSummaryAction } from "@/server/actions/ai";
import { type FormState } from "@/server/actions/shared";
import { BUTTON_SECONDARY } from "../ui";

const INITIAL: FormState = { ok: false, message: "", errors: {} };

/** Yapay zekâ özetini kullanıcı isteğiyle üretir; hata olursa düğmenin yanında bildirir. */
export function AiSummaryButton({ projectId, rangeKey, hasSummary }: { projectId: string; rangeKey: RangeKey; hasSummary: boolean }) {
  const [state, action, pending] = useActionState(generateAiSummaryAction, INITIAL);

  return (
    <form action={action} className="flex flex-wrap items-center justify-end gap-3">
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="rangeKey" value={rangeKey} />
      <span role="status" aria-live="polite" className="text-[0.8125rem] text-negative-ink">
        {pending || state.ok ? "" : state.message}
      </span>
      <button type="submit" disabled={pending} className={BUTTON_SECONDARY}>
        <Sparkles className="h-4 w-4" aria-hidden="true" />
        {pending ? "Özet üretiliyor…" : hasSummary ? "Yeniden üret" : "Özet üret"}
      </button>
    </form>
  );
}
