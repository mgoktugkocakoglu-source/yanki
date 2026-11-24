"use server";

import { refresh } from "next/cache";
import { collectProject } from "../pipeline/collect";
import { getProject } from "../repositories/projects";
import { recordAudit } from "../repositories/runs";
import { failure, authorize, type FormState } from "./shared";

/** Elle başlatılan tarama. */

const COLLECT_FAILURES: Record<string, string> = {
  "not-found": "Proje bulunamadı.",
  demo: "Bu projede kaynak taranmıyor.",
  busy: "Bu proje için bir tarama zaten sürüyor.",
  "no-keywords": "Sorgu aranabilir kelime içermiyor.",
};

export async function collectNowAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const projectId = String(formData.get("projectId") ?? "");
  const { viewer, project: allowed } = await authorize(projectId);
  if (!allowed) return failure(COLLECT_FAILURES["not-found"]);
  const outcome = await collectProject(projectId);
  if (!outcome.ok) return failure(COLLECT_FAILURES[outcome.reason]);

  const project = await getProject(projectId);
  await recordAudit({
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
