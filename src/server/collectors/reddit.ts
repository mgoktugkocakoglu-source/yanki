import type { RawItem } from "@/domain/types";
import { config } from "../config";
import { fetchJson, postForm, SourceRequestError } from "./http";
import { booleanQuery } from "./query";
import type { CollectRequest, CollectResult, Connector } from "./types";

/**
 * Reddit resmî API: gönderi başlık ve metinlerinde arama (yorumlar alınmaz).
 *
 * Uygulama kimliğiyle (client credentials) okunur; kullanıcı adına işlem
 * yapılmaz. Ticari kullanım Reddit ile yazılı anlaşma gerektirir; anahtarlar
 * o anlaşmayla verilen uygulamaya ait olmalıdır.
 *
 * DİKKAT: Bu bağlayıcı gerçek bir anahtarla sınanmadı; uç nokta ve alan adları
 * resmî belgelere göre yazıldı. İlk çalıştırmada Kaynaklar ekranındaki sonucu denetleyin.
 */

const CONNECTOR_ID = "reddit";
const TOKEN_ENDPOINT = "https://www.reddit.com/api/v1/access_token";
const SEARCH_ENDPOINT = "https://oauth.reddit.com/search";
const PAGE_SIZE = 100;
/** Jeton süresi dolmadan bu kadar önce yenilenir. */
const TOKEN_MARGIN_MS = 60_000;

interface TokenResponse {
  access_token?: string;
  expires_in?: number;
}

export interface RedditPost {
  id?: string;
  title?: string;
  selftext?: string;
  author?: string;
  subreddit?: string;
  permalink?: string;
  created_utc?: number;
  score?: number;
  num_comments?: number;
}

interface SearchResponse {
  data?: { children?: Array<{ kind?: string; data?: RedditPost }> };
}

let cachedToken: { value: string; expiresAt: number } | null = null;

async function accessToken(): Promise<string> {
  const { redditClientId, redditClientSecret } = config;
  if (!redditClientId || !redditClientSecret) throw new SourceRequestError("REDDIT_CLIENT_ID ve REDDIT_CLIENT_SECRET tanımlı değil.", null);
  if (cachedToken && cachedToken.expiresAt > Date.now()) return cachedToken.value;

  const basic = Buffer.from(`${redditClientId}:${redditClientSecret}`).toString("base64");
  const response = await postForm<TokenResponse>(TOKEN_ENDPOINT, { grant_type: "client_credentials" }, { Authorization: `Basic ${basic}` });
  if (!response.access_token) throw new SourceRequestError("Reddit erişim jetonu vermedi; uygulama kimliğini denetleyin.", null);
  cachedToken = { value: response.access_token, expiresAt: Date.now() + (response.expires_in ?? 3600) * 1000 - TOKEN_MARGIN_MS };
  return cachedToken.value;
}

/** Reddit aramasında gruplar AND, grup içi OR ile birleştirilir. */
export function redditQuery(groups: readonly string[][]): string {
  return groups.map((group) => booleanQuery([group])).join(" AND ");
}

export function toRawItem(post: RedditPost): RawItem | null {
  if (!post.id || !post.permalink || typeof post.created_utc !== "number") return null;
  const deleted = !post.author || post.author === "[deleted]";
  return {
    connectorId: CONNECTOR_ID,
    sourceType: "forum",
    sourceName: "Reddit",
    externalId: post.id,
    url: `https://www.reddit.com${post.permalink}`,
    title: post.title ?? "",
    content: post.selftext ?? "",
    authorName: null,
    authorHandle: deleted ? null : (post.author ?? null),
    authorFollowers: null,
    language: null,
    publishedAt: post.created_utc * 1000,
    // Reddit artı ve eksi oyların farkını (puan) verir; ayrı beğeni sayısı yoktur.
    likes: post.score ?? null,
    comments: post.num_comments ?? null,
    shares: null,
    views: null,
  };
}

function explain(error: unknown): never {
  if (error instanceof SourceRequestError) {
    if (error.status === 401) throw new SourceRequestError("Reddit kimlik bilgileri geçersiz (401). REDDIT_CLIENT_ID ve REDDIT_CLIENT_SECRET değerlerini denetleyin.", 401);
    if (error.status === 403) throw new SourceRequestError("Reddit erişimi reddetti (403). Uygulamanın API erişim onayı olduğunu denetleyin.", 403);
    if (error.status === 429) throw new SourceRequestError("Reddit hız sınırına takıldı (429); sonraki taramada yeniden denenecek.", 429);
  }
  throw error;
}

async function collect(request: CollectRequest): Promise<CollectResult> {
  if (request.maxItems !== null && request.maxItems <= 0) {
    return { items: [], notes: ["Günlük Reddit okuma sınırına ulaşıldı; yarın devam edilecek (YANKI_REDDIT_DAILY_LIMIT)."] };
  }
  const limit = Math.min(PAGE_SIZE, request.maxItems ?? PAGE_SIZE);
  const params = new URLSearchParams({ q: redditQuery(request.groups), sort: "new", t: "week", type: "link", limit: String(limit), raw_json: "1" });

  const token = await accessToken().catch(explain);
  const response = await fetchJson<SearchResponse>(`${SEARCH_ENDPOINT}?${params}`, { Authorization: `Bearer ${token}` }).catch(explain);
  const posts = (response.data?.children ?? []).map((child) => child.data).filter((post): post is RedditPost => post !== undefined);
  const items = posts
    .map(toRawItem)
    .filter((item): item is RawItem => item !== null && item.publishedAt >= request.since);

  const notes: string[] = [];
  if (posts.length >= limit) notes.push(`Sonuç sayfa sınırına ulaştı; en yeni ${limit} gönderi alındı.`);
  return { items, notes };
}

export const redditConnector: Connector = {
  descriptor: {
    id: CONNECTOR_ID,
    name: "Reddit",
    sourceType: "forum",
    summary: "Resmî API ile son 7 günün gönderilerinde anahtar kelime araması; puan ve yorum sayılarıyla. Yorumlar alınmaz.",
    access: "open",
    terms: "Resmî API; ticari kullanım Reddit ile yazılı anlaşma gerektirir. Günlük okuma sınırı YANKI_REDDIT_DAILY_LIMIT ile belirlenir. Kullanıcı adları kişisel veridir (KVKK).",
    requiredSetting: "REDDIT_CLIENT_ID",
    minIntervalMinutes: 30,
    dailyLimit: config.redditDailyLimit,
    capabilities: {
      keywordSearch: true,
      history: "Son 7 gün; tarama başına en yeni 100 gönderi",
      engagement: true,
      authorFollowers: false,
      stores: "Gönderi başlığı, metni ve bağlantısı",
    },
  },
  isConfigured: () => config.redditClientId !== null && config.redditClientSecret !== null,
  collect,
};
