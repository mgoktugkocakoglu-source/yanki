"use client";

import { ShieldAlert } from "lucide-react";
import { useActionState } from "react";
import type { RangeKey } from "@/lib/time";
import { scanClaimsAction } from "@/server/actions/claims";
import { type FormState } from "@/server/actions/shared";
import { BUTTON_PRIMARY } from "../ui";

const INITIAL: FormState = { ok: false, message: "", errors: {} };

/** İddia taramasını kullanıcı isteğiyle başlatır; hata olursa düğmenin yanında bildirir. */
export function ClaimsButton({ projectId, rangeKey, hasRun }: { projectId: string; rangeKey: RangeKey; hasRun: boolean }) {
  const [state, action, pending] = useActionState(scanClaimsAction, INITIAL);

  return (
    <form action={action} className="flex flex-wrap items-center justify-end gap-3">
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="rangeKey" value={rangeKey} />
      <span role="status" aria-live="polite" className="text-[0.8125rem] text-negative-ink">
        {pending || state.ok ? "" : state.message}
      </span>
      <button type="submit" disabled={pending} className={BUTTON_PRIMARY}>
        <ShieldAlert className="h-4 w-4" aria-hidden="true" />
        {pending ? "İddialar taranıyor…" : hasRun ? "Yeniden tara" : "İddiaları tara"}
      </button>
    </form>
  );
}
