import { createHash } from "node:crypto";
import { groupProbes, probeConditions } from "@/lib/query";
import { execute, queryAll, queryOne, transaction, type SqlParams } from "../db/client";
import { SEED_FEEDS } from "../news/sources";

/**
 * Haber arşivi deposu: taranan akışlar, robots.txt önbelleği ve arşivdeki
 * başlıklar. Arşiv projelerden bağımsızdır; projeler buradan eşleştirilir.
 */

export type FeedKind = "rss" | "sitemap";
export type FeedStatus = "ok" | "unchanged" | "error" | "robots";

export interface NewsFeed {
  id: string;
  outlet: string;
  domain: string;
  url: string;
  kind: FeedKind;
  language: string;
  origin: "seed" | "manual";
  enabled: boolean;
  etag: string | null;
  lastModified: string | null;
  lastFetchedAt: number | null;
  lastOkAt: number | null;
  lastStatus: FeedStatus | null;
  lastError: string | null;
  lastItemCount: number;
  failures: number;
  nextDueAt: number;
}

interface FeedRow {
  id: string;
  outlet: string;
  domain: string;
  url: string;
  kind: FeedKind;
  language: string;
  origin: "seed" | "manual";
  enabled: number;
  etag: string | null;
  last_modified: string | null;
  last_fetched_at: number | null;
  last_ok_at: number | null;
  last_status: FeedStatus | null;
  last_error: string | null;
  last_item_count: number;
  failures: number;
  next_due_at: number;
}

function toFeed(row: FeedRow): NewsFeed {
  return {
    id: row.id,
    outlet: row.outlet,
    domain: row.domain,
    url: row.url,
    kind: row.kind,
    language: row.language,
    origin: row.origin,
    enabled: row.enabled === 1,
    etag: row.etag,
    lastModified: row.last_modified,
    lastFetchedAt: row.last_fetched_at,
    lastOkAt: row.last_ok_at,
    lastStatus: row.last_status,
    lastError: row.last_error,
    lastItemCount: row.last_item_count,
    failures: row.failures,
    nextDueAt: row.next_due_at,
  };
}

function feedId(url: string): string {
  return createHash("sha1").update(url).digest("hex").slice(0, 16);
}

export interface NewFeed {
  outlet: string;
  domain: string;
  url: string;
  kind: FeedKind;
  language: string;
  origin: "seed" | "manual";
}

/** Akışı ekler; aynı adres zaten varsa dokunmaz ve false döner. */
export async function addFeed(feed: NewFeed, now: number): Promise<boolean> {
  return (
    (await execute("INSERT INTO news_feeds (id, outlet, domain, url, kind, language, origin, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING", [
      feedId(feed.url),
      feed.outlet,
      feed.domain,
      feed.url,
      feed.kind,
      feed.language,
      feed.origin,
      now,
    ])) > 0
  );
}

/** Başlangıç listesindeki eksik akışları ekler. Kapatılmış ya da elle eklenmiş akışlara dokunmaz. */
export async function seedFeeds(now: number): Promise<void> {
  await transaction(async () => {
    for (const seed of SEED_FEEDS) {
      await addFeed({ outlet: seed.outlet, domain: seed.domain, url: seed.url, kind: "rss", language: seed.language ?? "tr", origin: "seed" }, now);
    }
  });
}

export async function listFeeds(): Promise<NewsFeed[]> {
  return (await queryAll<FeedRow>("SELECT * FROM news_feeds ORDER BY lower(outlet), url")).map(toFeed);
}

export async function getFeed(id: string): Promise<NewsFeed | null> {
  const row = await queryOne<FeedRow>("SELECT * FROM news_feeds WHERE id = ?", [id]);
  return row ? toFeed(row) : null;
}

/** Tarama sırası gelmiş açık akışlar; en uzun süredir taranmayan önce. */
export async function listDueFeeds(now: number): Promise<NewsFeed[]> {
  return (await queryAll<FeedRow>("SELECT * FROM news_feeds WHERE enabled = 1 AND next_due_at <= ? ORDER BY COALESCE(last_fetched_at, 0)", [now])).map(toFeed);
}

export async function setFeedEnabled(id: string, enabled: boolean): Promise<void> {
  await execute("UPDATE news_feeds SET enabled = ?, next_due_at = 0 WHERE id = ?", [enabled ? 1 : 0, id]);
}

export interface FeedResult {
  status: FeedStatus;
  error: string | null;
  itemCount: number;
  etag: string | null;
  lastModified: string | null;
  nextDueAt: number;
}

export async function recordFeedResult(feed: NewsFeed, result: FeedResult, now: number): Promise<void> {
  const succeeded = result.status === "ok" || result.status === "unchanged";
  await execute(
    `UPDATE news_feeds SET last_fetched_at = ?, last_ok_at = ?, last_status = ?, last_error = ?, last_item_count = ?,
       failures = ?, etag = ?, last_modified = ?, next_due_at = ? WHERE id = ?`,
    [
      now,
      succeeded ? now : feed.lastOkAt,
      result.status,
      result.error,
      result.status === "ok" ? result.itemCount : feed.lastItemCount,
      result.status === "error" ? feed.failures + 1 : 0,
      result.etag,
      result.lastModified,
      result.nextDueAt,
      feed.id,
    ],
  );
}

/* ── robots.txt ───────────────────────────────────────────────────────── */

