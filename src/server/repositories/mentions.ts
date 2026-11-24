import type { Mention, ReachBasis, Sentiment, SourceType, TimeRange } from "@/domain/types";
import { compileToSql, type QueryNode } from "@/lib/query";
import { execute, queryAll, queryOne, transaction, type SqlParams } from "../db/client";

/**
 * Bahsetme deposu. Liste, sayım ve tüm analitik sorgular aynı `MentionFilter`
 * ve aynı `buildWhere` işlevinden geçer; grafikteki sayı ile listedeki sayının
 * tutmaması böylece yapısal olarak engellenir.
 */

export interface MentionFilter {
  projectId: string;
  range?: TimeRange;
  /** Kullanıcının yazdığı ek Boolean süzgeç. */
  query?: QueryNode;
  /** Varsayılan: ilgisiz işaretlenenler dışarıda. */
  includeIrrelevant?: boolean;
}

export interface WhereClause {
  sql: string;
  params: SqlParams;
}

/** Önce kullanıcı düzeltmesi, sonra dil modeli, sonra kural tabanlı sonuç (bkz. `effectiveSentiment`). */
export const EFFECTIVE_SENTIMENT = "COALESCE(m.sentiment_override, m.ai_sentiment, m.sentiment)";

export function buildWhere(filter: MentionFilter): WhereClause {
  const conditions = ["m.project_id = ?"];
  const params: SqlParams = [filter.projectId];

  if (filter.range) {
    conditions.push("m.published_at >= ? AND m.published_at < ?");
    params.push(filter.range.from, filter.range.to);
  }
  if (!filter.includeIrrelevant) {
    conditions.push("m.is_irrelevant = 0");
  }
  if (filter.query) {
    const compiled = compileToSql(filter.query, "m");
    conditions.push(compiled.sql);
    params.push(...compiled.params);
  }
  return { sql: conditions.join(" AND "), params };
}

interface MentionRow {
  id: string;
  workspace_id: string;
  project_id: string;
  connector_id: string;
  source_type: SourceType;
  source_name: string;
  external_id: string;
  url: string;
  title: string;
  content: string;
  author_name: string | null;
  author_handle: string | null;
  author_followers: number | null;
  language: string;
  published_at: number;
  collected_at: number;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  views: number | null;
  engagement: number | null;
  reach: number | null;
  reach_basis: ReachBasis;
  sentiment: Sentiment;
  sentiment_score: number;
  sentiment_confidence: number;
  emotion: Mention["emotion"];
  is_sarcastic: number;
  intent: Mention["intent"];
  story_key: string;
  sentiment_override: Sentiment | null;
  ai_sentiment: Sentiment | null;
  ai_model: string | null;
  is_irrelevant: number;
  is_demo: number;
}

const MENTION_COLUMNS = `m.id, m.workspace_id, m.project_id, m.connector_id, m.source_type, m.source_name,
  m.external_id, m.url, m.title, m.content, m.author_name, m.author_handle, m.author_followers, m.language,
  m.published_at, m.collected_at, m.likes, m.comments, m.shares, m.views, m.engagement, m.reach, m.reach_basis,
  m.sentiment, m.sentiment_score, m.sentiment_confidence, m.emotion, m.is_sarcastic, m.intent, m.story_key,
  m.sentiment_override, m.ai_sentiment, m.ai_model, m.is_irrelevant, m.is_demo`;

function toMention(row: MentionRow, topics: MentionTopicIds = NO_TOPICS): Mention {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    projectId: row.project_id,
    connectorId: row.connector_id,
    sourceType: row.source_type,
    sourceName: row.source_name,
    externalId: row.external_id,
    url: row.url,
    title: row.title,
    content: row.content,
    authorName: row.author_name,
    authorHandle: row.author_handle,
    authorFollowers: row.author_followers,
    language: row.language,
    publishedAt: row.published_at,
    collectedAt: row.collected_at,
    likes: row.likes,
    comments: row.comments,
    shares: row.shares,
    views: row.views,
    engagement: row.engagement,
    reach: row.reach,
    reachBasis: row.reach_basis,
    sentiment: row.sentiment,
    sentimentScore: row.sentiment_score,
    sentimentConfidence: row.sentiment_confidence,
    emotion: row.emotion,
    isSarcastic: row.is_sarcastic === 1,
    intent: row.intent,
    storyKey: row.story_key,
    sentimentOverride: row.sentiment_override,
    aiSentiment: row.ai_sentiment,
    aiModel: row.ai_model,
    isIrrelevant: row.is_irrelevant === 1,
    isDemo: row.is_demo === 1,
    topicIds: topics.all,
    aiTopicIds: topics.ai,
  };
}

interface MentionTopicIds {
  all: string[];
  ai: string[];
}

const NO_TOPICS: MentionTopicIds = { all: [], ai: [] };

