/**
 * Türkçe duyarlı metin normalizasyonu.
 *
 * Arama ve eşleştirme her zaman "katlanmış" (folded) biçim üzerinde yapılır;
 * özgün metin hiçbir zaman değiştirilmez. Katlama iki adımdır:
 *   1. Türkçe kurallarıyla küçük harfe çevirme (İ→i, I→ı).
 *   2. Türkçe'ye özgü harfleri ASCII karşılığına indirme (ı→i, ş→s, ğ→g ...).
 *
 * İkinci adım bilinçli bir tercihtir: sosyal medyada "şikayet" çoğu zaman
 * "sikayet" diye yazılır. Katlama, isabeti çok az düşürerek kapsamı artırır.
 */

const FOLD_MAP: Record<string, string> = {
  ı: "i",
  ş: "s",
  ğ: "g",
  ç: "c",
  ö: "o",
  ü: "u",
  â: "a",
  î: "i",
  û: "u",
};

const APOSTROPHES = /['’‘`´ʼ]/g;
const WORD_CHARS = /[\p{L}\p{N}]+/gu;

/** Türkçe kurallarıyla küçük harfe çevirir (İstanbul → istanbul, IŞIK → ışık). */
export function turkishLower(input: string): string {
  return input.replace(/İ/g, "i").replace(/I/g, "ı").toLowerCase();
}

/** Tek bir kelimeyi arama biçimine indirir: küçük harf + ASCII katlama. */
export function foldWord(word: string): string {
  const lowered = turkishLower(word).normalize("NFC");
  let folded = "";
  for (const char of lowered) {
    folded += FOLD_MAP[char] ?? char;
  }
  // Birleşik aksanları (örn. i̇) temizle.
  return folded.normalize("NFD").replace(/\p{M}/gu, "");
}

/**
 * Kesme işaretiyle ayrılan çekim ekini atar: "THY'nin" → "THY".
 * Özel adlarda ek her zaman kesmeden sonra gelir; kökü korumak yeterlidir.
 */
function stripApostropheSuffix(text: string): string {
  return text.replace(/([\p{L}\p{N}]+)['’‘`´ʼ][\p{L}]{1,8}(?![\p{L}\p{N}])/gu, "$1");
}

/** Metni katlanmış kelimelere ayırır. Hashtag ve mention işaretleri atılır. */
export function tokenize(text: string): string[] {
  const cleaned = stripApostropheSuffix(text).replace(APOSTROPHES, " ");
  const matches = cleaned.match(WORD_CHARS);
  if (!matches) return [];
  return matches.map(foldWord).filter((token) => token.length > 0);
}

/**
 * Veritabanında saklanan arama alanı: katlanmış kelimelerin tek boşlukla
 * birleştirilmiş hali. Sorgu motorunun SQL tarafı bu alan üzerinde çalışır.
 */
export function toSearchText(...parts: Array<string | null | undefined>): string {
  return tokenize(parts.filter(Boolean).join(" \n ")).join(" ");
}

export interface TokenSpan {
  /** Katlanmış kelime. */
  token: string;
  /** Özgün metindeki başlangıç konumu (dahil). */
  start: number;
  /** Özgün metindeki bitiş konumu (hariç). */
  end: number;
}

/**
 * Özgün metindeki konumlarıyla birlikte kelimeleri döndürür.
 * Arayüzde eşleşen ifadeleri vurgulamak için kullanılır.
 */
export function tokenizeWithSpans(text: string): TokenSpan[] {
  const spans: TokenSpan[] = [];
  const pattern = /[\p{L}\p{N}]+(?:['’‘`´ʼ][\p{L}]{1,8}(?![\p{L}\p{N}]))?/gu;
  for (const match of text.matchAll(pattern)) {
    const raw = match[0];
    const apostropheAt = raw.search(APOSTROPHES);
    const stem = apostropheAt === -1 ? raw : raw.slice(0, apostropheAt);
    const token = foldWord(stem);
    if (token.length === 0) continue;
    spans.push({ token, start: match.index, end: match.index + raw.length });
  }
  return spans;
}
