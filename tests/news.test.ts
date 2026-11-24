import { describe, expect, it } from "vitest";
import { isPathAllowed, parseRobots } from "@/lib/crawl/robots";
import { buildCollectionPlan, EMPTY_FIELDS, matchQuery, parseQuery } from "@/lib/query";
import { tokenize, toSearchText } from "@/lib/text/normalize";
import { isInflectionOf, stablePrefix } from "@/lib/text/turkish";
import { parseNewsSitemap } from "@/server/collectors/feed-parser";
import { canonicalUrl, isPublicFeedUrl, toArticles } from "@/server/news/crawler";
import { SEED_FEEDS } from "@/server/news/sources";
import {
  addFeed,
  archiveStats,
  findCandidateArticles,
  getFeed,
  insertArticles,
  listDueFeeds,
  listFeeds,
  pruneArticles,
  recordFeedResult,
  seedFeeds,
  setFeedEnabled,
  type NewArticle,
} from "@/server/repositories/news";

/** Haber arşivi: görgü kuralları, arşiv kaydı ve projelerle eşleştirme. Ağa çıkılmaz. */

const NOW = Date.parse("2026-11-24T12:00:00+03:00");
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

describe("robots.txt", () => {
  const robots = [
    "User-agent: *",
    "Disallow: /arama",
    "Disallow: /*.pdf$",
    "Allow: /arama/rss",
    "Crawl-delay: 5",
    "",
    "User-agent: KotuBot",
    "Disallow: /",
    "Sitemap: https://ornek.com.tr/sitemap.xml",
  ].join("\n");

  it("genel grubun kurallarını uygular; en uzun eşleşen kural kazanır", () => {
    const rules = parseRobots(robots, "YankiBot");
    expect(isPathAllowed(rules, "https://ornek.com.tr/rss/gundem.xml")).toBe(true);
    expect(isPathAllowed(rules, "https://ornek.com.tr/arama?q=x")).toBe(false);
    expect(isPathAllowed(rules, "https://ornek.com.tr/arama/rss")).toBe(true);
    expect(isPathAllowed(rules, "https://ornek.com.tr/dosya.pdf")).toBe(false);
    expect(isPathAllowed(rules, "https://ornek.com.tr/dosya.pdf?x=1")).toBe(true);
    expect(rules.crawlDelaySeconds).toBe(5);
    expect(rules.sitemaps).toEqual(["https://ornek.com.tr/sitemap.xml"]);
  });

  it("bize özel grup varsa yalnızca o uygulanır", () => {
    const rules = parseRobots("User-agent: *\nDisallow:\n\nUser-agent: yankibot\nDisallow: /rss", "YankiBot");
    expect(isPathAllowed(rules, "https://ornek.com.tr/rss/a.xml")).toBe(false);
    expect(isPathAllowed(rules, "https://ornek.com.tr/haber")).toBe(true);
  });

  it("boş dosya ve boş Disallow her şeye izin verir", () => {
    expect(isPathAllowed(parseRobots("", "YankiBot"), "https://ornek.com.tr/rss")).toBe(true);
    expect(isPathAllowed(parseRobots("User-agent: *\nDisallow:", "YankiBot"), "https://ornek.com.tr/rss")).toBe(true);
  });

  it("başka bir tarayıcıya konan yasak bizi bağlamaz, herkese konan bağlar", () => {
    expect(isPathAllowed(parseRobots("User-agent: KotuBot\nDisallow: /", "YankiBot"), "https://ornek.com.tr/rss")).toBe(true);
    expect(isPathAllowed(parseRobots("User-agent: *\nDisallow: /", "YankiBot"), "https://ornek.com.tr/rss")).toBe(false);
  });
});

