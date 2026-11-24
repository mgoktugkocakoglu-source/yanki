import type { TermMode } from "../text/turkish";

export type FieldName = "source" | "site" | "sentiment" | "emotion" | "intent" | "lang" | "author" | "topic" | "sarcasm" | "reach" | "engagement" | "followers";

export type CompareOp = "=" | ">" | ">=" | "<" | "<=";

/**
 * Metin düğümü. Tek kelime ya da bitişik kelimelerden oluşan bir öbektir.
 * Öbekte son kelime dışındakiler birebir aranır; `mode` yalnızca son kelimeye
 * uygulanır, çünkü Türkçe'de çekim eki öbeğin sonuna gelir.
 */
export interface TextNode {
  kind: "text";
  tokens: string[];
  mode: TermMode;
  /** Kullanıcının yazdığı hali; hata iletileri ve kaynak aramaları için. */
  raw: string;
}

export interface NearNode {
  kind: "near";
  /** Her iki taraf, kendi içinde VEYA ile bağlı metin düğümleridir. */
  left: TextNode[];
  right: TextNode[];
  distance: number;
}

export interface FieldNode {
  kind: "field";
  field: FieldName;
  op: CompareOp;
  value: string | number;
}

export interface AndNode {
  kind: "and";
  children: QueryNode[];
}

export interface OrNode {
  kind: "or";
  children: QueryNode[];
}

export interface NotNode {
  kind: "not";
  child: QueryNode;
}

export type QueryNode = AndNode | OrNode | NotNode | TextNode | NearNode | FieldNode;

/** Sorgu metninde konumu belli, kullanıcıya gösterilebilir hata. */
export class QuerySyntaxError extends Error {
  readonly position: number;

  constructor(message: string, position: number) {
    super(message);
    this.name = "QuerySyntaxError";
    this.position = position;
  }
}
