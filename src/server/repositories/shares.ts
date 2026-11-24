import { randomBytes } from "node:crypto";
import type { RangeKey } from "@/lib/time";
import { execute, queryAll, queryOne } from "../db/client";

/**
 * Rapor paylaşım bağlantıları. Bağlantı, tahmin edilemeyen bir anahtarla
 * projenin seçili dönem raporunu salt okunur açar; rapor her açılışta güncel
 * veriyle çizilir. İptal edilen bağlantı bir daha açılmaz.
 */

export interface ReportShare {
  token: string;
  projectId: string;
  rangeKey: RangeKey;
  createdAt: number;
  revokedAt: number | null;
}

interface ShareRow {
  token: string;
  project_id: string;
  range_key: RangeKey;
  created_at: number;
  revoked_at: number | null;
}

const COLUMNS = "token, project_id, range_key, created_at, revoked_at";

function toShare(row: ShareRow): ReportShare {
  return { token: row.token, projectId: row.project_id, rangeKey: row.range_key, createdAt: row.created_at, revokedAt: row.revoked_at };
}

/** Proje ve dönem için etkin bağlantı varsa onu döndürür, yoksa yenisini oluşturur. */
export async function ensureShare(workspaceId: string, projectId: string, rangeKey: RangeKey, now: number): Promise<ReportShare> {
  const existing = await queryOne<ShareRow>(`SELECT ${COLUMNS} FROM report_shares WHERE project_id = ? AND range_key = ? AND revoked_at IS NULL ORDER BY created_at DESC LIMIT 1`, [
    projectId,
    rangeKey,
  ]);
  if (existing) return toShare(existing);

  const token = randomBytes(24).toString("base64url");
  await execute("INSERT INTO report_shares (token, workspace_id, project_id, range_key, created_at) VALUES (?, ?, ?, ?, ?)", [token, workspaceId, projectId, rangeKey, now]);
  return { token, projectId, rangeKey, createdAt: now, revokedAt: null };
}

/** Yalnızca etkin (iptal edilmemiş) bağlantıyı döndürür. */
export async function getActiveShare(token: string): Promise<ReportShare | null> {
  const row = await queryOne<ShareRow>(`SELECT ${COLUMNS} FROM report_shares WHERE token = ? AND revoked_at IS NULL`, [token]);
  return row ? toShare(row) : null;
}

export async function listActiveShares(projectId: string): Promise<ReportShare[]> {
  return (await queryAll<ShareRow>(`SELECT ${COLUMNS} FROM report_shares WHERE project_id = ? AND revoked_at IS NULL ORDER BY created_at DESC`, [projectId])).map(toShare);
}

export async function revokeShare(token: string, now: number): Promise<boolean> {
  return (await execute("UPDATE report_shares SET revoked_at = ? WHERE token = ? AND revoked_at IS NULL", [now, token])) > 0;
}
