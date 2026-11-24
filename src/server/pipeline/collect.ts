import type { CollectionRun, Project, RunStatus } from "@/domain/types";
import { buildCollectionPlan, type CollectionPlan } from "@/lib/query";
import { bucketStart, DAY_MS } from "@/lib/time";
import { getConnector, isConnectorAllowed, isConnectorUsable } from "../collectors/registry";
import type { CollectRequest, Connector } from "../collectors/types";
import { insertMentions, type NewMention } from "../repositories/mentions";
import { getProject, listTopics } from "../repositories/projects";
import { fetchedSince, latestRunPerConnector, recordRun } from "../repositories/runs";
import { getWorkspace } from "../repositories/workspaces";
import { buildMention, prepareProject, type PreparedProject } from "./ingest";

/**
 * Toplama düzenleyicisi: bir projenin açık bağlayıcılarını sırayla çalıştırır,
 * adayları sorguyla süzer, yenileri kaydeder ve her çalışmayı kayda geçirir.
 *
 * Çalışma kaydı üç durumu ayırır: "ok" (yeni içerik var), "empty" (kaynak
 * yanıt verdi ama eşleşen yok) ve "error" (kaynağa ulaşılamadı). "Sıfır
 * bahsetme" ile "kaynak çalışmıyor" böylece karışmaz.
 */

/** Ücretsiz kaynaklarda her taramada geriye bakılan pencere; yinelenenler zaten elenir. */
const LOOKBACK_MS = 7 * DAY_MS;
/** Ücretli kaynaklarda son taramayla örtüşme payı: sınırdaki gönderiler kaçmasın. */
const METERED_OVERLAP_MS = 2 * 60_000;

const LOCK_KEY = Symbol.for("yanki.collection.locks");
type GlobalWithLocks = typeof globalThis & { [LOCK_KEY]?: Set<string> };

function locks(): Set<string> {
  const holder = globalThis as GlobalWithLocks;
  holder[LOCK_KEY] ??= new Set();
  return holder[LOCK_KEY];
}

interface ConnectorOutcome {
  status: RunStatus;
  fetched: number;
  matched: NewMention[];
  message: string | null;
}

