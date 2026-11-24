"use client";

import { CircleHelp, Search, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useId, useState, useTransition, type FormEvent } from "react";
import { PARAMS } from "@/lib/links";
import { FIELD_SPECS, tryParseQuery } from "@/lib/query";

/**
 * Sorgu çubuğu. Sorgu yazılırken tarayıcıda ayrıştırılır; hata, gönderilmeden
 * önce ve hatanın konumuyla birlikte gösterilir. Sunucudaki ayrıştırıcıyla
 * aynı koddur, bu yüzden "burada geçerli, orada değil" durumu oluşmaz.
 */

const OPERATORS: Array<{ syntax: string; meaning: string }> = [
  { syntax: "seçim", meaning: "Kelime ve Türkçe ekleri: seçimler, seçimde, seçimin" },
  { syntax: '"erken seçim"', meaning: "Öbek: kelimeler bu sırayla ve yan yana" },
  { syntax: "=kar", meaning: "Birebir: ek almış biçimler (karın, kara) sayılmaz" },
  { syntax: "koalisyon*", meaning: "Bu harflerle başlayan her kelime" },
  { syntax: "seçim VE koalisyon", meaning: "İkisi de geçmeli (yan yana yazmak da aynıdır)" },
  { syntax: "İsrail VEYA Israel", meaning: "En az biri geçmeli" },
  { syntax: "DEĞİL çekiliş  ·  -çekiliş", meaning: "Geçmemeli" },
  { syntax: "seçim YAKIN/5 sonuç", meaning: "Aralarında en çok 5 kelime olmalı" },
  { syntax: "( … )", meaning: "Gruplama" },
];

export function QueryHelp() {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  return (
    <div className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
        className="inline-flex h-10 items-center gap-1.5 rounded-md px-2.5 text-[0.875rem] font-medium text-ink-soft hover:bg-sunken hover:text-ink"
      >
        <CircleHelp className="h-4 w-4" aria-hidden="true" />
        Sorgu dili
      </button>
      {open ? (
        <div id={panelId} className="absolute right-0 top-full z-30 mt-2 w-[min(38rem,92vw)] rounded-lg border border-line bg-surface p-4 shadow-pop">
          <div className="flex items-baseline justify-between">
            <h3 className="font-semibold">Sorgu dili</h3>
            <button type="button" onClick={() => setOpen(false)} className="rounded p-1 text-ink-muted hover:bg-sunken" aria-label="Kapat">
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
          <p className="mt-1 text-[0.8125rem] text-ink-soft">
            İşleçler büyük harfle yazılır; İngilizce karşılıkları (AND, OR, NOT, NEAR) da geçerlidir. Türkçe karakter ve büyük-küçük harf farkı aranmaz.
          </p>
          <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[0.8125rem]">
            {OPERATORS.map((operator) => (
              <div key={operator.syntax} className="contents">
                <dt className="reading whitespace-nowrap text-brand-strong">{operator.syntax}</dt>
                <dd className="text-ink-soft">{operator.meaning}</dd>
              </div>
            ))}
          </dl>
          <h4 className="mt-4 text-[0.8125rem] font-semibold">Alan filtreleri</h4>
          <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[0.8125rem]">
            {FIELD_SPECS.map((field) => (
              <div key={field.name} className="contents">
                <dt className="reading whitespace-nowrap text-brand-strong">{field.example}</dt>
                <dd className="text-ink-soft">
                  {field.description}
                  {field.values ? `: ${Object.values(field.values).map((spellings) => spellings[0]).join(", ")}` : ""}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      ) : null}
    </div>
  );
}

interface QueryBarProps {
  initialQuery: string;
  placeholder?: string;
}

export function QueryBar({ initialQuery, placeholder = "gecik* ton:olumsuz -kaynak:haber" }: QueryBarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(initialQuery);
  const [pending, startTransition] = useTransition();
  const errorId = useId();

  const trimmed = query.trim();
  const parsed = trimmed ? tryParseQuery(trimmed) : null;
  const error = parsed && !parsed.ok ? parsed : null;

  const apply = (value: string) => {
    const params = new URLSearchParams(searchParams);
    if (value) params.set(PARAMS.query, value);
    else params.delete(PARAMS.query);
    params.delete(PARAMS.page);
    startTransition(() => router.push(`${pathname}?${params}`));
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!error) apply(trimmed);
  };

  return (
    <form onSubmit={submit} role="search" className="flex flex-col gap-1.5">
      <div className="flex items-start gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-ink-muted" aria-hidden="true" />
          <input
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={placeholder}
            aria-label="Bu projenin içeriklerinde ara"
            aria-invalid={error !== null}
            aria-describedby={error ? errorId : undefined}
            spellCheck={false}
            autoComplete="off"
            className={`reading h-10 w-full rounded-md border bg-surface pl-9 pr-9 text-[0.9375rem] placeholder:text-ink-muted ${
              error ? "border-negative" : "border-line-strong hover:border-ink-muted"
            }`}
          />
          {query ? (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                apply("");
              }}
              className="absolute right-2 top-2 rounded p-1 text-ink-muted hover:bg-sunken hover:text-ink"
              aria-label="Sorguyu temizle"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          ) : null}
        </div>
        <button
          type="submit"
          disabled={error !== null || pending}
          className="inline-flex h-10 items-center rounded-md bg-brand px-4 text-[0.875rem] font-semibold text-[var(--on-brand)] hover:bg-brand-strong disabled:opacity-60"
        >
          {pending ? "Aranıyor…" : "Ara"}
        </button>
        <QueryHelp />
      </div>
      {error ? (
        <p id={errorId} className="text-[0.8125rem] text-negative-ink">
          <span className="reading mr-1.5 rounded bg-negative-wash px-1.5 py-0.5">{error.position + 1}. karakter</span>
          {error.message}
        </p>
      ) : null}
    </form>
  );
}
