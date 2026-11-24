/**
 * Hafif dil tespiti. Amaç tam bir dil tanıyıcı olmak değil; Türkçe içeriği
 * diğerlerinden güvenle ayırmak ve kısa/belirsiz metinde "und" (belirsiz)
 * demeyi bilmektir. Girdi: katlanmış kelimeler + özgün metin.
 */

const STOPWORDS: Readonly<Record<string, ReadonlySet<string>>> = {
  tr: new Set([
    "ve", "bir", "bu", "icin", "ile", "de", "da", "cok", "ama", "gibi", "daha", "en", "ne", "mi", "var",
    "yok", "degil", "kadar", "olarak", "olan", "sonra", "ben", "sen", "biz", "siz", "su", "her", "hic",
    "ki", "ya", "veya", "ise", "diye", "gore", "bile", "hem", "nasil", "neden", "simdi", "artik", "yine",
    "oldu", "olduk", "etti", "edildi", "tarafindan", "uzere", "karsi", "once", "bugun", "yeni", "tum",
  ]),
  en: new Set([
    "the", "and", "is", "of", "to", "in", "for", "that", "this", "with", "on", "are", "was", "it", "as",
    "be", "at", "by", "not", "have", "from", "you", "we", "they", "has", "but", "an", "will", "their",
    "what", "about", "which", "when", "been", "more", "can", "its", "just", "your", "my",
  ]),
  de: new Set(["der", "die", "und", "das", "ist", "nicht", "mit", "fur", "auf", "ein", "eine", "den", "von", "zu", "sich", "auch"]),
  fr: new Set(["le", "les", "des", "est", "et", "pour", "dans", "que", "une", "du", "qui", "pas", "sur", "avec", "au"]),
  es: new Set(["el", "los", "las", "que", "por", "para", "con", "una", "del", "es", "se", "como", "mas", "pero"]),
};

/** Türkçe işlev kelimeleri; öne çıkan ifade çıkarımında elenir. */
export const TURKISH_STOPWORDS: ReadonlySet<string> = STOPWORDS.tr;

const TURKISH_LETTERS = /[ğĞşŞıİ]/g;
const ARABIC_SCRIPT = /[؀-ۿ]/g;
const CYRILLIC_SCRIPT = /[Ѐ-ӿ]/g;
/** ç, ö, ü başka dillerde de bulunur; tek başına zayıf kanıttır. */
const SHARED_TURKISH_LETTERS = /[çÇöÖüÜ]/g;
const MIN_EVIDENCE = 2;

/**
 * Kaynağın bildirdiği dil etiketini iki harfli koda indirir ("en-US" → "en").
 * Tanınmayan biçimde ise null döner ve dil metinden tespit edilir.
 */
export function normalizeLanguage(tag: string | null): string | null {
  const match = tag?.trim().toLowerCase().match(/^([a-z]{2})(?:[-_][a-z0-9]+)*$/);
  return match ? match[1] : null;
}

/** ISO 639-1 kodu ya da "und" (belirlenemedi). */
export function detectLanguage(tokens: readonly string[], originalText: string): string {
  const letters = originalText.replace(/[^\p{L}]/gu, "").length || 1;
  if ((originalText.match(ARABIC_SCRIPT)?.length ?? 0) / letters > 0.4) return "ar";
  if ((originalText.match(CYRILLIC_SCRIPT)?.length ?? 0) / letters > 0.4) return "ru";

  const scores: Record<string, number> = {};
  for (const token of tokens) {
    for (const [language, words] of Object.entries(STOPWORDS)) {
      if (words.has(token)) scores[language] = (scores[language] ?? 0) + 1;
    }
  }
  // ğ, ş, ı, İ neredeyse yalnızca Türkçe'de bulunur; güçlü kanıttır.
  const turkishLetters = originalText.match(TURKISH_LETTERS)?.length ?? 0;
  const sharedLetters = originalText.match(SHARED_TURKISH_LETTERS)?.length ?? 0;
  scores.tr = (scores.tr ?? 0) + Math.min(turkishLetters, 6) * 0.75 + Math.min(sharedLetters, 4) * 0.3;

  let best = "und";
  let bestScore = 0;
  for (const [language, score] of Object.entries(scores)) {
    if (score > bestScore) {
      best = language;
      bestScore = score;
    }
  }
  return bestScore >= MIN_EVIDENCE ? best : "und";
}
