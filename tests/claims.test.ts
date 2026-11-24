import { beforeAll, describe, expect, it } from "vitest";
import type { Project } from "@/domain/types";
import { buildMatchPrompt } from "@/server/ai/prompt";
import type { AiProvider, ClaimsDraft, MatchDraft, MatchRequest } from "@/server/ai/types";
import { ensureSeeded } from "@/server/setup/seed";
import { FactCheckUnavailableError, type FactCheck } from "@/server/factcheck/google";
import { getLatestClaimRun } from "@/server/repositories/claims";
import { listProjects } from "@/server/repositories/projects";
import { listWorkspaces } from "@/server/repositories/workspaces";
import { CLAIM_LIMIT, scanClaims } from "@/server/services/claims";

/** İddia taraması sahte sağlayıcı ve sahte doğrulama aramasıyla sınanır; dış hizmete istek gitmez. */

const NOW = Date.parse("2026-11-12T14:30:00+03:00");
let project: Project;

function fakeProvider(claims: ClaimsDraft["claims"], match: (request: MatchRequest) => MatchDraft["matches"] = () => []): AiProvider & { matchRequests: MatchRequest[] } {
  const matchRequests: MatchRequest[] = [];
  return {
    id: "sahte",
    label: "Sahte sağlayıcı",
    model: "sahte-model",
    classifyModel: "sahte-sinif",
    location: "local",
    matchRequests,
    summarize: async () => ({ summary: "", themes: [], inputTokens: null, outputTokens: null }),
    classify: async () => ({ results: [], inputTokens: null, outputTokens: null }),
    answer: async () => ({ answer: "", mentionNumbers: [], inputTokens: null, outputTokens: null }),
    extractClaims: async () => ({ claims, inputTokens: 10, outputTokens: 5 }),
    matchFactChecks: async (request) => {
      matchRequests.push(request);
      return { matches: match(request), inputTokens: 10, outputTokens: 5 };
    },
  };
}

function check(url: string, rating: string): FactCheck {
  return { publisherName: "Örnek Doğrulama", publisherSite: "ornek.example", url, title: "Başlık", rating, reviewDate: NOW, claimText: "İncelenen iddia", language: "tr" };
}

beforeAll(async () => {
  await ensureSeeded(NOW);
  project = (await listProjects((await listWorkspaces())[0].id))[0];
});

describe("eşleştirme istemi", () => {
  it("iddiaları ve adayları numarasıyla listeler", () => {
    const prompt = buildMatchPrompt({
      claims: [
        { number: 2, text: "Su kesintisi üç gün sürdü.", candidates: [{ number: 1, claimText: "Kesinti bir hafta sürdü", title: "Başlık", publisher: "Teyit", rating: "Yanlış" }] },
      ],
    });
    expect(prompt).toContain("İddia [2]: Su kesintisi üç gün sürdü.");
    expect(prompt).toContain("Aday [1] (Teyit; derecelendirme: Yanlış)");
  });
});

describe("iddia taraması", () => {
  it("sağlayıcı yokken kapalıdır", async () => {
    expect(await scanClaims(project, "7g", NOW, null, null)).toMatchObject({ ok: false, reason: "disabled" });
    expect(await getLatestClaimRun(project.id, "7g")).toBeNull();
  });

  it("dayanağı olmayan iddiayı atar, yalnızca modelin eşleştirdiği doğrulamaları saklar", async () => {
    const provider = fakeProvider(
      [
        { text: "  Su kesintisi üç gün sürdü.  ", mentionNumbers: [1, 2, 2, 9999], searchQueries: ["su kesintisi üç gün", "water outage three days", "üçüncü sorgu"] },
        { text: "Dayanağı olmayan iddia.", mentionNumbers: [9999, 0, 1.5], searchQueries: ["x"] },
        { text: "Tek içerikli iddia.", mentionNumbers: [3], searchQueries: ["tek"] },
      ],
      () => [
        { claimNumber: 1, candidateNumbers: [2, 2, 99] },
        { claimNumber: 99, candidateNumbers: [1] },
      ],
    );
    const queries: string[] = [];
    const outcome = await scanClaims(project, "30g", NOW, provider, async (query) => {
      queries.push(query);
      return query.startsWith("su")
        ? [check("https://ornek.example/a", "Yanlış"), check("https://ornek.example/b", "Doğru")]
        : query === "tek"
          ? []
          : [check("https://ornek.example/a", "Yanlış")];
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    // İddia başına en çok iki arama; üçüncü sorgu ve dayanaksız iddianın sorgusu gönderilmez.
    expect(queries).toEqual(["su kesintisi üç gün", "water outage three days", "tek"]);
    // Aynı adres iki aramada gelse de aday listesinde bir kez yer alır; adayı olmayan iddia modele sorulmaz.
    expect(provider.matchRequests[0].claims).toHaveLength(1);
    expect(provider.matchRequests[0].claims[0].candidates).toHaveLength(2);

    const { run } = outcome;
    expect(run.factCheckStatus).toBe("ok");
    expect(run.claims.map((claim) => claim.text)).toEqual(["Su kesintisi üç gün sürdü.", "Tek içerikli iddia."]);
    expect(run.claims[0].mentionIds).toHaveLength(2);
    expect(run.claims[0].checks.map((entry) => entry.url)).toEqual(["https://ornek.example/b"]);
    expect(run.claims[1].checks).toEqual([]);
    expect(Object.values(run.claims[0].platforms).reduce((sum, count) => sum + count, 0)).toBe(2);

    const stored = (await getLatestClaimRun(project.id, "30g"))!;
    expect(stored.claims.map((claim) => claim.text)).toEqual(run.claims.map((claim) => claim.text));
    expect(stored.claims[0].checks[0]).toMatchObject({ publisherName: "Örnek Doğrulama", rating: "Doğru" });
  });

  it("doğrulama araması kapalıyken iddiaları yine çıkarır ve durumu yazar", async () => {
    const provider = fakeProvider([{ text: "Bir iddia.", mentionNumbers: [1], searchQueries: ["bir"] }]);
    const disabled = await scanClaims(project, "24s", NOW, provider, null);
    expect(disabled).toMatchObject({ ok: true, run: { factCheckStatus: "disabled" } });

    const failing = await scanClaims(project, "24s", NOW, provider, async () => {
      throw new FactCheckUnavailableError("API etkin değil.");
    });
    expect(failing).toMatchObject({ ok: true, run: { factCheckStatus: "error", factCheckMessage: "API etkin değil." } });
    // Aynı proje ve dönem için yalnızca son tarama saklanır.
    expect((await getLatestClaimRun(project.id, "24s"))?.factCheckStatus).toBe("error");
    expect(provider.matchRequests).toHaveLength(0);
  });

  it("iddia sayısını sınırlar ve en çok içerikte geçeni öne alır", async () => {
    const many = Array.from({ length: CLAIM_LIMIT + 5 }, (_, index) => ({ text: `İddia ${index}`, mentionNumbers: index === 7 ? [1, 2, 3] : [1], searchQueries: [] }));
    const outcome = await scanClaims(project, "90g", NOW, fakeProvider(many), null);
    expect(outcome.ok && outcome.run.claims).toHaveLength(CLAIM_LIMIT);
    expect(outcome.ok && outcome.run.claims[0].text).toBe("İddia 7");
  });
});