describe("tarayıcı dönüşümleri", () => {
  it("izleme parametrelerini ve parçayı atar, başka protokolü reddeder", () => {
    expect(canonicalUrl("https://ornek.com.tr/haber/1?utm_source=rss&id=7#yorumlar")).toBe("https://ornek.com.tr/haber/1?id=7");
    expect(canonicalUrl("javascript:alert(1)")).toBeNull();
  });

  it("yalnızca genel internet adreslerini kabul eder", () => {
    expect(isPublicFeedUrl("https://www.ornek.com.tr/rss")).toBe(true);
    const rejected = [
      "http://localhost/rss",
      "http://127.0.0.1/rss",
      "http://10.0.0.5/rss",
      "https://sunucu.internal/rss",
      "https://ornek.com.tr:8443/rss",
      "ftp://ornek.com.tr/rss",
      "https://kullanici:parola@ornek.com.tr/rss",
    ];
    for (const url of rejected) expect(isPublicFeedUrl(url), url).toBe(false);
  });

  it("haber site haritasını okur; haber bilgisi taşımayan adresleri atlar", () => {
    const xml = [
      '<?xml version="1.0"?>',
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">',
      "<url><loc>https://ornek.com.tr/haber/1</loc><news:news><news:publication_date>2026-11-24T08:00:00+03:00</news:publication_date>",
      "<news:title>Meclis bütçeyi görüştü</news:title></news:news></url>",
      "<url><loc>https://ornek.com.tr/kunye</loc></url>",
      "</urlset>",
    ].join("");
    const entries = parseNewsSitemap(xml);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ url: "https://ornek.com.tr/haber/1", title: "Meclis bütçeyi görüştü", publishedAt: Date.parse("2026-11-24T08:00:00+03:00") });
  });

  it("tarihsiz, saklama süresinden eski ve gelecek tarihli girişleri arşive almaz", async () => {
    await seedFeeds(NOW);
    const feed = (await listFeeds())[0];
    const entry = (id: string, publishedAt: number | null) => ({
      id,
      title: `Başlık ${id}`,
      url: `https://ornek.com.tr/${id}`,
      text: "Özet",
      author: null,
      publishedAt,
      sourceName: null,
      sourceUrl: null,
    });
    const articles = toArticles(feed, [entry("a", NOW - HOUR), entry("b", null), entry("c", NOW - 400 * DAY), entry("d", NOW + 2 * DAY), entry("a", NOW - HOUR)], NOW);
    expect(articles.map((article) => article.externalId)).toEqual(["a"]);
  });
});

describe("akış kaydı", () => {
  it("başlangıç listesi bir kez yüklenir, adresler tekildir", async () => {
    await seedFeeds(NOW);
    await seedFeeds(NOW);
    expect((await listFeeds()).filter((feed) => feed.origin === "seed")).toHaveLength(SEED_FEEDS.length);
    expect(new Set(SEED_FEEDS.map((feed) => feed.url)).size).toBe(SEED_FEEDS.length);
    expect(SEED_FEEDS.every((feed) => feed.url.startsWith("https://"))).toBe(true);
  });

  it("hata veren akışın sırası ertelenir, başarıda sayaç sıfırlanır; kapalı akış taranmaz", async () => {
    const url = "https://deneme.example.com/rss";
    await addFeed({ outlet: "Deneme", domain: "deneme.example.com", url, kind: "rss", language: "tr", origin: "manual" }, NOW);
    const find = async () => (await listFeeds()).find((feed) => feed.url === url)!;
    const isDue = async (at: number) => (await listDueFeeds(at)).some((feed) => feed.url === url);

    await recordFeedResult(await find(), { status: "error", error: "HTTP 500", itemCount: 0, etag: null, lastModified: null, nextDueAt: NOW + HOUR }, NOW);
    expect(await find()).toMatchObject({ failures: 1, lastStatus: "error", lastOkAt: null });
    expect(await isDue(NOW + 60_000)).toBe(false);
    expect(await isDue(NOW + 2 * HOUR)).toBe(true);

    await recordFeedResult(await find(), { status: "ok", error: null, itemCount: 12, etag: "abc", lastModified: null, nextDueAt: NOW }, NOW + HOUR);
    expect(await find()).toMatchObject({ failures: 0, lastStatus: "ok", lastItemCount: 12, etag: "abc", lastOkAt: NOW + HOUR });

    await setFeedEnabled((await find()).id, false);
    expect((await getFeed((await find()).id))?.enabled).toBe(false);
    expect(await isDue(NOW + 9 * HOUR)).toBe(false);
  });
});

