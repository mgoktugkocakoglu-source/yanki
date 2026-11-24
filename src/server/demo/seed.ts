import type { Project } from "@/domain/types";
import { bucketStart } from "@/lib/time";
import { execute, queryOne } from "../db/client";
import { buildMention, prepareProject } from "../pipeline/ingest";
import { insertMentions, type NewMention } from "../repositories/mentions";
import { createProject, listProjects, listTopics, replaceTopics } from "../repositories/projects";
import { recordAudit } from "../repositories/runs";
import { createWorkspace, listWorkspaces } from "../repositories/workspaces";
import { PUBLIC_WORKSPACE } from "./corpus-public";
import { generateRawItems } from "./generator";
import type { DemoProjectSpec, DemoWorkspaceSpec } from "./types";

/**
 * İlk çalıştırmada veritabanını kurar: bir demo çalışma alanı (kurgusal
 * belediye verisiyle) ve canlı çalışma alanı. Gündem projeleri canlı alanda
 * gerçek kaynaklardan toplanır (bkz. `agenda.ts`). Demo verisi ayrı çalışma
 * alanlarında durur ve her kayıt `is_demo` ile işaretlidir; canlı veriyle
 * hiçbir zaman karışmaz.
 *
 * Demo içerikleri "bugün"e göre üretilir. Gün değiştiğinde aynı tohumla
 * yeniden üretilirler; böylece grafikler her zaman bugüne kadar dolu görünür
 * ve gelecek tarihli kayıt oluşmaz. (Demo içeriklerindeki ton düzeltmeleri
 * bu yenilemede sıfırlanır; konu tanımları korunur.)
 */

const DEMO_WORKSPACES: readonly DemoWorkspaceSpec[] = [PUBLIC_WORKSPACE];
const LIVE_WORKSPACE_NAME = "Çalışma alanım";
const SEEDED_DAY_KEY = "demo_seeded_day";

function readSeededDay(): number | null {
  const row = queryOne<{ value: string }>("SELECT value FROM app_meta WHERE key = ?", [SEEDED_DAY_KEY]);
  return row ? Number(row.value) : null;
}

function writeSeededDay(day: number): void {
  execute("INSERT INTO app_meta (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value", [SEEDED_DAY_KEY, String(day)]);
}

/** Bir demo projesinin içeriklerini baştan üretir; projenin güncel konu tanımlarıyla etiketler. */
function fillProject(project: Project, spec: DemoProjectSpec, now: number): number {
  const prepared = prepareProject(project, listTopics(project.id));
  const rawItems = generateRawItems(spec, now);
  const mentions = rawItems
    .map((raw) => buildMention(raw, prepared, { now, isDemo: true }))
    .filter((mention): mention is NewMention => mention !== null);

  if (mentions.length < rawItems.length) {
    // Bir şablon proje sorgusuyla eşleşmiyorsa metin ya da sorgu hatalıdır.
    console.warn(`[yankı] demo: "${project.name}" için ${rawItems.length - mentions.length} içerik sorguyla eşleşmedi.`);
  }
  execute("DELETE FROM mentions WHERE project_id = ? AND is_demo = 1", [project.id]);
  return insertMentions(mentions);
}

function createDemoWorkspace(spec: DemoWorkspaceSpec, now: number): number {
  const workspace = createWorkspace(spec.name, "demo", now);
  return spec.projects.reduce((inserted, projectSpec) => {
    const project = createProject(
      workspace.id,
      { name: projectSpec.name, description: projectSpec.description, query: projectSpec.query, connectorIds: [] },
      now,
    );
    replaceTopics(project.id, [...projectSpec.topics]);
    return inserted + fillProject(project, projectSpec, now);
  }, 0);
}

function refreshDemoWorkspaces(now: number): void {
  const workspaces = listWorkspaces().filter((workspace) => workspace.kind === "demo");
  for (const spec of DEMO_WORKSPACES) {
    const workspace = workspaces.find((entry) => entry.name === spec.name);
    if (!workspace) continue;
    const projects = listProjects(workspace.id);
    for (const projectSpec of spec.projects) {
      const project = projects.find((entry) => entry.name === projectSpec.name);
      if (project) fillProject(project, projectSpec, now);
    }
  }
}

/** Artık tanımlı olmayan demo alanlarını (ör. kaldırılan kargo demosu) içerikleriyle siler. */
function removeRetiredDemoWorkspaces(): void {
  const current = DEMO_WORKSPACES.map((spec) => spec.name);
  for (const workspace of listWorkspaces()) {
    if (workspace.kind === "demo" && !current.includes(workspace.name)) {
      execute("DELETE FROM workspaces WHERE id = ?", [workspace.id]);
    }
  }
}

function isDatabaseEmpty(): boolean {
  return (queryOne<{ count: number }>("SELECT COUNT(*) AS count FROM workspaces")?.count ?? 0) === 0;
}

let checkedOnDay: number | null = null;

/** Her istekte çağrılabilir; günde bir kez gerçekten çalışır. */
export function ensureSeeded(now: number = Date.now()): void {
  const day = bucketStart(now, "day");
  if (checkedOnDay === day) return;

  if (isDatabaseEmpty()) {
    const inserted = DEMO_WORKSPACES.reduce((sum, spec, index) => sum + createDemoWorkspace(spec, now + index), 0);
    createWorkspace(LIVE_WORKSPACE_NAME, "live", now);
    recordAudit({ workspaceId: null, action: "kurulum", objectType: "sistem", detail: `İlk kurulum: ${inserted} kurgusal demo kaydı oluşturuldu.` }, now);
    writeSeededDay(day);
  } else {
    removeRetiredDemoWorkspaces();
    if (readSeededDay() !== day) {
      refreshDemoWorkspaces(now);
      writeSeededDay(day);
    }
  }
  checkedOnDay = day;
}
