import type { Emotion } from "../../domain/types";

/**
 * Ton ve duygu sözlükleri. Tüm girişler katlanmış (ASCII, küçük harf) köklerdir.
 *
 * Bu sözlük "v1 sezgisel" bir tabandır: şeffaf, çevrimdışı ve denetlenebilir,
 * ama bir dil modelinin yerini tutmaz. Değerlendirme kümesi oluştuğunda aynı
 * arayüzün arkasına ince ayarlı bir model (ör. BERTurk tabanlı) takılabilir.
 *
 * Katlama bazı kelimeleri çakıştırır (sınır/sinir, açı/acı, şok/sok-ak); bu
 * yüzden kısa ve çok anlamlı kökler yalnızca kelimenin tamamı eşleşirse sayılır.
 */

export interface PolarEntry {
  /** -2 (çok olumsuz) … +2 (çok olumlu). */
  weight: number;
  /** Fiil kökü: içine olumsuzluk eki alabilir (beğen-me-dim). */
  verb?: boolean;
  /** Yalnızca kelimenin tamamı eşleşirse geçerli. */
  exact?: boolean;
}

function entries(weight: number, stems: string, options: Omit<PolarEntry, "weight"> = {}): Array<[string, PolarEntry]> {
  return stems
    .split(/\s+/)
    .filter(Boolean)
    .map((stem) => [stem, { weight, ...options }]);
}

export const TURKISH_POLARITY: ReadonlyMap<string, PolarEntry> = new Map([
  // güçlü olumlu
  ...entries(2, "harika mukemmel muhtesem sahane kusursuz efsane bayildim bayiliyorum bayildi"),
  ...entries(
    1.5,
    "super tesekkur sagol memnun basari kaliteli guzel guvenilir tebrik bravo helal takdir minnettar mutlu faydali yararli sorunsuz eksiksiz zamaninda nazik kibar guleryuzlu lezzetli guvenli ozenli hayran odul",
  ),
  ...entries(1.5, "begen sevin cozul duzel iyiles", { verb: true }),
  ...entries(1.5, "seviyorum sevdim severim sevdik", { exact: true }),
  // ılımlı olumlu
  ...entries(1, "iyi hizli tavsiye kolay pratik etkili verimli rahat keyif temiz saglam dayanikli profesyonel avantaj firsat rekor cozum kazanc umut"),
  // Tek başına ton belirlemeyen, birikince olumluya çeken iş dünyası kelimeleri.
  ...entries(0.5, "indirim uygun destek yatirim buyume gelisme"),

  // güçlü olumsuz
  ...entries(-2, "berbat rezalet rezil felaket igrenc korkunc magdur dolandirici sahtekar skandal fahis soygun kazik hirsiz kepaze"),
  ...entries(-2, "dolandir kandir aldat", { verb: true }),
  ...entries(
    -1.5,
    "kotu yetersiz ariza bozuk hatali sikayet pisman sahte yalan kriz kesinti saygisiz terbiyesiz ilgisiz kaba magduriyet coktu cokuyor kirikligi vurgun ihmal guvensiz kalitesiz kirik ezilmis yirtik hasar pislik tehlike sizinti sizmis susuz dayanilmaz kayboldu",
  ),
  ...entries(-1.5, "bozul gecik", { verb: true }),
  ...entries(-1.5, "nefret biktim biktik bikti bikmis"),
  ...entries(-1.5, "pis", { exact: true }),
  // ılımlı olumsuz
  ...entries(
    -1,
    "sorun problem sikinti hata eksik pahali zam zamlar zamli zammi vasat yavas karisik aksaklik aksama tepki protesto grev zarar ceza iflas patlak bulanik kesik tasmis isgal baskin endise kayip ezik",
  ),
  ...entries(-1, "zor kaza", { exact: true }),
  ...entries(-0.8, "iptal koku"),
  // Tek başına nötr kalan, ancak başka sinyallerle birlikte şikâyeti güçlendiren kelimeler.
  ...entries(-0.3, "bekliyorum bekletiyor beklettiler hala iade iddia"),
]);

export const ENGLISH_POLARITY: ReadonlyMap<string, PolarEntry> = new Map([
  ...entries(2, "amazing excellent awesome outstanding perfect fantastic"),
  ...entries(1.5, "great love loved wonderful best happy impressive recommend thanks thank"),
  ...entries(1, "good nice fast helpful reliable easy smooth solid useful"),
  ...entries(-2, "terrible awful horrible worst scam fraud disgusting"),
  ...entries(-1.5, "bad hate hated broken useless disappointed disappointing angry unacceptable"),
  ...entries(-1, "slow poor problem issue bug fail failed failing expensive refund outage delay delayed"),
]);

/** Kendinden önceki ton kelimesini tersine çeviren kelimeler ("iyi değil", "sorun yok"). */
export const TURKISH_NEGATORS: ReadonlySet<string> = new Set([
  "degil",
  "degildi",
  "degilim",
  "degiliz",
  "degildir",
  "yok",
  "yoktu",
  "diyemem",
  "diyemeyiz",
  "denemez",
  "denmez",
  "sayilmaz",
]);

export const ENGLISH_NEGATORS: ReadonlySet<string> = new Set(["not", "no", "never", "don", "doesn", "didn", "isn", "wasn", "aren", "won", "wouldn", "cannot"]);

