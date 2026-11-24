"use client";

import { Search } from "lucide-react";
import { useActionState } from "react";
import { QUERY_LANGUAGES } from "@/lib/query";
import { quickSearchAction } from "@/server/actions/projects";
import { type FormState } from "@/server/actions/shared";
import { BUTTON_PRIMARY, INPUT } from "../ui";

const INITIAL: FormState = { ok: false, message: "", errors: {} };

const LANGUAGES = [{ code: "", label: "Tüm diller" }, ...QUERY_LANGUAGES];

export interface SearchPlatform {
  id: string;
  name: string;
  /** Bu kurulumda taranabiliyor mu? */
  usable: boolean;
  /** Taranamıyorsa neden: eksik anahtar adı ya da kurulum kısıtı. */
  reason: string | null;
}

/** Gündem araması: konuyu yazınca seçili platformlar taranır ve sonuç ekranı açılır. */
export function SearchBox({ platforms }: { platforms: SearchPlatform[] }) {
  const [state, action, pending] = useActionState(quickSearchAction, INITIAL);
  const error = state.errors.query ?? state.errors.connectorIds ?? state.message;

  return (
    <form action={action} className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 sm:flex-row">
        <label htmlFor="arama-sorgusu" className="sr-only">
          Aranacak konu
        </label>
        <input
          id="arama-sorgusu"
          name="query"
          type="text"
          required
          minLength={2}
          maxLength={400}
          autoComplete="off"
          placeholder="Örn. Brezilya seçimleri ya da COP31"
          aria-describedby="arama-durumu"
          className={`${INPUT} h-12 text-[1rem]`}
        />
        <button type="submit" disabled={pending} className={`${BUTTON_PRIMARY} h-12 shrink-0 px-6`}>
          <Search className="h-4 w-4" aria-hidden="true" />
          {pending ? "Kaynaklar taranıyor…" : "Ara"}
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <div className="flex items-center gap-2">
          <label htmlFor="arama-dili" className="text-[0.8125rem] font-medium text-ink-soft">
            Dil
          </label>
          <select id="arama-dili" name="language" defaultValue="" className={`${INPUT} w-auto py-1.5`}>
            {LANGUAGES.map((language) => (
              <option key={language.code} value={language.code}>
                {language.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex min-w-[16rem] flex-1 items-center gap-2">
          <label htmlFor="arama-haric" className="shrink-0 text-[0.8125rem] font-medium text-ink-soft">
            Bunlar geçmesin
          </label>
          <input id="arama-haric" name="exclude" type="text" maxLength={200} autoComplete="off" placeholder="isteğe bağlı; virgülle ayırın" className={`${INPUT} py-1.5`} />
        </div>
      </div>

      <fieldset>
        <legend className="mb-2 text-[0.8125rem] font-medium text-ink-soft">Platformlar (isteğe bağlı; hepsi seçili gelir)</legend>
        <input type="hidden" name="platformsShown" value="1" />
        <div className="flex flex-wrap gap-2">
          {platforms.map((platform) => (
            <label
              key={platform.id}
              title={platform.reason ?? undefined}
              className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[0.875rem] ${
                platform.usable ? "cursor-pointer border-line-strong bg-surface hover:border-ink-muted" : "border-dashed border-line bg-sunken text-ink-muted"
              }`}
            >
              <input
                type="checkbox"
                name="connectorIds"
                value={platform.id}
                defaultChecked={platform.usable}
                disabled={!platform.usable}
                className="h-4 w-4 accent-[var(--brand)]"
              />
              {platform.name}
              {platform.usable ? null : <span className="text-[0.75rem]">· {platform.reason}</span>}
            </label>
          ))}
        </div>
      </fieldset>

      <p id="arama-durumu" role="status" aria-live="polite" className={`min-h-5 text-[0.875rem] ${pending ? "text-ink-muted" : "text-negative-ink"}`}>
        {pending ? "Seçili platformlar taranıyor; bu birkaç saniye sürebilir." : error}
      </p>
    </form>
  );
}
