"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { z } from "zod";
import { SENTIMENTS, type Project, type Sentiment } from "@/domain/types";
import { buildCollectionPlan, tryParseQuery, type QueryNode } from "@/lib/query";
import { isRangeKey } from "@/lib/time";
import { canSeeProject, creditShortage, spendCredits, visibleProjects, type Viewer } from "./auth/access";
import { enterAction } from "./auth/session";
import { defaultConnectorIds, getConnector, isConnectorUsable } from "./collectors/registry";
import { rememberWorkspace } from "./context";
import { collectProject, previewCollection, type PreviewResult } from "./pipeline/collect";
import { retagProject } from "./pipeline/retag";
import { getMention, setIrrelevant, setSentimentOverride } from "./repositories/mentions";
import { createProject, deleteProject, getProject, listProjects, replaceTopics, updateProject, type TopicInput } from "./repositories/projects";
import { recordAudit } from "./repositories/runs";
import { ensureShare, getActiveShare, revokeShare } from "./repositories/shares";
import { setProjectOwner } from "./repositories/users";
import { getWorkspace, getWorkspaceByKind } from "./repositories/workspaces";
import { askQuestion } from "./services/ai-ask";
import { classifyMentions } from "./services/ai-classify";
import { generateAiSummary } from "./services/ai-summary";
import { scanClaims } from "./services/claims";

/**
 * Sunucu işlevleri: arayüzden gelen tüm değişiklikler buradan geçer.
 * Her işlev girdisini doğrular, değişikliği yapar ve denetim izine yazar.
 */

export interface FormState {
  ok: boolean;
  message: string;
  /** Alan adı → hata iletisi. */
  errors: Record<string, string>;
}

const failure = (message: string, errors: Record<string, string> = {}): FormState => ({ ok: false, message, errors });

/**
 * Her işlevin ilk adımı: oturumu doğrular (giriş zorunluysa), denetim izi için
 * kişiyi belirler ve istenen projeye erişimi denetler. Erişilemeyen proje
 * "yok" sayılır.
 */
async function authorize(projectId: string): Promise<{ viewer: Viewer; project: Project | null }> {
  const viewer = await enterAction();
  const project = getProject(projectId);
  return { viewer, project: project && canSeeProject(viewer, project) ? project : null };
}



/* ── Çalışma alanı ────────────────────────────────────────────────────── */

export async function selectWorkspaceAction(formData: FormData): Promise<void> {
  const viewer = await enterAction();
  const workspace = getWorkspace(String(formData.get("workspaceId") ?? ""));
  if (!workspace) return;
  await rememberWorkspace(workspace.id);
  const [firstProject] = visibleProjects(viewer, listProjects(workspace.id));
  redirect(firstProject ? `/proje/${firstProject.id}` : "/projeler");
}

/* ── Proje ────────────────────────────────────────────────────────────── */

const projectSchema = z.object({
  name: z.string().trim().min(2, "En az 2 karakter yazın.").max(80, "En çok 80 karakter olabilir."),
  description: z.string().trim().max(200, "En çok 200 karakter olabilir."),
  query: z.string().trim().min(1, "Sorgu boş olamaz."),
  connectorIds: z.array(z.string()).min(1, "En az bir kaynak seçin."),
});

function validateQuery(query: string): { ok: true; ast: QueryNode } | { ok: false; message: string } {
  const parsed = tryParseQuery(query);
  if (!parsed.ok) return { ok: false, message: parsed.message };
  if (!buildCollectionPlan(parsed.ast)) {
    return { ok: false, message: "Sorgu, kaynaklarda aranabilecek en az bir kelime içermeli (yalnızca filtre ya da DEĞİL yetmez)." };
  }
  return { ok: true, ast: parsed.ast };
}

function readProjectForm(formData: FormData) {
  return projectSchema.safeParse({
    name: formData.get("name") ?? "",
    description: formData.get("description") ?? "",
    query: formData.get("query") ?? "",
    connectorIds: formData.getAll("connectorIds").map(String),
  });
}

function fieldErrors(error: z.ZodError): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of error.issues) {
    const field = String(issue.path[0] ?? "form");
    errors[field] ??= issue.message;
  }
  return errors;
}

