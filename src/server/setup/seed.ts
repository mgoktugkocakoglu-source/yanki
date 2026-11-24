import type { Project } from "@/domain/types";
import { bucketStart } from "@/lib/time";
import { config } from "../config";
import { execute, queryOne } from "../db/client";
import { buildMention, prepareProject } from "../pipeline/ingest";
import { insertMentions, type NewMention } from "../repositories/mentions";
import { createProject, listProjects, listTopics, replaceTopics } from "../repositories/projects";
import { recordAudit } from "../repositories/runs";
import { createWorkspace, listWorkspaces } from "../repositories/workspaces";
import { PUBLIC_WORKSPACE } from "../fixtures/corpus-public";
import { generateRawItems } from "../fixtures/generator";
import type { DemoProjectSpec, DemoWorkspaceSpec } from "../fixtures/types";

/**
 * İlk çalıştırmada canlı çalışma alanını kurar. Gündem konuları bu alanda
 * gerçek kaynaklardan toplanır (bkz. `agenda.ts`).
 *
 * Çalışan kurulumda üretilmiş (kurgusal) içerik yoktur: panelde ve tanıtım
 * sayfasında görünen her şey bağlı kaynaklardan toplanmış gerçek içeriktir.
 * Eski sürümlerden kalan örnek alan ilk açılışta içerikleriyle silinir.
 *
 * Üretilmiş sınama verisi yalnızca otomatik testlerde (`config.seedFixture`)
 * yüklenir; çözümleme, eşleştirme ve analiz hattını ağ olmadan sınamak içindir.
 */

const DEMO_WORKSPACES: readonly DemoWorkspaceSpec[] = [PUBLIC_WORKSPACE];
const LIVE_WORKSPACE_NAME = "Çalışma alanım";
const SEEDED_DAY_KEY = "demo_seeded_day";

async function readSeededDay(): Promise<number | null> {
  const row = await queryOne<{ value: string }>("SELECT value FROM app_meta WHERE key = ?", [SEEDED_DAY_KEY]);
  return row ? Number(row.value) : null;
}

async function writeSeededDay(day: number): Promise<void> {
  await execute("INSERT INTO app_meta (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value", [SEEDED_DAY_KEY, String(day)]);
}

/** Bir demo projesinin içeriklerini baştan üretir; projenin güncel konu tanımlarıyla etiketler. */
async function fillProject(project: Project, spec: DemoProjectSpec, now: number): Promise<number> {
  const prepared = prepareProject(project, await listTopics(project.id));
  const rawItems = generateRawItems(spec, now);
  const mentions = rawItems
    .map((raw) => buildMention(raw, prepared, { now, isDemo: true }))
    .filter((mention): mention is NewMention => mention !== null);

  if (mentions.length < rawItems.length) {
    // Bir şablon proje sorgusuyla eşleşmiyorsa metin ya da sorgu hatalıdır.
    console.warn(`[yankı] demo: "${project.name}" için ${rawItems.length - mentions.length} içerik sorguyla eşleşmedi.`);
  }
  await execute("DELETE FROM mentions WHERE project_id = ? AND is_demo = 1", [project.id]);
  return insertMentions(mentions);
}

async function createDemoWorkspace(spec: DemoWorkspaceSpec, now: number): Promise<number> {
  const workspace = await createWorkspace(spec.name, "demo", now);
  let inserted = 0;
  for (const projectSpec of spec.projects) {
    const project = await createProject(workspace.id, { name: projectSpec.name, description: projectSpec.description, query: projectSpec.query, connectorIds: [] }, now);
    await replaceTopics(project.id, [...projectSpec.topics]);
    inserted += await fillProject(project, projectSpec, now);
  }
  return inserted;
}

async function refreshDemoWorkspaces(now: number): Promise<void> {
  const workspaces = (await listWorkspaces()).filter((workspace) => workspace.kind === "demo");
  for (const spec of DEMO_WORKSPACES) {
    const workspace = workspaces.find((entry) => entry.name === spec.name);
    if (!workspace) continue;
    const projects = await listProjects(workspace.id);
    for (const projectSpec of spec.projects) {
      const project = projects.find((entry) => entry.name === projectSpec.name);
      if (project) await fillProject(project, projectSpec, now);
    }
  }
}

/** Sınama verisi kapalıyken hiçbir örnek alan kalmaz; açıkken yalnızca tanımlı olanlar kalır. */
async function removeRetiredDemoWorkspaces(): Promise<void> {
  const current = config.seedFixture ? DEMO_WORKSPACES.map((spec) => spec.name) : [];
  for (const workspace of await listWorkspaces()) {
    if (workspace.kind === "demo" && !current.includes(workspace.name)) {
      await execute("DELETE FROM workspaces WHERE id = ?", [workspace.id]);
    }
  }
}

async function isDatabaseEmpty(): Promise<boolean> {
  return ((await queryOne<{ count: number }>("SELECT COUNT(*) AS count FROM workspaces"))?.count ?? 0) === 0;
}

let checkedOnDay: number | null = null;

/** Her istekte çağrılabilir; günde bir kez gerçekten çalışır. */
export async function ensureSeeded(now: number = Date.now()): Promise<void> {
  const day = bucketStart(now, "day");
  if (checkedOnDay === day) return;

  if (await isDatabaseEmpty()) {
    let inserted = 0;
    if (config.seedFixture) {
      for (const [index, spec] of DEMO_WORKSPACES.entries()) inserted += await createDemoWorkspace(spec, now + index);
    }
    await createWorkspace(LIVE_WORKSPACE_NAME, "live", now);
    await recordAudit({ workspaceId: null, action: "kurulum", objectType: "sistem", detail: config.seedFixture ? `İlk kurulum: ${inserted} sınama kaydı oluşturuldu.` : "İlk kurulum." }, now);
    await writeSeededDay(day);
  } else {
    await removeRetiredDemoWorkspaces();
    if (config.seedFixture && await readSeededDay() !== day) {
      await refreshDemoWorkspaces(now);
      await writeSeededDay(day);
    }
  }
  checkedOnDay = day;
}
