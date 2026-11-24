import path from "node:path";

/**
 * Sunucu yapılandırması. Tüm ortam değişkenleri burada okunur; kodun geri
 * kalanı `process.env`'e doğrudan dokunmaz.
 */

export type DeploymentMode = "local" | "institution";

function readDeploymentMode(): DeploymentMode {
  return process.env.YANKI_DEPLOYMENT === "institution" ? "institution" : "local";
}

function readInteger(name: string, fallback: number, minimum: number): number {
  const parsed = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(parsed) && parsed >= minimum ? parsed : fallback;
}

export const config = {
  /** SQLite dosyası. Kurum içi kurulumda kalıcı bir birime yönlendirilir. */
  databasePath: process.env.YANKI_DB_PATH ?? path.join(process.cwd(), "data", "yanki.db"),

  /**
   * "institution" kipinde, koşulları yalnızca kişisel kullanıma izin veren
   * bağlayıcılar (ör. Google Haberler RSS) zorla kapatılır.
   */
  deployment: readDeploymentMode(),

  /** Canlı projelerin otomatik taranma aralığı (dakika). 0 = kapalı. */
  collectionIntervalMinutes: readInteger("YANKI_COLLECT_INTERVAL_MINUTES", 15, 0),

  /** Kaynaklara giden isteklerde kendimizi tanıttığımız ad. */
  userAgent: process.env.YANKI_USER_AGENT ?? "YankiBot/0.1 (+yerel kurulum; medya izleme)",

  /** X (Twitter) resmî API anahtarı. Boşsa bağlayıcı "anahtar bekleniyor" durumunda kalır. */
  xBearerToken: process.env.X_BEARER_TOKEN?.trim() || null,

  /** X'ten bir günde okunabilecek en çok gönderi (maliyet tavanı; gönderi başına ücretlidir). */
  xDailyPostLimit: readInteger("YANKI_X_DAILY_POST_LIMIT", 2000, 0),

  /** Reddit uygulama kimliği ve gizli anahtarı. İkisi de tanımlı değilse bağlayıcı "anahtar bekleniyor" durumunda kalır. */
  redditClientId: process.env.REDDIT_CLIENT_ID?.trim() || null,
  redditClientSecret: process.env.REDDIT_CLIENT_SECRET?.trim() || null,

  /** Reddit'ten bir günde okunabilecek en çok gönderi. */
  redditDailyLimit: readInteger("YANKI_REDDIT_DAILY_LIMIT", 5000, 0),

  /** YouTube Data API anahtarı (ücretsiz; günde 100 arama kotası). */
  youtubeApiKey: process.env.YOUTUBE_API_KEY?.trim() || null,

  /**
   * Claude API anahtarı. Boşsa yapay zekâ özellikleri kapalıdır ve hiçbir
   * içerik kurum dışına gönderilmez.
   */
  anthropicApiKey: process.env.ANTHROPIC_API_KEY?.trim() || null,

  /** Yapay zekâ özetinde kullanılan model. */
  aiModel: process.env.YANKI_AI_MODEL?.trim() || "claude-opus-5-5",

  /** Toplu ton ve konu sınıflandırmasında kullanılan model (yüksek hacim, düşük maliyet). */
  aiClassifyModel: process.env.YANKI_AI_CLASSIFY_MODEL?.trim() || "claude-haiku-5-5",

  /**
   * Google Fact Check Tools API anahtarı (yayımlanmış doğrulamalarda arama).
   * Ayrı tanımlanmadıysa YouTube için girilen Google anahtarı denenir; aynı
   * Google projesinde "Fact Check Tools API" etkin olmalıdır.
   */
  factCheckApiKey: process.env.GOOGLE_FACTCHECK_API_KEY?.trim() || process.env.YOUTUBE_API_KEY?.trim() || null,

  /** Tek bir kaynak isteği için zaman aşımı. */
  fetchTimeoutMs: 20_000,

  /** Üretim kipinde oturum çerezi yalnızca HTTPS üzerinden gönderilir. */
  isProduction: process.env.NODE_ENV === "production",

  /** Denetim izinde görünen kullanıcı. Kimlik doğrulama eklenince oturumdan gelecek. */
  localActor: "yerel-kullanici",
} as const;