export async function saveProjectAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const viewer = await enterAction();
  const parsed = readProjectForm(formData);
  if (!parsed.success) return failure("Formda düzeltilmesi gereken alanlar var.", fieldErrors(parsed.error));

  const query = validateQuery(parsed.data.query);
  if (!query.ok) return failure("Sorgu geçerli değil.", { query: query.message });

  const connectorIds = parsed.data.connectorIds.filter((id) => {
    const connector = getConnector(id);
    return connector !== undefined && isConnectorUsable(connector);
  });
  if (connectorIds.length === 0) return failure("Seçilen kaynaklar bu kurulumda kullanılamıyor.", { connectorIds: "Geçerli bir kaynak seçin." });

  const input = { ...parsed.data, connectorIds };
  const now = Date.now();
  const projectId = String(formData.get("projectId") ?? "");

  if (projectId) {
    const existing = getProject(projectId);
    if (existing && !canSeeProject(viewer, existing)) return failure("Proje bulunamadı.");
    if (!existing || getWorkspace(existing.workspaceId)?.kind !== "live") {
      return failure("Demo projeleri düzenlenemez.");
    }
    updateProject(projectId, input, now);
    recordAudit({ actor: viewer?.email, workspaceId: existing.workspaceId, action: "proje.güncellendi", objectType: "proje", objectId: projectId, detail: input.name });
    after(() => collectProject(projectId));
    redirect(`/proje/${projectId}/kaynaklar?kaydedildi=1`);
  }

  const workspace = getWorkspace(String(formData.get("workspaceId") ?? ""));
  if (workspace?.kind !== "live") return failure("Yeni proje yalnızca canlı çalışma alanında açılabilir.");

  const shortage = creditShortage(viewer, "search");
  if (shortage) return failure(shortage);
  const project = createProject(workspace.id, input, now);
  if (viewer) setProjectOwner(project.id, viewer.id);
  spendCredits(viewer, "search", project.id, now);
  recordAudit({ actor: viewer?.email, workspaceId: workspace.id, action: "proje.oluşturuldu", objectType: "proje", objectId: project.id, detail: project.name });
  // Proje canlı alanda açıldı; çalışma alanı sayfaları da artık o alanı göstersin.
  await rememberWorkspace(workspace.id);
  // İlk tarama yanıtı bekletmesin; kaynaklar ekranı durumu gösterir.
  after(() => collectProject(project.id));
  redirect(`/proje/${project.id}/kaynaklar?yeni=1`);
}

/** Arama ekranında seçilebilen diller (ISO 639-1). */
const SEARCH_LANGUAGES: readonly string[] = ["tr", "en", "ar", "de", "fr", "es", "ru"];

/**
 * Hızlı arama: yazılan konuyu canlı çalışma alanında bir projeye çevirir,
 * kaynakları hemen tarar ve sonuç ekranını açar. Aynı sorgu daha önce
 * arandıysa o proje yeniden taranıp açılır.
 */
export async function quickSearchAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const viewer = await enterAction();
  const text = String(formData.get("query") ?? "").trim();
  if (text.length < 2) return failure("Aramak istediğiniz konuyu yazın.", { query: "En az 2 karakter yazın." });
  if (text.length > 400) return failure("Sorgu çok uzun.", { query: "En çok 400 karakter olabilir." });

  // Dil seçimi sorguya `dil:` süzgeci olarak eklenir; kullanıcı kendisi yazdıysa dokunulmaz.
  const language = String(formData.get("language") ?? "");
  const hasLanguageFilter = /(^|[\s(])(dil|lang):/i.test(text);
  const fullQuery = SEARCH_LANGUAGES.includes(language) && !hasLanguageFilter ? `(${text}) dil:${language}` : text;

  const query = validateQuery(fullQuery);
  if (!query.ok) return failure("Sorgu geçerli değil.", { query: query.message });

  const workspace = getWorkspaceByKind("live");
  if (!workspace) return failure("Canlı çalışma alanı bulunamadı.");

  // Platform seçimi isteğe bağlıdır; form göndermediyse kullanılabilir tüm kaynaklar taranır.
  const usable = defaultConnectorIds();
  const connectorIds = formData.has("platformsShown") ? formData.getAll("connectorIds").map(String).filter((id) => usable.includes(id)) : usable;
  if (connectorIds.length === 0) return failure("En az bir platform seçin.", { connectorIds: "En az bir platform seçin." });

  let project = visibleProjects(viewer, listProjects(workspace.id)).find((entry) => entry.query === fullQuery) ?? null;
  if (project && project.connectorIds.join() !== connectorIds.join()) {
    updateProject(project.id, { name: project.name, description: project.description, query: project.query, connectorIds }, Date.now());
  }
  if (!project) {
    const shortage = creditShortage(viewer, "search");
    if (shortage) return failure(shortage);
    project = createProject(workspace.id, { name: text.slice(0, 80), description: "", query: fullQuery, connectorIds }, Date.now());
    if (viewer) setProjectOwner(project.id, viewer.id);
    spendCredits(viewer, "search", project.id, Date.now());
    recordAudit({ actor: viewer?.email, workspaceId: workspace.id, action: "arama.yapıldı", objectType: "proje", objectId: project.id, detail: text });
  }
  await rememberWorkspace(workspace.id);
  await collectProject(project.id);
  redirect(`/proje/${project.id}`);
}

