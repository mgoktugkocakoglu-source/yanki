import { beforeAll, describe, expect, it } from "vitest";
import { effectiveSentiment, type Project } from "@/domain/types";
import { EMPTY_FIELDS, matchQuery, parseQuery } from "@/lib/query";
import { resolveRange } from "@/lib/time";
import { queryAll } from "@/server/db/client";
import { ensureSeeded } from "@/server/setup/seed";
import { breakdown, summarize, timeSeries, topicBreakdown } from "@/server/repositories/metrics";
import { countMentions, listMentions, setIrrelevant, setSentimentOverride } from "@/server/repositories/mentions";
import { listProjects, listTopics } from "@/server/repositories/projects";
import { listWorkspaces } from "@/server/repositories/workspaces";

/**
 * Uçtan uca doğrulama: demo tohumlama gerçek ayrıştırma, çözümleme ve
 * eşleştirme hattından geçer; bu testler o hattın tutarlılığını sınar.
 * Veritabanı bellektedir (bkz. vitest.config.mts).
 */

const NOW = Date.parse("2026-11-12T14:30:00+03:00");
let project: Project;

beforeAll(() => {
  ensureSeeded(NOW);
  const demoWorkspace = listWorkspaces().find((workspace) => workspace.kind === "demo")!;
  project = listProjects(demoWorkspace.id)[0];
});

describe("tohumlama", () => {
  it("bir demo ve bir canlı çalışma alanı kurar", () => {
    expect(listWorkspaces().map((workspace) => workspace.kind).sort()).toEqual(["demo", "live"]);
  });

  it("yeniden çağrıldığında kayıt çoğaltmaz", () => {
    const before = countMentions({ projectId: project.id });
    ensureSeeded(NOW);
    expect(countMentions({ projectId: project.id })).toBe(before);
    expect(before).toBeGreaterThan(800);
  });

  it("gelecek tarihli kayıt üretmez", () => {
    const [{ latest }] = queryAll<{ latest: number }>("SELECT MAX(published_at) AS latest FROM mentions");
    expect(latest).toBeLessThan(NOW);
  });

  it("her demo içeriği kendi proje sorgusuyla eşleşir", () => {
    for (const workspace of listWorkspaces().filter((entry) => entry.kind === "demo")) {
      for (const demoProject of listProjects(workspace.id)) {
        expect(countMentions({ projectId: demoProject.id }), demoProject.name).toBeGreaterThan(300);
      }
    }
  });
});

describe("liste, sayım ve grafik tutarlılığı", () => {
  const range = resolveRange("30g", NOW);

  it("özet, zaman serisi ve liste aynı toplamı verir", () => {
    const filter = { projectId: project.id, range };
    const summary = summarize(filter);
    const seriesTotal = timeSeries(filter, "day").reduce((sum, point) => sum + point.total, 0);
    const listed = listMentions(filter, { limit: 100_000, offset: 0 }).length;

    expect(summary.total).toBe(countMentions(filter));
    expect(seriesTotal).toBe(summary.total);
    expect(listed).toBe(summary.total);
    expect(summary.positive + summary.negative + summary.neutral).toBe(summary.total);
  });

  it("kaynak türü dağılımının toplamı özete eşittir", () => {
    const filter = { projectId: project.id, range };
    const bySource = breakdown(filter, "sourceType", 20).reduce((sum, row) => sum + row.total, 0);
    expect(bySource).toBe(summarize(filter).total);
  });

  it.each([
    "gecik*",
    '"ek sefer" OR asfalt',
    "otobüs NEAR/4 gelmedi",
    "kaynak:haber",
    "ton:olumsuz -kaynak:haber",
    "(rezalet* OR mağdur*) ton:olumsuz",
    "niyet:şikayet OR niyet:övgü",
    "ironi:evet",
    "takipçi:>5000 etkileşim:>=20",
    "=rezalet",
    'konu:"Ulaşım" duygu:öfke',
  ])("SQL derleyici ile bellek içi eşleştirici aynı sonucu verir: %s", (query) => {
    const ast = parseQuery(query);
    const topicNames = new Map(listTopics(project.id).map((topic) => [topic.id, topic.name]));
    const all = listMentions({ projectId: project.id }, { limit: 100_000, offset: 0 });
    const searchTexts = new Map(
      queryAll<{ id: string; search_text: string }>("SELECT id, search_text FROM mentions WHERE project_id = ?", [project.id]).map(
        (row) => [row.id, row.search_text],
      ),
    );

    const expected = all.filter((mention) => {
      const tokens = (searchTexts.get(mention.id) ?? "").split(" ");
      return matchQuery(ast, tokens, {
        ...EMPTY_FIELDS,
        sourceType: mention.sourceType,
        site: mention.sourceName,
        sentiment: effectiveSentiment(mention),
        emotion: mention.emotion,
        intent: mention.intent,
        language: mention.language,
        author: `${mention.authorHandle ?? ""} ${mention.authorName ?? ""}`,
        topics: mention.topicIds.map((id) => topicNames.get(id) ?? ""),
        isSarcastic: mention.isSarcastic,
        reach: mention.reach,
        engagement: mention.engagement,
        followers: mention.authorFollowers,
      }).matched;
    }).length;

    expect(countMentions({ projectId: project.id, query: ast })).toBe(expected);
    expect(expected, "sorgu demo verisinde en az bir sonuç vermeli").toBeGreaterThan(0);
  });
});

