import type { NextRequest } from "next/server";
import { EMOTION_LABELS, INTENT_LABELS, SENTIMENT_LABELS, SOURCE_TYPE_LABELS } from "@/domain/labels";
import { effectiveSentiment, type Mention } from "@/domain/types";
import { TIMEZONE } from "@/lib/time";
import { loadProjectContext, type SearchParams } from "@/server/context";
import { listMentions } from "@/server/repositories/mentions";
import { listTopics } from "@/server/repositories/projects";
import { recordAudit } from "@/server/repositories/runs";
import { readMentionQuery } from "@/server/services/mention-query";

/**
 * CSV dışa aktarımı. Ekrandaki süzgecin aynısını kullanır.
 * Türkçe Excel'in doğrudan açabilmesi için noktalı virgül ayırıcı ve BOM
 * kullanılır; formül enjeksiyonuna karşı riskli hücreler etkisizleştirilir.
 */

const MAX_ROWS = 50_000;
const SEPARATOR = ";";
const FORMULA_START = /^[=+\-@\t\r]/;

const timestamp = new Intl.DateTimeFormat("sv-SE", { timeZone: TIMEZONE, dateStyle: "short", timeStyle: "medium" });

function cell(value: string | number | null): string {
  if (value === null) return "";
  let text = String(value);
  // Hesap tablosu, "=" ile başlayan hücreyi formül olarak çalıştırır.
  if (typeof value === "string" && FORMULA_START.test(text)) text = `'${text}`;
  return /[";\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

const COLUMNS = [
  "Yayın zamanı",
  "Kaynak türü",
  "Kaynak",
  "Yazar",
  "Başlık",
  "İçerik",
  "Ton",
  "Ton düzeltildi mi",
  "Ton puanı",
  "Duygu",
  "Niyet",
  "İroni şüphesi",
  "Konular",
  "Etkileşim",
  "Erişim tabanı",
  "Dil",
  "Bağlantı",
];

function toRow(mention: Mention, topicNames: ReadonlyMap<string, string>): string {
  return [
    timestamp.format(mention.publishedAt),
    SOURCE_TYPE_LABELS[mention.sourceType],
    mention.sourceName,
    mention.authorHandle ?? mention.authorName,
    mention.title,
    mention.content,
    SENTIMENT_LABELS[effectiveSentiment(mention)],
    mention.sentimentOverride ? "evet" : "hayır",
    mention.sentimentScore,
    EMOTION_LABELS[mention.emotion],
    INTENT_LABELS[mention.intent],
    mention.isSarcastic ? "evet" : "hayır",
    mention.topicIds
      .map((id) => topicNames.get(id))
      .filter(Boolean)
      .join(", "),
    mention.engagement,
    mention.reach,
    mention.language,
    mention.url,
  ]
    .map(cell)
    .join(SEPARATOR);
}

export async function GET(request: NextRequest, context: RouteContext<"/api/proje/[id]/disa-aktar">) {
  const { id } = await context.params;
  const loaded = await loadProjectContext(id);
  if (!loaded) return new Response("Proje bulunamadı.", { status: 404 });

  const searchParams: SearchParams = Object.fromEntries(request.nextUrl.searchParams);
  const query = readMentionQuery(loaded.project, searchParams, loaded.now);
  if (query.queryError) return new Response(`Sorgu geçersiz: ${query.queryError}`, { status: 422 });

  const mentions = await listMentions(query.filter, { limit: MAX_ROWS, offset: 0 });
  const topicNames = new Map((await listTopics(loaded.project.id)).map((topic) => [topic.id, topic.name]));
  const body = `﻿${[COLUMNS.join(SEPARATOR), ...mentions.map((mention) => toRow(mention, topicNames))].join("\r\n")}\r\n`;

  await recordAudit({
    workspaceId: loaded.workspace.id,
    action: "dışa-aktarım.csv",
    objectType: "proje",
    objectId: loaded.project.id,
    detail: `${mentions.length} satır${query.queryText ? `, süzgeç: ${query.queryText}` : ""}`,
  });

  const fileName = `yanki-${timestamp.format(loaded.now).slice(0, 10)}.csv`;
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "no-store",
    },
  });
}
