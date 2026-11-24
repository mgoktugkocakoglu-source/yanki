"use client";

import { useActionState } from "react";
import { QUERY_LANGUAGES } from "@/lib/query";
import type { AuthState } from "@/server/actions/auth";
import { addFeedAction } from "@/server/actions/news";
import { BUTTON_PRIMARY, INPUT } from "../ui";

const INITIAL: AuthState = { ok: false, message: "" };
const LABEL = "mb-1 block text-[0.875rem] font-medium";

/** Yeni haber akışı: adres kaydedilmeden önce sunucuda canlı olarak denenir. */
export function AddFeedForm() {
  const [state, action, pending] = useActionState(addFeedAction, INITIAL);
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-[14rem_1fr_9rem_auto] sm:items-end">
      <div>
        <label htmlFor="akis-yayin" className={LABEL}>
          Yayın adı
        </label>
        <input id="akis-yayin" name="outlet" required minLength={2} maxLength={80} autoComplete="off" className={INPUT} />
      </div>
      <div>
        <label htmlFor="akis-adres" className={LABEL}>
          Akış adresi (RSS, Atom ya da haber site haritası)
        </label>
        <input id="akis-adres" name="url" type="url" required maxLength={500} autoComplete="off" placeholder="https://…" className={INPUT} />
      </div>
      <div>
        <label htmlFor="akis-dil" className={LABEL}>
          Dil
        </label>
        <select id="akis-dil" name="language" defaultValue="tr" className={INPUT}>
          {QUERY_LANGUAGES.map((language) => (
            <option key={language.code} value={language.code}>
              {language.label}
            </option>
          ))}
        </select>
      </div>
      <button type="submit" disabled={pending} className={`${BUTTON_PRIMARY} whitespace-nowrap`}>
        {pending ? "Deneniyor…" : "Dene ve ekle"}
      </button>
      <p role="status" aria-live="polite" className={`min-h-5 text-[0.875rem] sm:col-span-4 ${state.ok ? "text-positive-ink" : "text-negative-ink"}`}>
        {pending || state.message === "" ? "" : `${state.ok ? "✓ " : "! "}${state.message}`}
      </p>
    </form>
  );
}
