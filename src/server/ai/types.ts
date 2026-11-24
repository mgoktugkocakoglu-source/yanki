/**
 * Yapay zekâ sağlayıcı sözleşmesi. Uygulamanın geri kalanı yalnızca bu
 * arayüzü bilir; bulut ya da yerel model aynı yere takılır.
 */

/** Modele gönderilen tek içerik. Numara, yanıttaki kanıt göndermelerini eşlemek içindir. */
export interface SummaryItem {
  number: number;
  source: string;
  publishedAt: number;
  text: string;
}

export interface SummaryRequest {
  projectName: string;
  query: string;
  rangeLabel: string;
  items: SummaryItem[];
}

export interface SummaryTheme {
  title: string;
  description: string;
  /** Temayı destekleyen içeriklerin numaraları (`SummaryItem.number`). */
  mentionNumbers: number[];
}

export interface SummaryDraft {
  summary: string;
  themes: SummaryTheme[];
  /** Sağlayıcının bildirdiği kullanım; bildirmiyorsa null. */
  inputTokens: number | null;
  outputTokens: number | null;
}

/** Sınıflandırılacak tek içerik. */
export interface ClassifyItem {
  number: number;
  source: string;
  text: string;
}

export interface ClassifyRequest {
  projectName: string;
  query: string;
  /** Projenin tanımlı konuları; model yalnızca bunlardan seçer. */
  topics: Array<{ number: number; group: string; name: string }>;
  items: ClassifyItem[];
}

export interface ClassifyResult {
  /** `ClassifyItem.number`. */
  number: number;
  sentiment: string;
  topicNumbers: number[];
}

export interface ClassifyDraft {
  results: ClassifyResult[];
  inputTokens: number | null;
  outputTokens: number | null;
}

/** İddia çıkarımı: özetle aynı girdi biçimi. */
export type ClaimsRequest = SummaryRequest;

export interface ClaimDraft {
  /** Tek cümlelik, kontrol edilebilir olgusal iddia. */
  text: string;
  /** İddiayı taşıyan içeriklerin numaraları. */
  mentionNumbers: number[];
  /** Doğrulama veritabanlarında aranacak kısa sorgular (ör. biri Türkçe, biri İngilizce). */
  searchQueries: string[];
}

export interface ClaimsDraft {
  claims: ClaimDraft[];
  inputTokens: number | null;
  outputTokens: number | null;
}

export interface MatchRequest {
  claims: Array<{
    number: number;
    text: string;
    /** Yayımlanmış doğrulama adayları. */
    candidates: Array<{ number: number; claimText: string; title: string; publisher: string; rating: string }>;
  }>;
}

export interface MatchDraft {
  /** İddia numarası → gerçekten aynı iddiayı inceleyen adayların numaraları. */
  matches: Array<{ claimNumber: number; candidateNumbers: number[] }>;
  inputTokens: number | null;
  outputTokens: number | null;
}

export interface AnswerRequest extends SummaryRequest {
  /** Dönemin hesaplanmış ölçümleri; modelin kullanabileceği tek sayı kaynağı. */
  facts: string;
  question: string;
}

export interface AnswerDraft {
  answer: string;
  /** Yanıtın dayandığı içeriklerin numaraları. */
  mentionNumbers: number[];
  inputTokens: number | null;
  outputTokens: number | null;
}

export interface AiProvider {
  id: string;
  /** Arayüzde görünen ad. */
  label: string;
  /** Özet modeli. */
  model: string;
  /** Toplu sınıflandırma modeli. */
  classifyModel: string;
  /** "cloud": içerik kurum dışına gider. "local": kurum içinde kalır. */
  location: "cloud" | "local";
  summarize(request: SummaryRequest): Promise<SummaryDraft>;
  classify(request: ClassifyRequest): Promise<ClassifyDraft>;
  extractClaims(request: ClaimsRequest): Promise<ClaimsDraft>;
  matchFactChecks(request: MatchRequest): Promise<MatchDraft>;
  answer(request: AnswerRequest): Promise<AnswerDraft>;
}

/** Kullanıcıya gösterilebilir iletisi olan sağlayıcı hatası. */
export class AiError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "AiError";
  }
}
