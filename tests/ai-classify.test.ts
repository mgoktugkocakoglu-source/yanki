import { beforeAll, describe, expect, it } from "vitest";
import { effectiveSentiment, type Project } from "@/domain/types";
import { parseQuery } from "@/lib/query";
import { resolveRange } from "@/lib/time";
import { buildClassifyPrompt } from "@/server/ai/prompt";
import { AiError, type AiProvider, type ClassifyDraft, type ClassifyRequest } from "@/server/ai/types";
import { ensureSeeded } from "@/server/setup/seed";
import { retagProject } from "@/server/pipeline/retag";
import { summarize } from "@/server/repositories/metrics";
import { countAiClassified, countMentions, getMention, listUnclassified, setSentimentOverride } from "@/server/repositories/mentions";
import { listProjects, listTopics } from "@/server/repositories/projects";
import { listWorkspaces } from "@/server/repositories/workspaces";
import { classifyMentions, CLASSIFY_BATCH_SIZE, CLASSIFY_RUN_LIMIT } from "@/server/services/ai-classify";

/** Dil modeli sınıflandırması sahte bir sağlayıcıyla sınanır; testler dış hizmete istek göndermez. */

const NOW = Date.parse("2026-11-12T14:30:00+03:00");
let project: Project;

function fakeProvider(respond: (request: ClassifyRequest) => Promise<ClassifyDraft>): AiProvider & { requests: ClassifyRequest[] } {
  const requests: ClassifyRequest[] = [];
  return {
    id: "sahte",
    label: "Sahte sağlayıcı",
    model: "sahte-ozet",
    classifyModel: "sahte-sinif",
    location: "local",
    requests,
    summarize: async () => ({ summary: "", themes: [], inputTokens: null, outputTokens: null }),
    extractClaims: async () => ({ claims: [], inputTokens: null, outputTokens: null }),
    matchFactChecks: async () => ({ matches: [], inputTokens: null, outputTokens: null }),
    answer: async () => ({ answer: "", mentionNumbers: [], inputTokens: null, outputTokens: null }),
    classify(request) {
      requests.push(request);
      return respond(request);
    },
  };
}

beforeAll(async () => {
  await ensureSeeded(NOW);
  // Demo alanının ikinci projesi kullanılır.
  project = (await listProjects((await listWorkspaces())[0].id))[1];
});

describe("sınıflandırma istemi", () => {
  it("konuları ve içerikleri numarasıyla listeler", () => {
    const prompt = buildClassifyPrompt({
      projectName: "Deneme",
      query: "kargo",
      topics: [{ number: 1, group: "Konu", name: "Gecikme" }],
      items: [{ number: 1, source: "Sosyal", text: "Harika, yine gecikti" }],
    });
    expect(prompt).toContain("[1] Konu: Gecikme");
    expect(prompt).toContain("[1] (Sosyal) Harika, yine gecikti");
  });
});

describe("dil modeliyle sınıflandırma", () => {
  it("sağlayıcı yokken kapalıdır", async () => {
    expect(await classifyMentions(project, "24s", NOW, null)).toMatchObject({ ok: false, reason: "disabled" });
  });

  it("tüm gruplar başarısızsa hatayı döndürür ve hiçbir şey yazmaz", async () => {
    const provider = fakeProvider(async () => {
      throw new AiError("İstek sınırına takıldı.");
    });
    const outcome = await classifyMentions(project, "24s", NOW, provider);
    expect(outcome).toEqual({ ok: false, reason: "failed", message: "İstek sınırına takıldı." });
    expect(await countAiClassified({ projectId: project.id })).toBe(0);
  });

  it("geçersiz sonuçları atar, geçerlileri kural tabanlı sonucu silmeden yazar", async () => {
    const range = resolveRange("24s", NOW);
    const filter = { projectId: project.id, range };
    const [first, second, third] = await listUnclassified(filter, CLASSIFY_RUN_LIMIT);
    const topics = await listTopics(project.id);
    const newTopic = topics.findIndex((topic) => !first.topicIds.includes(topic.id));
    const flipped = first.sentiment === "negative" ? "positive" : "negative";
    await setSentimentOverride(third.id, "positive");

    const provider = fakeProvider(async (request) => ({
      results:
        request === provider.requests[0]
          ? [
              { number: 1, sentiment: flipped, topicNumbers: [newTopic + 1, newTopic + 1, 9999] },
              { number: 1, sentiment: "neutral", topicNumbers: [] }, // yinelenen: atılır
              { number: 2, sentiment: "çok kötü", topicNumbers: [] }, // geçersiz ton: atılır
              { number: 3, sentiment: "negative", topicNumbers: [] },
              { number: 9999, sentiment: "neutral", topicNumbers: [] }, // gönderilmeyen numara: atılır
            ]
          : [],
      inputTokens: 100,
      outputTokens: 10,
    }));

    const before = await summarize(filter);
    const outcome = await classifyMentions(project, "24s", NOW, provider);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    expect(provider.requests.every((request) => request.items.length <= CLASSIFY_BATCH_SIZE)).toBe(true);
    expect(outcome).toMatchObject({ model: "sahte-sinif", classified: 2, toneChanged: third.sentiment === "negative" ? 1 : 2, topicsAdded: 1 });
    expect(outcome.remaining).toBe(await countMentions(filter) - 2);

    const reloaded = (await getMention(first.id))!;
    expect(reloaded).toMatchObject({ sentiment: first.sentiment, aiSentiment: flipped, aiModel: "sahte-sinif" });
    expect(effectiveSentiment(reloaded)).toBe(flipped);
    expect(reloaded.aiTopicIds).toEqual([topics[newTopic].id]);
    expect(reloaded.topicIds).toContain(topics[newTopic].id);

    // Geçersiz sonuç gelen içerik sınıflandırılmamış kalır.
    expect((await getMention(second.id))!.aiSentiment).toBeNull();
    // İnsan düzeltmesi dil modelinin önündedir.
    expect(effectiveSentiment((await getMention(third.id))!)).toBe("positive");

    // Sayımlar ve sorgu süzgeci geçerli tonu kullanır.
    const after = await summarize(filter);
    expect(after.total).toBe(before.total);
    expect(after[flipped]).toBe(before[flipped] + 1);
    expect(await countMentions({ ...filter, query: parseQuery(`ton:${flipped === "positive" ? "olumlu" : "olumsuz"}`) })).toBe(after[flipped]);

    // Yeniden etiketleme dil modelinin atadığı konuyu silmez.
    await retagProject(project.id);
    expect((await getMention(first.id))!.aiTopicIds).toEqual([topics[newTopic].id]);
  });
});
