import type { QueryNode, TextNode } from "./ast";

/**
 * Toplama planı: kaynaklara gönderilecek arama ifadeleri.
 *
 * Kaynaklar bizim sorgu dilimizi bilmez; onlara yalnızca "çapa" ifadeleri
 * gönderilir ve dönen adaylar yerelde tam sorguyla süzülür (iki aşamalı
 * eşleştirme). Çapa kümesi, sorguyla eşleşen her içerikte en az birinin
 * mutlaka geçtiği ifadelerdir:
 *   - VEYA: bütün dalların çapaları birlikte gerekir.
 *   - VE:   tek bir dalın çapaları yeterlidir (en küçük küme seçilir).
 *   - DEĞİL ve alan filtreleri çapa üretmez.
 *
 * Ayrıca "zorunlu gruplar" çıkarılır: eşleşen her içerikte her gruptan en az
 * bir ifade geçer (VE'nin her dalı ayrı bir gruptur). VE/VEYA destekleyen
 * kaynaklara gruplar birlikte gönderilir; böylece sayfa sınırı ilgisiz
 * adaylarla dolmaz.
 */

export interface CollectionPlan {
  /** Kaynaklarda aranacak ifadeler; kullanıcının yazdığı haliyle. */
  keywords: string[];
  /** Zorunlu gruplar, küçükten büyüğe; en az bir grup vardır. */
  groups: string[][];
  /** Sorgu tek bir dile sabitlenmişse o dilin kodu. */
  language: string | null;
}

/** Kaynağa gönderilen en çok grup; fazlası yerelde süzülür. */
const MAX_GROUPS = 3;

function textKeyword(node: TextNode): string {
  return node.raw;
}

/** null: bu düğüm tek başına çapa sağlayamaz. */
function anchorsOf(node: QueryNode): string[] | null {
  switch (node.kind) {
    case "text":
      return [textKeyword(node)];
    case "near": {
      const left = node.left.map(textKeyword);
      const right = node.right.map(textKeyword);
      return left.length <= right.length ? left : right;
    }
    case "field":
    case "not":
      return null;
    case "or": {
      const all: string[] = [];
      for (const child of node.children) {
        const anchors = anchorsOf(child);
        if (anchors === null) return null;
        all.push(...anchors);
      }
      return all;
    }
    case "and": {
      let best: string[] | null = null;
      for (const child of node.children) {
        const anchors = anchorsOf(child);
        if (anchors !== null && (best === null || anchors.length < best.length)) best = anchors;
      }
      return best;
    }
  }
}

/** Boş dizi: bu düğüm kaynak aramasını daraltamaz. */
function groupsOf(node: QueryNode): string[][] {
  switch (node.kind) {
    case "text":
      return [[textKeyword(node)]];
    case "near":
      return [node.left.map(textKeyword), node.right.map(textKeyword)];
    case "field":
    case "not":
      return [];
    case "or": {
      // Her daldan bir grup alınıp birleştirilir; daraltamayan bir dal varsa VEYA da daraltamaz.
      const union: string[] = [];
      for (const child of node.children) {
        const groups = groupsOf(child);
        if (groups.length === 0) return [];
        union.push(...groups.reduce((smallest, group) => (group.length < smallest.length ? group : smallest)));
      }
      return [union];
    }
    case "and":
      return node.children.flatMap(groupsOf);
  }
}

function unique(terms: string[]): string[] {
  const seen = new Set<string>();
  return terms.filter((term) => {
    const key = term.toLocaleLowerCase("tr-TR");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function requiredLanguage(node: QueryNode): string | null {
  if (node.kind === "field" && node.field === "lang") return String(node.value);
  if (node.kind === "and") {
    for (const child of node.children) {
      const language = requiredLanguage(child);
      if (language) return language;
    }
  }
  return null;
}

/**
 * Sorgudan toplama planı çıkarır. Sorgu hiç aranabilir kelime içermiyorsa
 * (yalnızca filtre ya da DEĞİL) null döner; böyle bir sorguyla proje kurulamaz.
 */
export function buildCollectionPlan(ast: QueryNode): CollectionPlan | null {
  const anchors = anchorsOf(ast);
  if (anchors === null || anchors.length === 0) return null;

  const keywords = unique(anchors);
  const seenGroups = new Set<string>();
  const groups = groupsOf(ast)
    .map(unique)
    .filter((group) => {
      const key = group
        .map((term) => term.toLocaleLowerCase("tr-TR"))
        .sort()
        .join("|");
      if (seenGroups.has(key)) return false;
      seenGroups.add(key);
      return true;
    })
    .sort((a, b) => a.length - b.length)
    .slice(0, MAX_GROUPS);
  return { keywords, groups: groups.length > 0 ? groups : [keywords], language: requiredLanguage(ast) };
}
