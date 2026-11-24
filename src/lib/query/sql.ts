import type { TermMode } from "../text/turkish";
import type { FieldNode, NearNode, QueryNode, TextNode } from "./ast";
import { findNearRanges, findTextRanges, foldPhrase } from "./matcher";

/**
 * Sorgu ağacını parametreli bir SQL WHERE parçasına derler.
 *
 * Metin eşleşmesinin kuralları (Türkçe ekler, öbek, yakınlık) tek yerde,
 * `matcher.ts` içinde yaşar. SQL tarafı bu kuralları yeniden yazmaz; aynı
 * işlevleri veritabanına kayıtlı `yq_text` / `yq_near` işlevleri üzerinden
 * çağırır. Böylece liste, grafik ve canlı eşleştirici hep aynı sonucu verir.
 *
 * Kullanıcı girdisi hiçbir zaman SQL metnine gömülmez; hepsi parametredir.
 */

export interface SqlFragment {
  sql: string;
  params: Array<string | number>;
}

/** Derleyicinin varsaydığı kolon adları (bkz. server/db/schema.ts). */
const COLUMNS = {
  searchText: "search_text",
  sourceType: "source_type",
  sourceName: "source_name",
  sentiment: "COALESCE({a}.sentiment_override, {a}.ai_sentiment, {a}.sentiment)",
  emotion: "emotion",
  intent: "intent",
  language: "language",
  sarcasm: "is_sarcastic",
  reach: "reach",
  engagement: "engagement",
  followers: "author_followers",
} as const;

const SOFTENABLE = /[ptk]$/;

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

/**
 * Hızlı ön eleme için alt dizi. Yumuşayabilen son harf atılır ki
 * "kitap" → "kitabı" gibi biçimler ön elemede kaybolmasın.
 */
function likeProbe(node: TextNode): string {
  const first = node.tokens[0];
  const isSingleInflected = node.tokens.length === 1 && node.mode === "inflect";
  const stem = isSingleInflected && first.length > 3 && SOFTENABLE.test(first) ? first.slice(0, -1) : first;
  return `%${escapeLike(stem)}%`;
}

function compileText(node: TextNode, alias: string): SqlFragment {
  const column = `${alias}.${COLUMNS.searchText}`;
  return {
    sql: `(${column} LIKE ? ESCAPE '\\' AND yq_text(${column}, ?, ?) = 1)`,
    params: [likeProbe(node), node.tokens.join(" "), node.mode],
  };
}

function compileNear(node: NearNode, alias: string): SqlFragment {
  return {
    sql: `yq_near(${alias}.${COLUMNS.searchText}, ?) = 1`,
    params: [JSON.stringify({ left: node.left, right: node.right, distance: node.distance })],
  };
}

function compileField(node: FieldNode, alias: string): SqlFragment {
  const column = (name: keyof typeof COLUMNS) =>
    COLUMNS[name].includes("{a}") ? COLUMNS[name].replaceAll("{a}", alias) : `${alias}.${COLUMNS[name]}`;

  switch (node.field) {
    case "source":
      return { sql: `${column("sourceType")} = ?`, params: [node.value] };
    case "sentiment":
      return { sql: `${column("sentiment")} = ?`, params: [node.value] };
    case "emotion":
      return { sql: `${column("emotion")} = ?`, params: [node.value] };
    case "intent":
      return { sql: `${column("intent")} = ?`, params: [node.value] };
    case "lang":
      return { sql: `${column("language")} = ?`, params: [node.value] };
    case "sarcasm":
      return { sql: `${column("sarcasm")} = ?`, params: [node.value] };
    case "site":
      return {
        sql: `yq_fold(${column("sourceName")}) LIKE ? ESCAPE '\\'`,
        params: [`%${escapeLike(foldPhrase(String(node.value)))}%`],
      };
    case "author": {
      const probe = `%${escapeLike(foldPhrase(String(node.value)))}%`;
      return {
        sql: `(yq_fold(COALESCE(${alias}.author_handle, '')) LIKE ? ESCAPE '\\' OR yq_fold(COALESCE(${alias}.author_name, '')) LIKE ? ESCAPE '\\')`,
        params: [probe, probe],
      };
    }
    case "topic":
      return {
        sql: `EXISTS (SELECT 1 FROM mention_topics mt JOIN project_topics pt ON pt.id = mt.topic_id WHERE mt.mention_id = ${alias}.id AND pt.name_folded = ?)`,
        params: [foldPhrase(String(node.value))],
      };
    case "reach":
    case "engagement":
    case "followers":
      // `op` ayrıştırıcıdaki kapalı kümeden gelir; kullanıcı metni değildir.
      return { sql: `${column(node.field)} ${node.op} ?`, params: [node.value] };
  }
}

function joinFragments(fragments: SqlFragment[], operator: "AND" | "OR"): SqlFragment {
  return {
    sql: `(${fragments.map((fragment) => fragment.sql).join(` ${operator} `)})`,
    params: fragments.flatMap((fragment) => fragment.params),
  };
}

/** `alias`, mentions tablosunun sorgudaki takma adıdır. */
export function compileToSql(node: QueryNode, alias = "m"): SqlFragment {
  switch (node.kind) {
    case "text":
      return compileText(node, alias);
    case "near":
      return compileNear(node, alias);
    case "field":
      return compileField(node, alias);
    case "not": {
      const inner = compileToSql(node.child, alias);
      return { sql: `NOT COALESCE(${inner.sql}, 0)`, params: inner.params };
    }
    case "and":
      return joinFragments(node.children.map((child) => compileToSql(child, alias)), "AND");
    case "or":
      return joinFragments(node.children.map((child) => compileToSql(child, alias)), "OR");
  }
}

/* ── Veritabanına kaydedilen işlevlerin gövdeleri ─────────────────────── */

export function sqlTextMatch(searchText: unknown, terms: unknown, mode: unknown): number {
  if (typeof searchText !== "string" || typeof terms !== "string") return 0;
  const ranges = findTextRanges(searchText.split(" "), terms.split(" "), mode as TermMode);
  return ranges.length > 0 ? 1 : 0;
}

export function sqlNearMatch(searchText: unknown, spec: unknown): number {
  if (typeof searchText !== "string" || typeof spec !== "string") return 0;
  const { left, right, distance } = JSON.parse(spec) as Pick<NearNode, "left" | "right" | "distance">;
  return findNearRanges(searchText.split(" "), left, right, distance).length > 0 ? 1 : 0;
}

export function sqlFold(value: unknown): string {
  return typeof value === "string" ? foldPhrase(value) : "";
}
