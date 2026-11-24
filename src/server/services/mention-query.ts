import type { Project, TimeRange } from "@/domain/types";
import { PARAMS } from "@/lib/links";
import { tryParseQuery, type QueryNode } from "@/lib/query";
import { DAY_MS, resolveRange, type RangeKey } from "@/lib/time";
import { readRange, readString, type SearchParams } from "../context";
import type { MentionFilter } from "../repositories/mentions";

/**
 * Adres çubuğundaki parametreleri bahsetme süzgecine çevirir. Liste ekranı
 * ve dışa aktarma aynı işlevi kullanır; ekranda görülen ile indirilen aynıdır.
 */

export interface MentionQuery {
  filter: MentionFilter;
  rangeKey: RangeKey;
  range: TimeRange;
  /** Adreste açık bir aralık (ör. tek gün) verilmiş mi? */
  hasExplicitRange: boolean;
  queryText: string;
  queryAst: QueryNode | null;
  /** Kullanıcının yazdığı süzgeç geçersizse hata iletisi. */
  queryError: string | null;
  includeIrrelevant: boolean;
}

/** Açık aralık için üst sınır; adres çubuğundan keyfi büyük taramalar istenemesin. */
const MAX_EXPLICIT_RANGE_MS = 400 * DAY_MS;

function readExplicitRange(searchParams: SearchParams): TimeRange | null {
  const from = Number(readString(searchParams, PARAMS.from));
  const to = Number(readString(searchParams, PARAMS.to));
  const valid = Number.isSafeInteger(from) && Number.isSafeInteger(to) && from > 0 && to > from && to - from <= MAX_EXPLICIT_RANGE_MS;
  return valid ? { from, to } : null;
}

export function readMentionQuery(project: Project, searchParams: SearchParams, now: number): MentionQuery {
  const rangeKey = readRange(searchParams);
  const explicit = readExplicitRange(searchParams);
  const range = explicit ?? resolveRange(rangeKey, now);
  const includeIrrelevant = readString(searchParams, PARAMS.irrelevant) === "1";

  const queryText = readString(searchParams, PARAMS.query);
  const parsed = queryText ? tryParseQuery(queryText) : null;
  const queryAst = parsed?.ok ? parsed.ast : null;

  return {
    filter: { projectId: project.id, range, query: queryAst ?? undefined, includeIrrelevant },
    rangeKey,
    range,
    hasExplicitRange: explicit !== null,
    queryText,
    queryAst,
    queryError: parsed && !parsed.ok ? parsed.message : null,
    includeIrrelevant,
  };
}
