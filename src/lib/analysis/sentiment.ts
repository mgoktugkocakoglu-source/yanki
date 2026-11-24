import type { Emotion, Sentiment } from "../../domain/types";
import { isInflectionOf } from "../text/turkish";
import {
  EMOTION_EMOJI,
  EMOTION_STEMS,
  ENGLISH_NEGATORS,
  ENGLISH_POLARITY,
  INTENSIFIERS,
  LIGHT_VERB_STEMS,
  NEGATIVE_EMOJI,
  POSITIVE_EMOJI,
  PRAISE_STEMS,
  SARCASM_MARKERS,
  SERVICE_NOUNS,
  SERVICE_VERB_STEMS,
  TURKISH_NEGATORS,
  TURKISH_POLARITY,
  VERB_NEGATION,
  type PolarEntry,
} from "./lexicon";

/**
 * Sözlük ve kural tabanlı ton çözümleyici.
 *
 * Üç mekanizma birlikte çalışır:
 *   1. Ton sözlüğü: kök eşleşmesi; fiillerde kelime içi olumsuzluk
 *      ("beğenmedim") ve isimlerde -siz/-suz eki ("kalitesiz") tonu çevirir.
 *   2. Çeviriciler: "değil", "yok" ve olumsuz yardımcı fiiller önceki ton
 *      kelimesini tersine çevirir ("iyi değil", "tavsiye etmiyorum").
 *   3. Hizmet fiilleri: "gelmedi", "ulaşamıyorum" gibi olumsuz hizmet
 *      fiilleri sözlükte karşılığı olmasa da şikâyet sinyali sayılır.
 */

export interface SentimentEvidence {
  token: string;
  weight: number;
}

export interface SentimentResult {
  sentiment: Sentiment;
  /** -1 … +1. */
  score: number;
  /** 0 … 1; kanıtın gücü. Kalibre edilmiş bir olasılık değildir. */
  confidence: number;
  isSarcastic: boolean;
  /** Kararı etkileyen kelimeler; "neden böyle?" açıklaması için. */
  evidence: SentimentEvidence[];
}

const POSITIVE_THRESHOLD = 0.2;
const NEGATIVE_THRESHOLD = -0.2;
const SERVICE_FAILURE_WEIGHT = -1.2;
const WEAK_NEGATION_WEIGHT = -0.3;
const INTENSITY_FACTOR = 1.5;
const EMOJI_WEIGHT = 0.8;
const FLIP_WINDOW = 2;
const MIN_PREFIX_STEM = 4;
const SCORE_SCALE = 2.5;
const MAX_DERIVATIONS = 3;

/** İsimden isim/sıfat yapan ekler; "-siz" tonu tersine çevirir. */
const DERIVATION = /^(?:iyet|l[iu]k|l[iu]|s[iu]z|c[iu])/;
const WITHOUT = /^s[iu]z$/;
const ENGLISH_ENDING = /^(?:s|es|ed|d|ing|ly)$/;

interface PolarHit {
  index: number;
  token: string;
  weight: number;
}

/**
 * `token`, `stem` isminin türemiş/çekimli bir hali mi?
 * Öyleyse "-siz" eki alıp almadığını da bildirir. "hata" → "hatay" gibi
 * rastlantısal ön ek benzerlikleri burada elenir.
 */
function nominalForm(token: string, stem: string): { negated: boolean } | null {
  let base = stem;
  let negated = false;

  for (let step = 0; step <= MAX_DERIVATIONS; step += 1) {
    if (isInflectionOf(token, base)) return { negated };
    const derivation = DERIVATION.exec(token.slice(base.length));
    if (!derivation) return null;
    if (WITHOUT.test(derivation[0])) negated = !negated;
    base += derivation[0];
  }
  return null;
}

/** Kelimenin ton ağırlığı; sözlükte karşılığı yoksa null. */
function polarWeight(token: string, lexicon: ReadonlyMap<string, PolarEntry>, isTurkish: boolean): number | null {
  const exact = lexicon.get(token);
  if (exact) return exact.weight;

  for (let length = token.length - 1; length >= MIN_PREFIX_STEM; length -= 1) {
    const stem = token.slice(0, length);
    const entry = lexicon.get(stem);
    if (!entry || entry.exact) continue;

    const remainder = token.slice(length);
    if (!isTurkish) {
      if (ENGLISH_ENDING.test(remainder)) return entry.weight;
      continue;
    }
    if (entry.verb) return VERB_NEGATION.test(remainder) ? -entry.weight : entry.weight;

    const form = nominalForm(token, stem);
    if (form) return form.negated ? -entry.weight : entry.weight;
  }
  return null;
}

function isNegatedVerb(token: string, stems: readonly string[]): boolean {
  return stems.some((stem) => token.startsWith(stem) && VERB_NEGATION.test(token.slice(stem.length)));
}

function startsWithAny(token: string, stems: readonly string[]): boolean {
  return stems.some((stem) => token.startsWith(stem));
}

/** "=" ile başlayan kök birebir, diğerleri kelime başında aranır. */
function matchesEmotionStem(token: string, stem: string): boolean {
  return stem.startsWith("=") ? token === stem.slice(1) : token.startsWith(stem);
}

/** Hemen önceki kelimelerde bir hizmet adı var mı ("teslim edilmedi", "dönüş yok")? */
function followsServiceNoun(tokens: readonly string[], index: number): boolean {
  for (let offset = 1; offset <= FLIP_WINDOW; offset += 1) {
    const previous = tokens[index - offset];
    if (previous !== undefined && SERVICE_NOUNS.has(previous)) return true;
  }
  return false;
}