export async function deleteProjectAction(formData: FormData): Promise<void> {
  const { viewer, project } = await authorize(String(formData.get("projectId") ?? ""));
  if (!project || getWorkspace(project.workspaceId)?.kind !== "live") return;
  deleteProject(project.id);
  recordAudit({ actor: viewer?.email, workspaceId: project.workspaceId, action: "proje.silindi", objectType: "proje", objectId: project.id, detail: project.name });
  redirect("/projeler");
}

/* ── Konular ──────────────────────────────────────────────────────────── */

function usesFieldFilter(ast: QueryNode): boolean {
  switch (ast.kind) {
    case "field":
      return true;
    case "not":
      return usesFieldFilter(ast.child);
    case "and":
    case "or":
      return ast.children.some(usesFieldFilter);
    case "text":
    case "near":
      return false;
  }
}

const MAX_TOPICS = 60;

/** Her satır: "Grup | Konu adı | sorgu". */
function parseTopicLines(text: string): { topics: TopicInput[] } | { error: string } {
  const topics: TopicInput[] = [];
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length > MAX_TOPICS) return { error: `En çok ${MAX_TOPICS} konu tanımlanabilir.` };

  for (const [index, line] of lines.entries()) {
    const [groupName, name, ...rest] = line.split("|").map((part) => part.trim());
    const query = rest.join("|").trim();
    if (!groupName || !name || !query) {
      return { error: `${index + 1}. satır eksik. Biçim: Grup | Konu adı | sorgu` };
    }
    const parsed = tryParseQuery(query);
    if (!parsed.ok) return { error: `${index + 1}. satır (“${name}”): ${parsed.message}` };
    if (usesFieldFilter(parsed.ast)) {
      return { error: `${index + 1}. satır (“${name}”): konu sorguları yalnızca kelime içerebilir; alan filtresi kullanılamaz.` };
    }
    topics.push({ groupName, name, query });
  }
  return { topics };
}

export async function saveTopicsAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const { viewer, project } = await authorize(String(formData.get("projectId") ?? ""));
  if (!project) return failure("Proje bulunamadı.");

  const parsed = parseTopicLines(String(formData.get("topics") ?? ""));
  if ("error" in parsed) return failure(parsed.error, { topics: parsed.error });

  replaceTopics(project.id, parsed.topics);
  const tagged = retagProject(project.id);
  recordAudit({
    actor: viewer?.email,
    workspaceId: project.workspaceId,
    action: "konular.güncellendi",
    objectType: "proje",
    objectId: project.id,
    detail: `${parsed.topics.length} konu, ${tagged} etiket`,
  });
  refresh();
  return { ok: true, message: `${parsed.topics.length} konu kaydedildi; mevcut içerikler yeniden etiketlendi.`, errors: {} };
}

/* ── Toplama ──────────────────────────────────────────────────────────── */

const COLLECT_FAILURES: Record<string, string> = {
  "not-found": "Proje bulunamadı.",
  demo: "Demo projeleri kaynak taramaz; veriler kurgusaldır.",
  busy: "Bu proje için bir tarama zaten sürüyor.",
  "no-keywords": "Sorgu aranabilir kelime içermiyor.",
};