async function runConnector(connector: Connector, request: CollectRequest, prepared: PreparedProject, now: number): Promise<ConnectorOutcome> {
  try {
    const result = await connector.collect(request);
    const matched = result.items
      .map((item) => buildMention(item, prepared, { now, isDemo: false }))
      .filter((mention): mention is NewMention => mention !== null);
    return {
      status: matched.length > 0 ? "ok" : "empty",
      fetched: result.items.length,
      matched,
      message: result.notes.length > 0 ? result.notes.join(" ") : null,
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "bilinmeyen hata";
    return { status: "error", fetched: 0, matched: [], message: reason };
  }
}

/** Bağlayıcının günlük okuma tavanı; tavanı olmayanlarda null. */
function dailyLimitOf(connector: Connector): number | null {
  return connector.descriptor.dailyLimit ?? null;
}

/**
 * Bu tarama için isteği kurar. Ücretli kaynaklarda yalnızca son başarılı
 * taramadan sonrası istenir ve günlük tavandan kalan kadar içerik okunur;
 * aynı gönderiye iki kez para ödenmez.
 */
function buildRequest(connector: Connector, plan: CollectionPlan, lastRun: CollectionRun | undefined, now: number): CollectRequest {
  const { metered } = connector.descriptor;
  const resumeFrom = metered && lastRun && lastRun.status !== "error" ? lastRun.startedAt - METERED_OVERLAP_MS : null;
  const limit = dailyLimitOf(connector);
  return {
    keywords: plan.keywords,
    groups: plan.groups,
    language: plan.language,
    since: resumeFrom ?? now - LOOKBACK_MS,
    maxItems: limit === null ? null : Math.max(0, limit - fetchedSince(connector.descriptor.id, bucketStart(now, "day"))),
  };
}

function saveRun(project: Project, connectorId: string, startedAt: number, outcome: ConnectorOutcome, inserted: number): CollectionRun {
  return recordRun({
    workspaceId: project.workspaceId,
    projectId: project.id,
    connectorId,
    startedAt,
    finishedAt: Date.now(),
    status: outcome.status,
    fetched: outcome.fetched,
    matched: outcome.matched.length,
    inserted,
    message: outcome.message,
  });
}

function skipped(message: string): ConnectorOutcome {
  return { status: "skipped", fetched: 0, matched: [], message };
}

export type CollectOutcome =
  | { ok: true; runs: CollectionRun[]; inserted: number }
  | { ok: false; reason: "not-found" | "demo" | "busy" | "no-keywords" };

/** Projenin tüm açık bağlayıcılarını bir kez çalıştırır. */
export async function collectProject(projectId: string): Promise<CollectOutcome> {
  const project = getProject(projectId);
  if (!project) return { ok: false, reason: "not-found" };
  if (getWorkspace(project.workspaceId)?.kind !== "live") return { ok: false, reason: "demo" };

  const prepared = prepareProject(project, listTopics(project.id));
  const plan = buildCollectionPlan(prepared.ast);
  if (!plan) return { ok: false, reason: "no-keywords" };

  const active = locks();
  if (active.has(project.id)) return { ok: false, reason: "busy" };
  active.add(project.id);

  try {
    const lastRuns = new Map(latestRunPerConnector(project.id).map((run) => [run.connectorId, run]));
    const runs: CollectionRun[] = [];

    for (const connectorId of project.connectorIds) {
      const startedAt = Date.now();
      const connector = getConnector(connectorId);
      const lastRun = lastRuns.get(connectorId);

      if (!connector) {
        runs.push(saveRun(project, connectorId, startedAt, skipped("Bu bağlayıcı artık mevcut değil."), 0));
        continue;
      }
      if (!isConnectorAllowed(connector)) {
        runs.push(saveRun(project, connectorId, startedAt, skipped("Kurumsal kurulumda kapalı: kaynağın koşulları yalnızca kişisel kullanıma izin veriyor."), 0));
        continue;
      }
      if (!connector.isConfigured()) {
        runs.push(saveRun(project, connectorId, startedAt, skipped(`Anahtar bekleniyor: ${connector.descriptor.requiredSetting}.`), 0));
        continue;
      }
      // Kota koruması: çok sık taranmaması gereken kaynak sessizce atlanır, son sonucu ekranda kalır.
      const minInterval = (connector.descriptor.minIntervalMinutes ?? 0) * 60_000;
      if (lastRun && lastRun.status !== "skipped" && startedAt - lastRun.startedAt < minInterval) continue;

      const outcome = await runConnector(connector, buildRequest(connector, plan, lastRun, startedAt), prepared, startedAt);
      runs.push(saveRun(project, connectorId, startedAt, outcome, insertMentions(outcome.matched)));
    }
    return { ok: true, runs, inserted: runs.reduce((sum, run) => sum + run.inserted, 0) };
  } finally {
    active.delete(project.id);
  }
}

export interface PreviewSample {
  title: string;
  content: string;
  sourceName: string;
  publishedAt: number;
  url: string;
}

export interface PreviewResult {
  keywords: string[];
  connectors: Array<{ name: string; status: RunStatus; fetched: number; matched: number; message: string | null }>;
  samples: PreviewSample[];
  totalMatched: number;
}

const PREVIEW_SAMPLE_COUNT = 8;

/**
 * Sorguyu kaydetmeden dener: kaynaklardan aday çeker, kaç tanesinin
 * eşleştiğini ve örnekleri döndürür. Hiçbir şey veritabanına yazılmaz.
 * Ücretli kaynaklar önizlemede aranmaz; deneme para harcamamalıdır.
 */
export async function previewCollection(query: string, connectorIds: string[]): Promise<PreviewResult | null> {
  const now = Date.now();
  const draft: Project = {
    id: "onizleme",
    workspaceId: "onizleme",
    name: "",
    description: "",
    query,
    connectorIds,
    colorSlot: 0,
    createdAt: now,
    updatedAt: now,
  };
  const prepared = prepareProject(draft, []);
  const plan = buildCollectionPlan(prepared.ast);
  if (!plan) return null;

  const connectors: PreviewResult["connectors"] = [];
  const matched: NewMention[] = [];
  for (const connectorId of connectorIds) {
    const connector = getConnector(connectorId);
    if (!connector || !isConnectorUsable(connector)) continue;
    const outcome = connector.descriptor.metered
      ? skipped("Ücretli kaynak önizlemede aranmaz; proje kaydedilince taranır.")
      : await runConnector(connector, { keywords: plan.keywords, groups: plan.groups, language: plan.language, since: now - LOOKBACK_MS, maxItems: null }, prepared, now);
    connectors.push({
      name: connector.descriptor.name,
      status: outcome.status,
      fetched: outcome.fetched,
      matched: outcome.matched.length,
      message: outcome.message,
    });
    matched.push(...outcome.matched);
  }

  matched.sort((a, b) => b.publishedAt - a.publishedAt);
  return {
    keywords: plan.keywords,
    connectors,
    totalMatched: matched.length,
    samples: matched.slice(0, PREVIEW_SAMPLE_COUNT).map((mention) => ({
      title: mention.title,
      content: mention.content,
      sourceName: mention.sourceName,
      publishedAt: mention.publishedAt,
      url: mention.url,
    })),
  };
}
