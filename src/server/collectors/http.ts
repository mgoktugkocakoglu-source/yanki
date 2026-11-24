import { config } from "../config";

/** Kaynak isteği başarısız olduğunda nedenini taşıyan hata. */
export class SourceRequestError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
  ) {
    super(message);
    this.name = "SourceRequestError";
  }
}

const MAX_RESPONSE_BYTES = 6 * 1024 * 1024;
const RETRY_DELAY_MS = 1_500;

function describeFailure(error: unknown): string {
  if (error instanceof DOMException && error.name === "TimeoutError") return "zaman aşımı";
  if (error instanceof Error) {
    const cause = error.cause instanceof Error ? ` (${error.cause.message})` : "";
    return `${error.message}${cause}`;
  }
  return "bilinmeyen ağ hatası";
}

/**
 * Bir kaynağa GET isteği atar ve gövdeyi metin olarak döndürür.
 * Zaman aşımı, boyut sınırı ve tanıtıcı User-Agent burada uygulanır.
 */
export async function fetchText(url: string, accept = "*/*", extraHeaders: Record<string, string> = {}): Promise<string> {
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { "User-Agent": config.userAgent, Accept: accept, ...extraHeaders },
      signal: AbortSignal.timeout(config.fetchTimeoutMs),
      redirect: "follow",
      cache: "no-store",
    });
  } catch (error) {
    throw new SourceRequestError(describeFailure(error), null);
  }

  if (!response.ok) {
    throw new SourceRequestError(`HTTP ${response.status}`, response.status);
  }
  const declaredLength = Number(response.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_RESPONSE_BYTES) {
    throw new SourceRequestError("yanıt beklenenden büyük", response.status);
  }

  const body = await response.text();
  if (body.length > MAX_RESPONSE_BYTES) {
    throw new SourceRequestError("yanıt beklenenden büyük", response.status);
  }
  return body;
}

export type ConditionalFetch =
  | { status: "unchanged" }
  | { status: "ok"; body: string; etag: string | null; lastModified: string | null };

/**
 * Koşullu GET: önceki yanıtın ETag / Last-Modified değerleri gönderilir;
 * içerik değişmediyse (304) gövde indirilmez. Sürekli taramada yayıncının
 * sunucusuna gereksiz yük bindirmemek içindir.
 */
export async function fetchConditional(url: string, accept: string, validators: { etag: string | null; lastModified: string | null }): Promise<ConditionalFetch> {
  const headers: Record<string, string> = { "User-Agent": config.userAgent, Accept: accept };
  if (validators.etag) headers["If-None-Match"] = validators.etag;
  if (validators.lastModified) headers["If-Modified-Since"] = validators.lastModified;

  const request = () => fetch(url, { headers, signal: AbortSignal.timeout(config.fetchTimeoutMs), redirect: "follow", cache: "no-store" });
  let response: Response;
  try {
    // Bağlantı düzeyindeki geçici kopmalar (ECONNRESET) için kısa bir aradan sonra bir kez daha denenir.
    response = await request().catch(async (error: unknown) => {
      if (error instanceof DOMException) throw error;
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
      return request();
    });
  } catch (error) {
    throw new SourceRequestError(describeFailure(error), null);
  }
  if (response.status === 304) return { status: "unchanged" };
  if (!response.ok) throw new SourceRequestError(`HTTP ${response.status}`, response.status);

  const body = await response.text();
  if (body.length > MAX_RESPONSE_BYTES) throw new SourceRequestError("yanıt beklenenden büyük", response.status);
  return { status: "ok", body, etag: response.headers.get("etag"), lastModified: response.headers.get("last-modified") };
}

export async function fetchJson<Body>(url: string, extraHeaders: Record<string, string> = {}): Promise<Body> {
  const text = await fetchText(url, "application/json", extraHeaders);
  try {
    return JSON.parse(text) as Body;
  } catch {
    throw new SourceRequestError("yanıt JSON değil", null);
  }
}

/** Form gövdesiyle POST atar ve JSON yanıtı döndürür (OAuth jeton uçları için). */
export async function postForm<Body>(url: string, form: Record<string, string>, extraHeaders: Record<string, string> = {}): Promise<Body> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "User-Agent": config.userAgent, Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded", ...extraHeaders },
      body: new URLSearchParams(form).toString(),
      signal: AbortSignal.timeout(config.fetchTimeoutMs),
      cache: "no-store",
    });
  } catch (error) {
    throw new SourceRequestError(describeFailure(error), null);
  }
  if (!response.ok) throw new SourceRequestError(`HTTP ${response.status}`, response.status);
  try {
    return (await response.json()) as Body;
  } catch {
    throw new SourceRequestError("yanıt JSON değil", response.status);
  }
}

/** "https://www.ornek.com.tr/a/b" → "ornek.com.tr"; çözümlenemezse null. */
export function hostnameOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}
