import { randomUUID } from "node:crypto";
import type { Workspace, WorkspaceKind } from "@/domain/types";
import { execute, queryAll, queryOne } from "../db/client";

interface WorkspaceRow {
  id: string;
  name: string;
  kind: WorkspaceKind;
  created_at: number;
}

const COLUMNS = "id, name, kind, created_at";

function toWorkspace(row: WorkspaceRow): Workspace {
  return { id: row.id, name: row.name, kind: row.kind, createdAt: row.created_at };
}

/** Demo alanları önce gelir; ilk açılışta uygulama dolu görünür. */
export async function listWorkspaces(): Promise<Workspace[]> {
  return (await queryAll<WorkspaceRow>(`SELECT ${COLUMNS} FROM workspaces ORDER BY kind, created_at, name`)).map(toWorkspace);
}

export async function getWorkspace(id: string): Promise<Workspace | null> {
  const row = await queryOne<WorkspaceRow>(`SELECT ${COLUMNS} FROM workspaces WHERE id = ?`, [id]);
  return row ? toWorkspace(row) : null;
}

export async function getWorkspaceByKind(kind: WorkspaceKind): Promise<Workspace | null> {
  const row = await queryOne<WorkspaceRow>(`SELECT ${COLUMNS} FROM workspaces WHERE kind = ? ORDER BY created_at LIMIT 1`, [kind]);
  return row ? toWorkspace(row) : null;
}

export async function createWorkspace(name: string, kind: WorkspaceKind, now: number): Promise<Workspace> {
  const workspace: Workspace = { id: randomUUID(), name, kind, createdAt: now };
  await execute("INSERT INTO workspaces (id, name, kind, created_at) VALUES (?, ?, ?, ?)", [workspace.id, workspace.name, workspace.kind, workspace.createdAt]);
  return workspace;
}
