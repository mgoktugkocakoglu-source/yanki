import { seedAgendaProjects } from "./setup/agenda";
import { collectProject } from "./pipeline/collect";
import { cookies } from "next/headers";
import { connection } from "next/server";
import type { Project, Workspace } from "@/domain/types";
import { DEFAULT_RANGE, isRangeKey, type RangeKey } from "@/lib/time";
import { loadCanSeeProject, loadVisibleProjects, type Viewer } from "./auth/access";
import { requireUser } from "./auth/session";
import { ensureSeeded } from "./setup/seed";
import { getProject, listProjects } from "./repositories/projects";
import { getWorkspace, listWorkspaces } from "./repositories/workspaces";

/**
 * İstek bağlamı. Her sayfa veriye dokunmadan önce buradaki işlevlerden birini
 * çağırır; böylece (a) veritabanı kurulmuş olur ve (b) eşzamanlı SQLite
 * okumaları derleme zamanında değil, istek anında yapılır.
 */

const WORKSPACE_COOKIE = "yanki_calisma_alani";

export type SearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** Veri okumalarını istek anına erteler ve ilk kurulumu güvenceye alır. */
export async function requestStart(): Promise<number> {
  await connection();
  const now = Date.now();
  await ensureSeeded(now);
  // Hazır gündem projeleri ilk kurulduklarında beklemeden bir kez taranır.
  for (const projectId of await seedAgendaProjects(now)) {
    void collectProject(projectId).catch((error) => console.error("[yankı] gündem projesi taranamadı:", error));
  }
  return now;
}

export interface ProjectContext {
  now: number;
  project: Project;
  workspace: Workspace;
  /** Aynı çalışma alanındaki tüm projeler (proje değiştirici için). */
  siblings: Project[];
  workspaces: Workspace[];
  /** Oturumdaki kullanıcı; giriş zorunlu değilse null. */
  viewer: Viewer;
}

/** Proje sayfaları: çalışma alanı projeden türetilir; çerez gerekmez. */
export async function loadProjectContext(projectId: string): Promise<ProjectContext | null> {
  const now = await requestStart();
  const viewer = await requireUser();
  const project = await getProject(projectId);
  const workspace = project ? await getWorkspace(project.workspaceId) : null;
  // Başkasının konusu "yok" gibi davranır; varlığı da sızmaz.
  if (!project || !workspace || !(await loadCanSeeProject(viewer, project))) return null;
  return { now, project, workspace, siblings: (await loadVisibleProjects(viewer, await listProjects(workspace.id))), workspaces: await listWorkspaces(), viewer };
}

export interface WorkspaceContext {
  now: number;
  workspace: Workspace;
  projects: Project[];
  workspaces: Workspace[];
  viewer: Viewer;
}

/** Çalışma alanı sayfaları: seçim çerezde tutulur, yoksa canlı çalışma alanı açılır. */
export async function loadWorkspaceContext(): Promise<WorkspaceContext> {
  const now = await requestStart();
  const viewer = await requireUser();
  const workspaces = await listWorkspaces();
  const selectedId = (await cookies()).get(WORKSPACE_COOKIE)?.value;
  const workspace = workspaces.find((entry) => entry.id === selectedId) ?? workspaces.find((entry) => entry.kind === "live") ?? workspaces[0];
  return { now, workspace, projects: (await loadVisibleProjects(viewer, await listProjects(workspace.id))), workspaces, viewer };
}

export async function rememberWorkspace(workspaceId: string): Promise<void> {
  (await cookies()).set(WORKSPACE_COOKIE, workspaceId, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365 });
}

export function readRange(searchParams: SearchParams): RangeKey {
  const value = first(searchParams.d);
  return isRangeKey(value) ? value : DEFAULT_RANGE;
}

export function readString(searchParams: SearchParams, key: string): string {
  return first(searchParams[key])?.trim() ?? "";
}

export function readPositiveInteger(searchParams: SearchParams, key: string, fallback: number): number {
  const parsed = Number.parseInt(first(searchParams[key]) ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
