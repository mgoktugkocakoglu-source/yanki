"use server";

import { refresh } from "next/cache";
import { isRangeKey } from "@/lib/time";
import { creditShortage, spendCredits } from "../auth/access";
import { recordAudit } from "../repositories/runs";
import { askQuestion } from "../services/ai-ask";
import { classifyMentions } from "../services/ai-classify";
import { generateAiSummary } from "../services/ai-summary";
import { failure, authorize, type FormState } from "./shared";

/** Yapay zekâ işlevleri: dönem özeti, soru-yanıt ve toplu sınıflandırma. İçerik yalnızca kullanıcı istediğinde kurum dışına çıkar. */

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