function countMatches(text: string, pattern: RegExp): number {
  return text.match(pattern)?.length ?? 0;
}

function collectTurkishHits(tokens: readonly string[]): { hits: PolarHit[]; hasServiceFailure: boolean } {
  const hits: PolarHit[] = [];
  let hasServiceFailure = false;
  let intensify = false;

  tokens.forEach((token, index) => {
    if (INTENSIFIERS.has(token)) {
      intensify = true;
      return;
    }

    // Türkçe'de çevirici, ton kelimesinden SONRA gelir: "iyi değil", "tavsiye etmiyorum".
    const isNegatorWord = TURKISH_NEGATORS.has(token);
    if (isNegatorWord || isNegatedVerb(token, LIGHT_VERB_STEMS)) {
      const previous = hits.at(-1);
      if (previous && index - previous.index <= FLIP_WINDOW) {
        previous.weight = -previous.weight;
      } else if (followsServiceNoun(tokens, index)) {
        hits.push({ index, token, weight: SERVICE_FAILURE_WEIGHT });
        hasServiceFailure = true;
      } else if (!isNegatorWord) {
        hits.push({ index, token, weight: WEAK_NEGATION_WEIGHT });
      }
      intensify = false;
      return;
    }

    let weight = polarWeight(token, TURKISH_POLARITY, true);
    if (weight === null && isNegatedVerb(token, SERVICE_VERB_STEMS)) {
      weight = SERVICE_FAILURE_WEIGHT;
      hasServiceFailure = true;
    }
    if (weight !== null) {
      hits.push({ index, token, weight: intensify ? weight * INTENSITY_FACTOR : weight });
    }
    intensify = false;
  });

  return { hits, hasServiceFailure };
}

function collectEnglishHits(tokens: readonly string[]): PolarHit[] {
  const hits: PolarHit[] = [];
  let intensify = false;
  let negate = false;

  tokens.forEach((token, index) => {
    if (INTENSIFIERS.has(token)) {
      intensify = true;
      return;
    }
    // İngilizce'de olumsuzluk, ton kelimesinden ÖNCE gelir: "not good".
    if (ENGLISH_NEGATORS.has(token)) {
      negate = true;
      return;
    }
    const weight = polarWeight(token, ENGLISH_POLARITY, false);
    if (weight !== null) {
      const adjusted = (intensify ? weight * INTENSITY_FACTOR : weight) * (negate ? -1 : 1);
      hits.push({ index, token, weight: adjusted });
      negate = false;
    }
    intensify = false;
  });

  return hits;
}

export function analyzeSentiment(tokens: readonly string[], originalText: string, language: string): SentimentResult {
  const isEnglish = language === "en";
  const { hits, hasServiceFailure } = isEnglish
    ? { hits: collectEnglishHits(tokens), hasServiceFailure: false }
    : collectTurkishHits(tokens);

  const emojiScore =
    (countMatches(originalText, POSITIVE_EMOJI) - countMatches(originalText, NEGATIVE_EMOJI)) * EMOJI_WEIGHT;
  let raw = hits.reduce((sum, hit) => sum + hit.weight, 0) + emojiScore;

  // İroni şüphesi: övgü + hizmet aksaklığı ("harikasınız, yine giremiyorum") ya da açık işaret "(!)".
  // Ağır olumsuz bir kelimenin varlığı tek başına yetmez: "fahiş fiyat denetimi için tebrikler" gerçek övgüdür.
  const positiveHits = hits.filter((hit) => hit.weight > 0);
  const hasPraise = positiveHits.some((hit) => startsWithAny(hit.token, PRAISE_STEMS));
  const hasMarker = SARCASM_MARKERS.test(originalText) && positiveHits.length > 0;
  const isSarcastic = (hasPraise && hasServiceFailure) || hasMarker;
  if (isSarcastic) {
    // Övgü kelimeleri gerçek övgü değildir; katkıları ters çevrilir.
    const positiveMass = positiveHits.reduce((sum, hit) => sum + hit.weight, 0);
    raw -= 2 * positiveMass;
  }

  const score = Math.tanh(raw / SCORE_SCALE);
  const sentiment: Sentiment =
    score > POSITIVE_THRESHOLD ? "positive" : score < NEGATIVE_THRESHOLD ? "negative" : "neutral";

  const evidenceCount = hits.length + (emojiScore !== 0 ? 1 : 0);
  const confidence = evidenceCount === 0 ? 0.35 : Math.min(0.95, 0.4 + Math.abs(raw) * 0.12 + evidenceCount * 0.05);

  return {
    sentiment,
    score: Number(score.toFixed(3)),
    confidence: Number(confidence.toFixed(2)),
    isSarcastic,
    evidence: hits.map(({ token, weight }) => ({ token, weight })),
  };
}

const EMOTION_THRESHOLD = 1;

/** Baskın duyguyu bulur; yeterli kanıt yoksa "none". */
export function detectEmotion(tokens: readonly string[], originalText: string): Emotion {
  let best: Emotion = "none";
  let bestScore = 0;

  const candidates = Object.entries(EMOTION_STEMS) as Array<[Exclude<Emotion, "none">, readonly string[]]>;
  for (const [emotion, stems] of candidates) {
    const wordScore = tokens.filter((token) => stems.some((stem) => matchesEmotionStem(token, stem))).length;
    const score = wordScore + countMatches(originalText, EMOTION_EMOJI[emotion]);
    if (score > bestScore) {
      best = emotion;
      bestScore = score;
    }
  }
  return bestScore >= EMOTION_THRESHOLD ? best : "none";
}
