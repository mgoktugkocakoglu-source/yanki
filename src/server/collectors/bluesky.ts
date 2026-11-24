import type { RawItem } from "@/domain/types";
import { fetchJson, SourceRequestError } from "./http";
import { quoteTerm, termCombinations } from "./query";
import type { CollectRequest, CollectResult, Connector } from "./types";

/**
 * Bluesky herkese açık gönderi araması (AT Protokolü, kimlik doğrulamasız).
 *
 * Doğrulanan davranış (12 Kasım 2026): arama yalnızca `api.bsky.app`
 * üzerinde ve `cursor` parametresi olmadan yanıt veriyor; sayfalama `since`
 * ile zamana göre yapılır. Bu davranış belgelenmemiştir ve değişebilir.
 */

const CONNECTOR_ID = "bluesky";
const ENDPOINT = "https://api.bsky.app/xrpc/app.bsky.feed.searchPosts";
const PAGE_SIZE = 100;
const MAX_KEYWORDS = 12;
const CLOCK_SKEW_MS = 5 * 60_000;

interface BlueskyPost {
  uri: string;
  author: { handle: string; displayName?: string };
  record: { text?: string; createdAt?: string; langs?: string[] };
  embed?: { external?: { title?: string; description?: string } };
  replyCount?: number;
  repostCount?: number;
  likeCount?: number;
  quoteCount?: number;
  indexedAt: string;
}

interface SearchResponse {
  posts?: BlueskyPost[];
}

function searchUrl(query: string, request: CollectRequest): string {
  const params = new URLSearchParams({
    q: query,
    sort: "latest",
    limit: String(PAGE_SIZE),
    since: new Date(request.since).toISOString(),
  });
  if (request.language) params.set("lang", request.language);
  return `${ENDPOINT}?${params}`;
}

/**
 * `createdAt` istemcinin bildirdiği değerdir ve yanlış olabilir; dizine
 * alınma zamanından sonraysa dizin zamanı esas alınır.
 */
function publishedAtOf(post: BlueskyPost): number | null {
  const indexedAt = Date.parse(post.indexedAt);
  const createdAt = Date.parse(post.record.createdAt ?? "");
  if (Number.isNaN(indexedAt)) return Number.isNaN(createdAt) ? null : createdAt;
  if (Number.isNaN(createdAt) || createdAt > indexedAt + CLOCK_SKEW_MS) return indexedAt;
  return createdAt;
}

function toRawItem(post: BlueskyPost): RawItem | null {
  const publishedAt = publishedAtOf(post);
  const recordKey = post.uri.split("/").at(-1);
  if (publishedAt === null || !recordKey) return null;

  const card = post.embed?.external;
  const text = [post.record.text, card?.title, card?.description].filter(Boolean).join("\n").trim();
  if (!text) return null;

  return {
    connectorId: CONNECTOR_ID,
    sourceType: "social",
    sourceName: "Bluesky",
    externalId: post.uri,
    url: `https://bsky.app/profile/${post.author.handle}/post/${recordKey}`,
    title: "",
    content: text,
    authorName: post.author.displayName?.trim() || post.author.handle,
    authorHandle: post.author.handle,
    authorFollowers: null,
    language: post.record.langs?.[0] ?? null,
    publishedAt,
    likes: post.likeCount ?? null,
    comments: post.replyCount ?? null,
    shares: (post.repostCount ?? 0) + (post.quoteCount ?? 0),
    views: null,
  };
}

async function collect(request: CollectRequest): Promise<CollectResult> {
  // Bluesky aramasında boşluk VE anlamına gelir, VEYA yoktur: her gruptan bir ifade seçen birleşimler ayrı aranır.
  const { combinations, total } = termCombinations(request.groups, MAX_KEYWORDS);
  const keywords = combinations.map((terms) => terms.map(quoteTerm).join(" "));
  const notes: string[] = [];
  if (total > MAX_KEYWORDS) {
    notes.push(`Sorgu ${total} arama birleşimi gerektiriyor; ilk ${MAX_KEYWORDS} tanesi arandı.`);
  }

  const byId = new Map<string, RawItem>();
  const failures: string[] = [];

  for (const keyword of keywords) {
    try {
      const response = await fetchJson<SearchResponse>(searchUrl(keyword, request));
      const posts = response.posts ?? [];
      for (const post of posts) {
        const item = toRawItem(post);
        if (item) byId.set(item.externalId, item);
      }
      if (posts.length === PAGE_SIZE) {
        notes.push(`"${keyword}" için sonuç sayısı sayfa sınırına ulaştı; en yeni ${PAGE_SIZE} gönderi alındı.`);
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

export const blueskyConnector: Connector = {
  descriptor: {
    id: CONNECTOR_ID,
    name: "Bluesky",
    sourceType: "social",
    summary: "Herkese açık gönderilerde anahtar kelime araması; beğeni, yanıt ve yeniden paylaşım sayılarıyla.",
    access: "open",
    terms: "Herkese açık AT Protokolü uç noktası. Koşullarda otomatik erişimi yasaklayan bir madde görülmedi; gönderiler ve kullanıcı adları kişisel veridir (KVKK).",
    capabilities: {
      keywordSearch: true,
      history: "Arama başına en yeni 100 gönderi",
      engagement: true,
      authorFollowers: false,
      stores: "Gönderi metni + bağlantı",
    },
  },
  isConfigured: () => true,
  collect,
};
