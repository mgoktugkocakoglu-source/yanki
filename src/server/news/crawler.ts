import { ALLOW_ALL, isPathAllowed, parseRobots, type RobotsRules } from "@/lib/crawl/robots";
import { toSearchText } from "@/lib/text/normalize";
import { DAY_MS } from "@/lib/time";
import { parseFeed, parseNewsSitemap, type FeedEntry } from "../collectors/feed-parser";
import { fetchConditional, SourceRequestError } from "../collectors/http";
import { config } from "../config";
import {
  getRobots,
  insertArticles,
  listDueFeeds,
  pruneArticles,
  recordFeedResult,
  saveRobots,
  seedFeeds,
  type FeedResult,
  type NewArticle,
  type NewsFeed,
} from "../repositories/news";

/**
 * Haber tarayıcısı: yayıncıların kendi yayımladığı akışları sürekli okur ve
 * başlıkları arşive yazar. Makale sayfaları taranmaz; yalnızca yayıncının
 * akışta verdiği başlık, kısa özet ve bağlantı alınır.
 *
 * Görgü kuralları:
 *   - Her alan adının robots.txt dosyası okunur; izin vermediği akış taranmaz.
 *   - Aynı alan adına istekler sırayla ve aralıklı gider (Crawl-delay'e uyulur).
 *   - Koşullu GET kullanılır; değişmeyen akışın gövdesi indirilmez.
 *   - Yanıt vermeyen akışta aralık katlanarak uzar.
 */

const ROBOTS_TTL_MS = DAY_MS;
const ROBOTS_BLOCK_RETRY_MS = DAY_MS;
const MAX_BACKOFF_MS = 6 * 60 * 60_000;
const DEFAULT_HOST_DELAY_MS = 1_000;
/** Bundan uzun bekleme isteyen alan adında döngü başına tek akış taranır. */
const MAX_INLINE_DELAY_MS = 10_000;
const HOST_CONCURRENCY = 8;
const MAX_TITLE_LENGTH = 300;
const MAX_SUMMARY_LENGTH = 600;
const FUTURE_TOLERANCE_MS = 60 * 60_000;
const FEED_ACCEPT = "application/rss+xml, application/atom+xml, application/xml, text/xml";
const TRACKING_PARAM = /^(utm_[a-z]+|fbclid|gclid|ref|source)$/i;