export async function getRobots(host: string): Promise<{ body: string; fetchedAt: number } | null> {
  const row = await queryOne<{ body: string; fetched_at: number }>("SELECT body, fetched_at FROM news_robots WHERE host = ?", [host]);
  return row ? { body: row.body, fetchedAt: row.fetched_at } : null;
}

export async function saveRobots(host: string, body: string, now: number): Promise<void> {
  await execute("INSERT INTO news_robots (host, body, fetched_at) VALUES (?, ?, ?) ON CONFLICT (host) DO UPDATE SET body = excluded.body, fetched_at = excluded.fetched_at", [
    host,
    body,
    now,
  ]);
}

/* ── Arşiv ────────────────────────────────────────────────────────────── */

export interface NewArticle {
  feedId: string;
  outlet: string;
  domain: string;
  url: string;
  externalId: string;
  title: string;
  summary: string;
  searchText: string;
  language: string;
  publishedAt: number;
}

export interface NewsArticle {
  outlet: string;
  domain: string;
  url: string;
  externalId: string;
  title: string;
  summary: string;
  language: string;
  publishedAt: number;
}

/** Yeni başlıkları ekler; adresi arşivde olanlar atlanır. Eklenen sayısını döndürür. */
export async function insertArticles(articles: NewArticle[], now: number): Promise<number> {
  if (articles.length === 0) return 0;
  return await transaction(async () => {
    let inserted = 0;
    for (const article of articles) {
      inserted += await execute(
        `INSERT INTO news_articles (feed_id, outlet, domain, url, external_id, title, summary, search_text, language, published_at, first_seen_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING`,
        [
          article.feedId,
          article.outlet,
          article.domain,
          article.url,
          article.externalId,
          article.title,
          article.summary,
          article.searchText,
          article.language,
          article.publishedAt,
          now,
        ],
      );
    }
    return inserted;
  });
}

export async function pruneArticles(before: number): Promise<number> {
  return await execute("DELETE FROM news_articles WHERE published_at < ?", [before]);
}

const MAX_CANDIDATES = 20_000;

/**
 * Arşivden aday başlıklar. `groups` toplama planının zorunlu gruplarıdır: her
 * gruptan en az bir ifadenin kaba parçası metinde geçmelidir. Sonuç bir üst
 * kümedir; kesin eşleşmeyi çağıran taraf sorgu eşleştiricisiyle yapar.
 */
export async function findCandidateArticles(groups: readonly string[][], since: number): Promise<NewsArticle[]> {
  const conditions = ["published_at >= ?"];
  const params: SqlParams = [since];
  const probes = probeConditions("search_text", groupProbes(groups));
  conditions.push(...probes.conditions);
  params.push(...probes.params);
  return (
    await queryAll<{ outlet: string; domain: string; url: string; external_id: string; title: string; summary: string; language: string; published_at: number }>(
      `SELECT outlet, domain, url, external_id, title, summary, language, published_at FROM news_articles
     WHERE ${conditions.join(" AND ")} ORDER BY published_at DESC LIMIT ${MAX_CANDIDATES}`,
      params,
    )
  ).map((row) => ({
    outlet: row.outlet,
    domain: row.domain,
    url: row.url,
    externalId: row.external_id,
    title: row.title,
    summary: row.summary,
    language: row.language,
    publishedAt: row.published_at,
  }));
}

export interface ArchiveStats {
  articles: number;
  outlets: number;
  feeds: number;
  activeFeeds: number;
  failingFeeds: number;
  blockedFeeds: number;
  oldestPublishedAt: number | null;
  lastCrawlAt: number | null;
  addedSince: number;
}

/** Arşivin gerçek ölçüleri; `since` anından sonra eklenen başlık sayısıyla birlikte. */
export async function archiveStats(since: number): Promise<ArchiveStats> {
  const articles = await queryOne<{ total: number; outlets: number; oldest: number | null; added: number }>(
    "SELECT COUNT(*) AS total, COUNT(DISTINCT domain) AS outlets, MIN(published_at) AS oldest, COUNT(*) FILTER (WHERE first_seen_at >= ?) AS added FROM news_articles",
    [since],
  );
  const feeds = await queryOne<{ total: number; active: number; failing: number; blocked: number; last: number | null }>(
    `SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE enabled = 1) AS active,
            COUNT(*) FILTER (WHERE enabled = 1 AND last_status = 'error') AS failing,
            COUNT(*) FILTER (WHERE enabled = 1 AND last_status = 'robots') AS blocked,
            MAX(last_fetched_at) AS last FROM news_feeds`,
  );
  return {
    articles: articles?.total ?? 0,
    outlets: articles?.outlets ?? 0,
    feeds: feeds?.total ?? 0,
    activeFeeds: feeds?.active ?? 0,
    failingFeeds: feeds?.failing ?? 0,
    blockedFeeds: feeds?.blocked ?? 0,
    oldestPublishedAt: articles?.oldest ?? null,
    lastCrawlAt: feeds?.last ?? null,
    addedSince: articles?.added ?? 0,
  };
}

/** Akış başına arşivdeki başlık sayısı. */
export async function articleCountsByFeed(): Promise<Map<string, number>> {
  return new Map(
    (await queryAll<{ feed_id: string; total: number }>("SELECT feed_id, COUNT(*) AS total FROM news_articles GROUP BY feed_id")).map((row) => [row.feed_id, row.total]),
  );
}
