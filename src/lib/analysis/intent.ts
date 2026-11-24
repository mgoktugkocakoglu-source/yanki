import type { Intent, Sentiment } from "../../domain/types";

/**
 * Yazının amacını kurallarla sınıflandırır. Girdi, kelimeleri tek boşlukla
 * birleştirilmiş katlanmış metindir; kalıplar bu yüzden ASCII yazılır.
 *
 * Öncelik sırası bilinçlidir: ayrılma sinyali şikâyetten, satın alma niyeti
 * genel sorudan daha değerlidir ve önce yakalanır.
 */

interface IntentRule {
  intent: Exclude<Intent, "general">;
  patterns: RegExp[];
  /** Kural yalnızca bu tonlardan biriyle birlikte geçerlidir. */
  requires?: Sentiment[];
}

const RULES: readonly IntentRule[] = [
  {
    intent: "churn",
    patterns: [
      /\biptal (ettim|ediyorum|edecegim|ettirdim|ettiriyorum)\b/,
      /\b(birakiyorum|biraktim|birakacagim|vazgectim|vazgeciyorum)\b/,
      /\b\w+[ae] (gectim|geciyorum|gececegim|gecis yaptim)\b/,
      /\b(hesabimi|uyeligimi|aboneligimi|hattimi) (kapat|iptal|sil|tasi)/,
      /\bbir daha (asla|kesinlikle)\b/,
      /\bson kez\b/,
      /\bgecsem mi\b/,
    ],
  },
  {
    intent: "purchase",
    patterns: [
      /\b(tavsiye|oneri)(si|niz|leriniz)? (eder misiniz|var mi|verir misiniz|alabilir miyim)\b/,
      /\b(onerir|tavsiye eder) misiniz\b/,
      /\bkullanan var mi\b/,
      /\b(almayi|gecmeyi|kullanmayi) dusunuyorum\b/,
      /\b(almak|satin almak|denemek) istiyorum\b/,
      /\b(almali miyim|deger mi|alinir mi)\b/,
      /\bhangisi(ni)? (daha iyi|almaliyim|onerirsiniz|tercih)\b/,
      /\b(nereden|nasil) (alabilirim|satin alabilirim|siparis verebilirim)\b/,
      /\bfiyati? (ne kadar|nedir)\b/,
      /\balternatif(i|ler|leri)? (var mi|ariyorum|oner)/,
    ],
  },
  {
    intent: "support",
    patterns: [
      /\b(yardim|yardimci) (eder misiniz|edin|olur musunuz|olabilir misiniz|lazim|istiyorum)\b/,
      /\bnasil (yapabilirim|yapilir|cozebilirim|ulasabilirim|duzeltebilirim)\b/,
      /\b(musteri hizmetleri|cagri merkezi|canli destek)(ne|ni|yle)? (ulas|bagla|cevap)/,
      /\bkim (yardimci|ilgilenecek|bakacak)\b/,
      /\b(acil|lutfen) (donus|destek|yardim|cozum)\b/,
      /\bdonus (bekliyorum|yapin|yapar misiniz)\b/,
    ],
  },
  {
    intent: "complaint",
    requires: ["negative"],
    patterns: [
      /\b(sikayet|magdur|rezalet|skandal)/,
      /\b(gelmedi|ulasmadi|teslim edilmedi|yapilmadi|cozulmedi|iade edilmedi|verilmedi)\b/,
      /\b\d+ (gun|hafta|ay|saat)(dur|dir|den beri)\b/,
      /\b(hala|halen) (bekliyorum|gelmedi|cozulmedi|donus yok)\b/,
      /\b(sorun|problem|ariza|hata|kesinti|gecikme)/,
    ],
  },
  {
    intent: "praise",
    requires: ["positive"],
    patterns: [/\b(tesekkur|tebrik|bravo|helal|takdir)/, /\b(memnun|harika|mukemmel|super|bayildim)/, /\btavsiye ederim\b/],
  },
];

export function classifyIntent(searchText: string, sentiment: Sentiment): Intent {
  for (const rule of RULES) {
    if (rule.requires && !rule.requires.includes(sentiment)) continue;
    if (rule.patterns.some((pattern) => pattern.test(searchText))) return rule.intent;
  }
  return "general";
}
