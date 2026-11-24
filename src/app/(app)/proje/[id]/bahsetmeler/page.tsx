import { Download, X } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MentionCard } from "@/components/mentions/mention-card";
import { MentionDetail } from "@/components/mentions/mention-detail";
import { QueryBar } from "@/components/mentions/query-bar";
import { BUTTON_SECONDARY, EmptyState, PageContainer, PageHeading } from "@/components/ui";
import { SENTIMENT_LABELS, SENTIMENT_QUERY, SOURCE_TYPE_LABELS, SOURCE_TYPE_QUERY } from "@/domain/labels";
import { SENTIMENTS, type SourceType } from "@/domain/types";
import { formatDateTime, formatDayLong, formatNumber } from "@/lib/format";
import { PARAMS, projectHref } from "@/lib/links";
import { tryParseQuery, type QueryNode, describeQuery } from "@/lib/query";
import { DAY_MS, RANGE_PRESETS } from "@/lib/time";
import { loadProjectContext, readPositiveInteger, readString, type SearchParams } from "@/server/context";
import { countMentions, getMention, listMentions, type MentionSort } from "@/server/repositories/mentions";
import { breakdown, summarize } from "@/server/repositories/metrics";
import { listTopics } from "@/server/repositories/projects";
import { readMentionQuery, type MentionQuery } from "@/server/services/mention-query";

export const metadata: Metadata = { title: "Bahsedilmeler" };

/** Ayrıntı panelinde açık olan içeriğin adres parametresi. */
const SELECTED_PARAM = "secili";

const PAGE_SIZE = 20;

/** Geçerli adres parametrelerini koruyarak yeni bir adres kurar. */
function hrefWith(base: string, searchParams: SearchParams, changes: Record<string, string | null>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    const single = Array.isArray(value) ? value[0] : value;
    if (single) params.set(key, single);
  }
  for (const [key, value] of Object.entries(changes)) {
    if (value === null) params.delete(key);
    else params.set(key, value);
  }
  const search = params.toString();
  return search ? `${base}?${search}` : base;
}

/** Sorguya bir alan filtresi ekler; aynı alan zaten varsa değerini değiştirir, aynı değerse kaldırır. */
function toggleField(queryText: string, field: string, value: string): string {
  const token = `${field}:${value}`;
  const pattern = new RegExp(`(^|\\s)${field}:\\S+`, "giu");
  const had = queryText.toLocaleLowerCase("tr-TR").includes(token);
  const stripped = queryText.replace(pattern, " ").replace(/\s+/g, " ").trim();
  return had ? stripped : `${stripped} ${token}`.trim();
}

function describeRange(query: MentionQuery): string {
  if (!query.hasExplicitRange) return RANGE_PRESETS[query.rangeKey].label;
  const { from, to } = query.range;
  return to - from === DAY_MS ? formatDayLong(from) : `${formatDateTime(from)} – ${formatDateTime(to)}`;
}

interface FacetProps {
  label: string;
  count: number;
  href: string;
  active: boolean;
}

