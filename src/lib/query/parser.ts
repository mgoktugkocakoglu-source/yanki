import { tokenize } from "../text/normalize";
import type { TermMode } from "../text/turkish";
import { QuerySyntaxError, type CompareOp, type FieldNode, type QueryNode, type TextNode } from "./ast";
import { findFieldSpec, resolveFieldValue } from "./fields";

/**
 * Boolean sorgu dili.
 *
 *   sorgu   := veya
 *   veya    := ve ( (OR | VEYA) ve )*
 *   ve      := tekli ( (AND | VE)? tekli )*          -- yan yana yazım VE demektir
 *   tekli   := (NOT | DEĞİL | '-') tekli | yakın
 *   yakın   := birincil ( (NEAR | YAKIN)/n birincil )?
 *   birincil:= '(' veya ')' | alan:değer | metin
 *   metin   := '='? ( kelime '*'? | "öbek" )
 *
 * İşleçler yalnızca BÜYÜK harfle yazıldığında işleçtir; "ve" kelimesi aranabilir.
 */

const MAX_QUERY_LENGTH = 4000;
const MAX_NEAR_DISTANCE = 50;
const QUOTES = new Set(['"', "“", "”", "„"]);
const AND_WORDS = new Set(["AND", "VE", "&&", "&"]);
const OR_WORDS = new Set(["OR", "VEYA", "||", "|"]);
const NOT_WORDS = new Set(["NOT", "DEĞİL", "DEGIL"]);
const NEAR_PATTERN = /^(?:NEAR|YAKIN)\/(\d+)$/;
const COMPARE_PATTERN = /^(>=|<=|>|<|=)?(.*)$/s;

type Token =
  | { type: "lparen" | "rparen" | "and" | "or" | "not"; position: number }
  | { type: "near"; distance: number; position: number }
  | { type: "node"; node: QueryNode; position: number };

function isSpace(char: string): boolean {
  return /\s/.test(char);
}

function buildTextNode(raw: string, strict: boolean, position: number): TextNode {
  const wildcard = raw.endsWith("*");
  const body = wildcard ? raw.slice(0, -1) : raw;
  const tokens = tokenize(body);
  if (tokens.length === 0) {
    throw new QuerySyntaxError(`"${raw}" aranabilir bir kelime içermiyor.`, position);
  }
  if (strict && wildcard) {
    throw new QuerySyntaxError("Birebir eşleşme (=) ile joker (*) birlikte kullanılamaz.", position);
  }
  const mode: TermMode = wildcard ? "prefix" : strict ? "exact" : "inflect";
  return { kind: "text", tokens, mode, raw: body.trim() };
}

function buildFieldNode(rawName: string, rawValue: string, position: number): FieldNode {
  const spec = findFieldSpec(rawName);
  if (!spec) {
    throw new QuerySyntaxError(`Bilinmeyen alan: "${rawName}". İçinde ":" geçen bir ifadeyi aramak için tırnak kullanın.`, position);
  }
  const [, rawOp = "", rest = ""] = COMPARE_PATTERN.exec(rawValue) ?? [];
  const op = (rawOp || "=") as CompareOp;
  if (op !== "=" && spec.kind !== "number") {
    throw new QuerySyntaxError(`"${rawName}" alanında karşılaştırma (${op}) kullanılamaz.`, position);
  }
  const resolved = resolveFieldValue(spec, rest);
  if (!resolved.ok) {
    throw new QuerySyntaxError(`"${rawName}" alanı için ${resolved.reason}.`, position);
  }
  return { kind: "field", field: spec.name, op, value: resolved.value };
}

function readQuoted(input: string, openAt: number): { text: string; next: number } {
  let cursor = openAt + 1;
  while (cursor < input.length && !QUOTES.has(input[cursor])) cursor += 1;
  if (cursor >= input.length) {
    throw new QuerySyntaxError("Tırnak kapatılmamış.", openAt);
  }
  return { text: input.slice(openAt + 1, cursor), next: cursor + 1 };
}

