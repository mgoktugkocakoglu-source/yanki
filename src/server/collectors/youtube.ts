import type { RawItem } from "@/domain/types";
import { htmlToText } from "@/lib/text/html";
import { config } from "../config";
import { fetchJson, SourceRequestError } from "./http";
import { booleanQuery } from "./query";
import type { CollectRequest, CollectResult, Connector } from "./types";

/**
 * YouTube Data API v3: video başlık ve açıklamalarında arama.
 *
 * Ücretsizdir ama günde 100 arama kotası vardır. Bu yüzden ifadeler tek
 * aramada birleştirilir ve bir konu en sık 6 saatte bir taranır (günde 4 arama;
 * böylece kota yaklaşık 25 konuya yeter).
 * Video yorumları ve konuşma dökümü bu sürümde alınmaz.
 *
 * 24 Kasım 2026'da gerçek anahtarla denendi.
 */

const CONNECTOR_ID = "youtube";
const API = "https://www.googleapis.com/youtube/v3";
const PAGE_SIZE = 50;

interface SearchItem {
  id?: { videoId?: string };
  snippet?: { title?: string; description?: string; channelTitle?: string; channelId?: string; publishedAt?: string };
}

interface VideoStatistics {
  id: string;
  statistics?: { viewCount?: string; likeCount?: string; commentCount?: string };
}

function toNumber(value: string | undefined): number | null {
  const parsed = Number(value);
  return value !== undefined && Number.isFinite(parsed) ? parsed : null;
}

async function collect(request: CollectRequest): Promise<CollectResult> {
  const key = config.youtubeApiKey;
  if (!key) throw new SourceRequestError("YOUTUBE_API_KEY tanımlı değil.", null);

  // YouTube aramasında "|" VEYA, boşluk VE anlamına gelir.
  const query = booleanQuery(request.groups, "|");
  const searchParams = new URLSearchParams({
    part: "snippet",
    type: "video",
    order: "date",
    maxResults: String(PAGE_SIZE),
    q: query,
    publishedAfter: new Date(request.since).toISOString(),
    key,
  });
  if (request.language) searchParams.set("relevanceLanguage", request.language);

  const search = await fetchJson<{ items?: SearchItem[] }>(`${API}/search?${searchParams}`);
  const found = (search.items ?? []).filter((item) => item.id?.videoId && item.snippet?.publishedAt);
  if (found.length === 0) return { items: [], notes: [] };

  // İzlenme ve beğeni sayıları ayrı bir uç noktadan gelir (kota maliyeti düşük).
  const ids = found.map((item) => item.id!.videoId!).join(",");
  const videos = await fetchJson<{ items?: VideoStatistics[] }>(`${API}/videos?${new URLSearchParams({ part: "statistics", id: ids, key })}`);
  const statistics = new Map((videos.items ?? []).map((video) => [video.id, video.statistics ?? {}]));

  const items = found.map((item): RawItem => {
    const videoId = item.id!.videoId!;
    const snippet = item.snippet!;
    const stats = statistics.get(videoId) ?? {};
    return {
      connectorId: CONNECTOR_ID,
      sourceType: "video",
      sourceName: "YouTube",
      externalId: videoId,
      url: `https://www.youtube.com/watch?v=${videoId}`,
      // Arama uç noktası başlıkları HTML varlık kodlarıyla döndürür.
      title: htmlToText(snippet.title ?? ""),
      content: htmlToText(snippet.description ?? ""),
      authorName: snippet.channelTitle ?? null,
      authorHandle: null,
      authorFollowers: null,
      language: null,
      publishedAt: Date.parse(snippet.publishedAt!),
      likes: toNumber(stats.likeCount),
      comments: toNumber(stats.commentCount),
      shares: null,
      views: toNumber(stats.viewCount),
    };
  });
  return { items: items.filter((item) => !Number.isNaN(item.publishedAt)), notes: [] };
}

export const youtubeConnector: Connector = {
  descriptor: {
    id: CONNECTOR_ID,
    name: "YouTube",
    sourceType: "video",
    summary: "Video başlık ve açıklamalarında anahtar kelime araması; izlenme, beğeni ve yorum sayılarıyla.",
    access: "open",
    terms: "Resmî ücretsiz API; günde 100 arama kotası olduğu için her konu en sık 6 saatte bir taranır. Yorumlar ve video dökümleri alınmaz.",
    requiredSetting: "YOUTUBE_API_KEY",
    minIntervalMinutes: 360,
    capabilities: {
      keywordSearch: true,
      history: "Arama başına en yeni 50 video",
      engagement: true,
      authorFollowers: false,
      stores: "Başlık + açıklama + bağlantı",
    },
  },
  isConfigured: () => config.youtubeApiKey !== null,
  collect,
};