export async function collectNowAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const projectId = String(formData.get("projectId") ?? "");
  const { viewer, project: allowed } = await authorize(projectId);
  if (!allowed) return failure(COLLECT_FAILURES["not-found"]);
  const outcome = await collectProject(projectId);
  if (!outcome.ok) return failure(COLLECT_FAILURES[outcome.reason]);

  const project = getProject(projectId);
  recordAudit({
    actor: viewer?.email,
    workspaceId: project?.workspaceId ?? null,
    action: "tarama.elle",
    objectType: "proje",
    objectId: projectId,
    detail: `${outcome.inserted} yeni içerik`,
  });
  refresh();
  const failed = outcome.runs.filter((run) => run.status === "error").length;
  const suffix = failed > 0 ? ` ${failed} kaynağa ulaşılamadı.` : "";
  return { ok: true, message: `Tarama bitti: ${outcome.inserted} yeni içerik eklendi.${suffix}`, errors: {} };
}

/* ── Yapay zekâ ───────────────────────────────────────────────────────── */

export async function generateAiSummaryAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const { viewer, project } = await authorize(String(formData.get("projectId") ?? ""));
  const rangeKey = formData.get("rangeKey");
  if (!project || !isRangeKey(rangeKey)) return failure("Proje bulunamadı.");

  const shortage = creditShortage(viewer, "summary");
  if (shortage) return failure(shortage);
  const outcome = await generateAiSummary(project, rangeKey, Date.now());
  if (!outcome.ok) return failure(outcome.message);
  spendCredits(viewer, "summary", project.id, Date.now());

  recordAudit({
    actor: viewer?.email,
    workspaceId: project.workspaceId,
    action: "yapayzeka.özet",
    objectType: "proje",
    objectId: project.id,
    detail: `${outcome.summary.mentionsSent} içerik ${outcome.summary.model} modeline gönderildi`,
  });
  refresh();
  return { ok: true, message: "Özet oluşturuldu.", errors: {} };
}

export type AskState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "answered"; question: string; answer: string; evidenceIds: string[]; model: string; mentionsSent: number };

export async function askQuestionAction(_previous: AskState, formData: FormData): Promise<AskState> {
  const { viewer, project } = await authorize(String(formData.get("projectId") ?? ""));
  const rangeKey = formData.get("rangeKey");
  if (!project || !isRangeKey(rangeKey)) return { status: "error", message: "Proje bulunamadı." };

  const question = String(formData.get("question") ?? "").trim();
  const shortage = creditShortage(viewer, "ask");
  if (shortage) return { status: "error", message: shortage };
  const outcome = await askQuestion(project, rangeKey, question, Date.now());
  if (!outcome.ok) return { status: "error", message: outcome.message };
  spendCredits(viewer, "ask", project.id, Date.now());

  recordAudit({
    actor: viewer?.email,
    workspaceId: project.workspaceId,
    action: "yapayzeka.soru",
    objectType: "proje",
    objectId: project.id,
    detail: `${outcome.mentionsSent} içerik ${outcome.model} modeline gönderildi`,
  });
  return { status: "answered", question, answer: outcome.answer, evidenceIds: outcome.evidenceIds, model: outcome.model, mentionsSent: outcome.mentionsSent };
}

/* ── Rapor paylaşımı ──────────────────────────────────────────────────── */

export async function createReportShareAction(formData: FormData): Promise<void> {
  const { viewer, project } = await authorize(String(formData.get("projectId") ?? ""));
  const rangeKey = formData.get("rangeKey");
  if (!project || !isRangeKey(rangeKey)) return;

  const share = ensureShare(project.workspaceId, project.id, rangeKey, Date.now());
  if (share.createdAt >= Date.now() - 1000) {
    recordAudit({ actor: viewer?.email, workspaceId: project.workspaceId, action: "rapor.paylaşıldı", objectType: "proje", objectId: project.id, detail: rangeKey });
  }
  redirect(`/paylasim/${share.token}`);
}

export async function revokeReportShareAction(formData: FormData): Promise<void> {
  const token = String(formData.get("token") ?? "");
  const share = getActiveShare(token);
  if (!share) return;
  const { viewer, project: allowed } = await authorize(share.projectId);
  if (!allowed) return;
  if (revokeShare(token, Date.now())) {
    recordAudit({ actor: viewer?.email, workspaceId: null, action: "rapor.paylaşım.iptal", objectType: "rapor" });
    refresh();
  }
}

