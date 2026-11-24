"use client";

import { RefreshCw } from "lucide-react";
import { useActionState } from "react";
import { collectNowAction } from "@/server/actions/collection";
import { type FormState } from "@/server/actions/shared";
import { BUTTON_PRIMARY } from "../ui";

const INITIAL: FormState = { ok: false, message: "", errors: {} };

/** Elle tarama: sonucu düğmenin yanında bildirir. */
export function CollectButton({ projectId }: { projectId: string }) {
  const [state, action, pending] = useActionState(collectNowAction, INITIAL);

  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <input type="hidden" name="projectId" value={projectId} />
      <button type="submit" disabled={pending} className={BUTTON_PRIMARY}>
        <RefreshCw className={`h-4 w-4 ${pending ? "animate-spin" : ""}`} aria-hidden="true" />
        {pending ? "Kaynaklar taranıyor…" : "Şimdi tara"}
      </button>
      <span role="status" aria-live="polite" className={`text-[0.875rem] ${state.ok ? "text-positive-ink" : "text-negative-ink"}`}>
        {pending ? "" : state.message}
      </span>
    </form>
  );
}
