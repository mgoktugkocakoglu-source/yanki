import type { Emotion, Intent, RunStatus, Sentiment, SourceType } from "./types";

/** Alan değerlerinin arayüzde görünen Türkçe karşılıkları ve sorgu dilindeki yazımları. */

export const SOURCE_TYPE_LABELS: Record<SourceType, string> = {
  news: "Haber",
  social: "Sosyal",
  forum: "Forum",
  video: "Video",
  review: "Yorum ve şikâyet",
  blog: "Blog",
};

/** Sorgu dilinde `kaynak:` alanına yazılan değer. */
export const SOURCE_TYPE_QUERY: Record<SourceType, string> = {
  news: "haber",
  social: "sosyal",
  forum: "forum",
  video: "video",
  review: "yorum",
  blog: "blog",
};

export const SENTIMENT_LABELS: Record<Sentiment, string> = {
  positive: "Olumlu",
  neutral: "Nötr",
  negative: "Olumsuz",
};

export const SENTIMENT_QUERY: Record<Sentiment, string> = {
  positive: "olumlu",
  neutral: "nötr",
  negative: "olumsuz",
};

export const EMOTION_LABELS: Record<Emotion, string> = {
  joy: "Sevinç",
  anger: "Öfke",
  sadness: "Üzüntü",
  fear: "Korku",
  surprise: "Şaşkınlık",
  disgust: "Tiksinti",
  none: "Belirgin duygu yok",
};

export const EMOTION_QUERY: Record<Emotion, string> = {
  joy: "sevinç",
  anger: "öfke",
  sadness: "üzüntü",
  fear: "korku",
  surprise: "şaşkınlık",
  disgust: "tiksinti",
  none: "yok",
};

export const INTENT_LABELS: Record<Intent, string> = {
  complaint: "Şikâyet",
  praise: "Övgü",
  purchase: "Satın alma niyeti",
  churn: "Ayrılma sinyali",
  support: "Destek talebi",
  general: "Genel",
};

export const INTENT_QUERY: Record<Intent, string> = {
  complaint: "şikayet",
  praise: "övgü",
  purchase: "satınalma",
  churn: "ayrılma",
  support: "destek",
  general: "genel",
};

export const RUN_STATUS_LABELS: Record<RunStatus, string> = {
  ok: "Yeni içerik alındı",
  empty: "Yanıt verdi, eşleşme yok",
  error: "Kaynağa ulaşılamadı",
  skipped: "Atlandı",
};

export const WEEKDAY_LABELS = ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar"] as const;
export const WEEKDAY_SHORT_LABELS = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"] as const;
