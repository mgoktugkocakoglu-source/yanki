import { beforeAll, describe, expect, it } from "vitest";
import { halves, MIN_BUCKET_VOLUME } from "@/components/charts/platform-trend";
import type { Project } from "@/domain/types";
import { DAILY_OPTIONS, detectAnomalies, type SeriesBucket } from "@/lib/stats/anomaly";
import { resolveRange } from "@/lib/time";
import type { AiProvider, AnswerRequest } from "@/server/ai/types";
import { ensureSeeded } from "@/server/demo/seed";
import { summarize } from "@/server/repositories/metrics";
import { listProjects } from "@/server/repositories/projects";
import { ensureShare, getActiveShare, listActiveShares, revokeShare } from "@/server/repositories/shares";
import { listWorkspaces } from "@/server/repositories/workspaces";
import { askQuestion, buildFacts } from "@/server/services/ai-ask";
import { findAnomalies } from "@/server/services/alerts";
import { getAnalysis } from "@/server/services/analysis";
import { getOverview } from "@/server/services/overview";

/** Rapor paylaşımı, soru sorma, uyarı duyarlılığı ve platform ton seyri. Dış hizmete istek gitmez. */

const NOW = Date.parse("2026-11-12T14:30:00+03:00");
let project: Project;

beforeAll(() => {
  ensureSeeded(NOW);
  project = listProjects(listWorkspaces()[0].id)[0];
});

describe("rapor paylaşım bağlantısı", () => {
  it("aynı proje ve dönem için tek etkin bağlantı tutar; iptal edilen açılmaz", () => {
    const first = ensureShare(project.workspaceId, project.id, "7g", NOW);
    expect(first.token.length).toBeGreaterThanOrEqual(32);
    expect(ensureShare(project.workspaceId, project.id, "7g", NOW + 1).token).toBe(first.token);
    expect(ensureShare(project.workspaceId, project.id, "30g", NOW).token).not.toBe(first.token);
    expect(getActiveShare(first.token)).toMatchObject({ projectId: project.id, rangeKey: "7g" });
    expect(listActiveShares(project.id)).toHaveLength(2);

    expect(revokeShare(first.token, NOW + 2)).toBe(true);
    expect(revokeShare(first.token, NOW + 3)).toBe(false);
    expect(getActiveShare(first.token)).toBeNull();
    expect(getActiveShare("olmayan-anahtar")).toBeNull();
    // İptalden sonra yeni bağlantı farklı bir anahtarla oluşur.
    expect(ensureShare(project.workspaceId, project.id, "7g", NOW + 4).token).not.toBe(first.token);
  });
});

describe("düz yazıyla soru", () => {
  function fakeProvider(reply: (request: AnswerRequest) => { answer: string; mentionNumbers: number[] }): AiProvider & { requests: AnswerRequest[] } {
    const requests: AnswerRequest[] = [];
    return {
      id: "sahte",
      label: "Sahte sağlayıcı",
      model: "sahte-model",
      classifyModel: "sahte-sinif",
      location: "local",
      requests,
      summarize: async () => ({ summary: "", themes: [], inputTokens: null, outputTokens: null }),
      classify: async () => ({ results: [], inputTokens: null, outputTokens: null }),
      extractClaims: async () => ({ claims: [], inputTokens: null, outputTokens: null }),
      matchFactChecks: async () => ({ matches: [], inputTokens: null, outputTokens: null }),
      answer: async (request) => {
        requests.push(request);
        return { ...reply(request), inputTokens: 1, outputTokens: 1 };
      },
    };
  }

  it("ölçüm dökümü panelin sayılarıyla aynıdır", () => {
    const overview = getOverview(project, "30g", NOW);
    const facts = buildFacts(overview);
    const summary = summarize({ projectId: project.id, range: resolveRange("30g", NOW) });
    expect(facts).toContain(`Toplam içerik: ${summary.total}`);
    expect(facts).toContain(`olumsuz ${summary.negative}`);
    expect(facts).toContain("Platformlar:");
  });

  it("geçersiz soruyu ve kapalı sağlayıcıyı modele gitmeden reddeder", async () => {
    const provider = fakeProvider(() => ({ answer: "x", mentionNumbers: [] }));
    expect(await askQuestion(project, "30g", "ne?", NOW, null)).toMatchObject({ ok: false, reason: "disabled" });
    expect(await askQuestion(project, "30g", "  a ", NOW, provider)).toMatchObject({ ok: false, reason: "invalid" });
    expect(await askQuestion(project, "30g", "x".repeat(301), NOW, provider)).toMatchObject({ ok: false, reason: "invalid" });
    expect(provider.requests).toHaveLength(0);
  });

  it("soruyu ölçümlerle birlikte gönderir ve geçersiz dayanağı atar", async () => {
    const provider = fakeProvider(() => ({ answer: "  Su kesintisi öne çıktı.  ", mentionNumbers: [2, 2, 9999, 0] }));
    const outcome = await askQuestion(project, "30g", "En çok ne konuşuldu?", NOW, provider);
    expect(outcome).toMatchObject({ ok: true, answer: "Su kesintisi öne çıktı.", model: "sahte-model" });
    expect(outcome.ok && outcome.evidenceIds).toHaveLength(1);
    expect(provider.requests[0].question).toBe("En çok ne konuşuldu?");
    expect(provider.requests[0].facts).toContain("Toplam içerik:");
  });
});

