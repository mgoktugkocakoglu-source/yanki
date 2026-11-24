"use client";

import { Search, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useId, useState, useTransition, type FormEvent } from "react";
import { PARAMS } from "@/lib/links";
import { tryParseQuery } from "@/lib/query";

/**
 * İçerik arama çubuğu. Kullanıcı yalnızca kelime yazar; ton, kaynak gibi
 * süzgeçler yandaki seçeneklerden gelir ve kutuda gösterilmez (adres
 * çubuğundaki sorguda korunur, etkin süzgeçler satırında okunur halde durur).
 */

const FIELD_TOKEN = /(^|\s)-?[\p{L}]+:[^\s"()]+/gu;

/** Sorgu metnini kutuda gösterilecek kelimelere ve gizli tutulan süzgeçlere ayırır. */
function splitFilters(query: string): { words: string; filters: string } {
  const filters = (query.match(FIELD_TOKEN) ?? []).map((token) => token.trim()).join(" ");
  return { words: query.replace(FIELD_TOKEN, " ").replace(/\s+/g, " ").trim(), filters };
}

interface QueryBarProps {
  initialQuery: string;
  placeholder?: string;
}

export function QueryBar({ initialQuery, placeholder = "Bu konunun içeriklerinde kelime arayın" }: QueryBarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const initial = splitFilters(initialQuery);
  const [query, setQuery] = useState(initial.words);
  const [pending, startTransition] = useTransition();
  const errorId = useId();

  const trimmed = query.trim();
  const parsed = trimmed ? tryParseQuery(trimmed) : null;
  const error = parsed && !parsed.ok ? parsed : null;

  const apply = (value: string) => {
    const params = new URLSearchParams(searchParams);
    const full = `${value} ${initial.filters}`.trim();
    if (full) params.set(PARAMS.query, full);
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
            className={`h-10 w-full rounded-md border bg-surface pl-9 pr-9 text-[0.9375rem] placeholder:text-ink-muted ${
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
              aria-label="Aramayı temizle"
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
      </div>
      {error ? (
        <p id={errorId} className="text-[0.8125rem] text-negative-ink">
          Bu metin aranamıyor; yalnızca kelime yazın.
        </p>
      ) : null}
    </form>
  );
}