function lex(input: string): Token[] {
  const tokens: Token[] = [];
  let cursor = 0;

  while (cursor < input.length) {
    const char = input[cursor];
    if (isSpace(char)) {
      cursor += 1;
      continue;
    }
    const position = cursor;

    if (char === "(") {
      tokens.push({ type: "lparen", position });
      cursor += 1;
      continue;
    }
    if (char === ")") {
      tokens.push({ type: "rparen", position });
      cursor += 1;
      continue;
    }

    const next = input[cursor + 1];
    if (char === "-" && next !== undefined && !isSpace(next)) {
      tokens.push({ type: "not", position });
      cursor += 1;
      continue;
    }

    let strict = false;
    if (char === "=" && next !== undefined && !isSpace(next)) {
      strict = true;
      cursor += 1;
    }

    if (QUOTES.has(input[cursor])) {
      const quoted = readQuoted(input, cursor);
      tokens.push({ type: "node", node: buildTextNode(quoted.text, strict, position), position });
      cursor = quoted.next;
      continue;
    }

    let end = cursor;
    while (end < input.length && !isSpace(input[end]) && input[end] !== "(" && input[end] !== ")" && !QUOTES.has(input[end])) {
      end += 1;
    }
    const word = input.slice(cursor, end);
    cursor = end;

    // alan:"tırnaklı değer"
    if (word.endsWith(":") && QUOTES.has(input[cursor] ?? "")) {
      const quoted = readQuoted(input, cursor);
      tokens.push({ type: "node", node: buildFieldNode(word.slice(0, -1), quoted.text, position), position });
      cursor = quoted.next;
      continue;
    }

    if (!strict) {
      if (AND_WORDS.has(word)) {
        tokens.push({ type: "and", position });
        continue;
      }
      if (OR_WORDS.has(word)) {
        tokens.push({ type: "or", position });
        continue;
      }
      if (NOT_WORDS.has(word)) {
        tokens.push({ type: "not", position });
        continue;
      }
      const near = NEAR_PATTERN.exec(word);
      if (near) {
        const distance = Number(near[1]);
        if (distance < 1 || distance > MAX_NEAR_DISTANCE) {
          throw new QuerySyntaxError(`Yakınlık 1 ile ${MAX_NEAR_DISTANCE} arasında olmalı.`, position);
        }
        tokens.push({ type: "near", distance, position });
        continue;
      }
      const colonAt = word.indexOf(":");
      const looksLikeUrl = /^https?:/i.test(word);
      if (colonAt > 0 && colonAt < word.length - 1 && !looksLikeUrl) {
        tokens.push({
          type: "node",
          node: buildFieldNode(word.slice(0, colonAt), word.slice(colonAt + 1), position),
          position,
        });
        continue;
      }
    }

    tokens.push({ type: "node", node: buildTextNode(word, strict, position), position });
  }

  return tokens;
}

function flatten(kind: "and" | "or", children: QueryNode[]): QueryNode {
  const flat = children.flatMap((child) => (child.kind === kind ? child.children : [child]));
  return flat.length === 1 ? flat[0] : { kind, children: flat };
}

function toTextGroup(node: QueryNode, position: number): TextNode[] {
  if (node.kind === "text") return [node];
  if (node.kind === "or" && node.children.every((child): child is TextNode => child.kind === "text")) {
    return node.children;
  }
  throw new QuerySyntaxError("YAKIN yalnızca kelimeler, öbekler ya da bunların VEYA grupları arasında kullanılabilir.", position);
}

class Parser {
  private index = 0;

  constructor(
    private readonly tokens: Token[],
    private readonly inputLength: number,
  ) {}

