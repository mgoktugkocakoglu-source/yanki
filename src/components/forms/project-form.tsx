"use client";

import { Eye, Wand2 } from "lucide-react";
import { useActionState, useId, useState, useTransition } from "react";
import { RUN_STATUS_LABELS } from "@/domain/labels";
import { formatDateTime, formatNumber } from "@/lib/format";
import { buildCollectionPlan, tryParseQuery } from "@/lib/query";
import { previewQueryAction, saveProjectAction, type FormState, type PreviewState } from "@/server/actions";
import { QueryHelp } from "../mentions/query-bar";
import { BUTTON_PRIMARY, BUTTON_SECONDARY, INPUT } from "../ui";

/**
 * Proje formu. Sorgu yazılırken ayrıştırılır ve kaynaklarda hangi ifadelerin
 * aranacağı gösterilir; "Önizle" kaydetmeden önce gerçek kaynaklardan örnek
 * getirir. Amaç, ilgisiz içerikle dolu bir proje kurmayı baştan önlemektir.
 */

export interface ConnectorOption {
  id: string;
  name: string;
  summary: string;
  terms: string;
  personalOnly: boolean;
  allowed: boolean;
  /** Tanımlanması gereken ortam değişkeni; anahtar hazırsa null. */
  missingSetting: string | null;
  metered: boolean;
}

interface ProjectFormProps {
  /** Düzenlenen proje; yeni projede boş. */
  projectId?: string;
  /** Yeni projenin açılacağı çalışma alanı. */
  workspaceId?: string;
  initial: { name: string; description: string; query: string; connectorIds: string[] };
  connectors: ConnectorOption[];
}

const INITIAL_STATE: FormState = { ok: false, message: "", errors: {} };