describe("uyarı duyarlılığı", () => {
  const flat = (total: number, negative = 0): SeriesBucket[] => Array.from({ length: 14 }, (_, index) => ({ bucketStart: index, total, negative }));

  it("aynı seride yüksek duyarlılık daha çok, düşük duyarlılık daha az hareket bulur", () => {
    // Olağan düzey 10; son gün 22: orta eşiğin biraz üstünde, düşük eşiğin altında.
    const series = [...flat(10), { bucketStart: 14, total: 22, negative: 2 }];
    const count = (sensitivity: "low" | "medium" | "high") => detectAnomalies(series, { ...DAILY_OPTIONS, sensitivity }).length;
    expect(count("medium")).toBe(1);
    expect(count("low")).toBe(0);
    expect(count("high")).toBe(1);

    // Küçük oynama: yalnızca yüksek duyarlılık yakalar.
    const mild = [...flat(10), { bucketStart: 14, total: 18, negative: 1 }];
    expect(detectAnomalies(mild, { ...DAILY_OPTIONS, sensitivity: "medium" })).toHaveLength(0);
    expect(detectAnomalies(mild, { ...DAILY_OPTIONS, sensitivity: "high" })).toHaveLength(1);
  });

  it("varsayılan duyarlılık ortadır ve demo verisinde sıralama korunur", () => {
    const range = resolveRange("30g", NOW);
    const medium = findAnomalies(project.id, range, "day");
    expect(findAnomalies(project.id, range, "day", "medium")).toEqual(medium);
    expect(findAnomalies(project.id, range, "day", "low").length).toBeLessThanOrEqual(medium.length);
    expect(findAnomalies(project.id, range, "day", "high").length).toBeGreaterThanOrEqual(medium.length);
  });
});

describe("platforma göre ton seyri", () => {
  it("platform toplamları özete eşittir", () => {
    const analysis = getAnalysis(project, "30g", NOW);
    const total = analysis.platformTrend.reduce((sum, row) => sum + row.total, 0);
    const negative = analysis.platformTrend.reduce((sum, row) => sum + row.points.reduce((inner, point) => inner + point.negative, 0), 0);
    expect(total).toBe(analysis.summary.total);
    expect(negative).toBe(analysis.summary.negative);
    expect(new Set(analysis.platformTrend.map((row) => row.points.length)).size).toBe(1);
  });

  it("az içerikli yarı için oran hesaplamaz", () => {
    const point = (total: number, negative: number) => ({ bucketStart: 0, total, negative });
    expect(halves([point(10, 5), point(10, 0)])).toEqual({ first: 0.5, second: 0 });
    expect(halves([point(MIN_BUCKET_VOLUME - 1, 1), point(10, 2)])).toEqual({ first: null, second: 0.2 });
  });
});