  parse(): QueryNode {
    const node = this.parseOr();
    const leftover = this.peek();
    if (leftover) {
      const message = leftover.type === "rparen" ? "Fazladan kapanış parantezi." : "Beklenmeyen ifade.";
      throw new QuerySyntaxError(message, leftover.position);
    }
    return node;
  }

  private peek(): Token | undefined {
    return this.tokens[this.index];
  }

  private take(): Token | undefined {
    const token = this.tokens[this.index];
    this.index += 1;
    return token;
  }

  private endPosition(): number {
    return this.inputLength;
  }

  private parseOr(): QueryNode {
    const children = [this.parseAnd()];
    while (this.peek()?.type === "or") {
      this.take();
      children.push(this.parseAnd());
    }
    return flatten("or", children);
  }

  private parseAnd(): QueryNode {
    const children = [this.parseUnary()];
    for (;;) {
      const next = this.peek();
      if (!next || next.type === "or" || next.type === "rparen") break;
      if (next.type === "and") this.take();
      children.push(this.parseUnary());
    }
    return flatten("and", children);
  }

  private parseUnary(): QueryNode {
    if (this.peek()?.type === "not") {
      this.take();
      return { kind: "not", child: this.parseUnary() };
    }
    return this.parseNear();
  }

  private parseNear(): QueryNode {
    const leftPosition = this.peek()?.position ?? this.endPosition();
    const left = this.parsePrimary();
    const next = this.peek();
    if (next?.type !== "near") return left;

    this.take();
    const rightPosition = this.peek()?.position ?? this.endPosition();
    const right = this.parsePrimary();
    if (this.peek()?.type === "near") {
      throw new QuerySyntaxError("YAKIN zincirleme kullanılamaz; parantezle gruplayın.", this.peek()!.position);
    }
    return {
      kind: "near",
      left: toTextGroup(left, leftPosition),
      right: toTextGroup(right, rightPosition),
      distance: next.distance,
    };
  }

  private parsePrimary(): QueryNode {
    const token = this.take();
    if (!token) {
      throw new QuerySyntaxError("Sorgu yarım kaldı; bir kelime ya da ifade bekleniyor.", this.endPosition());
    }
    switch (token.type) {
      case "node":
        return token.node;
      case "lparen": {
        if (this.peek()?.type === "rparen") {
          throw new QuerySyntaxError("Boş parantez.", token.position);
        }
        const inner = this.parseOr();
        if (this.take()?.type !== "rparen") {
          throw new QuerySyntaxError("Parantez kapatılmamış.", token.position);
        }
        return inner;
      }
      case "rparen":
        throw new QuerySyntaxError("Fazladan kapanış parantezi.", token.position);
      case "and":
      case "or":
      case "near":
        throw new QuerySyntaxError("İşleçten önce bir kelime ya da ifade olmalı.", token.position);
      case "not":
        throw new QuerySyntaxError("DEĞİL işlecinden sonra bir ifade olmalı.", token.position);
    }
  }
}

/** Sorgu metnini ayrıştırır. Geçersizse `QuerySyntaxError` fırlatır. */
export function parseQuery(input: string): QueryNode {
  if (input.length > MAX_QUERY_LENGTH) {
    throw new QuerySyntaxError(`Sorgu en fazla ${MAX_QUERY_LENGTH} karakter olabilir.`, MAX_QUERY_LENGTH);
  }
  const tokens = lex(input);
  if (tokens.length === 0) {
    throw new QuerySyntaxError("Sorgu boş.", 0);
  }
  return new Parser(tokens, input.length).parse();
}

export type ParseOutcome = { ok: true; ast: QueryNode } | { ok: false; message: string; position: number };

/** Hata fırlatmayan sürüm; form doğrulaması ve canlı önizleme için. */
export function tryParseQuery(input: string): ParseOutcome {
  try {
    return { ok: true, ast: parseQuery(input) };
  } catch (error) {
    if (error instanceof QuerySyntaxError) {
      return { ok: false, message: error.message, position: error.position };
    }
    throw error;
  }
}
