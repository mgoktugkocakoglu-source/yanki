import type { RawItem } from "@/domain/types";
import { config } from "../config";
import { fetchJson, SourceRequestError } from "./http";
import { booleanQuery } from "./query";
import type { CollectRequest, CollectResult, Connector } from "./types";

/**
 * X (Twitter) resmî API v2: son 7 günün gönderilerinde arama.
 *
 * Ücretlidir (okunan gönderi başına). Maliyeti sınırlamak için:
 *   - Tüm arama ifadeleri VEYA ile tek sorguda birleştirilir: tarama başına tek istek.
 *   - Yalnızca son taramadan sonraki gönderiler istenir (`start_time`).
 *   - Günlük gönderi sınırı toplama düzenleyicisinde uygulanır (`maxItems`).
 *
 * DİKKAT: Bu bağlayıcı gerçek bir anahtarla sınanmadı; uç nokta ve alan adları
 * resmî belgelere göre yazıldı. İlk çalıştırmada Kaynaklar ekranındaki sonucu denetleyin.
 */

const CONNECTOR_ID = "x";
const ENDPOINT = "https://api.x.com/2/tweets/search/recent";
const MAX_QUERY_LENGTH = 512;
const PAGE_MIN = 10;
const PAGE_MAX = 100;
const SEARCH_WINDOW_MS = 7 * 86_400_000 - 5 * 60_000;
const QUERY_SUFFIX = " -is:retweet";

interface XUser {
  id: string;
  username: string;
  name: string;
  public_metrics?: { followers_count?: number };
}

interface XPost {
  id: string;
  text: string;
  author_id: string;
  created_at: string;
  lang?: string;
  public_metrics?: { like_count?: number; reply_count?: number; retweet_count?: number; quote_count?: number; impression_count?: number };
}

interface SearchResponse {
  data?: XPost[];
  includes?: { users?: XUser[] };
}

/** İfadeleri tek sorguda birleştirir; uzunluk sınırını aşarsa sondan ifade düşürür. */
function buildQuery(keywords: string[], groups: string[][], language: string | null): { query: string; dropped: number } {
  const suffix = `${QUERY_SUFFIX}${language ? ` lang:${language}` : ""}`;
  // Zorunlu grupların tümü sığıyorsa birlikte gönderilir; okunan (ücretli) gönderi sayısı azalır.
  const grouped = `${booleanQuery(groups)}${suffix}`;
  if (groups.length > 1 && grouped.length <= MAX_QUERY_LENGTH) return { query: grouped, dropped: 0 };
  const terms = keywords.map((keyword) => (/\s/.test(keyword) ? `"${keyword}"` : keyword));
  while (terms.length > 1 && `(${terms.join(" OR ")})${suffix}`.length > MAX_QUERY_LENGTH) terms.pop();
  const body = terms.length > 1 ? `(${terms.join(" OR ")})` : terms[0];
  return { query: `${body}${suffix}`, dropped: keywords.length - terms.length };
}

function toRawItem(post: XPost, users: ReadonlyMap<string, XUser>): RawItem | null {
  const publishedAt = Date.parse(post.created_at);
  const author = users.get(post.author_id);
  if (Number.isNaN(publishedAt) || !author) return null;
  const metrics = post.public_metrics ?? {};
  return {
    connectorId: CONNECTOR_ID,
    sourceType: "social",
    sourceName: "X",
    externalId: post.id,
    url: `https://x.com/${author.username}/status/${post.id}`,
    title: "",
    content: post.text,
    authorName: author.name,
    authorHandle: author.username,
    authorFollowers: author.public_metrics?.followers_count ?? null,
    language: post.lang && post.lang !== "und" ? post.lang : null,
    publishedAt,
    likes: metrics.like_count ?? null,
    comments: metrics.reply_count ?? null,
    shares: (metrics.retweet_count ?? 0) + (metrics.quote_count ?? 0),
    // Yeni gönderilerde gösterim 0 gelir; "görüntülenmedi" değil "henüz bilinmiyor" demektir.
    views: metrics.impression_count ? metrics.impression_count : null,
  };
}

function explain(error: unknown): never {
  if (error instanceof SourceRequestError) {
    if (error.status === 401) throw new SourceRequestError("X anahtarı geçersiz (401). X_BEARER_TOKEN değerini denetleyin.", 401);
    if (error.status === 402 || error.status === 403) throw new SourceRequestError(`X erişimi reddetti (${error.status}). Hesapta kredi ve arama yetkisi olduğunu denetleyin.`, error.status);
    if (error.status === 429) throw new SourceRequestError("X hız sınırına takıldı (429); sonraki taramada yeniden denenecek.", 429);
  }
  throw error;
}

async function collect(request: CollectRequest): Promise<CollectResult> {
  if (!config.xBearerToken) throw new SourceRequestError("X_BEARER_TOKEN tanımlı değil.", null);
  if (request.maxItems !== null && request.maxItems < PAGE_MIN) {
    return { items: [], notes: ["Günlük X gönderi sınırına ulaşıldı; yarın devam edilecek (YANKI_X_DAILY_POST_LIMIT)."] };
  }

  const { query, dropped } = buildQuery(request.keywords, request.groups, request.language);
  const params = new URLSearchParams({
    query,
    max_results: String(Math.min(PAGE_MAX, request.maxItems ?? PAGE_MAX)),
    start_time: new Date(Math.max(request.since, Date.now() - SEARCH_WINDOW_MS)).toISOString(),
    "tweet.fields": "created_at,lang,public_metrics,author_id",
    expansions: "author_id",
    "user.fields": "username,name,public_metrics",
  });

  const response = await fetchJson<SearchResponse>(`${ENDPOINT}?${params}`, { Authorization: `Bearer ${config.xBearerToken}` }).catch(explain);
  const users = new Map((response.includes?.users ?? []).map((user) => [user.id, user]));
  const posts = response.data ?? [];
  const items = posts.map((post) => toRawItem(post, users)).filter((item): item is RawItem => item !== null);

  const notes: string[] = [];
  if (dropped > 0) notes.push(`Sorgu uzunluk sınırı nedeniyle ${dropped} arama ifadesi X'te aranmadı.`);
  if (posts.length >= PAGE_MAX) notes.push(`Sonuç sayfa sınırına ulaştı; en yeni ${PAGE_MAX} gönderi alındı.`);
  return { items, notes };
}

export const xConnector: Connector = {
  descriptor: {
    id: CONNECTOR_ID,
    name: "X (Twitter)",
    sourceType: "social",
    summary: "Resmî API ile son 7 günün gönderilerinde anahtar kelime araması; takipçi, beğeni, yanıt ve yeniden paylaşım sayılarıyla.",
    access: "open",
    terms: "Resmî ücretli API: okunan gönderi başına ücret alınır. Günlük okuma sınırı YANKI_X_DAILY_POST_LIMIT ile belirlenir. Gönderiler ve kullanıcı adları kişisel veridir (KVKK).",
    requiredSetting: "X_BEARER_TOKEN",
    metered: true,
    dailyLimit: config.xDailyPostLimit,
    capabilities: {
      keywordSearch: true,
      history: "Son 7 gün; tarama başına en yeni 100 gönderi",
      engagement: true,
      authorFollowers: true,
      stores: "Gönderi metni + bağlantı",
    },
  },
  isConfigured: () => config.xBearerToken !== null,
  collect,
};
