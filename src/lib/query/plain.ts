import type { FieldNode, QueryNode, TextNode } from "./ast";
import { FIELD_SPECS } from "./fields";
import { tryParseQuery } from "./parser";
import { buildCollectionPlan } from "./plan";

/**
 * Sorgunun düz anlatımı. Arama tanımı arayüzde hiçbir zaman sorgu diliyle
 * gösterilmez ve kullanıcıdan sorgu dili yazması beklenmez: kullanıcı kelime
 * listeleri girer (`composeQuery`), kayıtlı tanım kelime listeleri olarak
 * okunur (`describeQuery`, `decomposeQuery`). Eşleşme kuralları değişmez;
 * burada yalnızca metin ↔ liste dönüşümü yapılır.
 */

export interface PlainQuery {
  /** En az biri geçmeli. */
  anyOf: string[];
  /** Hepsi geçmeli. */
  allOf: string[];
  /** Hiçbiri geçmemeli. */
  noneOf: string[];
  /** ISO 639-1 dil kodu; null ise tüm diller. */
  language: string | null;
}

export const QUERY_LANGUAGES: ReadonlyArray<{ code: string; label: string }> = [
  { code: "tr", label: "Türkçe" },
  { code: "en", label: "İngilizce" },
  { code: "ar", label: "Arapça" },
  { code: "de", label: "Almanca" },
  { code: "fr", label: "Fransızca" },
  { code: "es", label: "İspanyolca" },
  { code: "ru", label: "Rusça" },
];

export function languageLabel(code: string): string {
  return QUERY_LANGUAGES.find((language) => language.code === code)?.label ?? code.toLocaleUpperCase("tr-TR");
}