/** robots.txt'te aranacak ad: tanıtıcının ürün adı ("YankiBot/0.1 …" → "YankiBot"). */
function agentToken(): string {
  return config.userAgent.split(/[/\s]/)[0] || "YankiBot";
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** İzleme parametreleri ve parça atılır; aynı haber tek adresle saklanır. */
export function canonicalUrl(raw: string): string | null {
  try {
    const url = new URL(raw.trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (TRACKING_PARAM.test(key)) url.searchParams.delete(key);
    }
    return url.toString();
  } catch {
    return null;
  }
}

function clip(text: string, limit: number): string {
  const collapsed = text.replace(/\s+/g, " ").trim();
  return collapsed.length > limit ? `${collapsed.slice(0, limit).trimEnd()}…` : collapsed;
}

/** Akış girişlerini arşiv kayıtlarına çevirir. Tarihsiz, eski ya da gelecek tarihli girişler atılır. */
export function toArticles(feed: NewsFeed, entries: FeedEntry[], now: number): NewArticle[] {
  const oldest = now - config.newsRetentionDays * DAY_MS;
  const articles: NewArticle[] = [];
  const seen = new Set<string>();
  for (const entry of entries) {
    if (entry.publishedAt === null || entry.publishedAt < oldest || entry.publishedAt > now + FUTURE_TOLERANCE_MS) continue;
    const url = canonicalUrl(entry.url);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    const title = clip(entry.title, MAX_TITLE_LENGTH);
    const summary = clip(entry.text, MAX_SUMMARY_LENGTH);
    articles.push({
      feedId: feed.id,
      outlet: feed.outlet,
      domain: feed.domain,
      url,
      externalId: entry.id || url,
      title,
      summary,
      searchText: toSearchText(title, summary),
      language: feed.language,
      publishedAt: Math.min(entry.publishedAt, now),
    });
  }
  return articles;
}

type RobotsOutcome = { ok: true; rules: RobotsRules } | { ok: false; reason: string };

/**
 * Alan adının robots.txt kuralları (günde bir yenilenir). Dosya yoksa (4xx)
 * tarama serbesttir; sunucu hata veriyorsa ya da ulaşılamıyorsa kural
 * bilinemediği için o alan adı bu döngüde taranmaz (RFC 9309 §2.3.1).
 */
async function robotsFor(origin: string, now: number): Promise<RobotsOutcome> {
  const host = new URL(origin).host;
  const cached = await getRobots(host);
  if (cached && now - cached.fetchedAt < ROBOTS_TTL_MS) return { ok: true, rules: parseRobots(cached.body, agentToken()) };

  try {
    const response = await fetchConditional(`${origin}/robots.txt`, "text/plain, */*", { etag: null, lastModified: null });
    const body = response.status === "ok" ? response.body : "";
    await saveRobots(host, body, now);
    return { ok: true, rules: parseRobots(body, agentToken()) };
  } catch (error) {
    const status = error instanceof SourceRequestError ? error.status : null;
    if (status !== null && status >= 400 && status < 500) {
      await saveRobots(host, "", now);
      return { ok: true, rules: ALLOW_ALL };
    }
    // Daha önce okunmuş kurallar varsa onlarla devam etmek, kuralsız taramaktan güvenlidir.
    if (cached) return { ok: true, rules: parseRobots(cached.body, agentToken()) };
    return { ok: false, reason: `robots.txt okunamadı (${error instanceof Error ? error.message : "bilinmeyen hata"})` };
  }
}

function backoff(failures: number): number {
  const interval = Math.max(1, config.newsIntervalMinutes) * 60_000;
  return Math.min(interval * 2 ** Math.min(failures, 10), MAX_BACKOFF_MS);
}

interface FeedOutcome {
  status: FeedResult["status"];
  inserted: number;
}

async function crawlFeed(feed: NewsFeed, rules: RobotsRules, now: number): Promise<FeedOutcome> {
  const interval = Math.max(1, config.newsIntervalMinutes) * 60_000;
  const keep = { etag: feed.etag, lastModified: feed.lastModified };

  if (!isPathAllowed(rules, feed.url)) {
    await recordFeedResult(feed, { status: "robots", error: "robots.txt bu adresi taramaya kapatıyor", itemCount: 0, ...keep, nextDueAt: now + ROBOTS_BLOCK_RETRY_MS }, now);
    return { status: "robots", inserted: 0 };
  }
  try {
    const response = await fetchConditional(feed.url, FEED_ACCEPT, keep);
    if (response.status === "unchanged") {
      await recordFeedResult(feed, { status: "unchanged", error: null, itemCount: 0, ...keep, nextDueAt: now + interval }, now);
      return { status: "unchanged", inserted: 0 };
    }
    const entries = feed.kind === "sitemap" ? parseNewsSitemap(response.body) : parseFeed(response.body);
    if (entries.length === 0) throw new SourceRequestError("akışta okunabilir haber yok", null);
    const inserted = await insertArticles(toArticles(feed, entries, now), now);
    await recordFeedResult(
      feed,
      { status: "ok", error: null, itemCount: entries.length, etag: response.etag, lastModified: response.lastModified, nextDueAt: now + interval },
      now,
    );
    return { status: "ok", inserted };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "bilinmeyen hata";
    await recordFeedResult(feed, { status: "error", error: reason.slice(0, 200), itemCount: 0, ...keep, nextDueAt: now + backoff(feed.failures + 1) }, now);
    return { status: "error", inserted: 0 };
  }
}

export interface CrawlSummary {
  feeds: number;
  ok: number;
  unchanged: number;
  errors: number;
  blocked: number;
  inserted: number;
  pruned: number;
  durationMs: number;
}

async function crawlHost(feeds: NewsFeed[], summary: CrawlSummary, now: number): Promise<void> {
  const origin = new URL(feeds[0].url).origin;
  const robots = await robotsFor(origin, now);
  if (!robots.ok) {
    for (const feed of feeds) {
      await recordFeedResult(
        feed,
        { status: "error", error: robots.reason.slice(0, 200), itemCount: 0, etag: feed.etag, lastModified: feed.lastModified, nextDueAt: now + backoff(feed.failures + 1) },
        now,
      );
      summary.errors += 1;
    }
    return;
  }
  const requested = (robots.rules.crawlDelaySeconds ?? 0) * 1000;
  const delay = Math.max(DEFAULT_HOST_DELAY_MS, requested);
  // Uzun bekleme isteyen alan adında bu döngüde tek akış taranır; diğerleri sıradaki döngüye kalır.
  const batch = delay > MAX_INLINE_DELAY_MS ? feeds.slice(0, 1) : feeds;

  for (const [index, feed] of batch.entries()) {
    if (index > 0) await sleep(delay);
    const outcome = await crawlFeed(feed, robots.rules, now);
    summary.inserted += outcome.inserted;
    if (outcome.status === "ok") summary.ok += 1;
    else if (outcome.status === "unchanged") summary.unchanged += 1;
    else if (outcome.status === "robots") summary.blocked += 1;
    else summary.errors += 1;
  }
}

const RUNNING_KEY = Symbol.for("yanki.news.crawl");
type GlobalWithCrawl = typeof globalThis & { [RUNNING_KEY]?: Promise<CrawlSummary> };

async function runCycle(): Promise<CrawlSummary> {
  const started = Date.now();
  await seedFeeds(started);
  const due = await listDueFeeds(started);
  const summary: CrawlSummary = { feeds: due.length, ok: 0, unchanged: 0, errors: 0, blocked: 0, inserted: 0, pruned: 0, durationMs: 0 };

  const byHost = new Map<string, NewsFeed[]>();
  for (const feed of due) {
    let host: string;
    try {
      host = new URL(feed.url).host;
    } catch {
      continue;
    }
    byHost.set(host, [...(byHost.get(host) ?? []), feed]);
  }

  const queue = [...byHost.values()];
  const workers = Array.from({ length: Math.min(HOST_CONCURRENCY, queue.length) }, async () => {
    for (let feeds = queue.shift(); feeds; feeds = queue.shift()) {
      try {
        await crawlHost(feeds, summary, started);
      } catch (error) {
        // Bir alan adındaki beklenmedik hata diğerlerini durdurmamalı.
        console.error(`[yankı] haber taraması: ${feeds[0].domain}`, error);
        summary.errors += feeds.length;
      }
    }
  });
  await Promise.all(workers);

  summary.pruned = await pruneArticles(started - config.newsRetentionDays * DAY_MS);
  summary.durationMs = Date.now() - started;
  return summary;
}

/** Sırası gelen akışları bir kez tarar. Süren bir tarama varsa onun sonucu beklenir. */
export function crawlNews(): Promise<CrawlSummary> {
  const holder = globalThis as GlobalWithCrawl;
  holder[RUNNING_KEY] ??= runCycle().finally(() => {
    delete holder[RUNNING_KEY];
  });
  return holder[RUNNING_KEY];
}

/** Yalnızca genel internet adresleri: yerel ağ, IP adresi ya da başka protokol kabul edilmez. */
export function isPublicFeedUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    const host = url.hostname.toLowerCase();
    if (url.protocol !== "https:" && url.protocol !== "http:") return false;
    if (url.username || url.password || url.port) return false;
    if (!host.includes(".") || /^[\d.]+$/.test(host) || host.includes(":")) return false;
    return !/(^|\.)(localhost|local|internal|lan|home|test)$/.test(host);
  } catch {
    return false;
  }
}

