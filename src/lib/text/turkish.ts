/**
 * Türkçe çekim eki farkındalığı.
 *
 * Türkçe sondan eklemeli olduğu için "kargo" arayan biri "kargom", "kargoyu",
 * "kargodan" yazılarını da görmek ister; ama "kar" arayan biri "karar"ı ya da
 * "karşı"yı görmek istemez. Buradaki yaklaşım tam bir biçimbilim çözümleyici
 * değildir: kelimenin kökten sonra kalan kısmı, ses kurallarına uyan bir
 * çekim eki dizisi olarak bölünebiliyorsa eşleşme kabul edilir.
 *
 * Bilinen sınır: eş sesli çekimler ayrılamaz ("kar" → "karın" hem "kar'ın"
 * hem "karın" olabilir). Böyle durumlarda kullanıcı `=kar` yazarak birebir
 * eşleşme isteyebilir.
 *
 * Tüm girdiler `foldWord` ile katlanmış olmalıdır. Ek listesi de katlanmış
 * (ASCII) biçimde tutulur; bu yüzden ünlü uyumu çeşitleri teke iner
 * (ı/i → i, u/ü → u).
 */

/** Ekin hangi sesten sonra gelebileceği. */
type Follows = "vowel" | "consonant" | "any";

interface SuffixRule {
  follows: Follows;
  /** Yalnızca doğrudan köke eklenebilir (kargo-m). */
  stemOnly?: boolean;
  /** Kendisinden sonra başka ek gelemez (araba-yla). */
  terminal?: boolean;
}

/** Katlanmış çekim ekleri. Yapım ekleri (-ci, -lik, -li ...) bilerek yoktur. */
const SUFFIX_RULES: Readonly<Record<string, SuffixRule>> = {
  // çoğul
  lar: { follows: "any" },
  ler: { follows: "any" },
  // iyelik
  m: { follows: "vowel", stemOnly: true },
  n: { follows: "vowel", stemOnly: true },
  im: { follows: "consonant" },
  um: { follows: "consonant" },
  si: { follows: "vowel" },
  su: { follows: "vowel" },
  miz: { follows: "vowel" },
  muz: { follows: "vowel" },
  niz: { follows: "vowel" },
  nuz: { follows: "vowel" },
  // belirtme ve tamlayan (ünsüzden sonra -i/-in, ünlüden sonra -yi/-nin)
  i: { follows: "consonant" },
  u: { follows: "consonant" },
  in: { follows: "consonant" },
  un: { follows: "consonant" },
  yi: { follows: "vowel" },
  yu: { follows: "vowel" },
  ni: { follows: "vowel" },
  nu: { follows: "vowel" },
  nin: { follows: "vowel" },
  nun: { follows: "vowel" },
  // yönelme
  a: { follows: "consonant" },
  e: { follows: "consonant" },
  ya: { follows: "vowel" },
  ye: { follows: "vowel" },
  na: { follows: "vowel" },
  ne: { follows: "vowel" },
  // bulunma ve ayrılma
  da: { follows: "any" },
  de: { follows: "any" },
  ta: { follows: "any" },
  te: { follows: "any" },
  nda: { follows: "vowel" },
  nde: { follows: "vowel" },
  dan: { follows: "any" },
  den: { follows: "any" },
  tan: { follows: "any" },
  ten: { follows: "any" },
  ndan: { follows: "vowel" },
  nden: { follows: "vowel" },
  // vasıta
  la: { follows: "consonant", terminal: true },
  le: { follows: "consonant", terminal: true },
  yla: { follows: "vowel", terminal: true },
  yle: { follows: "vowel", terminal: true },
  // ilgi eki
  ki: { follows: "any" },
  // ek-fiil
  dir: { follows: "any", terminal: true },
  dur: { follows: "any", terminal: true },
  tir: { follows: "any", terminal: true },
  tur: { follows: "any", terminal: true },
  di: { follows: "consonant", terminal: true },
  du: { follows: "consonant", terminal: true },
  ti: { follows: "consonant", terminal: true },
  tu: { follows: "consonant", terminal: true },
  ydi: { follows: "vowel", terminal: true },
  ydu: { follows: "vowel", terminal: true },
  mis: { follows: "consonant", terminal: true },
  mus: { follows: "consonant", terminal: true },
  ymis: { follows: "vowel", terminal: true },
  ymus: { follows: "vowel", terminal: true },
};