/** Virgül ya da satırla ayrılmış kelime listesi; tırnak ve sorgu işaretleri atılır. */
export function splitTerms(value: string): string[] {
  const terms = value
    .split(/[,;\n]+/)
    .map((term) =>
      term
        .replace(/["“”()*=:|]/g, " ")
        .replace(/\s+/g, " ")
        .trim(),
    )
    .filter((term) => term !== "");
  return [...new Set(terms)];
}

/** Her ifade tırnak içinde yazılır; böylece işleç gibi görünen kelimeler de (ve, veya, değil) düz kelime kalır. */
function quote(term: string): string {
  return `"${term}"`;
}

function group(terms: string[]): string {
  return terms.length > 1 ? `(${terms.map(quote).join(" OR ")})` : quote(terms[0]);
}

/** Kelime listelerinden sorgu metni. Aranacak kelime yoksa boş metin döner. */
export function composeQuery(plain: PlainQuery): string {
  const parts: string[] = [];
  if (plain.anyOf.length > 0) parts.push(group(plain.anyOf));
  parts.push(...plain.allOf.map(quote));
  if (parts.length === 0) return "";
  if (plain.noneOf.length > 0) parts.push(`NOT ${group(plain.noneOf)}`);
  if (plain.language) parts.push(`dil:${plain.language}`);
  return parts.join(" ");
}

export interface QueryDescription {
  /** Her grup bir koşuldur; grup içindeki ifadelerden en az biri geçmelidir. */
  required: string[][];
  excluded: string[];
  /** Alan süzgeçleri, okunur haliyle: "Ton: olumsuz". */
  filters: string[];
  /** Tanım kelime listelerine tam olarak indirgenebildi mi? */
  simple: boolean;
}

function flattenAnd(node: QueryNode): QueryNode[] {
  return node.kind === "and" ? node.children.flatMap(flattenAnd) : [node];
}

function flattenOr(node: QueryNode): QueryNode[] {
  return node.kind === "or" ? node.children.flatMap(flattenOr) : [node];
}

function textsOf(node: QueryNode): TextNode[] | null {
  const parts = flattenOr(node);
  return parts.every((part): part is TextNode => part.kind === "text") ? parts : null;
}

const FIELD_LABELS: Record<FieldNode["field"], string> = {
  source: "Kaynak türü",
  site: "Site",
  sentiment: "Ton",
  emotion: "Duygu",
  intent: "Amaç",
  lang: "Dil",
  author: "Yazar",
  topic: "Konu",
  sarcasm: "İroni",
  reach: "Erişim",
  engagement: "Etkileşim",
  followers: "Takipçi",
};

function describeField(node: FieldNode, negated: boolean): string {
  const spec = FIELD_SPECS.find((entry) => entry.name === node.field);
  const value = node.field === "lang" ? languageLabel(String(node.value)) : (spec?.values?.[String(node.value)]?.[0] ?? String(node.value));
  const comparison = node.op === "=" ? "" : `${node.op} `;
  const label = FIELD_LABELS[node.field];
  return `${label}: ${negated ? "şu olmayan: " : ""}${comparison}${value}`;
}

/** Sorgu metnini okunur parçalara ayırır. Ayrıştırılamayan metin için null döner. */
export function describeQuery(text: string): QueryDescription | null {
  const parsed = tryParseQuery(text);
  if (!parsed.ok) return null;

  const description: QueryDescription = { required: [], excluded: [], filters: [], simple: true };
  for (const node of flattenAnd(parsed.ast)) {
    if (node.kind === "field") {
      description.filters.push(describeField(node, false));
      continue;
    }
    if (node.kind === "not") {
      if (node.child.kind === "field") {
        description.filters.push(describeField(node.child, true));
        continue;
      }
      const texts = textsOf(node.child);
      if (texts) {
        description.excluded.push(...texts.map((entry) => entry.raw));
        continue;
      }
    }
    const texts = textsOf(node);
    if (texts) {
      description.required.push(texts.map((entry) => entry.raw));
      continue;
    }
    // Yakınlık ya da iç içe koşul: kelime listesine indirgenemez; kaynaklarda aranan ifadeler gösterilir.
    description.simple = false;
  }
  if (!description.simple) {
    const plan = buildCollectionPlan(parsed.ast);
    description.required = plan ? [plan.keywords] : [];
  }
  return description;
}

/**
 * Kayıtlı sorguyu form alanlarına geri çevirir. Kelime listeleriyle tam olarak
 * ifade edilemeyen tanımlar için null döner (form o zaman tanımı olduğu gibi korur).
 */
export function decomposeQuery(text: string): PlainQuery | null {
  const parsed = tryParseQuery(text);
  if (!parsed.ok) return null;

  const plain: PlainQuery = { anyOf: [], allOf: [], noneOf: [], language: null };
  const plainTexts = (node: QueryNode): string[] | null => {
    const texts = textsOf(node);
    return texts && texts.every((entry) => entry.mode === "inflect") ? texts.map((entry) => entry.raw) : null;
  };

  for (const node of flattenAnd(parsed.ast)) {
    if (node.kind === "field") {
      if (node.field !== "lang" || node.op !== "=" || plain.language !== null) return null;
      plain.language = String(node.value);
      continue;
    }
    if (node.kind === "not") {
      const excluded = plainTexts(node.child);
      if (!excluded) return null;
      plain.noneOf.push(...excluded);
      continue;
    }
    const terms = plainTexts(node);
    if (!terms) return null;
    if (terms.length === 1) plain.allOf.push(terms[0]);
    else if (plain.anyOf.length === 0) plain.anyOf = terms;
    else return null;
  }
  // Tek koşul varsa "en az biri" alanında gösterilir; anlam aynıdır.
  if (plain.anyOf.length === 0 && plain.allOf.length === 1) {
    plain.anyOf = plain.allOf;
    plain.allOf = [];
  }
  return plain.anyOf.length + plain.allOf.length > 0 ? plain : null;
}

/**
 * Arama kutusuna yazılan düz metinden kelime listeleri. Virgül farklı yazımları
 * ayırır (en az biri geçmeli); virgül yoksa yazılan kelimelerin hepsi aranır.
 * Tırnak içine alınan metin tek bir öbek sayılır.
 */
export function plainFromSearch(text: string, excluded: string, language: string | null): PlainQuery {
  const trimmed = text.trim();
  const base = { noneOf: splitTerms(excluded), language };
  if (/[,;\n]/.test(trimmed)) return { anyOf: splitTerms(trimmed), allOf: [], ...base };
  if (/^["“].+["”]$/.test(trimmed)) return { anyOf: [], allOf: splitTerms(trimmed), ...base };
  return { anyOf: [], allOf: splitTerms(trimmed.split(/\s+/).join(",")), ...base };
}

/** Konu satırındaki virgüllü kelime listesinden sorgu. Tek kelimede sondaki `*` (ön ek) ve baştaki `=` (birebir) korunur. */
export function topicTermsToQuery(text: string): string {
  const terms: string[] = [];
  for (const raw of text.split(/[,;]+/)) {
    const term = raw.trim();
    const body = splitTerms(term)[0];
    if (!body) continue;
    const single = !/\s/.test(body);
    if (single && term.startsWith("=")) terms.push(`=${body}`);
    else if (single && term.endsWith("*")) terms.push(`${body}*`);
    else terms.push(quote(body));
  }
  return terms.join(" OR ");
}

/** Konu sorgusunu virgüllü kelime listesine çevirir. */
export function queryToTopicTerms(query: string): string {
  const parsed = tryParseQuery(query);
  if (!parsed.ok) return query;
  const texts = textsOf(parsed.ast);
  if (texts) return texts.map((entry) => `${entry.mode === "exact" ? "=" : ""}${entry.raw}${entry.mode === "prefix" ? "*" : ""}`).join(", ");
  return (describeQuery(query)?.required.flat() ?? []).join(", ");
}