describe("arşiv ve eşleştirme", () => {
  const article = (id: string, title: string, summary: string, publishedAt: number): NewArticle => ({
    feedId: "deneme",
    outlet: "Deneme Gazetesi",
    domain: "deneme.example.com",
    url: `https://deneme.example.com/haber/${id}`,
    externalId: id,
    title,
    summary,
    searchText: toSearchText(title, summary),
    language: "tr",
    publishedAt,
  });
  const corpus = [
    article("1", "Kitabın yeni baskısı raflarda", "Yayınevi ikinci baskıyı duyurdu.", NOW - HOUR),
    article("2", "Belediye meclisi bütçeyi onayladı", "Ulaşım yatırımlarına pay ayrıldı.", NOW - 2 * HOUR),
    article("3", "Seçimlerde son durum", "Sandıkların çoğu açıldı.", NOW - 3 * HOUR),
    article("4", "Renginden memnun kalmayanlara iade", "Mağaza açıklama yaptı.", NOW - 4 * HOUR),
    article("5", "Eski haber", "Seçim arşivi.", NOW - 30 * DAY),
    article("6", "Hava durumu", "Yarın yağmur bekleniyor.", NOW - HOUR),
  ];
  const since = NOW - 7 * DAY;

  it("aynı adres ikinci kez eklenmez", async () => {
    expect(await insertArticles(corpus, NOW)).toBe(corpus.length);
    expect(await insertArticles(corpus, NOW)).toBe(0);
    expect((await archiveStats(NOW - HOUR)).articles).toBe(corpus.length);
  });

  it("çekimde değişmeyen ön ek, kökün her çekimli biçiminde geçer", () => {
    const pairs = [
      ["kitap", "kitabin"],
      ["renk", "renginden"],
      ["secim", "secimlerde"],
      ["butce", "butceyi"],
      ["meclis", "meclisi"],
    ] as const;
    for (const [stem, inflected] of pairs) {
      expect(isInflectionOf(inflected, stem), `${stem} → ${inflected}`).toBe(true);
      expect(inflected.includes(stablePrefix(stem)), `${stem} → ${inflected}`).toBe(true);
    }
  });

  it("arşiv ön süzgeci, sorguyla eşleşen hiçbir haberi kaçırmaz", async () => {
    const queries = ["kitap", "renk", "seçim -çekiliş", '(belediye OR "hava durumu") dil:tr', '"belediye meclisi" bütçe', "ulaşım OR yağmur", "sandık*", "=baskısı"];
    for (const text of queries) {
      const ast = parseQuery(text);
      const plan = buildCollectionPlan(ast)!;
      const expected = corpus
        .filter((entry) => entry.publishedAt >= since)
        .filter((entry) => matchQuery(ast, tokenize(`${entry.title} \n ${entry.summary}`), { ...EMPTY_FIELDS, language: "tr" }).matched)
        .map((entry) => entry.externalId);
      const candidates = (await findCandidateArticles(plan.groups, since)).map((entry) => entry.externalId);
      expect(expected.length, text).toBeGreaterThan(0);
      expect(expected.every((id) => candidates.includes(id)), text).toBe(true);
      expect(candidates.includes("5"), text).toBe(false);
    }
  });

  it("ön süzgeç gerçekten daraltır: ilgisiz haberler aday olmaz", async () => {
    expect((await findCandidateArticles([["kitap"]], since)).map((entry) => entry.externalId)).toEqual(["1"]);
    expect((await findCandidateArticles([["belediye"], ["bütçe"]], since)).map((entry) => entry.externalId)).toEqual(["2"]);
  });

  it("saklama süresi dolan başlıklar silinir", async () => {
    expect(await pruneArticles(since)).toBe(1);
    expect((await archiveStats(NOW)).articles).toBe(corpus.length - 1);
  });
});
