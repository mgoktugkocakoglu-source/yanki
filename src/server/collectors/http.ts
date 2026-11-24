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