export type ProbeResult = { ok: true; kind: "rss" | "sitemap"; entries: number; dated: number } | { ok: false; reason: string };

/** Yeni bir akış adresini kaydetmeden dener: robots.txt izni, yanıt ve okunabilir haber var mı? */
export async function probeFeed(url: string): Promise<ProbeResult> {
  if (!isPublicFeedUrl(url)) return { ok: false, reason: "Adres genel bir internet adresi olmalı (https://…)." };
  const robots = await robotsFor(new URL(url).origin, Date.now());
  if (!robots.ok) return { ok: false, reason: robots.reason };
  if (!isPathAllowed(robots.rules, url)) return { ok: false, reason: "Sitenin robots.txt dosyası bu adresi taramaya kapatıyor." };
  try {
    const response = await fetchConditional(url, FEED_ACCEPT, { etag: null, lastModified: null });
    if (response.status !== "ok") return { ok: false, reason: "Adres içerik döndürmedi." };
    const feedEntries = parseFeed(response.body);
    const entries = feedEntries.length > 0 ? feedEntries : parseNewsSitemap(response.body);
    if (entries.length === 0) return { ok: false, reason: "Adreste okunabilir bir haber akışı (RSS, Atom ya da haber site haritası) bulunamadı." };
    return { ok: true, kind: feedEntries.length > 0 ? "rss" : "sitemap", entries: entries.length, dated: entries.filter((entry) => entry.publishedAt !== null).length };
  } catch (error) {
    return { ok: false, reason: `Adrese ulaşılamadı: ${error instanceof Error ? error.message : "bilinmeyen hata"}` };
  }
}
