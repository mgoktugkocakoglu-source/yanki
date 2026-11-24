/**
 * Kaynak sorgusu kurucuları. Toplama planındaki zorunlu gruplar, kaynağın
 * anladığı arama sözdizimine çevrilir. Kaynaklar Türkçe ekleri bilmez; bu
 * yüzden buradaki sorgu yalnızca aday getirir, asıl eşleşme yerelde yapılır.
 */

export function quoteTerm(term: string): string {
  return /\s/.test(term) ? `"${term}"` : term;
}

/** `(a OR b) (c OR d)`: her gruptan en az bir ifade geçmeli. */
export function booleanQuery(groups: readonly string[][], or: string = " OR "): string {
  return groups
    .map((group) => {
      const terms = group.map(quoteTerm);
      return terms.length > 1 ? `(${terms.join(or)})` : terms[0];
    })
    .join(" ");
}

/**
 * Her gruptan bir ifade seçen birleşimler; VEYA desteklemeyen kaynaklarda her
 * birleşim ayrı aranır. En çok `limit` birleşim döner; `total` hepsinin sayısıdır.
 */
export function termCombinations(groups: readonly string[][], limit: number): { combinations: string[][]; total: number } {
  let combinations: string[][] = [[]];
  for (const group of groups) {
    combinations = combinations.flatMap((prefix) => group.map((term) => [...prefix, term]));
  }
  return { combinations: combinations.slice(0, limit), total: combinations.length };
}
