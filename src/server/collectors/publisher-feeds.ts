import type { RawItem } from "@/domain/types";
import { config } from "../config";
import { crawlNews } from "../news/crawler";
import { SEED_FEEDS } from "../news/sources";
import { archiveStats, findCandidateArticles, type NewsArticle } from "../repositories/news";
import type { CollectRequest, CollectResult, Connector } from "./types";

/**
 * Haber arşivi bağlayıcısı. Yayıncı akışları projelerden bağımsız olarak
 * sürekli taranıp arşive yazılır (bkz. `news/crawler.ts`); bu bağlayıcı ağa
 * çıkmaz, arşivden aday başlıkları getirir. Böylece yeni açılan bir konu,
 * arşivde duran geçmiş haberlerle hemen dolar.
 *
 * Saklanan içerik başlık + kısa özet + bağlantıdır; tam metin saklanmaz.
 */

const CONNECTOR_ID = "yayinci-rss";
const OUTLET_COUNT = new Set(SEED_FEEDS.map((feed) => feed.domain)).size;

function toRawItem(article: NewsArticle): RawItem {
  return {
    connectorId: CONNECTOR_ID,
    sourceType: "news",
    sourceName: article.domain,
    externalId: article.externalId,
    url: article.url,
    title: article.title,
    content: article.summary,
    authorName: article.outlet,
    authorHandle: null,
    authorFollowers: null,
    language: article.language,
    publishedAt: article.publishedAt,
    likes: null,
    comments: null,
    shares: null,
    views: null,
  };
}

/** Arşiv hiç taranmadıysa ya da taraması gecikmişse önce bir tarama yapılır. */
async function ensureFreshArchive(now: number): Promise<void> {
  const { lastCrawlAt } = await archiveStats(now);
  const staleAfter = Math.max(1, config.newsIntervalMinutes) * 2 * 60_000;
  if (lastCrawlAt === null || now - lastCrawlAt > staleAfter) await crawlNews();
}

async function collect(request: CollectRequest): Promise<CollectResult> {
  const now = Date.now();
  await ensureFreshArchive(now);
  const stats = await archiveStats(now);
  const items = (await findCandidateArticles(request.groups, request.since)).map(toRawItem);
  const notes = stats.failingFeeds > 0 ? [`${stats.activeFeeds} akıştan ${stats.failingFeeds} tanesi son taramada yanıt vermedi.`] : [];
  return { items, notes };
}

export const publisherFeedsConnector: Connector = {
  descriptor: {
    id: CONNECTOR_ID,
    name: "Türkiye haber arşivi",
    sourceType: "news",
    summary: `${OUTLET_COUNT} yayıncının kendi akışlarından sürekli toplanan haber başlıkları: ajanslar, ulusal gazeteler, haber siteleri, ekonomi ve teknoloji yayınları.`,
    access: "open",
    terms:
      "Yayıncıların kendi yayımladığı akışlar; robots.txt kurallarına uyulur. İçerik telif altındadır: yalnızca başlık, kısa özet ve bağlantı saklanır; tam metin yeniden yayımlanmaz.",
    archiveDays: config.newsRetentionDays,
    capabilities: {
      keywordSearch: true,
      history: `Arşivde duran haberler (tarama başladığından beri, en çok ${config.newsRetentionDays} gün)`,
      engagement: false,
      authorFollowers: false,
      stores: "Başlık + kısa alıntı + bağlantı",
    },
  },
  isConfigured: () => true,
  collect,
};