function loadTopicIds(mentionIds: string[]): Map<string, MentionTopicIds> {
  const byMention = new Map<string, MentionTopicIds>();
  if (mentionIds.length === 0) return byMention;

  const placeholders = mentionIds.map(() => "?").join(", ");
  const rows = queryAll<{ mention_id: string; topic_id: string; source: string }>(
    `SELECT mention_id, topic_id, source FROM mention_topics WHERE mention_id IN (${placeholders})`,
    mentionIds,
  );
  for (const row of rows) {
    const entry = byMention.get(row.mention_id) ?? { all: [], ai: [] };
    entry.all.push(row.topic_id);
    if (row.source === "ai") entry.ai.push(row.topic_id);
    byMention.set(row.mention_id, entry);
  }
  return byMention;
}

export type MentionSort = "recent" | "engagement" | "followers";

const ORDER_BY: Record<MentionSort, string> = {
  recent: "m.published_at DESC, m.id",
  engagement: "COALESCE(m.engagement, -1) DESC, m.published_at DESC, m.id",
  followers: "COALESCE(m.author_followers, -1) DESC, m.published_at DESC, m.id",
};

export interface Page {
  limit: number;
  offset: number;
}

export function listMentions(filter: MentionFilter, page: Page, sort: MentionSort = "recent"): Mention[] {
  const where = buildWhere(filter);
  const rows = queryAll<MentionRow>(
    `SELECT ${MENTION_COLUMNS} FROM mentions m WHERE ${where.sql} ORDER BY ${ORDER_BY[sort]} LIMIT ? OFFSET ?`,
    [...where.params, page.limit, page.offset],
  );
  const topics = loadTopicIds(rows.map((row) => row.id));
  return rows.map((row) => toMention(row, topics.get(row.id)));
}

export function countMentions(filter: MentionFilter): number {
  const where = buildWhere(filter);
  const row = queryOne<{ count: number }>(`SELECT COUNT(*) AS count FROM mentions m WHERE ${where.sql}`, where.params);
  return row?.count ?? 0;
}

export function getMention(id: string): Mention | null {
  const row = queryOne<MentionRow>(`SELECT ${MENTION_COLUMNS} FROM mentions m WHERE m.id = ?`, [id]);
  return row ? toMention(row, loadTopicIds([id]).get(id)) : null;
}

export interface NewMention extends Omit<Mention, "sentimentOverride" | "isIrrelevant" | "aiSentiment" | "aiModel" | "aiTopicIds"> {
  searchText: string;
  analyzerVersion: string;
}