/** Kendinden sonraki ton kelimesini güçlendirenler. */
export const INTENSIFIERS: ReadonlySet<string> = new Set([
  "cok",
  "asiri",
  "gercekten",
  "resmen",
  "inanilmaz",
  "bayagi",
  "epey",
  "fazla",
  "tam",
  "very",
  "really",
  "so",
  "extremely",
]);

/**
 * Hizmet bağlamındaki fiil kökleri. Bunların olumsuzu ya da yeterlik
 * olumsuzu ("gelmedi", "ulaşamıyorum", "açılmıyor") tek başına şikâyet
 * sinyalidir, sözlükte olumsuz bir kelime olmasa bile.
 */
export const SERVICE_VERB_STEMS: readonly string[] = [
  "gel",
  "ulas",
  "gir",
  "acil",
  "ac",
  "calis",
  "yukle",
  "yap",
  "ver",
  "coz",
  "don",
  "ilgilen",
  "al",
  "ode",
  "yat",
  "cik",
  "gonder",
  "ara",
  "cevapla",
  "yanitla",
  "isle",
  "guncelle",
  "baglan",
  "tamamla",
  "onar",
  "bul",
  "degis",
];

/** Yardımcı fiillerin olumsuzu: önceki ton kelimesini çevirir ("tavsiye etmiyorum"). */
export const LIGHT_VERB_STEMS: readonly string[] = ["et", "ed", "ol"];

/**
 * Hizmet adları. Olumsuz bir yardımcı fiil ya da "yok" ile birlikte geçince
 * ("teslim edilmedi", "dönüş yok") hizmet aksaklığı sayılır.
 */
export const SERVICE_NOUNS: ReadonlySet<string> = new Set([
  "teslim",
  "iade",
  "telefon",
  "cevap",
  "yanit",
  "donus",
  "yardim",
  "aciklama",
  "bilgi",
  "haber",
  "kontrol",
  "tamir",
  "onarim",
  "odeme",
  "mudahale",
  "kabul",
  "duyuru",
  "acan",
  "ilgilenen",
  "muhatap",
]);

/** Fiil kökünden sonra gelen olumsuzluk / yeterlik olumsuzu ekleri (katlanmış). */
export const VERB_NEGATION = /^(?:il|ul|in|un|n|dir|tir|dur|tur|t)?(?:[ae])?(?:m[ae]d[iu]|m[iu]yo|m[ae]z|m[ae]mis|m[ae]y[ae]c|m[ae]yin|m[ae]sin)/;

/** Övgü kelimeleri: olumsuz bir hizmet sinyaliyle birlikte geçerse ironi şüphesi doğar. */
export const PRAISE_STEMS: readonly string[] = ["harika", "tebrik", "bravo", "helal", "super", "aferin", "tesekkur", "sagol", "mukemmel", "muhtesem", "sahane"];

/**
 * Duygu kökleri. "=" ile başlayanlar yalnızca kelimenin tamamıyla eşleşir;
 * diğerleri kelimenin başında aranır.
 */
export const EMOTION_STEMS: Readonly<Record<Exclude<Emotion, "none">, readonly string[]>> = {
  anger: [
    "rezalet",
    "rezil",
    "=yeter",
    "bikti",
    "sinirlen",
    "sinirli",
    "ofke",
    "kizgin",
    "kizdim",
    "utanin",
    "utanmaz",
    "kepaze",
    "sacma",
    "lanet",
    "nefret",
    "isyan",
    "cildir",
    "delir",
    "terbiyesiz",
    "saygisiz",
    "skandal",
    "protesto",
    "hakaret",
  ],
  joy: ["harika", "mukemmel", "super", "bayil", "mutlu", "sevin", "tesekkur", "muhtesem", "sahane", "efsane", "tebrik", "keyif"],
  sadness: ["uzul", "uzgun", "uzucu", "yazik", "maalesef", "kirgin", "kirikligi", "pisman", "vefat", "=aci"],
  fear: ["kork", "endise", "kaygi", "tedirgin", "tehlike", "guvensiz", "panik", "tehdit", "urkutucu"],
  surprise: ["sasir", "saskin", "inanamiyorum", "inanilmaz", "=sok", "beklenmedik", "hayret"],
  disgust: ["igrenc", "tiksin", "pislik", "kokusmus", "bocek", "igren", "=pis", "dayanilmaz"],
};

export const POSITIVE_EMOJI = /[😍🥰😊😁👏👍🙏🎉❤💚💙😀🤩✨💯]/gu;
export const NEGATIVE_EMOJI = /[😡🤬😠👎💔😤😢😭🤮🤢😞😒😩]/gu;
export const SARCASM_MARKERS = /\(\s*!\s*\)|🙄|🙃/u;

export const EMOTION_EMOJI: Readonly<Record<Exclude<Emotion, "none">, RegExp>> = {
  anger: /[😡🤬😠😤]/gu,
  joy: /[😍🥰😊😁🎉🤩]/gu,
  sadness: /[😢😭💔😞]/gu,
  fear: /[😨😱😰]/gu,
  surprise: /[😮😲🤯]/gu,
  disgust: /[🤮🤢]/gu,
};
