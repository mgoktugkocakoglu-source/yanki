/**
 * Alan (domain) tipleri. Bu dosya hiçbir çalışma zamanı bağımlılığı taşımaz;
 * sunucu, istemci ve testler aynı sözlüğü buradan kullanır.
 */

export const SOURCE_TYPES = ["news", "social", "forum", "video", "review", "blog"] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

export const SENTIMENTS = ["positive", "neutral", "negative"] as const;
export type Sentiment = (typeof SENTIMENTS)[number];

export const EMOTIONS = ["joy", "anger", "sadness", "fear", "surprise", "disgust", "none"] as const;
export type Emotion = (typeof EMOTIONS)[number];

export const INTENTS = ["complaint", "praise", "purchase", "churn", "support", "general"] as const;
export type Intent = (typeof INTENTS)[number];

export type WorkspaceKind = "demo" | "live";

export interface Workspace {
  id: string;
  name: string;
  kind: WorkspaceKind;
  createdAt: number;
}

export interface Project {
  id: string;
  workspaceId: string;
  name: string;
  description: string;
  /** Boolean sorgu metni; tek doğruluk kaynağı budur. */
  query: string;
  /** Bu projede açık olan bağlayıcı kimlikleri. */
  connectorIds: string[];
  /** Karşılaştırma grafiklerinde kullanılan sabit renk yuvası (0 tabanlı). */
  colorSlot: number;
  createdAt: number;
  updatedAt: number;
}

export interface ProjectTopic {
  id: string;
  projectId: string;
  /** Konu grubu: örn. "Konu", "Mahalle", "Ürün". */
  groupName: string;
  name: string;
  /** Bu konuyu tanımlayan Boolean sorgu. */
  query: string;
}

/** Erişim tahmininin neye dayandığı; null ise kaynak veri vermemiştir. */
export type ReachBasis = "followers" | "views" | "score" | null;

/** Bir bağlayıcıdan gelen, henüz analiz edilmemiş ham içerik. */
export interface RawItem {
  connectorId: string;
  sourceType: SourceType;
  /** Yayın ya da platform adı: "hurriyet.com.tr", "Bluesky" ... */
  sourceName: string;
  /** Kaynaktaki kalıcı kimlik. */
  externalId: string;
  url: string;
  title: string;
  content: string;
  authorName: string | null;
  authorHandle: string | null;
  authorFollowers: number | null;
  /** Kaynak dil bilgisi verdiyse (ISO 639-1); vermediyse null. */
  language: string | null;
  publishedAt: number;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  views: number | null;
}

export interface MentionAnalysis {
  language: string;
  sentiment: Sentiment;
  /** -1 (çok olumsuz) ile +1 (çok olumlu) arası. */
  sentimentScore: number;
  /** 0–1 arası; sözlük kanıtının gücü. Kalibre edilmiş olasılık değildir. */
  sentimentConfidence: number;
  emotion: Emotion;
  isSarcastic: boolean;
  intent: Intent;
}

export interface Mention extends MentionAnalysis {
  id: string;
  workspaceId: string;
  projectId: string;
  connectorId: string;
  sourceType: SourceType;
  sourceName: string;
  externalId: string;
  url: string;
  title: string;
  content: string;
  authorName: string | null;
  authorHandle: string | null;
  authorFollowers: number | null;
  publishedAt: number;
  collectedAt: number;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  views: number | null;
  /** Gözlenen etkileşim toplamı; hiçbir sayı yoksa null. */
  engagement: number | null;
  reach: number | null;
  reachBasis: ReachBasis;
  /** Aynı haberin farklı yayınlarını gruplayan anahtar. */
  storyKey: string;
  /** Kullanıcının düzelttiği ton; null ise model sonucu geçerlidir. */
  sentimentOverride: Sentiment | null;
  /** Dil modelinin belirlediği ton; sınıflandırılmadıysa null. */
  aiSentiment: Sentiment | null;
  /** Sınıflandırmayı yapan model; sınıflandırılmadıysa null. */
  aiModel: string | null;
  /** `topicIds` içinden, dil modelinin atadığı konular. */
  aiTopicIds: string[];
  /** Kullanıcı bu içeriği "ilgisiz" olarak işaretledi. */
  isIrrelevant: boolean;
  isDemo: boolean;
  topicIds: string[];
}

export type RunStatus = "ok" | "empty" | "error" | "skipped";

export interface CollectionRun {
  id: string;
  workspaceId: string;
  projectId: string;
  connectorId: string;
  startedAt: number;
  finishedAt: number;
  status: RunStatus;
  fetched: number;
  matched: number;
  inserted: number;
  message: string | null;
}

export interface AuditEvent {
  id: string;
  workspaceId: string | null;
  actor: string;
  action: string;
  objectType: string;
  objectId: string | null;
  detail: string | null;
  createdAt: number;
}

/** Yarı açık zaman aralığı: [from, to). Epoch milisaniye. */
export interface TimeRange {
  from: number;
  to: number;
}

/** Geçerli ton: önce insan düzeltmesi, sonra dil modeli, sonra kural tabanlı sonuç. */
export function effectiveSentiment(mention: Pick<Mention, "sentiment" | "sentimentOverride" | "aiSentiment">): Sentiment {
  return mention.sentimentOverride ?? mention.aiSentiment ?? mention.sentiment;
}
