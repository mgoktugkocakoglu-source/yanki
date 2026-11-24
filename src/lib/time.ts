import type { TimeRange } from "../domain/types";

/**
 * Zaman yardımcıları. Veriler UTC epoch milisaniye olarak saklanır; günlük ve
 * saatlik kovalar kurumun saat dilimine göre hesaplanır. Türkiye 2016'dan beri
 * yaz saati uygulamadığı için sabit +03:00 kayması yeterlidir.
 */

export const HOUR_MS = 3_600_000;
export const DAY_MS = 24 * HOUR_MS;
export const TIMEZONE = "Europe/Istanbul";
export const TIMEZONE_OFFSET_MS = 3 * HOUR_MS;

export type Bucket = "hour" | "day";

export const RANGE_PRESETS = {
  "24s": { label: "Son 24 saat", shortLabel: "24 saat", durationMs: DAY_MS, bucket: "hour" },
  "7g": { label: "Son 7 gün", shortLabel: "7 gün", durationMs: 7 * DAY_MS, bucket: "day" },
  "30g": { label: "Son 30 gün", shortLabel: "30 gün", durationMs: 30 * DAY_MS, bucket: "day" },
  "90g": { label: "Son 90 gün", shortLabel: "90 gün", durationMs: 90 * DAY_MS, bucket: "day" },
} as const satisfies Record<string, { label: string; shortLabel: string; durationMs: number; bucket: Bucket }>;

export type RangeKey = keyof typeof RANGE_PRESETS;
export const DEFAULT_RANGE: RangeKey = "30g";

export function isRangeKey(value: unknown): value is RangeKey {
  return typeof value === "string" && value in RANGE_PRESETS;
}

export function bucketSizeMs(bucket: Bucket): number {
  return bucket === "hour" ? HOUR_MS : DAY_MS;
}

/** Zaman damgasının ait olduğu kovanın başlangıcı (yerel saate göre hizalı, UTC ms). */
export function bucketStart(timestamp: number, bucket: Bucket): number {
  const size = bucketSizeMs(bucket);
  return Math.floor((timestamp + TIMEZONE_OFFSET_MS) / size) * size - TIMEZONE_OFFSET_MS;
}

/**
 * Seçili dönem. Bitiş, içinde bulunulan kovanın sonuna yuvarlanır ki son kova
 * yarım görünmesin ve liste ile grafik aynı aralığı kullansın.
 */
export function resolveRange(key: RangeKey, now: number): TimeRange {
  const { durationMs, bucket } = RANGE_PRESETS[key];
  const to = bucketStart(now, bucket) + bucketSizeMs(bucket);
  return { from: to - durationMs, to };
}

/** Karşılaştırma için hemen önceki eşit uzunluktaki dönem. */
export function previousRange(range: TimeRange): TimeRange {
  const duration = range.to - range.from;
  return { from: range.from - duration, to: range.from };
}

/** Aralıktaki tüm kova başlangıçları; veri olmayan kovalar da dahil. */
export function enumerateBuckets(range: TimeRange, bucket: Bucket): number[] {
  const size = bucketSizeMs(bucket);
  const starts: number[] = [];
  for (let start = bucketStart(range.from, bucket); start < range.to; start += size) {
    starts.push(start);
  }
  return starts;
}

/** Yerel saate göre haftanın günü (0 = Pazartesi … 6 = Pazar) ve saat. */
export function localWeekdayAndHour(timestamp: number): { weekday: number; hour: number } {
  const local = new Date(timestamp + TIMEZONE_OFFSET_MS);
  return { weekday: (local.getUTCDay() + 6) % 7, hour: local.getUTCHours() };
}
