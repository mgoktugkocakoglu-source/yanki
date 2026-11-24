import { randomUUID } from "node:crypto";
import type { TimeRange } from "@/domain/types";
import type { RangeKey } from "@/lib/time";
import { execute, queryOne } from "../db/client";

/** Yapay zekâ özetleri: her özet, hangi modelle ve kaç içerikten üretildiğiyle saklanır. */

export interface AiSummaryTheme {
  title: string;
  description: string;
  /** Temayı destekleyen bahsetme kimlikleri; yalnızca modele gönderilenlerden. */
  mentionIds: string[];
}

export interface AiSummary {
  id: string;
  projectId: string;
  rangeKey: RangeKey;
  range: TimeRange;
  provider: string;
  model: string;
  summary: string;
  themes: AiSummaryTheme[];
  /** Modele gönderilen içerik sayısı. */
  mentionsSent: number;
  /** Dönemdeki toplam içerik sayısı. */
  mentionsTotal: number;
  inputTokens: number | null;
  outputTokens: number | null;
  createdAt: number;
}

export type NewAiSummary = Omit<AiSummary, "id"> & { workspaceId: string };

interface AiSummaryRow {
  id: string;
  project_id: string;
  range_key: RangeKey;
  range_from: number;
  range_to: number;
  provider: string;
  model: string;
  summary: string;
  themes: string;
  mentions_sent: number;
  mentions_total: number;
  input_tokens: number | null;
  output_tokens: number | null;
  created_at: number;
}

export function saveAiSummary({ workspaceId, ...input }: NewAiSummary): AiSummary {
  const id = randomUUID();
  execute(
    `INSERT INTO ai_summaries
       (id, workspace_id, project_id, range_key, range_from, range_to, provider, model, summary, themes,
        mentions_sent, mentions_total, input_tokens, output_tokens, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      workspaceId,
      input.projectId,
      input.rangeKey,
      input.range.from,
      input.range.to,
      input.provider,
      input.model,
      input.summary,
      JSON.stringify(input.themes),
      input.mentionsSent,
      input.mentionsTotal,
      input.inputTokens,
      input.outputTokens,
      input.createdAt,
    ],
  );
  return { ...input, id };
}

/** Projenin seçili dönem türü için en son özeti. */
export function getLatestAiSummary(projectId: string, rangeKey: RangeKey): AiSummary | null {
  const row = queryOne<AiSummaryRow>(
    `SELECT id, project_id, range_key, range_from, range_to, provider, model, summary, themes,
            mentions_sent, mentions_total, input_tokens, output_tokens, created_at
     FROM ai_summaries WHERE project_id = ? AND range_key = ? ORDER BY created_at DESC LIMIT 1`,
    [projectId, rangeKey],
  );
  if (!row) return null;
  return {
    id: row.id,
    projectId: row.project_id,
    rangeKey: row.range_key,
    range: { from: row.range_from, to: row.range_to },
    provider: row.provider,
    model: row.model,
    summary: row.summary,
    themes: JSON.parse(row.themes) as AiSummaryTheme[],
    mentionsSent: row.mentions_sent,
    mentionsTotal: row.mentions_total,
    inputTokens: row.input_tokens,
    outputTokens: row.output_tokens,
    createdAt: row.created_at,
  };
}
