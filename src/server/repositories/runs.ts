import { config } from "../config";
import { randomUUID } from "node:crypto";
import type { AuditEvent, CollectionRun, RunStatus } from "@/domain/types";
import { execute, queryAll, queryOne } from "../db/client";

interface RunRow {
  id: string;
  workspace_id: string;
  project_id: string;
  connector_id: string;
  started_at: number;
  finished_at: number;
  status: RunStatus;
  fetched: number;
  matched: number;
  inserted: number;
  message: string | null;
}

const RUN_COLUMNS = "id, workspace_id, project_id, connector_id, started_at, finished_at, status, fetched, matched, inserted, message";

function toRun(row: RunRow): CollectionRun {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    projectId: row.project_id,
    connectorId: row.connector_id,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    status: row.status,
    fetched: row.fetched,
    matched: row.matched,
    inserted: row.inserted,
    message: row.message,
  };
}

export async function recordRun(run: Omit<CollectionRun, "id">): Promise<CollectionRun> {
  const saved: CollectionRun = { id: randomUUID(), ...run };
  await execute(`INSERT INTO collection_runs (${RUN_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
    saved.id,
    saved.workspaceId,
    saved.projectId,
    saved.connectorId,
    saved.startedAt,
    saved.finishedAt,
    saved.status,
    saved.fetched,
    saved.matched,
    saved.inserted,
    saved.message,
  ]);
  return saved;
}

export async function listRuns(projectId: string, limit: number): Promise<CollectionRun[]> {
  return (await queryAll<RunRow>(`SELECT ${RUN_COLUMNS} FROM collection_runs WHERE project_id = ? ORDER BY started_at DESC LIMIT ?`, [projectId, limit])).map(toRun);
}

/** Her bağlayıcının bu projedeki en son çalışması. */
export async function latestRunPerConnector(projectId: string): Promise<CollectionRun[]> {
  return (
    await queryAll<RunRow>(
      `SELECT ${RUN_COLUMNS} FROM collection_runs r
     WHERE r.project_id = ? AND r.started_at = (
       SELECT MAX(started_at) FROM collection_runs WHERE project_id = r.project_id AND connector_id = r.connector_id
     )`,
      [projectId],
    )
  ).map(toRun);
}

/** Bir bağlayıcının belirli bir andan beri tüm projelerde okuduğu içerik sayısı (günlük sınır için). */
export async function fetchedSince(connectorId: string, since: number): Promise<number> {
  const row = await queryOne<{ total: number | null }>("SELECT SUM(fetched) AS total FROM collection_runs WHERE connector_id = ? AND started_at >= ?", [connectorId, since]);
  return row?.total ?? 0;
}

/* ── Denetim izi ──────────────────────────────────────────────────────── */

interface AuditRow {
  id: string;
  workspace_id: string | null;
  actor: string;
  action: string;
  object_type: string;
  object_id: string | null;
  detail: string | null;
  created_at: number;
}

export interface AuditInput {
  workspaceId: string | null;
  action: string;
  objectType: string;
  objectId?: string | null;
  /** İnsan tarafından okunur kısa açıklama. Ham içerik metni yazılmaz. */
  detail?: string | null;
  /** İşlemi yapan kişinin e-postası; verilmezse (girişsiz kurulum, zamanlayıcı) yerel kullanıcı adı. */
  actor?: string;
  /** İşlemin ilgili olduğu kurum; verilmezse işlemi yapanın kurumu yazılır. */
  orgId?: string | null;
}

export async function recordAudit(input: AuditInput, now: number = Date.now()): Promise<void> {
  const actor = input.actor ?? config.localActor;
  await execute(
    `INSERT INTO audit_events (id, workspace_id, actor, action, object_type, object_id, detail, created_at, org_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, (SELECT org_id FROM users WHERE email = ?)))`,
    [randomUUID(), input.workspaceId, actor, input.action, input.objectType, input.objectId ?? null, input.detail ?? null, now, input.orgId ?? null, actor],
  );
}

function toAuditEvent(row: AuditRow): AuditEvent {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    actor: row.actor,
    action: row.action,
    objectType: row.object_type,
    objectId: row.object_id,
    detail: row.detail,
    createdAt: row.created_at,
  };
}

const AUDIT_COLUMNS = "id, workspace_id, actor, action, object_type, object_id, detail, created_at";

/** Tüm kayıtlar; yalnızca sistem yöneticisi görür. */
export async function listAllAuditEvents(limit: number): Promise<AuditEvent[]> {
  return (await queryAll<AuditRow>(`SELECT ${AUDIT_COLUMNS} FROM audit_events ORDER BY created_at DESC LIMIT ?`, [limit])).map(toAuditEvent);
}

/** Bir kurumun kullanıcılarının işlemleri ve o kurumla ilgili yönetim işlemleri. */
export async function listOrgAuditEvents(orgId: string, limit: number): Promise<AuditEvent[]> {
  return (await queryAll<AuditRow>(`SELECT ${AUDIT_COLUMNS} FROM audit_events WHERE org_id = ? ORDER BY created_at DESC LIMIT ?`, [orgId, limit])).map(toAuditEvent);
}

export async function listAuditEvents(workspaceId: string, limit: number): Promise<AuditEvent[]> {
  return (
    await queryAll<AuditRow>(
      `SELECT id, workspace_id, actor, action, object_type, object_id, detail, created_at
     FROM audit_events WHERE workspace_id = ? OR workspace_id IS NULL ORDER BY created_at DESC LIMIT ?`,
      [workspaceId, limit],
    )
  ).map((row) => ({
    id: row.id,
    workspaceId: row.workspace_id,
    actor: row.actor,
    action: row.action,
    objectType: row.object_type,
    objectId: row.object_id,
    detail: row.detail,
    createdAt: row.created_at,
  }));
}
