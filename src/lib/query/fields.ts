import { foldWord } from "../text/normalize";
import type { FieldName } from "./ast";

/**
 * Alan filtrelerinin sözlüğü. Alan adları ve değerleri hem Türkçe hem
 * İngilizce yazılabilir; karşılaştırma katlanmış biçim üzerinden yapılır,
 * yani "erişim", "erisim" ve "ERİŞİM" aynıdır.
 */

interface FieldSpec {
  name: FieldName;
  kind: "enum" | "text" | "number" | "boolean";
  aliases: string[];
  /** enum alanlar için: kanonik değer → kabul edilen yazımlar. */
  values?: Record<string, string[]>;
  /** Yardım metninde gösterilen örnek. */
  example: string;
  description: string;
}

export const FIELD_SPECS: readonly FieldSpec[] = [
  {
    name: "source",
    kind: "enum",
    aliases: ["kaynak", "source"],
    values: {
      news: ["haber", "news"],
      social: ["sosyal", "social"],
      forum: ["forum"],
      video: ["video"],
      review: ["yorum", "review", "degerlendirme"],
      blog: ["blog"],
    },
    example: "kaynak:haber",
    description: "Kaynak türü",
  },
  {
    name: "site",
    kind: "text",
    aliases: ["site", "alan"],
    example: "site:ornek.com.tr",
    description: "Yayın ya da platform adı",
  },
  {
    name: "sentiment",
    kind: "enum",
    aliases: ["ton", "sentiment"],
    values: {
      positive: ["olumlu", "pozitif", "positive"],
      negative: ["olumsuz", "negatif", "negative"],
      neutral: ["notr", "neutral"],
    },
    example: "ton:olumsuz",
    description: "Ton (kullanıcı düzeltmesi varsa o geçerlidir)",
  },
  {
    name: "emotion",
    kind: "enum",
    aliases: ["duygu", "emotion"],
    values: {
      joy: ["sevinc", "joy"],
      anger: ["ofke", "anger"],
      sadness: ["uzuntu", "sadness"],
      fear: ["korku", "fear"],
      surprise: ["saskinlik", "surprise"],
      disgust: ["tiksinti", "disgust"],
      none: ["yok", "none"],
    },
    example: "duygu:öfke",
    description: "Baskın duygu",
  },
  {
    name: "intent",
    kind: "enum",
    aliases: ["niyet", "intent"],
    values: {
      complaint: ["sikayet", "complaint"],
      praise: ["ovgu", "praise"],
      purchase: ["satinalma", "purchase"],
      churn: ["ayrilma", "churn"],
      support: ["destek", "support"],
      general: ["genel", "general"],
    },
    example: "niyet:şikayet",
    description: "Yazının amacı",
  },
  {
    name: "lang",
    kind: "text",
    aliases: ["dil", "lang"],
    example: "dil:tr",
    description: "Dil kodu",
  },
  {
    name: "author",
    kind: "text",
    aliases: ["yazar", "author"],
    example: "yazar:ornekhesap",
    description: "Yazar adı ya da kullanıcı adı",
  },
  {
    name: "topic",
    kind: "text",
    aliases: ["konu", "topic"],
    example: 'konu:"teslimat gecikmesi"',
    description: "Projede tanımlı konu",
  },
  {
    name: "sarcasm",
    kind: "boolean",
    aliases: ["ironi", "sarcasm"],
    example: "ironi:evet",
    description: "İroni şüphesi",
  },
  {
    name: "reach",
    kind: "number",
    aliases: ["erisim", "reach"],
    example: "erişim:>10000",
    description: "Tahmini erişim",
  },
  {
    name: "engagement",
    kind: "number",
    aliases: ["etkilesim", "engagement"],
    example: "etkileşim:>=50",
    description: "Gözlenen etkileşim",
  },
  {
    name: "followers",
    kind: "number",
    aliases: ["takipci", "followers"],
    example: "takipçi:>5000",
    description: "Yazarın takipçi sayısı",
  },
];

const SPEC_BY_ALIAS = new Map<string, FieldSpec>();
for (const spec of FIELD_SPECS) {
  for (const alias of spec.aliases) SPEC_BY_ALIAS.set(alias, spec);
}

const TRUE_WORDS = new Set(["evet", "var", "true", "yes", "1"]);
const FALSE_WORDS = new Set(["hayir", "yok", "false", "no", "0"]);

export function findFieldSpec(rawName: string): FieldSpec | undefined {
  return SPEC_BY_ALIAS.get(foldWord(rawName));
}

export type FieldValueResult = { ok: true; value: string | number } | { ok: false; reason: string };

/** Kullanıcının yazdığı alan değerini kanonik değere çevirir. */
export function resolveFieldValue(spec: FieldSpec, rawValue: string): FieldValueResult {
  const folded = foldWord(rawValue.trim());
  if (folded.length === 0) return { ok: false, reason: "değer boş" };

  switch (spec.kind) {
    case "enum": {
      const entries = Object.entries(spec.values ?? {});
      const hit = entries.find(([canonical, spellings]) => canonical === folded || spellings.includes(folded));
      if (hit) return { ok: true, value: hit[0] };
      const accepted = entries.map(([, spellings]) => spellings[0]).join(", ");
      return { ok: false, reason: `geçerli değerler: ${accepted}` };
    }
    case "number": {
      const digits = rawValue.replace(/[.\s_]/g, "").replace(",", ".");
      const parsed = Number(digits);
      if (!Number.isFinite(parsed) || parsed < 0) return { ok: false, reason: "sayı bekleniyor" };
      return { ok: true, value: parsed };
    }
    case "boolean": {
      if (TRUE_WORDS.has(folded)) return { ok: true, value: 1 };
      if (FALSE_WORDS.has(folded)) return { ok: true, value: 0 };
      return { ok: false, reason: "evet ya da hayır bekleniyor" };
    }
    case "text":
      return { ok: true, value: rawValue.trim().toLocaleLowerCase("tr-TR") };
  }
}
