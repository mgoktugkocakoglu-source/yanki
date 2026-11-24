import type { RawItem } from "@/domain/types";
import { parseFeed, type FeedEntry } from "./feed-parser";
import { fetchText, SourceRequestError } from "./http";
import type { CollectRequest, CollectResult, Connector } from "./types";

/**
 * Türkiye'deki yayıncıların kendi RSS akışları.
 *
 * Bu akışlar anahtar kelimeyle aranamaz: son yayınlananların tamamı çekilir,
 * eşleştirme yerelde yapılır. Saklanan içerik başlık + kısa özet + bağlantıdır;
 * tam metin yeniden yayımlanmaz.
 *
 * Adresler 12 Kasım 2026'da canlı olarak doğrulandı.
 */

interface PublisherFeed {
  outlet: string;
  domain: string;
  url: string;
}

const FEEDS: readonly PublisherFeed[] = [
  { outlet: "Anadolu Ajansı", domain: "aa.com.tr", url: "https://www.aa.com.tr/tr/rss/default?cat=guncel" },
  { outlet: "Anadolu Ajansı Ekonomi", domain: "aa.com.tr", url: "https://www.aa.com.tr/tr/rss/default?cat=ekonomi" },
  { outlet: "TRT Haber", domain: "trthaber.com", url: "https://www.trthaber.com/sondakika.rss" },
  { outlet: "Hürriyet", domain: "hurriyet.com.tr", url: "https://www.hurriyet.com.tr/rss/anasayfa" },
  { outlet: "Sabah", domain: "sabah.com.tr", url: "https://www.sabah.com.tr/rss/sondakika.xml" },
  { outlet: "NTV", domain: "ntv.com.tr", url: "https://www.ntv.com.tr/son-dakika.rss" },
  { outlet: "Sözcü", domain: "sozcu.com.tr", url: "https://www.sozcu.com.tr/feeds-rss-category-sozcu" },
  { outlet: "Cumhuriyet", domain: "cumhuriyet.com.tr", url: "https://www.cumhuriyet.com.tr/rss" },
  { outlet: "Habertürk", domain: "haberturk.com", url: "https://www.haberturk.com/rss" },
  { outlet: "Milliyet", domain: "milliyet.com.tr", url: "https://www.milliyet.com.tr/rss/rssnew/sondakikarss.xml" },
  { outlet: "BBC Türkçe", domain: "bbc.com/turkce", url: "https://feeds.bbci.co.uk/turkce/rss.xml" },
  { outlet: "DW Türkçe", domain: "dw.com/tr", url: "https://rss.dw.com/xml/rss-tur-all" },
  { outlet: "Euronews Türkçe", domain: "tr.euronews.com", url: "https://tr.euronews.com/rss" },
  { outlet: "Diken", domain: "diken.com.tr", url: "https://www.diken.com.tr/feed/" },
  { outlet: "Webtekno", domain: "webtekno.com", url: "https://www.webtekno.com/rss.xml" },
  { outlet: "ShiftDelete.Net", domain: "shiftdelete.net", url: "https://shiftdelete.net/feed" },
  { outlet: "DonanımHaber", domain: "donanimhaber.com", url: "https://www.donanimhaber.com/rss/tum/" },
  { outlet: "Bloomberg HT", domain: "bloomberght.com", url: "https://www.bloomberght.com/rss/tum-haberler.xml" },
  { outlet: "Dünya", domain: "dunya.com", url: "https://www.dunya.com/rss" },
  { outlet: "Ekonomim", domain: "ekonomim.com", url: "https://www.ekonomim.com/rss" },
];

export const PUBLISHER_FEED_COUNT = FEEDS.length;
const CONNECTOR_ID = "yayinci-rss";
const CACHE_TTL_MS = 4 * 60_000;
const MAX_NOTED_FAILURES = 4;

interface CachedFeed {
  fetchedAt: number;
  entries: FeedEntry[];
}

/** Aynı tarama döngüsünde birden çok proje aynı akışı yeniden indirmesin. */
const cache = new Map<string, CachedFeed>();

async function loadFeed(feed: PublisherFeed): Promise<FeedEntry[]> {
  const cached = cache.get(feed.url);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) return cached.entries;

  const entries = parseFeed(await fetchText(feed.url, "application/rss+xml, application/atom+xml, application/xml, text/xml"));
  cache.set(feed.url, { fetchedAt: Date.now(), entries });
  return entries;
}

function toRawItem(feed: PublisherFeed, entry: FeedEntry): RawItem | null {
  if (entry.publishedAt === null) return null;
  return {
    connectorId: CONNECTOR_ID,
    sourceType: "news",
    sourceName: feed.domain,
    externalId: entry.id,
    url: entry.url,
    title: entry.title,
    content: entry.text,
    authorName: feed.outlet,
    authorHandle: null,
    authorFollowers: null,
    language: "tr",
    publishedAt: entry.publishedAt,
    likes: null,
    comments: null,
    shares: null,
    views: null,
  };
}

async function collect(request: CollectRequest): Promise<CollectResult> {
  const settled = await Promise.allSettled(FEEDS.map(loadFeed));
  const items: RawItem[] = [];
  const failures: string[] = [];

  settled.forEach((result, index) => {
    const feed = FEEDS[index];
    if (result.status === "rejected") {
      const reason = result.reason instanceof SourceRequestError ? result.reason.message : "ayrıştırılamadı";
      failures.push(`${feed.outlet} (${reason})`);
      return;
    }
    for (const entry of result.value) {
      const item = toRawItem(feed, entry);
      // Bazı akışlar yıllar öncesine ait öğeleri de karıştırır; yalnızca istenen pencere alınır.
      if (item && item.publishedAt >= request.since) items.push(item);
    }
  });

  if (failures.length === FEEDS.length) {
    throw new SourceRequestError(`Hiçbir akışa ulaşılamadı: ${failures.slice(0, MAX_NOTED_FAILURES).join(", ")}`, null);
  }
  const notes =
    failures.length > 0
      ? [`${FEEDS.length} akıştan ${failures.length} tanesi yanıt vermedi: ${failures.slice(0, MAX_NOTED_FAILURES).join(", ")}`]
      : [];
  return { items, notes };
}

export const publisherFeedsConnector: Connector = {
  descriptor: {
    id: CONNECTOR_ID,
    name: "Türkiye haber siteleri",
    sourceType: "news",
    summary: `${FEEDS.length} yayıncının kendi RSS akışı: ajanslar, ulusal gazeteler, ekonomi ve teknoloji yayınları.`,
    access: "open",
    terms:
      "Yayıncıların kendi akışları. İçerik telif altındadır: yalnızca başlık, kısa özet ve bağlantı saklanır; tam metin yeniden yayımlanmaz.",
    capabilities: {
      keywordSearch: false,
      history: "Akışta duran son öğeler (çoğunlukla 1–3 gün)",
      engagement: false,
      authorFollowers: false,
      stores: "Başlık + kısa alıntı + bağlantı",
    },
  },
  isConfigured: () => true,
  collect,
};