export async function scanClaimsAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const { viewer, project } = await authorize(String(formData.get("projectId") ?? ""));
  const rangeKey = formData.get("rangeKey");
  if (!project || !isRangeKey(rangeKey)) return failure("Proje bulunamadı.");

  const shortage = creditShortage(viewer, "claims");
  if (shortage) return failure(shortage);
  const outcome = await scanClaims(project, rangeKey, Date.now());
  if (!outcome.ok) return failure(outcome.message);
  spendCredits(viewer, "claims", project.id, Date.now());

  const matched = outcome.run.claims.filter((claim) => claim.checks.length > 0).length;
  recordAudit({
    actor: viewer?.email,
    workspaceId: project.workspaceId,
    action: "yapayzeka.iddia",
    objectType: "proje",
    objectId: project.id,
    detail: `${outcome.run.mentionsSent} içerik ${outcome.run.model} modeline gönderildi; ${outcome.run.claims.length} iddia, ${matched} tanesinde yayımlanmış doğrulama`,
  });
  refresh();
  return { ok: true, message: `${outcome.run.claims.length} iddia bulundu.`, errors: {} };
}

export async function classifyMentionsAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const { viewer, project } = await authorize(String(formData.get("projectId") ?? ""));
  const rangeKey = formData.get("rangeKey");
  if (!project || !isRangeKey(rangeKey)) return failure("Proje bulunamadı.");

  const shortage = creditShortage(viewer, "classify");
  if (shortage) return failure(shortage);
  const outcome = await classifyMentions(project, rangeKey, Date.now());
  if (!outcome.ok) return failure(outcome.message);
  spendCredits(viewer, "classify", project.id, Date.now());

  recordAudit({
    actor: viewer?.email,
    workspaceId: project.workspaceId,
    action: "yapayzeka.sınıflandırma",
    objectType: "proje",
    objectId: project.id,
    detail: `${outcome.sent} içerik ${outcome.model} modeline gönderildi; ${outcome.classified} tanesi sınıflandırıldı`,
  });
  refresh();
  const parts = [`${outcome.classified} içerik sınıflandırıldı`, `${outcome.toneChanged} tanesinde ton değişti`, `${outcome.topicsAdded} konu eşleşmesi eklendi`];
  if (outcome.failedBatches > 0) parts.push(`${outcome.failedBatches} grup başarısız oldu`);
  if (outcome.remaining > 0) parts.push(`${outcome.remaining} içerik sırada`);
  return { ok: true, message: `${parts.join(" · ")}.`, errors: {} };
}

export type PreviewState = { ok: true; preview: PreviewResult } | { ok: false; message: string } | null;

export async function previewQueryAction(query: string, connectorIds: string[]): Promise<PreviewState> {
  await enterAction();
  const validated = validateQuery(query.trim());
  if (!validated.ok) return { ok: false, message: validated.message };
  const preview = await previewCollection(query.trim(), connectorIds);
  return preview ? { ok: true, preview } : { ok: false, message: "Sorgu aranabilir kelime içermiyor." };
}

/* ── Bahsetme düzeltmeleri ────────────────────────────────────────────── */

export async function setToneAction(mentionId: string, sentiment: Sentiment | null): Promise<void> {
  if (sentiment !== null && !SENTIMENTS.includes(sentiment)) return;
  const mention = getMention(mentionId);
  if (!mention) return;
  const { viewer, project: allowed } = await authorize(mention.projectId);
  if (!allowed) return;
  setSentimentOverride(mentionId, sentiment);
  recordAudit({
    actor: viewer?.email,
    workspaceId: mention.workspaceId,
    action: "ton.düzeltildi",
    objectType: "bahsetme",
    objectId: mentionId,
    detail: sentiment ? `${mention.sentiment} → ${sentiment}` : "düzeltme geri alındı",
  });
  refresh();
}

export async function setIrrelevantAction(mentionId: string, isIrrelevant: boolean): Promise<void> {
  const mention = getMention(mentionId);
  if (!mention) return;
  const { viewer, project: allowed } = await authorize(mention.projectId);
  if (!allowed) return;
  setIrrelevant(mentionId, isIrrelevant);
  recordAudit({
    actor: viewer?.email,
    workspaceId: mention.workspaceId,
    action: isIrrelevant ? "ilgisiz.işaretlendi" : "ilgisiz.geri-alındı",
    objectType: "bahsetme",
    objectId: mentionId,
  });
  refresh();
}
