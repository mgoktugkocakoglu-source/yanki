import { beforeAll, describe, expect, it } from "vitest";
import type { Project } from "@/domain/types";
import { buildSummaryPrompt, clipText, ITEM_TEXT_LIMIT } from "@/server/ai/prompt";
import { AiError, type AiProvider, type SummaryRequest } from "@/server/ai/types";
import { ensureSeeded } from "@/server/setup/seed";
import { getLatestAiSummary } from "@/server/repositories/ai-summaries";
import { listProjects } from "@/server/repositories/projects";
import { listWorkspaces } from "@/server/repositories/workspaces";
import { generateAiSummary, SUMMARY_MENTION_LIMIT } from "@/server/services/ai-summary";

/** Yapay zekâ özeti sahte bir sağlayıcıyla sınanır; testler dış hizmete istek göndermez. */

const NOW = Date.parse("2026-11-12T14:30:00+03:00");
let project: Project;

function fakeProvider(respond: (request: SummaryRequest) => ReturnType<AiProvider["summarize"]>): AiProvider & { requests: SummaryRequest[] } {
  const requests: SummaryRequest[] = [];
  return {
    id: "sahte",
    label: "Sahte sağlayıcı",
    model: "sahte-model",
    classifyModel: "sahte-model",
    location: "local",
    requests,
    summarize(request) {
      requests.push(request);
      return respond(request);
    },
    classify: async () => ({ results: [], inputTokens: null, outputTokens: null }),
    extractClaims: async () => ({ claims: [], inputTokens: null, outputTokens: null }),
    matchFactChecks: async () => ({ matches: [], inputTokens: null, outputTokens: null }),
    answer: async () => ({ answer: "", mentionNumbers: [], inputTokens: null, outputTokens: null }),
  };
}

beforeAll(() => {
  ensureSeeded(NOW);
  project = listProjects(listWorkspaces()[0].id)[0];
});

describe("özet istemi", () => {
  it("uzun metni sınırda keser ve boşlukları sadeleştirir", () => {
    const clipped = clipText(`a  b\n${"x".repeat(1000)}`);
    expect(clipped.startsWith("a b x")).toBe(true);
    expect(clipped.length).toBe(ITEM_TEXT_LIMIT + 1);
    expect(clipped.endsWith("…")).toBe(true);
  });

  it("içerikleri numarasıyla listeler", () => {
    const prompt = buildSummaryPrompt({
      projectName: "Deneme",
      query: "kargo",
      rangeLabel: "Son 7 gün",
      items: [{ number: 1, source: "Haber", publishedAt: NOW, text: "Kargo gecikti" }],
    });
    expect(prompt).toContain("[1] (Haber, 2026-11-12) Kargo gecikti");
    expect(prompt).toContain("İzleme sorgusu: kargo");
  });
});

describe("yapay zekâ özeti", () => {
  it("sağlayıcı yokken kapalıdır ve kayıt oluşturmaz", async () => {
    const outcome = await generateAiSummary(project, "7g", NOW, null);
    expect(outcome).toMatchObject({ ok: false, reason: "disabled" });
    expect(getLatestAiSummary(project.id, "7g")).toBeNull();
  });

  it("gönderilen içerik sayısını sınırlar ve sonucu kaynağıyla saklar", async () => {
    const provider = fakeProvider(async () => ({
      summary: "  Kargo gecikmeleri konuşuldu.  ",
      themes: [{ title: "Gecikme", description: "Teslimat şikâyetleri.", mentionNumbers: [1, 1, 2, 9999, 0, 1.5] }],
      inputTokens: 1200,
      outputTokens: 80,
    }));
    const outcome = await generateAiSummary(project, "30g", NOW, provider);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    const [request] = provider.requests;
    expect(request.items.length).toBeLessThanOrEqual(SUMMARY_MENTION_LIMIT);
    expect(request.items.every((item) => item.text.length <= ITEM_TEXT_LIMIT + 1)).toBe(true);

    const { summary } = outcome;
    expect(summary.summary).toBe("Kargo gecikmeleri konuşuldu.");
    expect(summary.model).toBe("sahte-model");
    expect(summary.mentionsSent).toBe(request.items.length);
    expect(summary.mentionsTotal).toBeGreaterThanOrEqual(summary.mentionsSent);
    // Gönderilmeyen, yinelenen ya da tam sayı olmayan numaralar atılır.
    expect(summary.themes[0].mentionIds).toHaveLength(2);
    expect(getLatestAiSummary(project.id, "30g")).toEqual(summary);
  });

  it("sağlayıcı hatasını kullanıcıya gösterilebilir iletiyle döndürür", async () => {
    const provider = fakeProvider(async () => {
      throw new AiError("API anahtarı geçersiz.");
    });
    const outcome = await generateAiSummary(project, "24s", NOW, provider);
    expect(outcome).toEqual({ ok: false, reason: "failed", message: "API anahtarı geçersiz." });
    expect(getLatestAiSummary(project.id, "24s")).toBeNull();
  });
});
