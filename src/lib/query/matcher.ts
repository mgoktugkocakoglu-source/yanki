import { foldWord } from "../text/normalize";
import { tokenMatches, type TermMode } from "../text/turkish";
import type { CompareOp, FieldNode, NearNode, QueryNode, TextNode } from "./ast";

/** Alan filtrelerinin baktığı değerler. Metin eşleşmesi `tokens` üzerinden yapılır. */
export interface MatchableFields {
  sourceType: string;
  site: string;
  sentiment: string;
  emotion: string;
  intent: string;
  language: string;
  author: string;
  topics: string[];
  isSarcastic: boolean;
  reach: number | null;
  engagement: number | null;
  followers: number | null;
}

export const EMPTY_FIELDS: MatchableFields = {
  sourceType: "",
  site: "",
  sentiment: "",
  emotion: "",
  intent: "",
  language: "",
  author: "",
  topics: [],
  isSarcastic: false,
  reach: null,
  engagement: null,
  followers: null,
};

/** Kelime dizisindeki yarı açık aralık: [start, end). */
export type TokenRange = readonly [start: number, end: number];

export interface MatchResult {
  matched: boolean;
  /** Eşleşmeyi sağlayan kelime aralıkları; vurgulama ve kanıt için. */
  hits: TokenRange[];
}

const NO_MATCH: MatchResult = { matched: false, hits: [] };

/** Bir metin düğümünün kelime dizisinde geçtiği tüm konumlar. */
export function findTextRanges(tokens: readonly string[], terms: readonly string[], mode: TermMode): TokenRange[] {
  const ranges: TokenRange[] = [];
  const lastIndex = terms.length - 1;
  const lastTerm = terms[lastIndex];

  for (let start = 0; start + terms.length <= tokens.length; start += 1) {
    let aligned = true;
    for (let offset = 0; offset < lastIndex; offset += 1) {
      if (tokens[start + offset] !== terms[offset]) {
        aligned = false;
        break;
      }
    }
    if (aligned && tokenMatches(tokens[start + lastIndex], lastTerm, mode)) {
      ranges.push([start, start + terms.length]);
    }
  }
  return ranges;
}

function matchText(node: TextNode, tokens: readonly string[]): MatchResult {
  const hits = findTextRanges(tokens, node.tokens, node.mode);
  return hits.length > 0 ? { matched: true, hits } : NO_MATCH;
}

/** İki aralık arasındaki kelime sayısı; çakışıyorlarsa -1. */
function gapBetween(a: TokenRange, b: TokenRange): number {
  if (a[1] <= b[0]) return b[0] - a[1];
  if (b[1] <= a[0]) return a[0] - b[1];
  return -1;
}

export function findNearRanges(tokens: readonly string[], left: readonly TextNode[], right: readonly TextNode[], distance: number): TokenRange[] {
  const leftRanges = left.flatMap((node) => findTextRanges(tokens, node.tokens, node.mode));
  if (leftRanges.length === 0) return [];
  const rightRanges = right.flatMap((node) => findTextRanges(tokens, node.tokens, node.mode));

  const hits: TokenRange[] = [];
  for (const a of leftRanges) {
    for (const b of rightRanges) {
      const gap = gapBetween(a, b);
      if (gap >= 0 && gap <= distance) hits.push(a, b);
    }
  }
  return hits;
}

function matchNear(node: NearNode, tokens: readonly string[]): MatchResult {
  const hits = findNearRanges(tokens, node.left, node.right, node.distance);
  return hits.length > 0 ? { matched: true, hits } : NO_MATCH;
}

function compareNumbers(actual: number | null, op: CompareOp, expected: number): boolean {
  if (actual === null) return false;
  switch (op) {
    case "=":
      return actual === expected;
    case ">":
      return actual > expected;
    case ">=":
      return actual >= expected;
    case "<":
      return actual < expected;
    case "<=":
      return actual <= expected;
  }
}

/** Metin alanlarını karşılaştırmadan önce katlar: harf büyüklüğü ve Türkçe karakter farkı yok sayılır. */
export function foldPhrase(text: string): string {
  return text.split(/\s+/).filter(Boolean).map(foldWord).join(" ");
}

function matchField(node: FieldNode, fields: MatchableFields): boolean {
  switch (node.field) {
    case "source":
      return fields.sourceType === node.value;
    case "sentiment":
      return fields.sentiment === node.value;
    case "emotion":
      return fields.emotion === node.value;
    case "intent":
      return fields.intent === node.value;
    case "lang":
      return fields.language === node.value;
    case "site":
      return foldPhrase(fields.site).includes(foldPhrase(String(node.value)));
    case "author":
      return foldPhrase(fields.author).includes(foldPhrase(String(node.value)));
    case "topic": {
      const wanted = foldPhrase(String(node.value));
      return fields.topics.some((topic) => foldPhrase(topic) === wanted);
    }
    case "sarcasm":
      return fields.isSarcastic === (node.value === 1);
    case "reach":
      return compareNumbers(fields.reach, node.op, Number(node.value));
    case "engagement":
      return compareNumbers(fields.engagement, node.op, Number(node.value));
    case "followers":
      return compareNumbers(fields.followers, node.op, Number(node.value));
  }
}

/**
 * Sorguyu tek bir içerik üzerinde değerlendirir.
 * `tokens`, `tokenize()` ile üretilmiş katlanmış kelimelerdir.
 */
export function matchQuery(node: QueryNode, tokens: readonly string[], fields: MatchableFields = EMPTY_FIELDS): MatchResult {
  switch (node.kind) {
    case "text":
      return matchText(node, tokens);
    case "near":
      return matchNear(node, tokens);
    case "field":
      return matchField(node, fields) ? { matched: true, hits: [] } : NO_MATCH;
    case "not":
      return matchQuery(node.child, tokens, fields).matched ? NO_MATCH : { matched: true, hits: [] };
    case "and": {
      const hits: TokenRange[] = [];
      for (const child of node.children) {
        const result = matchQuery(child, tokens, fields);
        if (!result.matched) return NO_MATCH;
        hits.push(...result.hits);
      }
      return { matched: true, hits };
    }
    case "or": {
      const hits: TokenRange[] = [];
      let matched = false;
      for (const child of node.children) {
        const result = matchQuery(child, tokens, fields);
        if (result.matched) {
          matched = true;
          hits.push(...result.hits);
        }
      }
      return matched ? { matched: true, hits } : NO_MATCH;
    }
  }
}

/**
 * Vurgulanacak kelime aralıkları: sorgunun olumlu metin düğümlerinin metinde
 * geçtiği her yer. `matchQuery`den farkı, sorgunun bütünü bu metinde
 * sağlanmasa da (ör. VE'nin bir yarısı başlıkta, diğeri içerikte) geçen
 * kelimeleri döndürmesidir.
 */
export function findHighlights(node: QueryNode, tokens: readonly string[]): TokenRange[] {
  switch (node.kind) {
    case "text":
      return findTextRanges(tokens, node.tokens, node.mode);
    case "near":
      return findNearRanges(tokens, node.left, node.right, node.distance);
    case "and":
    case "or":
      return node.children.flatMap((child) => findHighlights(child, tokens));
    case "not":
    case "field":
      return [];
  }
}