describe("insan düzeltmeleri", () => {
  it("ton düzeltmesi sayımlara yansır, model sonucu korunur", () => {
    const filter = { projectId: project.id };
    const before = summarize(filter);
    const target = listMentions({ ...filter, query: parseQuery("ton:olumsuz") }, { limit: 1, offset: 0 })[0];

    setSentimentOverride(target.id, "positive");
    const after = summarize(filter);
    expect(after.negative).toBe(before.negative - 1);
    expect(after.positive).toBe(before.positive + 1);

    const reloaded = listMentions({ ...filter, query: parseQuery("ton:olumlu") }, { limit: 100_000, offset: 0 }).find(
      (mention) => mention.id === target.id,
    );
    expect(reloaded).toMatchObject({ sentiment: "negative", sentimentOverride: "positive" });

    setSentimentOverride(target.id, null);
    expect(summarize(filter)).toEqual(before);
  });

  it("ilgisiz işaretlenen içerik tüm metriklerden çıkar", () => {
    const filter = { projectId: project.id };
    const before = summarize(filter).total;
    const target = listMentions(filter, { limit: 1, offset: 0 })[0];

    setIrrelevant(target.id, true);
    expect(summarize(filter).total).toBe(before - 1);
    expect(countMentions({ ...filter, includeIrrelevant: true })).toBe(before);
    setIrrelevant(target.id, false);
  });
});

describe("konu etiketleme", () => {
  it("planlı olayın konusu olay gününde öne çıkar", () => {
    const topics = listTopics(project.id);
    const strike = topics.find((topic) => topic.name === "Su kesintisi")!;
    const rows = topicBreakdown({ projectId: project.id });
    const strikeRow = rows.find((row) => row.topicId === strike.id);
    expect(strikeRow?.total ?? 0).toBeGreaterThan(40);
    expect(strikeRow!.negative / strikeRow!.total).toBeGreaterThan(0.6);
  });
});

describe("kapsam farkındalığı", () => {
  it("veri toplanmayan dönemi sıfır sayıp sahte alarm üretmez", async () => {
    const { findAnomalies } = await import("@/server/services/alerts");
    const { earliestPublishedAt } = await import("@/server/repositories/mentions");
    const { bucketStart, DAY_MS } = await import("@/lib/time");

    // Projenin ilk haftası: öncesinde veri yok, taban çizgisi kurulamaz.
    const firstDay = bucketStart(earliestPublishedAt(project.id)!, "day");
    expect(findAnomalies(project.id, { from: firstDay, to: firstDay + 7 * DAY_MS }, "day")).toEqual([]);
  });

  it("planlı olayı kritik düzeyde yakalar", async () => {
    const { findAnomalies } = await import("@/server/services/alerts");
    const anomalies = findAnomalies(project.id, resolveRange("30g", NOW), "day");
    expect(anomalies.some((anomaly) => anomaly.level === "critical" && anomaly.kinds.includes("volume"))).toBe(true);
  });
});

describe("demo verisinin yenilenmesi", () => {
  it("gün değişince aynı içerikleri bugüne göre yeniden üretir; gelecek tarihli kayıt oluşmaz", async () => {
    const { DAY_MS } = await import("@/lib/time");
    const before = countMentions({ projectId: project.id });

    // Ertesi gün, gece yarısından hemen sonra: bugünün kovası neredeyse boşken.
    const nextDay = Date.parse("2026-11-13T00:10:00+03:00");
    ensureSeeded(nextDay);

    const [{ latest }] = queryAll<{ latest: number }>("SELECT MAX(published_at) AS latest FROM mentions WHERE project_id = ?", [project.id]);
    expect(latest).toBeLessThan(nextDay);
    expect(nextDay - latest).toBeLessThan(DAY_MS);
    // Hacim aynı ölçekte kalır (yalnızca bugünün kısmi günü farklıdır).
    expect(Math.abs(countMentions({ projectId: project.id }) - before)).toBeLessThan(before * 0.05);
  });
});