const INSERT_SQL = `INSERT OR IGNORE INTO mentions (
  id, workspace_id, project_id, connector_id, source_type, source_name, external_id, url, title, content, search_text,
  author_name, author_handle, author_followers, language, published_at, collected_at, likes, comments, shares, views,
  engagement, reach, reach_basis, sentiment, sentiment_score, sentiment_confidence, emotion, is_sarcastic, intent,
  story_key, analyzer_version, is_demo
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

function insertOne(mention: NewMention): boolean {
  const inserted = execute(INSERT_SQL, [
    mention.id,
    mention.workspaceId,
    mention.projectId,
    mention.connectorId,
    mention.sourceType,
    mention.sourceName,
    mention.externalId,
    mention.url,
    mention.title,
    mention.content,
    mention.searchText,
    mention.authorName,
    mention.authorHandle,
    mention.authorFollowers,
    mention.language,
    mention.publishedAt,
    mention.collectedAt,
    mention.likes,
    mention.comments,
    mention.shares,
    mention.views,
    mention.engagement,
    mention.reach,
    mention.reachBasis,
    mention.sentiment,
    mention.sentimentScore,
    mention.sentimentConfidence,
    mention.emotion,
    mention.isSarcastic ? 1 : 0,
    mention.intent,
    mention.storyKey,
    mention.analyzerVersion,
    mention.isDemo ? 1 : 0,
  ]);
  if (inserted === 0) return false;

  for (const topicId of mention.topicIds) {
    execute("INSERT OR IGNORE INTO mention_topics (mention_id, topic_id) VALUES (?, ?)", [mention.id, topicId]);
  }
  return true;
}

/**
 * Bahsetmeleri ekler. Aynı kaynak kimliği daha önce kaydedildiyse atlanır
 * (idempotent); dönen sayı gerçekten eklenen yeni kayıtlardır.
 */
export function insertMentions(mentions: NewMention[]): number {
  if (mentions.length === 0) return 0;
  return transaction(() => mentions.reduce((count, mention) => count + (insertOne(mention) ? 1 : 0), 0));
}

export function setSentimentOverride(id: string, sentiment: Sentiment | null): void {
  execute("UPDATE mentions SET sentiment_override = ? WHERE id = ?", [sentiment, id]);
}

export function setIrrelevant(id: string, isIrrelevant: boolean): void {
  execute("UPDATE mentions SET is_irrelevant = ? WHERE id = ?", [isIrrelevant ? 1 : 0, id]);
}

/** Projenin kural tabanlı konu eşleşmelerini baştan yazar; dil modelinin atadıkları korunur. */
export function replaceMentionTopics(projectId: string, assignments: Array<{ mentionId: string; topicId: string }>): void {
  transaction(() => {
    execute("DELETE FROM mention_topics WHERE source = 'rule' AND mention_id IN (SELECT id FROM mentions WHERE project_id = ?)", [projectId]);
    for (const { mentionId, topicId } of assignments) {
      execute("INSERT OR IGNORE INTO mention_topics (mention_id, topic_id) VALUES (?, ?)", [mentionId, topicId]);
    }
  });
}

/* ── Dil modeli sınıflandırması ───────────────────────────────────────── */

/** Dönemin henüz dil modeliyle sınıflandırılmamış içerikleri, en yeniden eskiye. */
export function listUnclassified(filter: MentionFilter, limit: number): Mention[] {
  const where = buildWhere(filter);
  const rows = queryAll<MentionRow>(
    `SELECT ${MENTION_COLUMNS} FROM mentions m WHERE ${where.sql} AND m.ai_classified_at IS NULL ORDER BY m.published_at DESC, m.id LIMIT ?`,
    [...where.params, limit],
  );
  const topics = loadTopicIds(rows.map((row) => row.id));
  return rows.map((row) => toMention(row, topics.get(row.id)));
}

export function countAiClassified(filter: MentionFilter): number {
  const where = buildWhere(filter);
  const row = queryOne<{ count: number }>(`SELECT COUNT(*) AS count FROM mentions m WHERE ${where.sql} AND m.ai_classified_at IS NOT NULL`, where.params);
  return row?.count ?? 0;
}

export interface AiClassification {
  mentionId: string;
  sentiment: Sentiment;
  topicIds: string[];
}

/** Dil modeli sonucunu yazar. Kural tabanlı sonuç ve insan düzeltmesi silinmez. */
export function saveAiClassifications(classifications: AiClassification[], model: string, now: number): void {
  transaction(() => {
    for (const { mentionId, sentiment, topicIds } of classifications) {
      execute("UPDATE mentions SET ai_sentiment = ?, ai_model = ?, ai_classified_at = ? WHERE id = ?", [sentiment, model, now, mentionId]);
      for (const topicId of topicIds) {
        execute("INSERT OR IGNORE INTO mention_topics (mention_id, topic_id, source) VALUES (?, ?, 'ai')", [mentionId, topicId]);
      }
    }
  });
}

export interface SearchableMention {
  id: string;
  searchText: string;
}

/** Yeniden etiketleme ve kök neden analizi için yalnızca arama metinleri. */
export function listSearchTexts(filter: MentionFilter, limit: number): SearchableMention[] {
  const where = buildWhere(filter);
  return queryAll<{ id: string; search_text: string }>(
    `SELECT m.id, m.search_text FROM mentions m WHERE ${where.sql} ORDER BY m.published_at DESC LIMIT ?`,
    [...where.params, limit],
  ).map((row) => ({ id: row.id, searchText: row.search_text }));
}

export interface MentionText {
  title: string;
  content: string;
  storyKey: string;
}

/** Yalnızca başlık ve içerik; öne çıkan ifadeleri özgün yazımıyla bulmak için. */
export function listTexts(filter: MentionFilter, limit: number): MentionText[] {
  const where = buildWhere(filter);
  return queryAll<{ title: string; content: string; story_key: string }>(
    `SELECT m.title, m.content, m.story_key FROM mentions m WHERE ${where.sql} ORDER BY m.published_at DESC LIMIT ?`,
    [...where.params, limit],
  ).map((row) => ({ title: row.title, content: row.content, storyKey: row.story_key }));
}

/**
 * Kapsam başlangıcı: projenin elindeki en eski içeriğin zamanı. Bu andan
 * öncesi "sıfır bahsetme" değil, "veri yok"tur; karşılaştırma ve anomali
 * hesapları bu ayrımı gözetir.
 */
export function earliestPublishedAt(projectId: string): number | null {
  const row = queryOne<{ earliest: number | null }>("SELECT MIN(published_at) AS earliest FROM mentions WHERE project_id = ?", [projectId]);
  return row?.earliest ?? null;
}

export function latestCollectedAt(projectId: string): number | null {
  const row = queryOne<{ latest: number | null }>("SELECT MAX(collected_at) AS latest FROM mentions WHERE project_id = ?", [projectId]);
  return row?.latest ?? null;
}

export function latestPublishedAt(projectId: string): number | null {
  const row = queryOne<{ latest: number | null }>("SELECT MAX(published_at) AS latest FROM mentions WHERE project_id = ?", [projectId]);
  return row?.latest ?? null;
}

