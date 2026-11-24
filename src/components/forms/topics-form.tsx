"use client";

import { useActionState, useId } from "react";
import { saveTopicsAction, type FormState } from "@/server/actions";
import { BUTTON_PRIMARY, INPUT } from "../ui";

const INITIAL_STATE: FormState = { ok: false, message: "", errors: {} };

interface TopicsFormProps {
  projectId: string;
  /** Her satır: "Grup | Konu adı | sorgu". */
  initialText: string;
  readOnly: boolean;
}

/**
 * Konu tanımları. Her konu küçük bir sorgudur; kaydedildiğinde projenin
 * mevcut içerikleri de yeniden etiketlenir. Grup adı serbesttir: "Konu",
 * "Ürün", "Mahalle" gibi; her grup analiz ekranında ayrı bir karne olur.
 */
export function TopicsForm({ projectId, initialText, readOnly }: TopicsFormProps) {
  const [state, action, pending] = useActionState(saveTopicsAction, INITIAL_STATE);
  const fieldId = useId();
  const helpId = useId();

  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="projectId" value={projectId} />
      <label htmlFor={fieldId} className="sr-only">
        Konular
      </label>
      <textarea
        id={fieldId}
        name="topics"
        rows={Math.min(18, Math.max(6, initialText.split("\n").length + 1))}
        defaultValue={initialText}
        readOnly={readOnly}
        spellCheck={false}
        aria-describedby={helpId}
        aria-invalid={state.errors.topics !== undefined}
        placeholder={"Konu | Teslimat gecikmesi | gecik* OR gelmedi\nKonu | Fiyat | fiyat OR zam OR pahalı\nMahalle | Çınarlı | Çınarlı"}
        className={`${INPUT} reading text-[0.8125rem] leading-relaxed ${state.errors.topics ? "border-negative" : ""} ${readOnly ? "bg-sunken" : ""}`}
      />
      <p id={helpId} className="text-[0.8125rem] text-ink-soft">
        Her satıra bir konu: <span className="reading text-ink">Grup | Konu adı | sorgu</span>. Konu sorguları yalnızca kelime içerir (alan filtresi kullanılamaz).
      </p>
      {readOnly ? null : (
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" disabled={pending} className={BUTTON_PRIMARY}>
            {pending ? "Kaydediliyor ve etiketleniyor…" : "Konuları kaydet"}
          </button>
          <span role="status" aria-live="polite" className={`text-[0.875rem] ${state.ok ? "text-positive-ink" : "text-negative-ink"}`}>
            {pending ? "" : state.message}
          </span>
        </div>
      )}
    </form>
  );
}
