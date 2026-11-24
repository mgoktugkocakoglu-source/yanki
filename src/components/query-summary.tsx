import { describeQuery } from "@/lib/query";

/**
 * Arama tanımının düz anlatımı: aranan ifadeler, hariç tutulanlar ve süzgeçler.
 * Sorgu dili (işleçler, parantezler, alan adları) arayüzde gösterilmez.
 */
export function QuerySummary({ query, className = "" }: { query: string; className?: string }) {
  const description = describeQuery(query);
  if (!description) return null;
  const { required, excluded, filters } = description;
  const rows: Array<{ label: string; values: string[] }> = [];
  required.forEach((group, index) => rows.push({ label: index === 0 ? "Aranan" : "Birlikte", values: group }));
  if (excluded.length > 0) rows.push({ label: "Hariç", values: excluded });

  return (
    <dl className={`flex flex-col gap-1.5 text-[0.8125rem] ${className}`}>
      {rows.map((row, index) => (
        <div key={index} className="flex flex-wrap items-baseline gap-1.5">
          <dt className="w-14 shrink-0 text-ink-muted">{row.label}</dt>
          <dd className="flex min-w-0 flex-wrap gap-1.5">
            {row.values.map((value) => (
              <span key={value} className="rounded border border-line bg-sunken px-1.5 py-0.5 text-ink">
                {value}
              </span>
            ))}
          </dd>
        </div>
      ))}
      {filters.length > 0 ? (
        <div className="flex flex-wrap items-baseline gap-1.5">
          <dt className="w-14 shrink-0 text-ink-muted">Süzgeç</dt>
          <dd className="text-ink-soft">{filters.join(" · ")}</dd>
        </div>
      ) : null}
    </dl>
  );
}
