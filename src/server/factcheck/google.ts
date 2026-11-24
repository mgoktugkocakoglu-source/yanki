import { fetchJson, SourceRequestError } from "../collectors/http";
import { config } from "../config";

/**
 * Google Fact Check Tools API: doğrulama kuruluşlarının yayımladığı
 * ClaimReview kayıtlarında arama. Yankı hüküm üretmez; yalnızca yayımlanmış
 * doğrulamaları, yayımlayan kuruluşun adı ve bağlantısıyla gösterir.
 *
 * Belge: https://developers.google.com/fact-check/tools/api/reference/rest/v1alpha1/claims/search
 */

const ENDPOINT = "https://factchecktools.googleapis.com/v1alpha1/claims:search";
const PAGE_SIZE = 5;

/** Yayımlanmış tek bir doğrulama. Metinler dış içeriktir; düz metin olarak gösterilir. */
export interface FactCheck {
  publisherName: string;
  publisherSite: string | null;
  url: string;
  title: string;
  /** Kuruluşun kendi verdiği derecelendirme ("Yanlış", "False", "Misleading" …). */
  rating: string;
  reviewDate: number | null;
  /** Kuruluşun incelediği iddianın metni. */
  claimText: string;
  language: string | null;
}

/** Arama yapılamadı: anahtar yok, API etkin değil ya da kota doldu. */
export class FactCheckUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FactCheckUnavailableError";
  }
}

export type FactCheckSearch = (query: string) => Promise<FactCheck[]>;

interface SearchResponse {
  claims?: Array<{
    text?: string;
    claimReview?: Array<{
      publisher?: { name?: string; site?: string };
      url?: string;
      title?: string;
      reviewDate?: string;
      textualRating?: string;
      languageCode?: string;
    }>;
  }>;
}

export function isFactCheckConfigured(): boolean {
  return config.factCheckApiKey !== null;
}

function isHttpUrl(value: string | undefined): value is string {
  return value !== undefined && /^https?:\/\//i.test(value);
}

export const searchFactChecks: FactCheckSearch = async (query) => {
  const key = config.factCheckApiKey;
  if (!key) throw new FactCheckUnavailableError("Doğrulama araması için Google API anahtarı tanımlı değil.");

  const params = new URLSearchParams({ query, pageSize: String(PAGE_SIZE), key });
  let response: SearchResponse;
  try {
    response = await fetchJson<SearchResponse>(`${ENDPOINT}?${params}`);
  } catch (error) {
    if (error instanceof SourceRequestError && (error.status === 403 || error.status === 401)) {
      throw new FactCheckUnavailableError("Google projesinde Fact Check Tools API etkin değil ya da anahtar bu API için kısıtlı.");
    }
    if (error instanceof SourceRequestError && error.status === 429) {
      throw new FactCheckUnavailableError("Doğrulama araması kotası doldu.");
    }
    throw error;
  }

  const results: FactCheck[] = [];
  for (const claim of response.claims ?? []) {
    for (const review of claim.claimReview ?? []) {
      if (!isHttpUrl(review.url)) continue;
      const reviewDate = review.reviewDate ? Date.parse(review.reviewDate) : Number.NaN;
      results.push({
        publisherName: review.publisher?.name?.trim() || review.publisher?.site || "Bilinmeyen kuruluş",
        publisherSite: review.publisher?.site ?? null,
        url: review.url,
        title: review.title?.trim() ?? "",
        rating: review.textualRating?.trim() ?? "",
        reviewDate: Number.isNaN(reviewDate) ? null : reviewDate,
        claimText: claim.text?.trim() ?? "",
        language: review.languageCode ?? null,
      });
    }
  }
  return results;
};
