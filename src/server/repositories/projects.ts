import { randomUUID } from "node:crypto";
import type { Project, ProjectTopic } from "@/domain/types";
import { foldPhrase } from "@/lib/query/matcher";
import { execute, queryAll, queryOne, transaction } from "../db/client";

interface ProjectRow {
  id: string;
  workspace_id: string;
  name: string;
  description: string;
  query: string;
  connector_ids: string;
  color_slot: number;
  created_at: number;
  updated_at: number;
}

interface TopicRow {
  id: string;
  project_id: string;
  group_name: string;
  name: string;
  query: string;
}

const PROJECT_COLUMNS = "id, workspace_id, name, description, query, connector_ids, color_slot, created_at, updated_at";
const TOPIC_COLUMNS = "id, project_id, group_name, name, query";

/** Karşılaştırma grafiklerindeki kategorik palet yuvası sayısı. */
export const COLOR_SLOT_COUNT = 5;

function toProject(row: ProjectRow): Project {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    name: row.name,
    description: row.description,
    query: row.query,
    connectorIds: JSON.parse(row.connector_ids) as string[],
    colorSlot: row.color_slot,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toTopic(row: TopicRow): ProjectTopic {
  return { id: row.id, projectId: row.project_id, groupName: row.group_name, name: row.name, query: row.query };
}

export function listProjects(workspaceId: string): Project[] {
  return queryAll<ProjectRow>(
    `SELECT ${PROJECT_COLUMNS} FROM projects WHERE workspace_id = ? ORDER BY created_at`,
    [workspaceId],
  ).map(toProject);
}

export function listAllProjects(): Project[] {
  return queryAll<ProjectRow>(`SELECT ${PROJECT_COLUMNS} FROM projects ORDER BY created_at`).map(toProject);
}

export function getProject(id: string): Project | null {
  const row = queryOne<ProjectRow>(`SELECT ${PROJECT_COLUMNS} FROM projects WHERE id = ?`, [id]);
  return row ? toProject(row) : null;
}

export interface ProjectInput {
  name: string;
  description: string;
  query: string;
  connectorIds: string[];
}

/** Renk yuvası projeye bir kez atanır ve değişmez: renk sıralamayı değil, projeyi izler. */
function nextColorSlot(workspaceId: string): number {
  const row = queryOne<{ count: number }>("SELECT COUNT(*) AS count FROM projects WHERE workspace_id = ?", [workspaceId]);
  return (row?.count ?? 0) % COLOR_SLOT_COUNT;
}

export function createProject(workspaceId: string, input: ProjectInput, now: number): Project {
  const project: Project = {
    id: randomUUID(),
    workspaceId,
    ...input,
    colorSlot: nextColorSlot(workspaceId),
    createdAt: now,
    updatedAt: now,
  };
  execute(
    `INSERT INTO projects (${PROJECT_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      project.id,
      project.workspaceId,
      project.name,
      project.description,
      project.query,
      JSON.stringify(project.connectorIds),
      project.colorSlot,
      project.createdAt,
      project.updatedAt,
    ],
  );
  return project;
}

export function updateProject(id: string, input: ProjectInput, now: number): void {
  execute(
    "UPDATE projects SET name = ?, description = ?, query = ?, connector_ids = ?, updated_at = ? WHERE id = ?",
    [input.name, input.description, input.query, JSON.stringify(input.connectorIds), now, id],
  );
}

export function deleteProject(id: string): void {
  execute("DELETE FROM projects WHERE id = ?", [id]);
}

export function listTopics(projectId: string): ProjectTopic[] {
  return queryAll<TopicRow>(
    `SELECT ${TOPIC_COLUMNS} FROM project_topics WHERE project_id = ? ORDER BY position`,
    [projectId],
  ).map(toTopic);
}

export interface TopicInput {
  groupName: string;
  name: string;
  query: string;
}

/** Projenin konu listesini verilenle değiştirir. Eski eşleşmeler silinir. */
export function replaceTopics(projectId: string, topics: TopicInput[]): ProjectTopic[] {
  return transaction(() => {
    execute("DELETE FROM project_topics WHERE project_id = ?", [projectId]);
    return topics.map((topic, position) => {
      const created: ProjectTopic = { id: randomUUID(), projectId, ...topic };
      execute(
        "INSERT INTO project_topics (id, project_id, group_name, name, name_folded, query, position) VALUES (?, ?, ?, ?, ?, ?, ?)",
        [created.id, projectId, created.groupName, created.name, foldPhrase(created.name), created.query, position],
      );
      return created;
    });
  });
}