function Facet({ label, count, href, active }: FacetProps) {
  return (
    <Link
      href={href}
      aria-pressed={active}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[0.8125rem] font-medium transition-colors ${
        active ? "border-brand bg-brand-wash text-brand-strong" : "border-line bg-surface text-ink-soft hover:border-line-strong hover:text-ink"
      }`}
    >
      {label}
      <span className="reading text-[0.75rem] opacity-80">{formatNumber(count)}</span>
    </Link>
  );
}

export default async function MentionsPage({ params, searchParams }: PageProps<"/proje/[id]/bahsetmeler">) {
  const { id } = await params;
  const context = await loadProjectContext(id);
  if (!context) notFound();

  const { project, now } = context;
  const rawParams = await searchParams;
  const query = readMentionQuery(project, rawParams, now);
  const base = projectHref(project.id, "bahsetmeler");

  const sortParam = readString(rawParams, PARAMS.sort);
  const sort: MentionSort = sortParam === "etkilesim" ? "engagement" : sortParam === "takipci" ? "followers" : "recent";
  const page = readPositiveInteger(rawParams, PARAMS.page, 1);
  const total = await countMentions(query.filter);
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const mentions = await listMentions(query.filter, { limit: PAGE_SIZE, offset: (Math.min(page, pageCount) - 1) * PAGE_SIZE }, sort);

  const selectedId = readString(rawParams, SELECTED_PARAM);
  const found = selectedId ? await getMention(selectedId) : null;
  const selected = found?.projectId === project.id ? found : null;
  const hasActiveFilter = query.queryText !== "" || query.hasExplicitRange || query.includeIrrelevant;

  const tones = await summarize(query.filter);
  const sources = await breakdown(query.filter, "sourceType", 10);
  const topicNames = new Map((await listTopics(project.id)).map((topic) => [topic.id, topic.name]));

  const projectQuery = tryParseQuery(project.query);
  const highlightQueries: QueryNode[] = [...(projectQuery.ok ? [projectQuery.ast] : []), ...(query.queryAst ? [query.queryAst] : [])];
  const queryDescription = query.queryText ? describeQuery(query.queryText) : null;
  const activeFilterLabels = queryDescription
    ? [
        ...queryDescription.required.map((group) => group.join(" ya da ")),
        ...queryDescription.excluded.map((term) => `hariç: ${term}`),
        ...queryDescription.filters,
      ]
    : [];
  const lowerQuery = query.queryText.toLocaleLowerCase("tr-TR");
  const facetHref = (field: string, value: string) =>
    hrefWith(base, rawParams, { [PARAMS.query]: toggleField(query.queryText, field, value) || null, [PARAMS.page]: null });

  const exportHref = hrefWith(`/api/proje/${project.id}/disa-aktar`, rawParams, { [PARAMS.page]: null, [PARAMS.sort]: null });

  return (
    <PageContainer>
      <PageHeading
        title="Bahsedilmeler"
        lead={
          <>
            <span className="reading font-medium text-ink">{formatNumber(total)}</span> içerik · {describeRange(query)}
            {query.hasExplicitRange ? (
              <Link
                href={hrefWith(base, rawParams, { [PARAMS.from]: null, [PARAMS.to]: null, [PARAMS.page]: null })}
                className="ml-2 inline-flex items-center gap-0.5 rounded-full border border-line px-2 py-0.5 text-[0.75rem] font-medium text-ink-soft hover:border-line-strong"
              >
                <X className="h-3 w-3" aria-hidden="true" />
                aralığı kaldır
              </Link>
            ) : null}
          </>
        }
        actions={
          <a href={exportHref} className={BUTTON_SECONDARY} download>
            <Download className="h-4 w-4" aria-hidden="true" />
            CSV indir
          </a>
        }
      />

      <QueryBar key={query.queryText} initialQuery={query.queryText} />
      {query.queryError ? (
        <p className="mt-2 rounded-md border border-negative/40 bg-negative-wash px-3 py-2 text-[0.875rem] text-negative-ink" role="alert">
          Arama uygulanamadı. Aşağıdaki liste süzgeçsiz gösteriliyor.
        </p>
      ) : null}

      {hasActiveFilter ? (
        <p className="mt-3 flex flex-wrap items-center gap-2 text-[0.8125rem] text-ink-soft">
          Etkin süzgeçler:
          {activeFilterLabels.map((label) => (
            <span key={label} className="rounded-full bg-brand-wash px-2.5 py-0.5 text-brand-strong">
              {label}
            </span>
          ))}
          {query.hasExplicitRange ? <span className="rounded-full bg-brand-wash px-2.5 py-0.5 text-brand-strong">{describeRange(query)}</span> : null}
          {query.includeIrrelevant ? <span className="rounded-full bg-brand-wash px-2.5 py-0.5 text-brand-strong">ilgisizler dahil</span> : null}
          <Link href={hrefWith(base, { [PARAMS.range]: rawParams[PARAMS.range] }, {})} className="font-semibold text-brand-strong hover:underline">
            Filtreleri temizle
          </Link>
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2">
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Tona göre süz">
          {SENTIMENTS.map((sentiment) => (
            <Facet
              key={sentiment}
              label={SENTIMENT_LABELS[sentiment]}
              count={tones[sentiment]}
              href={facetHref("ton", SENTIMENT_QUERY[sentiment])}
              active={lowerQuery.includes(`ton:${SENTIMENT_QUERY[sentiment]}`)}
            />
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Kaynak türüne göre süz">
          {sources.map((source) => {
            const type = source.key as SourceType;
            return (
              <Facet
                key={type}
                label={SOURCE_TYPE_LABELS[type] ?? type}
                count={source.total}
                href={facetHref("kaynak", SOURCE_TYPE_QUERY[type] ?? type)}
                active={lowerQuery.includes(`kaynak:${SOURCE_TYPE_QUERY[type]}`)}
              />
            );
          })}
        </div>

        <div className="ml-auto flex items-center gap-3 text-[0.8125rem]">
          <Link
            href={hrefWith(base, rawParams, { [PARAMS.irrelevant]: query.includeIrrelevant ? null : "1", [PARAMS.page]: null })}
            className="font-medium text-ink-soft hover:text-ink hover:underline"
          >
            {query.includeIrrelevant ? "İlgisizleri gizle" : "İlgisizleri de göster"}
          </Link>
          <div role="group" aria-label="Sıralama" className="inline-flex rounded-md border border-line bg-sunken p-0.5">
            {(
              [
                ["recent", "En yeni", null],
                ["engagement", "En çok etkileşim", "etkilesim"],
                ["followers", "En çok takipçi", "takipci"],
              ] as const
            ).map(([key, label, value]) => (
              <Link
                key={key}
                href={hrefWith(base, rawParams, { [PARAMS.sort]: value, [PARAMS.page]: null })}
                aria-current={sort === key ? "true" : undefined}
                className={`rounded px-2.5 py-1 font-medium ${sort === key ? "bg-surface text-brand-strong shadow-[0_0_0_1px_var(--line)]" : "text-ink-soft hover:text-ink"}`}
              >
                {label}
              </Link>
            ))}
          </div>
        </div>
      </div>

      <div className={selected ? "mt-4 grid gap-5 xl:grid-cols-[minmax(0,1fr)_26rem]" : "mt-4"}>
        <div className="flex min-w-0 flex-col gap-3">
        {mentions.length === 0 ? (
          <EmptyState
            title="Bu süzgeçle eşleşen içerik yok"
            action={
              <Link href={base} className="font-semibold text-brand-strong hover:underline">
                Süzgeçleri temizle
              </Link>
            }
          >
            Daha az kelimeyle aramayı ya da dönemi genişletmeyi deneyin. Türkçe ekler kendiliğinden yakalanır.
          </EmptyState>
        ) : (
          mentions.map((mention) => (
            <MentionCard
              key={mention.id}
              mention={mention}
              queries={highlightQueries}
              topicNames={topicNames}
              now={now}
              detailHref={hrefWith(base, rawParams, { [SELECTED_PARAM]: mention.id })}
              selected={mention.id === selected?.id}
            />
          ))
        )}
        </div>
        {selected ? (
          <MentionDetail
            mention={selected}
            queries={highlightQueries}
            topicNames={topicNames}
            closeHref={hrefWith(base, rawParams, { [SELECTED_PARAM]: null })}
          />
        ) : null}
      </div>

      {pageCount > 1 ? (
        <nav aria-label="Sayfalar" className="mt-6 flex items-center justify-between text-[0.875rem]">
          <span className="text-ink-muted">
            Sayfa <span className="reading text-ink">{Math.min(page, pageCount)}</span> / <span className="reading">{formatNumber(pageCount)}</span>
          </span>
          <div className="flex gap-2">
            {page > 1 ? (
              <Link href={hrefWith(base, rawParams, { [PARAMS.page]: String(page - 1) })} className={BUTTON_SECONDARY} rel="prev">
                Önceki
              </Link>
            ) : null}
            {page < pageCount ? (
              <Link href={hrefWith(base, rawParams, { [PARAMS.page]: String(page + 1) })} className={BUTTON_SECONDARY} rel="next">
                Sonraki
              </Link>
            ) : null}
          </div>
        </nav>
      ) : null}
    </PageContainer>
  );
}