const MAX_SUFFIX_LENGTH = Math.max(...Object.keys(SUFFIX_RULES).map((suffix) => suffix.length));
const MAX_SUFFIX_CHAIN = 4;
const MAX_REMAINDER_LENGTH = 12;
const VOWELS = new Set(["a", "e", "i", "o", "u"]);

/** Sert ünsüzle biten kökün yumuşamış hali: kitap → kitab, renk → reng. */
const SOFTENING: Readonly<Record<string, string>> = { p: "b", t: "d", k: "g" };

function endsWithVowel(text: string): boolean {
  return VOWELS.has(text.at(-1) ?? "");
}

function fitsAfter(rule: SuffixRule, precedingEndsWithVowel: boolean): boolean {
  if (rule.follows === "any") return true;
  return rule.follows === "vowel" ? precedingEndsWithVowel : !precedingEndsWithVowel;
}

/** `remainder`, `preceding` biçiminden sonra gelebilecek bir ek dizisi mi? */
function isSuffixChain(remainder: string, preceding: string, depth = 0): boolean {
  if (remainder.length === 0) return true;
  if (depth >= MAX_SUFFIX_CHAIN) return false;

  const precedingEndsWithVowel = endsWithVowel(preceding);
  const longest = Math.min(MAX_SUFFIX_LENGTH, remainder.length);

  for (let length = longest; length >= 1; length -= 1) {
    const suffix = remainder.slice(0, length);
    const rule = SUFFIX_RULES[suffix];
    if (!rule) continue;
    if (rule.stemOnly && depth > 0) continue;
    if (!fitsAfter(rule, precedingEndsWithVowel)) continue;

    const rest = remainder.slice(length);
    if (rest.length === 0) return true;
    if (rule.terminal) continue;
    if (isSuffixChain(rest, suffix, depth + 1)) return true;
  }
  return false;
}

function softenedStem(stem: string): string | null {
  const last = stem.at(-1);
  if (!last || !(last in SOFTENING) || stem.length < 3) return null;
  return stem.slice(0, -1) + SOFTENING[last];
}

/**
 * `token`, `stem` kökünün kendisi ya da çekimli hali mi?
 * Her iki girdi de katlanmış olmalıdır.
 */
export function isInflectionOf(token: string, stem: string): boolean {
  if (token === stem) return true;
  if (token.length <= stem.length || token.length - stem.length > MAX_REMAINDER_LENGTH) return false;

  if (token.startsWith(stem) && isSuffixChain(token.slice(stem.length), stem)) return true;

  const softened = softenedStem(stem);
  if (softened && token.startsWith(softened)) {
    const remainder = token.slice(softened.length);
    // Yumuşama yalnızca ünlüyle başlayan ekten önce olur (kitab-ı, reng-i).
    return VOWELS.has(remainder[0] ?? "") && isSuffixChain(remainder, softened);
  }
  return false;
}

/**
 * `stem` kökünün her çekimli biçiminde değişmeden kalan baş kısmı. Kök ya
 * aynen ya da son ünsüzü yumuşamış olarak geçtiği için, yumuşayabilen son
 * harf atılır. Büyük arşivlerde kaba ön süzgeç (LIKE) için kullanılır; asıl
 * eşleşme kararını yine `isInflectionOf` verir.
 */
export function stablePrefix(stem: string): string {
  return softenedStem(stem) === null ? stem : stem.slice(0, -1);
}

export type TermMode = "inflect" | "exact" | "prefix";

/** Tek kelime eşleşmesi: çekim farkında, birebir ya da ön ek. */
export function tokenMatches(token: string, term: string, mode: TermMode): boolean {
  switch (mode) {
    case "exact":
      return token === term;
    case "prefix":
      return token.startsWith(term);
    case "inflect":
      return isInflectionOf(token, term);
  }
}