function splitTerms(value: string): string[] {
  return value.split(",").map((term) => term.trim().replace(/["“”]/g, "")).filter(Boolean);
}

function quote(term: string): string {
  return /\s/.test(term) ? `"${term}"` : term;
}

/** Sihirbaz alanlarından Boolean sorgu kurar. */
function composeQuery(anyOf: string, allOf: string, noneOf: string, onlyTurkish: boolean): string {
  const any = splitTerms(anyOf).map(quote);
  const all = splitTerms(allOf).map(quote);
  const none = splitTerms(noneOf).map(quote);
  const parts: string[] = [];
  if (any.length > 0) parts.push(any.length > 1 ? `(${any.join(" OR ")})` : any[0]);
  parts.push(...all);
  if (none.length > 0) parts.push(`NOT ${none.length > 1 ? `(${none.join(" OR ")})` : none[0]}`);
  if (onlyTurkish) parts.push("dil:tr");
  return parts.join(" ");
}

function FieldError({ id, message }: { id: string; message?: string }) {
  return message ? (
    <p id={id} className="mt-1 text-[0.8125rem] text-negative-ink">
      {message}
    </p>
  ) : null;
}

function PreviewPanel({ state }: { state: Exclude<PreviewState, null> }) {
  if (!state.ok) {
    return (
      <p className="rounded-md border border-negative/40 bg-negative-wash px-3 py-2 text-[0.875rem] text-negative-ink" role="alert">
        {state.message}
      </p>
    );
  }
  const { preview } = state;
  return (
    <div className="rounded-lg border border-line bg-sunken p-4">
      <p className="font-semibold">
        Son 7 günde <span className="reading">{formatNumber(preview.totalMatched)}</span> içerik eşleşti
      </p>
      <ul className="mt-2 flex flex-col gap-1 text-[0.8125rem] text-ink-soft">
        {preview.connectors.map((connector) => (
          <li key={connector.name}>
            <span className="font-medium text-ink">{connector.name}</span>: {RUN_STATUS_LABELS[connector.status].toLocaleLowerCase("tr-TR")} ·{" "}
            <span className="reading">
              {formatNumber(connector.fetched)} aday, {formatNumber(connector.matched)} eşleşme
            </span>
            {connector.message ? ` · ${connector.message}` : ""}
          </li>
        ))}
      </ul>
      {preview.samples.length > 0 ? (
        <>
          <p className="mt-3 text-[0.8125rem] font-semibold">Örnekler: bunlar aradığınız türden içerik mi?</p>
          <ul className="mt-1.5 flex flex-col divide-y divide-line">
            {preview.samples.map((sample, index) => (
              <li key={index} className="py-2 text-[0.875rem]">
                <span className="reading mr-2 text-[0.75rem] text-ink-muted">
                  {sample.sourceName} · {formatDateTime(sample.publishedAt)}
                </span>
                <span className="font-medium">{sample.title}</span> <span className="text-ink-soft">{sample.content.slice(0, 180)}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[0.8125rem] text-ink-muted">
            İlgisiz örnekler görüyorsanız sorguya zorunlu bir kelime ekleyin ya da DEĞİL ile hariç tutun.
          </p>
        </>
      ) : (
        <p className="mt-3 text-[0.875rem] text-ink-soft">Eşleşen içerik çıkmadı. Kelimeleri gevşetmeyi ya da başka bir yazım eklemeyi deneyin.</p>
      )}
    </div>
  );
}

export function ProjectForm({ projectId, workspaceId, initial, connectors }: ProjectFormProps) {
  const [state, formAction, saving] = useActionState(saveProjectAction, INITIAL_STATE);
  const [query, setQuery] = useState(initial.query);
  const [selected, setSelected] = useState<string[]>(initial.connectorIds);
  const [wizard, setWizard] = useState({ anyOf: "", allOf: "", noneOf: "", onlyTurkish: true });
  const [preview, setPreview] = useState<PreviewState>(null);
  const [previewing, startPreview] = useTransition();
  const ids = { name: useId(), description: useId(), query: useId(), queryError: useId(), nameError: useId() };

  const trimmed = query.trim();
  const parsed = trimmed ? tryParseQuery(trimmed) : null;
  const plan = parsed?.ok ? buildCollectionPlan(parsed.ast) : null;
  const liveError = parsed && !parsed.ok ? parsed.message : parsed?.ok && !plan ? "Sorgu, kaynaklarda aranabilecek en az bir kelime içermeli." : null;
  const queryError = liveError ?? state.errors.query;

  const toggleConnector = (id: string) =>
    setSelected((current) => (current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id]));

  const runPreview = () => startPreview(async () => setPreview(await previewQueryAction(trimmed, selected)));

  return (
    <form action={formAction} className="flex flex-col gap-8">
      {projectId ? <input type="hidden" name="projectId" value={projectId} /> : null}
      {workspaceId ? <input type="hidden" name="workspaceId" value={workspaceId} /> : null}

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-3 text-[1rem] font-semibold">Proje</legend>
        <div>
          <label htmlFor={ids.name} className="mb-1 block text-[0.875rem] font-medium">
            Ad
          </label>
          <input
            id={ids.name}
            name="name"
            required
            maxLength={80}
            defaultValue={initial.name}
            placeholder="ör. Kurumumuz, bir rakip, bir kampanya"
            aria-invalid={state.errors.name !== undefined}
            aria-describedby={state.errors.name ? ids.nameError : undefined}
            className={INPUT}
          />
          <FieldError id={ids.nameError} message={state.errors.name} />
        </div>
        <div>
          <label htmlFor={ids.description} className="mb-1 block text-[0.875rem] font-medium">
            Açıklama <span className="font-normal text-ink-muted">(isteğe bağlı)</span>
          </label>
          <input id={ids.description} name="description" maxLength={200} defaultValue={initial.description} className={INPUT} />
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-1 text-[1rem] font-semibold">Neyi izleyeceksiniz?</legend>
        <p className="mb-4 max-w-[70ch] text-[0.875rem] text-ink-soft">
          Kelimeleri virgülle ayırarak yazıp sorguya dönüştürün ya da sorguyu doğrudan yazın. Türkçe ekler kendiliğinden yakalanır: “seçim” yazmak “seçimler” ve “seçimde” için de yeterlidir.
        </p>

        <div className="rounded-lg border border-line bg-sunken p-4">
          <div className="grid gap-3 sm:grid-cols-3">
            {(
              [
                ["anyOf", "Bunlardan en az biri geçsin", "Kurum adı, kısaltması, hesabı"],
                ["allOf", "Bunların hepsi de geçsin", "isteğe bağlı"],
                ["noneOf", "Bunlar geçmesin", "çekiliş, iş ilanı"],
              ] as const
            ).map(([key, label, placeholder]) => (
              <label key={key} className="block text-[0.8125rem] font-medium">
                {label}
                <input
                  value={wizard[key]}
                  onChange={(event) => setWizard((current) => ({ ...current, [key]: event.target.value }))}
                  placeholder={placeholder}
                  className={`${INPUT} mt-1 font-normal`}
                />
              </label>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <label className="inline-flex items-center gap-2 text-[0.875rem]">
              <input
                type="checkbox"
                checked={wizard.onlyTurkish}
                onChange={(event) => setWizard((current) => ({ ...current, onlyTurkish: event.target.checked }))}
                className="h-4 w-4 accent-[var(--brand)]"
              />
              Yalnızca Türkçe içerik
            </label>
            <button
              type="button"
              disabled={splitTerms(wizard.anyOf).length + splitTerms(wizard.allOf).length === 0}
              onClick={() => setQuery(composeQuery(wizard.anyOf, wizard.allOf, wizard.noneOf, wizard.onlyTurkish))}
              className={BUTTON_SECONDARY}
            >
              <Wand2 className="h-4 w-4" aria-hidden="true" />
              Sorguya dönüştür
            </button>
          </div>
        </div>

        <div className="mt-4">
          <div className="mb-1 flex items-center justify-between">
            <label htmlFor={ids.query} className="text-[0.875rem] font-medium">
              Sorgu
            </label>
            <QueryHelp />
          </div>
          <textarea
            id={ids.query}
            name="query"
            required
            rows={3}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            spellCheck={false}
            aria-invalid={queryError !== undefined && queryError !== null}
            aria-describedby={ids.queryError}
            placeholder='("Kurum Adı" OR kurumadi) NOT çekiliş dil:tr'
            className={`${INPUT} reading leading-relaxed ${queryError ? "border-negative" : ""}`}
          />
          <div id={ids.queryError} className="mt-1 min-h-5 text-[0.8125rem]" aria-live="polite">
            {queryError ? (
              <span className="text-negative-ink">{queryError}</span>
            ) : plan ? (
              <span className="text-ink-soft">
                Kaynaklarda aranacak ifadeler: <span className="reading text-ink">{plan.keywords.join(" · ")}</span>
                {plan.language ? ` · dil: ${plan.language}` : ""}
              </span>
            ) : null}
          </div>
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-1 text-[1rem] font-semibold">Kaynaklar</legend>
        <p className="mb-3 text-[0.875rem] text-ink-soft">Yalnızca gerçekten bağlı kaynaklar listelenir. Diğerleri için Kaynaklar ekranındaki koşullara bakın.</p>
        <div className="grid gap-3 lg:grid-cols-3">
          {connectors.map((connector) => (
            <label
              key={connector.id}
              className={`flex gap-3 rounded-lg border p-3.5 ${
                connector.allowed ? "cursor-pointer border-line bg-surface hover:border-line-strong" : "border-dashed border-line bg-sunken opacity-70"
              }`}
            >
              <input
                type="checkbox"
                name="connectorIds"
                value={connector.id}
                checked={selected.includes(connector.id)}
                disabled={!connector.allowed}
                onChange={() => toggleConnector(connector.id)}
                className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--brand)]"
              />
              <span className="min-w-0">
                <span className="flex flex-wrap items-center gap-1.5 font-semibold">
                  {connector.name}
                  {connector.personalOnly ? (
                    <span className="rounded border border-saffron/50 bg-saffron-wash px-1.5 py-0.5 text-[0.6875rem] font-semibold text-saffron-ink">Yalnızca kişisel kullanım</span>
                  ) : null}
                  {connector.metered ? (
                    <span className="rounded border border-line bg-sunken px-1.5 py-0.5 text-[0.6875rem] font-semibold text-ink-soft">Ücretli</span>
                  ) : null}
                </span>
                {connector.missingSetting ? (
                  <span className="mt-1 block text-[0.8125rem] font-medium text-saffron-ink">
                    Anahtar bekleniyor: <span className="reading">{connector.missingSetting}</span> değerini .env.local dosyasına ekleyip sunucuyu yeniden başlatın.
                  </span>
                ) : null}
                <span className="mt-0.5 block text-[0.8125rem] text-ink-soft">{connector.summary}</span>
                <span className="mt-1 block text-[0.75rem] text-ink-muted">{connector.terms}</span>
              </span>
            </label>
          ))}
        </div>
        <FieldError id="kaynak-hatasi" message={state.errors.connectorIds} />
      </fieldset>

      {preview ? <PreviewPanel state={preview} /> : null}

      <div className="flex flex-wrap items-center gap-3 border-t border-line pt-5">
        <button type="submit" disabled={saving || Boolean(liveError)} className={BUTTON_PRIMARY}>
          {saving ? "Kaydediliyor…" : projectId ? "Değişiklikleri kaydet" : "Projeyi oluştur"}
        </button>
        <button type="button" onClick={runPreview} disabled={previewing || !plan || selected.length === 0} className={BUTTON_SECONDARY}>
          <Eye className="h-4 w-4" aria-hidden="true" />
          {previewing ? "Kaynaklar deneniyor…" : "Önizle"}
        </button>
        {state.message && !state.ok ? (
          <span role="alert" className="text-[0.875rem] text-negative-ink">
            {state.message}
          </span>
        ) : null}
      </div>
    </form>
  );
}
