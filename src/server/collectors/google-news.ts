import type { RawItem } from "@/domain/types";
import { parseFeed, type FeedEntry } from "./feed-parser";
import { fetchText, hostnameOf, SourceRequestError } from "./http";
import { booleanQuery, quoteTerm } from "./query";
import type { CollectRequest, CollectResult, Connector } from "./types";

/**
 * Google Haberler RSS araması (Türkiye, Türkçe).
 *
 * DİKKAT: Akışın kendi telif notu kullanımı "kişisel, ticari olmayan" ile
 * sınırlar. Bu bağlayıcı yerel deneme içindir; kurumsal dağıtımda
 * (YANKI_DEPLOYMENT=institution) kayıt sistemi tarafından kapatılır ve yerini
 * lisanslı bir haber sağlayıcısı almalıdır.
 */

const CONNECTOR_ID = "google-haberler";
const ENDPOINT = "https://news.google.com/rss/search";
const MAX_KEYWORDS = 8;
const DAY_MS = 86_400_000;

function searchUrl(query: string, since: number): string {
  const days = Math.max(1, Math.min(30, Math.ceil((Date.now() - since) / DAY_MS)));
  const params = new URLSearchParams({ q: `${query} when:${days}d`, hl: "tr", gl: "TR", ceid: "TR:tr" });
  return `${ENDPOINT}?${params}`;
}

/** Başlıklar "Haber başlığı - Yayın adı" biçiminde gelir; yayın adı ayrılır. */
function stripSourceSuffix(title: string, sourceName: string | null): string {
  if (!sourceName) return title;
  const suffix = ` - ${sourceName}`;
  return title.endsWith(suffix) ? title.slice(0, -suffix.length) : title;
}

function toRawItem(entry: FeedEntry): RawItem | null {
  if (entry.publishedAt === null) return null;
  const domain = entry.sourceUrl ? hostnameOf(entry.sourceUrl) : null;
  return {
    connectorId: CONNECTOR_ID,
    sourceType: "news",
    sourceName: domain ?? entry.sourceName ?? "news.google.com",
    externalId: entry.id,
    // Google yönlendirme bağlantısıdır; yayıncının adresi akışta verilmez.
    url: entry.url,
    title: stripSourceSuffix(entry.title, entry.sourceName),
    // Açıklama alanı yalnızca başlığın tekrarını ve yayın adını içerir.
    content: "",
    authorName: entry.sourceName,
    authorHandle: null,
    authorFollowers: null,
    // Arama Türkiye/Türkçe baskısında yapılır; kısa başlıklarda dil tahmini güvenilmez olduğundan baskının dili esas alınır.
    language: "tr",
    publishedAt: entry.publishedAt,
    likes: null,
    comments: null,
    shares: null,
    views: null,
  };
}

async function collect(request: CollectRequest): Promise<CollectResult> {
  // Birden çok zorunlu grup varsa tek bir VE/VEYA sorgusu gönderilir; yoksa her ifade ayrı aranır.
  const grouped = request.groups.length > 1;
  const keywords = grouped ? [booleanQuery(request.groups)] : request.keywords.slice(0, MAX_KEYWORDS).map(quoteTerm);
  const notes: string[] = [];
  if (!grouped && request.keywords.length > MAX_KEYWORDS) {
    notes.push(`Sorguda ${request.keywords.length} arama ifadesi var; ilk ${MAX_KEYWORDS} tanesi arandı.`);
  }

  const byId = new Map<string, RawItem>();
  const failures: string[] = [];

  // Kaynağı yormamak için ifadeler sırayla aranır.
  for (const keyword of keywords) {
    try {
      const xml = await fetchText(searchUrl(keyword, request.since), "application/rss+xml, application/xml");
      for (const entry of parseFeed(xml)) {
        const item = toRawItem(entry);
        if (item && item.publishedAt >= request.since) byId.set(item.externalId, item);
      }
    } catch (error) {
      failures.push(`"${keyword}" (${error instanceof Error ? error.message : "hata"})`);
    }
  }

  if (failures.length === keywords.length) {
    throw new SourceRequestError(`Arama yapılamadı: ${failures.join(", ")}`, null);
  }
  if (failures.length > 0) notes.push(`Aranamayan ifadeler: ${failures.join(", ")}`);
  return { items: [...byId.values()], notes };
}

export const googleNewsConnector: Connector = {
  descriptor: {
    id: CONNECTOR_ID,
    name: "Google Haberler araması",
    sourceType: "news",
    summary: "Anahtar kelimeyle haber araması; binlerce yayından başlık getirir.",
    access: "personal-only",
    terms: "Akışın kendi koşulu: yalnızca kişisel, ticari olmayan kullanım. Kurumsal kurulumda kapatılır; yerine lisanslı bir haber sağlayıcısı bağlanmalıdır.",
    capabilities: {
      keywordSearch: true,
      history: "Son 30 güne kadar, arama başına en çok 100 başlık",
      engagement: false,
      authorFollowers: false,
      stores: "Yalnızca başlık + Google yönlendirme bağlantısı",
    },
  },
  isConfigured: () => true,
  collect,
};
