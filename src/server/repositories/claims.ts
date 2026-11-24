import { randomUUID } from "node:crypto";
import type { TimeRange } from "@/domain/types";
import type { RangeKey } from "@/lib/time";
import { execute, queryAll, queryOne, transaction } from "../db/client";
import type { FactCheck } from "../factcheck/google";

/**
 * İddia deposu. Bir "çalıştırma", seçili dönemin içeriklerinden dil modeliyle
 * çıkarılan iddiaları ve bunlarla eşleşen yayımlanmış doğrulamaları tutar.
 * Proje ve dönem türü başına yalnızca son çalıştırma saklanır.
 */

export type FactCheckStatus = "ok" | "disabled" | "error";

export interface Claim {
  id: string;
  text: string;
  /** İddiayı taşıyan içeriklerin kimlikleri; yalnızca modele gönderilenlerden. */
  mentionIds: string[];
  firstSeenAt: number;
  /** Platform adı → içerik sayısı. */
  platforms: Record<string, number>;
  /** Dil modelinin bu iddiayla eşleştirdiği yayımlanmış doğrulamalar. */
  checks: FactCheck[];
}

export interface ClaimRun {
  id: string;
  projectId: string;
  rangeKey: RangeKey;
  range: TimeRange;
  model: string;
  mentionsSent: number;
  mentionsTotal: number;
  factCheckStatus: FactCheckStatus;
  factCheckMessage: string | null;
  createdAt: number;
  claims: Claim[];
}

export type NewClaimRun = Omit<ClaimRun, "id" | "claims"> & { workspaceId: string; claims: Array<Omit<Claim, "id">> };

interface RunRow {
  id: string;
  project_id: string;
  range_key: RangeKey;
  range_from: number;
  range_to: number;
  model: string;
  mentions_sent: number;
  mentions_total: number;
  factcheck_status: FactCheckStatus;
  factcheck_message: string | null;
  created_at: number;
}

interface CheckRow {
  claim_id: string;
  publisher_name: string;
  publisher_site: string | null;
  url: string;
  title: string;
  rating: string;
  review_date: number | null;
  claim_text: string;
  language: string | null;
}

export async function saveClaimRun({ workspaceId, claims, ...run }: NewClaimRun): Promise<ClaimRun> {
  const id = randomUUID();
  const saved: Claim[] = [];
  await transaction(async () => {
    await execute("DELETE FROM claim_runs WHERE project_id = ? AND range_key = ?", [run.projectId, run.rangeKey]);
    await execute(
      `INSERT INTO claim_runs (id, workspace_id, project_id, range_key, range_from, range_to, model, mentions_sent, mentions_total,
         factcheck_status, factcheck_message, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        workspaceId,
        run.projectId,
        run.rangeKey,
        run.range.from,
        run.range.to,
        run.model,
        run.mentionsSent,
        run.mentionsTotal,
        run.factCheckStatus,
        run.factCheckMessage,
        run.createdAt,
      ],
    );
    for (const [position, claim] of claims.entries()) {
      const claimId = randomUUID();
      await execute("INSERT INTO claims (id, run_id, position, text, first_seen_at, platforms) VALUES (?, ?, ?, ?, ?, ?)", [
        claimId,
        id,
        position,
        claim.text,
        claim.firstSeenAt,
        JSON.stringify(claim.platforms),
      ]);
      for (const mentionId of claim.mentionIds) {
        await execute("INSERT INTO claim_mentions (claim_id, mention_id) VALUES (?, ?) ON CONFLICT DO NOTHING", [claimId, mentionId]);
      }
      for (const check of claim.checks) {
        await execute(
          `INSERT INTO claim_checks (id, claim_id, publisher_name, publisher_site, url, title, rating, review_date, claim_text, language)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [randomUUID(), claimId, check.publisherName, check.publisherSite, check.url, check.title, check.rating, check.reviewDate, check.claimText, check.language],
        );
      }
      saved.push({ ...claim, id: claimId });
    }
  });
  return { ...run, id, claims: saved };
}

/** Projenin seçili dönem türü için son çalıştırması. */
export async function getLatestClaimRun(projectId: string, rangeKey: RangeKey): Promise<ClaimRun | null> {
  const row = await queryOne<RunRow>(
    `SELECT id, project_id, range_key, range_from, range_to, model, mentions_sent, mentions_total, factcheck_status, factcheck_message, created_at
     FROM claim_runs WHERE project_id = ? AND range_key = ? ORDER BY created_at DESC LIMIT 1`,
    [projectId, rangeKey],
  );
  if (!row) return null;

  const claimRows = await queryAll<{ id: string; text: string; first_seen_at: number; platforms: string }>(
    "SELECT id, text, first_seen_at, platforms FROM claims WHERE run_id = ? ORDER BY position",
    [row.id],
  );
  const mentionRows = await queryAll<{ claim_id: string; mention_id: string }>(
    "SELECT cm.claim_id, cm.mention_id FROM claim_mentions cm JOIN claims c ON c.id = cm.claim_id JOIN mentions m ON m.id = cm.mention_id WHERE c.run_id = ? ORDER BY m.published_at",
    [row.id],
  );
  const checkRows = await queryAll<CheckRow>(
    `SELECT k.claim_id, k.publisher_name, k.publisher_site, k.url, k.title, k.rating, k.review_date, k.claim_text, k.language
     FROM claim_checks k JOIN claims c ON c.id = k.claim_id WHERE c.run_id = ? ORDER BY k.review_date DESC`,
    [row.id],
  );

  return {
    id: row.id,
    projectId: row.project_id,
    rangeKey: row.range_key,
    range: { from: row.range_from, to: row.range_to },
    model: row.model,
    mentionsSent: row.mentions_sent,
    mentionsTotal: row.mentions_total,
    factCheckStatus: row.factcheck_status,
    factCheckMessage: row.factcheck_message,
    createdAt: row.created_at,
    claims: claimRows.map((claim) => ({
      id: claim.id,
      text: claim.text,
      firstSeenAt: claim.first_seen_at,
      platforms: JSON.parse(claim.platforms) as Record<string, number>,
      mentionIds: mentionRows.filter((entry) => entry.claim_id === claim.id).map((entry) => entry.mention_id),
      checks: checkRows
        .filter((check) => check.claim_id === claim.id)
        .map((check) => ({
          publisherName: check.publisher_name,
          publisherSite: check.publisher_site,
          url: check.url,
          title: check.title,
          rating: check.rating,
          reviewDate: check.review_date,
          claimText: check.claim_text,
          language: check.language,
        })),
    })),
  };
}
