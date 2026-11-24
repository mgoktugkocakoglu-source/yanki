/**
 * Metrik sözlüğü. Arayüzdeki her sayının yanındaki "nasıl hesaplanır?"
 * açıklaması buradan gelir; tanım ile hesap aynı yerde tutulur ki ikisi
 * birbirinden kopmasın.
 */

export interface MetricDefinition {
  name: string;
  formula: string;
  notes: string;
}

/** Net ton: -100 (tamamı olumsuz) … +100 (tamamı olumlu). Sınıflandırılmış içerik yoksa null. */
export function netTone(positive: number, negative: number): number | null {
  const classified = positive + negative;
  return classified === 0 ? null : Math.round(((positive - negative) / classified) * 100);
}

export function share(part: number, whole: number): number {
  return whole === 0 ? 0 : part / whole;
}

export const METRICS = {
  mentions: {
    name: "Bahsetme",
    formula: "Seçili dönemde proje sorgusuyla eşleşen tekil içerik sayısı.",
    notes: "Aynı içerik bir kaynaktan iki kez gelirse bir kez sayılır. “İlgisiz” işaretlediğiniz içerikler sayıma girmez.",
  },
  stories: {
    name: "Tekil hikâye",
    formula: "Başlığının ilk 12 kelimesi aynı olan içerikler tek hikâye sayılır.",
    notes: "Bir ajans haberini 40 site yayımlarsa bu 40 bahsetme ama 1 hikâyedir. Kümeleme yaklaşıktır; farklı haberler nadiren birleşebilir.",
  },
  netTone: {
    name: "Net ton",
    formula: "(Olumlu − Olumsuz) ÷ (Olumlu + Olumsuz) × 100",
    notes:
      "Nötr içerik formüle girmez. −100 ile +100 arasındadır. Ton, sözlük ve kural tabanlı bir çözümleyiciyle belirlenir; düzelttiğiniz içeriklerde sizin kararınız geçerlidir.",
  },
  negativeShare: {
    name: "Olumsuz oranı",
    formula: "Olumsuz ÷ tüm bahsetmeler",
    notes: "Payda nötr içeriği de kapsar.",
  },
  engagement: {
    name: "Gözlenen etkileşim",
    formula: "Beğeni + yanıt + yeniden paylaşım (içerik toplandığı andaki değerler).",
    notes: "Yalnızca kaynağın bu sayıları verdiği içeriklerde hesaplanır; haber sitelerinde bulunmaz. Platformlar arasında tanımlar farklıdır, tekil kişi sayısı değildir.",
  },
  reach: {
    name: "Erişim tabanı",
    formula: "Yazarın takipçi sayısı (video içeriklerinde görüntülenme).",
    notes: "Olası en geniş kitleyi gösterir; gerçek görüntülenme ya da tekil kişi sayısı değildir. Kaynak bu veriyi vermiyorsa sayı uydurulmaz, alan boş kalır.",
  },
  shareOfVoice: {
    name: "Ses payı",
    formula: "Projenin bahsetme sayısı ÷ karşılaştırılan projelerin toplam bahsetme sayısı",
    notes: "Yalnızca aynı dönem ve aynı kaynak kümesi için anlamlıdır. Payın yüksek olması olumlu algı demek değildir; tonla birlikte okunmalıdır.",
  },
  anomaly: {
    name: "Olağan dışı hareket",
    formula: "Sağlam z-skoru = (gözlenen − medyan) ÷ en büyük(1,4826 × MAD, √medyan). Eşik: 3,5.",
    notes:
      "Medyan ve MAD, önceki 28 günden (saatlik görünümde önceki 7 günün aynı saatinden) hesaplanır. En az 8 bahsetme ve olağan düzeyin 1,5 katı şartı aranır. Sezgisel bir uyarıdır; kesin bir kriz tespiti değildir.",
  },
} as const satisfies Record<string, MetricDefinition>;

export type MetricId = keyof typeof METRICS;
