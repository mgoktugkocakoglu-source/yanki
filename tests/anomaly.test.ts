import { describe, expect, it } from "vitest";
import { DAILY_OPTIONS, detectAnomalies, HOURLY_OPTIONS, median, type SeriesBucket } from "@/lib/stats/anomaly";
import { bucketStart, DAY_MS, enumerateBuckets, HOUR_MS, previousRange, resolveRange } from "@/lib/time";

function series(totals: number[], negativeShare: (index: number) => number = () => 0.2): SeriesBucket[] {
  return totals.map((total, index) => ({ bucketStart: index * DAY_MS, total, negative: Math.round(total * negativeShare(index)) }));
}

const steady = [30, 28, 33, 31, 29, 34, 30, 27, 32, 30, 31, 29, 33, 30];

describe("medyan", () => {
  it("tek ve çift uzunlukta doğru değeri verir", () => {
    expect(median([5, 1, 3])).toBe(3);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([])).toBe(0);
  });
});

describe("anomali tespiti", () => {
  it("olağan dalgalanmayı anomali saymaz", () => {
    expect(detectAnomalies(series([...steady, 36, 25, 33]), DAILY_OPTIONS)).toEqual([]);
  });

  it("belirgin bir sıçramayı yakalar ve olağan düzeyi bildirir", () => {
    const [anomaly] = detectAnomalies(series([...steady, 150]), DAILY_OPTIONS);
    expect(anomaly).toMatchObject({ kinds: ["volume"], observed: 150, baseline: 30 });
    expect(anomaly.score).toBeGreaterThan(8);
  });

  it("düşük hacimde büyük oranlı artışı kriz saymaz", () => {
    // 1'den 6'ya çıkmak %500 artıştır ama altı bahsetme bir olay değildir.
    expect(detectAnomalies(series([1, 2, 1, 0, 1, 2, 1, 1, 0, 1, 6]), DAILY_OPTIONS)).toEqual([]);
  });

  it("dümdüz bir seride (MAD = 0) küçük oynamaya alarm vermez", () => {
    const flat = Array.from({ length: 14 }, () => 20);
    expect(detectAnomalies(series([...flat, 26]), DAILY_OPTIONS)).toEqual([]);
    expect(detectAnomalies(series([...flat, 60]), DAILY_OPTIONS)).toHaveLength(1);
  });

  it("yeterli geçmiş yoksa karar vermez", () => {
    expect(detectAnomalies(series([10, 12, 300]), DAILY_OPTIONS)).toEqual([]);
  });

  it("hacim olağanken ton kaymasını ayrıca yakalar", () => {
    const [anomaly] = detectAnomalies(
      series([...steady, 31], (index) => (index === steady.length ? 0.7 : 0.2)),
      DAILY_OPTIONS,
    );
    expect(anomaly).toMatchObject({ kinds: ["tone"], level: "attention" });
  });

  it("düzeyi olumsuzluğa göre belirler", () => {
    const negativeSpike = detectAnomalies(series([...steady, 150], (index) => (index === steady.length ? 0.8 : 0.2)), DAILY_OPTIONS)[0];
    const positiveSpike = detectAnomalies(series([...steady, 150], (index) => (index === steady.length ? 0.05 : 0.2)), DAILY_OPTIONS)[0];
    expect(negativeSpike.level).toBe("critical");
    expect(positiveSpike.level).toBe("info");
  });

  it("önceki bir sıçrama taban çizgisini bozmaz", () => {
    const anomalies = detectAnomalies(series([...steady, 150, 31, 140]), DAILY_OPTIONS);
    expect(anomalies.map((anomaly) => anomaly.observed)).toEqual([150, 140]);
  });

  it("saatlik seride aynı saatle karşılaştırır", () => {
    // Her gün 12:00'de olağan bir tepe var; bu tepe anomali değildir.
    const hourly = Array.from({ length: 24 * 8 }, (_, index) => ({
      bucketStart: index * HOUR_MS,
      total: index % 24 === 12 ? 60 : 8,
      negative: 2,
    }));
    expect(detectAnomalies(hourly, HOURLY_OPTIONS)).toEqual([]);

    hourly[24 * 7 + 3].total = 70;
    expect(detectAnomalies(hourly, HOURLY_OPTIONS).map((anomaly) => anomaly.observed)).toEqual([70]);
  });
});

describe("zaman aralıkları", () => {
  const now = Date.parse("2026-11-12T14:30:00+03:00");

  it("günlük kovayı Türkiye saatine göre hizalar", () => {
    expect(new Date(bucketStart(now, "day")).toISOString()).toBe("2026-11-11T21:00:00.000Z");
    expect(new Date(bucketStart(Date.parse("2026-11-12T00:10:00+03:00"), "day")).toISOString()).toBe("2026-11-11T21:00:00.000Z");
    expect(new Date(bucketStart(Date.parse("2026-11-11T23:50:00+03:00"), "day")).toISOString()).toBe("2026-11-10T21:00:00.000Z");
  });

  it("dönem içinde bulunulan günün sonunda biter ve tam sayıda kova içerir", () => {
    const range = resolveRange("30g", now);
    expect(new Date(range.to).toISOString()).toBe("2026-11-12T21:00:00.000Z");
    expect(enumerateBuckets(range, "day")).toHaveLength(30);
    expect(enumerateBuckets(resolveRange("24s", now), "hour")).toHaveLength(24);
  });

  it("önceki dönem aynı uzunlukta ve bitişiktir", () => {
    const range = resolveRange("7g", now);
    const previous = previousRange(range);
    expect(previous.to).toBe(range.from);
    expect(previous.to - previous.from).toBe(range.to - range.from);
  });
});
