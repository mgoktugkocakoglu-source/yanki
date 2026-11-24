import type { MentionAnalysis } from "../../domain/types";
import { tokenize } from "../text/normalize";
import { classifyIntent } from "./intent";
import { detectLanguage, normalizeLanguage } from "./language";
import { analyzeSentiment, detectEmotion } from "./sentiment";

/** Çözümleyicinin sürümü; sonuçlarla birlikte saklanır ki eski kayıtlar ayırt edilebilsin. */
export const ANALYZER_VERSION = "sozluk-v1";

export interface AnalyzableText {
  title: string;
  content: string;
  /** Kaynağın bildirdiği dil; yoksa metinden tahmin edilir. */
  languageHint: string | null;
}

/**
 * Tek bir içeriği uçtan uca çözümler: dil → ton → duygu → niyet.
 * Saf bir işlevdir; ağ ya da veritabanı kullanmaz.
 */
export function analyzeText({ title, content, languageHint }: AnalyzableText): MentionAnalysis {
  const text = `${title}\n${content}`;
  const tokens = tokenize(text);

  const language = normalizeLanguage(languageHint) ?? detectLanguage(tokens, text);
  const sentiment = analyzeSentiment(tokens, text, language);
  const emotion = detectEmotion(tokens, text);
  const intent = classifyIntent(tokens.join(" "), sentiment.sentiment);

  return {
    language,
    sentiment: sentiment.sentiment,
    sentimentScore: sentiment.score,
    sentimentConfidence: sentiment.confidence,
    emotion,
    isSarcastic: sentiment.isSarcastic,
    intent,
  };
}
