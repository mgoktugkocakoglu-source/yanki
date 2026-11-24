import type { TimeRange } from "../domain/types";
import { DEFAULT_RANGE, type RangeKey } from "./time";

/** Uygulama içi adresler tek yerde kurulur; parametre adları dağınık kalmaz. */

export const PARAMS = {
  range: "d",
  query: "q",
  from: "bas",
  to: "bit",
  sort: "sira",
  page: "sayfa",
  irrelevant: "ilgisiz",
} as const;

export function projectHref(projectId: string, section = ""): string {
  return `/proje/${projectId}${section ? `/${section}` : ""}`;
}

interface MentionsLinkOptions {
  query?: string;
  rangeKey?: RangeKey;
  /** Belirli bir zaman aralığı (ör. tek bir gün); `rangeKey`in önüne geçer. */
  range?: TimeRange;
}

/** Süzülmüş bahsetme listesine bağlantı: grafikteki her sayı buradan kanıtına iner. */
export function mentionsHref(projectId: string, options: MentionsLinkOptions = {}): string {
  const params = new URLSearchParams();
  if (options.query) params.set(PARAMS.query, options.query);
  if (options.range) {
    params.set(PARAMS.from, String(options.range.from));
    params.set(PARAMS.to, String(options.range.to));
  } else if (options.rangeKey && options.rangeKey !== DEFAULT_RANGE) {
    params.set(PARAMS.range, options.rangeKey);
  }
  const search = params.toString();
  return `${projectHref(projectId, "bahsetmeler")}${search ? `?${search}` : ""}`;
}

const PHRASE_WORDS = 8;

/** Bir başlığı öbek aramasına çevirir: `"ilk sekiz kelime"`. */
export function phraseQuery(title: string): string {
  const words = title
    .replace(/["“”„]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, PHRASE_WORDS);
  return `"${words.join(" ")}"`;
}
