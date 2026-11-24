import { TIMEZONE } from "./time";

/**
 * Türkçe biçimlendirme. Sunucu ve tarayıcı aynı işlevleri kullanır; saat
 * dilimi her zaman açıkça verilir ki iki tarafta farklı çıktı oluşmasın.
 */

const LOCALE = "tr-TR";

const integer = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 0 });
const oneDecimal = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 1 });
const compact = new Intl.NumberFormat(LOCALE, { notation: "compact", maximumFractionDigits: 1 });

export function formatNumber(value: number): string {
  return integer.format(value);
}

/** 12.940 → "12,9 B"; 10.000'in altında tam yazılır. */
export function formatCompact(value: number): string {
  return Math.abs(value) < 10_000 ? integer.format(value) : compact.format(value);
}

export function formatDecimal(value: number): string {
  return oneDecimal.format(value);
}

/** 0,382 → "%38". Türkçe'de yüzde işareti sayıdan önce gelir. */
export function formatPercent(ratio: number): string {
  return `%${integer.format(Math.round(ratio * 100))}`;
}

/** Değişim oranı: +0,38 → "+%38", -0,12 → "−%12". Önceki değer 0 ise null. */
export function formatChange(current: number, previous: number): string | null {
  if (previous === 0) return null;
  const ratio = (current - previous) / previous;
  const rounded = Math.round(Math.abs(ratio) * 100);
  if (rounded === 0) return "değişmedi";
  return `${ratio > 0 ? "+" : "−"}%${integer.format(rounded)}`;
}

/** İşaretli tam sayı: 12 → "+12", -7 → "−7". */
export function formatSigned(value: number): string {
  const rounded = Math.round(value);
  if (rounded === 0) return "0";
  return `${rounded > 0 ? "+" : "−"}${integer.format(Math.abs(rounded))}`;
}

function formatter(options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat(LOCALE, { timeZone: TIMEZONE, ...options });
}

const dayMonth = formatter({ day: "numeric", month: "short" });
const dayMonthLong = formatter({ day: "numeric", month: "long", weekday: "long" });
const fullDate = formatter({ day: "numeric", month: "long", year: "numeric", weekday: "long" });
const time = formatter({ hour: "2-digit", minute: "2-digit" });
const dateTime = formatter({ day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const hourOnly = formatter({ hour: "2-digit", minute: "2-digit" });

/** "12 Kas" */
export function formatDay(timestamp: number): string {
  return dayMonth.format(timestamp);
}

/** "12 Kasım Perşembe" */
export function formatDayLong(timestamp: number): string {
  return dayMonthLong.format(timestamp);
}

/** "12 Kasım 2026 Perşembe" */
export function formatFullDate(timestamp: number): string {
  return fullDate.format(timestamp);
}

/** "14:30" */
export function formatTime(timestamp: number): string {
  return time.format(timestamp);
}

/** "12 Kas 14:30" */
export function formatDateTime(timestamp: number): string {
  return dateTime.format(timestamp);
}

/** Kova etiketi: günlük kovada "12 Kas", saatlik kovada "14:00". */
export function formatBucket(timestamp: number, bucket: "hour" | "day"): string {
  return bucket === "day" ? dayMonth.format(timestamp) : hourOnly.format(timestamp);
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** "az önce", "4 dk önce", "3 sa önce", "2 gün önce"; daha eskisi için tarih. */
export function formatRelative(timestamp: number, now: number): string {
  const elapsed = now - timestamp;
  if (elapsed < MINUTE) return "az önce";
  if (elapsed < HOUR) return `${Math.floor(elapsed / MINUTE)} dk önce`;
  if (elapsed < DAY) return `${Math.floor(elapsed / HOUR)} sa önce`;
  if (elapsed < 7 * DAY) return `${Math.floor(elapsed / DAY)} gün önce`;
  return dayMonth.format(timestamp);
}
