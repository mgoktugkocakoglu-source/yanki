import { createHash, randomUUID } from "node:crypto";
import type { Project, ProjectTopic, RawItem, ReachBasis } from "@/domain/types";
import { ANALYZER_VERSION, analyzeText } from "@/lib/analysis/analyze";
import { matchQuery, parseQuery, type MatchableFields, type QueryNode } from "@/lib/query";
import { excerptAround } from "@/lib/text/html";
import { tokenizeWithSpans, toSearchText } from "@/lib/text/normalize";
import type { NewMention } from "../repositories/mentions";

/**
 * Ham içeriği bahsetmeye çeviren saf dönüşüm: temizle → çözümle → konuları
 * etiketle → proje sorgusuyla eşleştir. Veritabanına ve ağa dokunmaz; canlı
 * toplama, önizleme ve demo verisi aynı işlevden geçer.
 */

export interface PreparedProject {
  project: Project;
  ast: QueryNode;
  topics: Array<{ id: string; name: string; ast: QueryNode }>;
}

/** Sorguları bir kez ayrıştırır; her içerik için yeniden ayrıştırılmaz. */
export function prepareProject(project: Project, topics: ProjectTopic[]): PreparedProject {
  return {
    project,
    ast: parseQuery(project.query),
    topics: topics.map((topic) => ({ id: topic.id, name: topic.name, ast: parseQuery(topic.query) })),
  };
}

const MAX_TITLE_LENGTH = 300;
/** Haberlerde tam metin saklanmaz; eşleşmenin çevresinden kısa bir alıntı alınır. */
const NEWS_EXCERPT_LENGTH = 480;
const MAX_CONTENT_LENGTH = 3000;
const STORY_KEY_TOKENS = 12;

function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function sumKnown(...values: Array<number | null>): number | null {
  const known = values.filter((value): value is number => value !== null);
  return known.length > 0 ? known.reduce((sum, value) => sum + value, 0) : null;
}

/**
 * Erişim tahmini yalnızca kaynağın verdiği bir dayanak varsa üretilir.
 * Dayanak yoksa sayı uydurulmaz; alan boş kalır ve arayüz bunu belirtir.
 */
function estimateReach(raw: RawItem): { reach: number | null; reachBasis: ReachBasis } {
  if (raw.views !== null) return { reach: raw.views, reachBasis: "views" };
  if (raw.authorFollowers !== null) return { reach: raw.authorFollowers, reachBasis: "followers" };
  return { reach: null, reachBasis: null };
}

/** Aynı başlıkla çıkan yayınları (ajans haberi, kopyala-yapıştır gönderi) gruplar. */
function storyKeyOf(tokens: string[], fallback: string): string {
  const basis = tokens.length > 0 ? tokens.slice(0, STORY_KEY_TOKENS).join(" ") : fallback;
  return createHash("sha1").update(basis).digest("hex").slice(0, 16);
}

export interface IngestOptions {
  now: number;
  isDemo: boolean;
}

/** İçerik proje sorgusuyla eşleşmiyorsa null döner. */
export function buildMention(raw: RawItem, prepared: PreparedProject, options: IngestOptions): NewMention | null {
  const title = collapseWhitespace(raw.title).slice(0, MAX_TITLE_LENGTH);
  const fullContent = collapseWhitespace(raw.content).slice(0, MAX_CONTENT_LENGTH * 4);
  const combined = `${title}\n${fullContent}`;

  const spans = tokenizeWithSpans(combined);
  const tokens = spans.map((span) => span.token);
  const analysis = analyzeText({ title, content: fullContent, languageHint: raw.language });
  const engagement = sumKnown(raw.likes, raw.comments, raw.shares);
  const { reach, reachBasis } = estimateReach(raw);

  const baseFields: MatchableFields = {
    sourceType: raw.sourceType,
    site: raw.sourceName,
    sentiment: analysis.sentiment,
    emotion: analysis.emotion,
    intent: analysis.intent,
    language: analysis.language,
    author: `${raw.authorHandle ?? ""} ${raw.authorName ?? ""}`,
    topics: [],
    isSarcastic: analysis.isSarcastic,
    reach,
    engagement,
    followers: raw.authorFollowers,
  };

  const matchedTopics = prepared.topics.filter((topic) => matchQuery(topic.ast, tokens, baseFields).matched);
  const match = matchQuery(prepared.ast, tokens, { ...baseFields, topics: matchedTopics.map((topic) => topic.name) });
  if (!match.matched) return null;

  // Alıntı, sorguyu sağlayan ilk kelimenin çevresinden kesilir ki kanıt görünür kalsın.
  const contentOffset = title.length + 1;
  const firstHit = match.hits[0];
  const hitStart = firstHit ? spans[firstHit[0]].start : 0;
  const focus = Math.max(0, hitStart - contentOffset);
  const limit = raw.sourceType === "news" ? NEWS_EXCERPT_LENGTH : MAX_CONTENT_LENGTH;
  const content = excerptAround(fullContent, focus, limit);

  return {
    id: randomUUID(),
    workspaceId: prepared.project.workspaceId,
    projectId: prepared.project.id,
    connectorId: raw.connectorId,
    sourceType: raw.sourceType,
    sourceName: raw.sourceName,
    externalId: raw.externalId,
    url: raw.url,
    title,
    content,
    searchText: toSearchText(title, content),
    authorName: raw.authorName,
    authorHandle: raw.authorHandle,
    authorFollowers: raw.authorFollowers,
    publishedAt: raw.publishedAt,
    collectedAt: options.now,
    likes: raw.likes,
    comments: raw.comments,
    shares: raw.shares,
    views: raw.views,
    engagement,
    reach,
    reachBasis,
    ...analysis,
    storyKey: storyKeyOf(tokens, raw.externalId),
    analyzerVersion: ANALYZER_VERSION,
    isDemo: options.isDemo,
    topicIds: matchedTopics.map((topic) => topic.id),
  };
}
