/**
 * Zaman serisi anomali tespiti (sezgisel v1).
 *
 * Her kova, kendi geçmişinin medyanı ve MAD'ı (medyan mutlak sapma) ile
 * karşılaştırılır. Ortalama ve standart sapma yerine bu sağlam istatistikler
 * kullanılır, çünkü önceki bir sıçrama taban çizgisini bozmamalıdır.
 *
 * Yanlış alarmı azaltan üç koruma vardır:
 *   - MAD sıfıra yakınsa ölçek için Poisson tabanı (√medyan) kullanılır;
 *     böylece dümdüz bir seride küçük bir oynama "anomali" olmaz.
 *   - En az hacim şartı: 2'den 6'ya çıkmak %200 artıştır ama kriz değildir.
 *   - Yeterli geçmiş yoksa hiç karar verilmez.
 */

export interface SeriesBucket {
  bucketStart: number;
  total: number;
  negative: number;
}

export type AnomalyKind = "volume" | "tone";
export type AnomalyLevel = "info" | "attention" | "critical";

export interface Anomaly {
  bucketStart: number;
  kinds: AnomalyKind[];
  level: AnomalyLevel;
  observed: number;
  /** Geçmişin medyanı: "olağan düzey". */
  baseline: number;
  /** Sağlam z-skoru: olağan düzeyden kaç ölçek birimi uzakta. */
  score: number;
  negativeShare: number;
  baselineNegativeShare: number;
}

/** Uyarı duyarlılığı: "high" daha küçük hareketleri de yakalar, "low" yalnızca belirgin olanları. */
export const SENSITIVITIES = ["low", "medium", "high"] as const;
export type Sensitivity = (typeof SENSITIVITIES)[number];

export interface AnomalyOptions {
  /** Karşılaştırma adımı: günlük seride 1, saatlik seride 24 (aynı saat). */
  seasonLength: number;
  /** Geriye bakılan en çok kova sayısı. */
  window: number;
  /** Karar vermek için gereken en az geçmiş kova. */
  minHistory: number;
  /** Varsayılan: "medium". */
  sensitivity?: Sensitivity;
}

export const DAILY_OPTIONS: AnomalyOptions = { seasonLength: 1, window: 28, minHistory: 7 };
export const HOURLY_OPTIONS: AnomalyOptions = { seasonLength: 24, window: 7, minHistory: 4 };

const SCORE_THRESHOLD = 3.5;
const CRITICAL_SCORE = 8;
const MIN_VOLUME = 8;
const MIN_RATIO = 1.5;
const MIN_NEGATIVE_COUNT = 6;
const TONE_SHARE_JUMP = 0.2;
const TONE_SHARE_RATIO = 1.6;
const MAD_TO_SIGMA = 1.4826;

/** Duyarlılığa göre eşikler. "medium" satırı yukarıdaki varsayılanlardır. */
const TUNING: Record<Sensitivity, { score: number; minVolume: number; minNegative: number; toneJump: number }> = {
  low: { score: 5, minVolume: 12, minNegative: 9, toneJump: 0.28 },
  medium: { score: SCORE_THRESHOLD, minVolume: MIN_VOLUME, minNegative: MIN_NEGATIVE_COUNT, toneJump: TONE_SHARE_JUMP },
  high: { score: 2.5, minVolume: 5, minNegative: 4, toneJump: 0.14 },
};

export function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

function historyOf(series: readonly SeriesBucket[], index: number, options: AnomalyOptions): SeriesBucket[] {
  const history: SeriesBucket[] = [];
  for (let step = 1; step <= options.window; step += 1) {
    const previous = series[index - step * options.seasonLength];
    if (!previous) break;
    history.push(previous);
  }
  return history;
}

function levelOf(kinds: AnomalyKind[], score: number, negativeShare: number): AnomalyLevel {
  // Yalnızca ton kayması: hacim olağan, olumsuz payı yükselmiş.
  if (!kinds.includes("volume")) return "attention";
  // Olumsuzluk taşımayan artış (kampanya, olumlu haber) bilgi düzeyindedir.
  if (negativeShare < 0.25) return "info";
  if (negativeShare >= 0.5 || score >= CRITICAL_SCORE) return "critical";
  return "attention";
}

/** `series` zamana göre sıralı ve boşlukları sıfırla doldurulmuş olmalıdır. */
export function detectAnomalies(series: readonly SeriesBucket[], options: AnomalyOptions): Anomaly[] {
  const anomalies: Anomaly[] = [];
  const tuning = TUNING[options.sensitivity ?? "medium"];

  series.forEach((bucket, index) => {
    const history = historyOf(series, index, options);
    if (history.length < options.minHistory) return;

    const totals = history.map((entry) => entry.total);
    const baseline = median(totals);
    const mad = median(totals.map((value) => Math.abs(value - baseline)));
    const scale = Math.max(MAD_TO_SIGMA * mad, Math.sqrt(Math.max(baseline, 1)));
    const score = (bucket.total - baseline) / scale;

    const historyTotal = totals.reduce((sum, value) => sum + value, 0);
    const historyNegative = history.reduce((sum, entry) => sum + entry.negative, 0);
    const baselineNegativeShare = historyTotal > 0 ? historyNegative / historyTotal : 0;
    const negativeShare = bucket.total > 0 ? bucket.negative / bucket.total : 0;

    const kinds: AnomalyKind[] = [];
    if (score >= tuning.score && bucket.total >= tuning.minVolume && bucket.total >= MIN_RATIO * Math.max(baseline, 1)) {
      kinds.push("volume");
    }
    if (bucket.negative >= tuning.minNegative && negativeShare - baselineNegativeShare >= tuning.toneJump && negativeShare >= TONE_SHARE_RATIO * baselineNegativeShare) {
      kinds.push("tone");
    }
    if (kinds.length === 0) return;

    anomalies.push({
      bucketStart: bucket.bucketStart,
      kinds,
      level: levelOf(kinds, score, negativeShare),
      observed: bucket.total,
      baseline,
      score: Number(score.toFixed(1)),
      negativeShare,
      baselineNegativeShare,
    });
  });

  return anomalies;
}
