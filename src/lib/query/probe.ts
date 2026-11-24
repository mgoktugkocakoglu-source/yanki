import { tokenize } from "../text/normalize";
import { stablePrefix } from "../text/turkish";

/**
 * Veritabanı için kaba ön süzgeç. Toplama planının zorunlu gruplarından
 * (`plan.ts`) LIKE kalıpları üretir: her gruptan en az bir kalıbın geçtiği
 * satırlar aday olur. Sonuç her zaman bir üst kümedir; kesin kararı sorgu
 * eşleştiricisi (`matcher.ts`) verir. Eşleşme kuralı burada yeniden yazılmaz.
 */

function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, "\\$&");
}

/** İfadenin en uzun kelimesinin çekimde değişmeyen başı; kelime yoksa null. */
function needleOf(keyword: string): string | null {
  const longest = tokenize(keyword).sort((a, b) => b.length - a.length)[0];
  return longest ? stablePrefix(longest) : null;
}

/** Grup başına LIKE kalıpları. Daraltamayan grup (kelimesi çıkarılamayan ifade) atlanır. */
export function groupProbes(groups: readonly (readonly string[])[]): string[][] {
  const probes: string[][] = [];
  for (const group of groups) {
    const needles = [...new Set(group.map(needleOf))];
    if (needles.length === 0 || needles.includes(null)) continue;
    probes.push(needles.map((needle) => `%${escapeLike(needle as string)}%`));
  }
  return probes;
}

/** Kalıplardan parametreli WHERE parçaları: her grup `(sütun LIKE ? OR …)`. */
export function probeConditions(column: string, probes: string[][]): { conditions: string[]; params: string[] } {
  return {
    conditions: probes.map((group) => `(${group.map(() => `${column} LIKE ? ESCAPE '\\'`).join(" OR ")})`),
    params: probes.flat(),
  };
}
