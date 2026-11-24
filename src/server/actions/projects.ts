"use server";

import { after } from "next/server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { composeQuery, plainFromSearch, QUERY_LANGUAGES } from "@/lib/query";
import { loadCanSeeProject, creditShortage, spendCredits, loadVisibleProjects } from "../auth/access";
import { enterAction } from "../auth/session";
import { defaultConnectorIds, getConnector, isConnectorUsable } from "../collectors/registry";
import { rememberWorkspace } from "../context";
import { collectProject, previewCollection, type PreviewResult } from "../pipeline/collect";
import { createProject, deleteProject, getProject, listProjects, updateProject } from "../repositories/projects";
import { recordAudit } from "../repositories/runs";
import { setProjectOwner } from "../repositories/users";
import { getWorkspace, getWorkspaceByKind } from "../repositories/workspaces";
import { failure, authorize, validateQuery, type FormState } from "./shared";

/** Proje kurma, hızlı arama, önizleme ve silme. Her işlev girdisini doğrular, değişikliği yapar ve denetim izine yazar. */

const projectSchema = z.object({
  name: z.string().trim().min(2, "En az 2 karakter yazın.").max(80, "En çok 80 karakter olabilir."),
  description: z.string().trim().max(200, "En çok 200 karakter olabilir."),
  query: z.string().trim().min(1, "Aranacak en az bir kelime yazın."),
  connectorIds: z.array(z.string()).min(1, "En az bir kaynak seçin."),
});

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
  if (!query.ok) return failure("Arama tanımı geçerli değil.", { query: query.message });

  const connectorIds = parsed.data.connectorIds.filter((id) => {
    const connector = getConnector(id);
    return connector !== undefined && isConnectorUsable(connector);
  });
  if (connectorIds.length === 0) return failure("Seçilen kaynaklar bu kurulumda kullanılamıyor.", { connectorIds: "Geçerli bir kaynak seçin." });

  const input = { ...parsed.data, connectorIds };
  const now = Date.now();
  const projectId = String(formData.get("projectId") ?? "");

  if (projectId) {
    const existing = await getProject(projectId);
    if (existing && !(await loadCanSeeProject(viewer, existing))) return failure("Proje bulunamadı.");
    if (!existing || (await getWorkspace(existing.workspaceId))?.kind !== "live") {
      return failure("Demo projeleri düzenlenemez.");
    }
    await updateProject(projectId, input, now);
    await recordAudit({ actor: viewer?.email, workspaceId: existing.workspaceId, action: "proje.güncellendi", objectType: "proje", objectId: projectId, detail: input.name });
    after(async () => collectProject(projectId));
    redirect(`/proje/${projectId}/kaynaklar?kaydedildi=1`);
  }

  const workspace = await getWorkspace(String(formData.get("workspaceId") ?? ""));
  if (workspace?.kind !== "live") return failure("Yeni proje yalnızca canlı çalışma alanında açılabilir.");

  const shortage = creditShortage(viewer, "search");
  if (shortage) return failure(shortage);
  const project = await createProject(workspace.id, input, now);
  if (viewer) await setProjectOwner(project.id, viewer.id);
  await spendCredits(viewer, "search", project.id, now);
  await recordAudit({ actor: viewer?.email, workspaceId: workspace.id, action: "proje.oluşturuldu", objectType: "proje", objectId: project.id, detail: project.name });
  // Proje canlı alanda açıldı; çalışma alanı sayfaları da artık o alanı göstersin.
  await rememberWorkspace(workspace.id);
  // İlk tarama yanıtı bekletmesin; kaynaklar ekranı durumu gösterir.
  after(async () => collectProject(project.id));
  redirect(`/proje/${project.id}/kaynaklar?yeni=1`);
}

/**
 * Hızlı arama: yazılan konuyu canlı çalışma alanında bir projeye çevirir,
 * kaynakları hemen tarar ve sonuç ekranını açar. Aynı sorgu daha önce
 * arandıysa o proje yeniden taranıp açılır.
 */
export async function quickSearchAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const viewer = await enterAction();
  const text = String(formData.get("query") ?? "").trim();
  if (text.length < 2) return failure("Aramak istediğiniz konuyu yazın.", { query: "En az 2 karakter yazın." });
  if (text.length > 400) return failure("Arama metni çok uzun.", { query: "En çok 400 karakter olabilir." });

  // Kullanıcı sorgu dili yazmaz: kelimeler, hariç tutulanlar ve dil seçimi sorguya burada çevrilir.
  const languageInput = String(formData.get("language") ?? "");
  const language = QUERY_LANGUAGES.some((entry) => entry.code === languageInput) ? languageInput : null;
  const fullQuery = composeQuery(plainFromSearch(text, String(formData.get("exclude") ?? "").slice(0, 200), language));
  if (!fullQuery) return failure("Aramak istediğiniz konuyu yazın.", { query: "Aranabilir en az bir kelime yazın." });

  const query = validateQuery(fullQuery);
  if (!query.ok) return failure("Arama tanımı geçerli değil.", { query: query.message });

  const workspace = await getWorkspaceByKind("live");
  if (!workspace) return failure("Canlı çalışma alanı bulunamadı.");

  // Platform seçimi isteğe bağlıdır; form göndermediyse kullanılabilir tüm kaynaklar taranır.
  const usable = defaultConnectorIds();
  const connectorIds = formData.has("platformsShown") ? formData.getAll("connectorIds").map(String).filter((id) => usable.includes(id)) : usable;
  if (connectorIds.length === 0) return failure("En az bir platform seçin.", { connectorIds: "En az bir platform seçin." });

  let project = (await loadVisibleProjects(viewer, await listProjects(workspace.id))).find((entry) => entry.query === fullQuery) ?? null;
  if (project && project.connectorIds.join() !== connectorIds.join()) {
    await updateProject(project.id, { name: project.name, description: project.description, query: project.query, connectorIds }, Date.now());
  }
  if (!project) {
    const shortage = creditShortage(viewer, "search");
    if (shortage) return failure(shortage);
    project = await createProject(workspace.id, { name: text.slice(0, 80), description: "", query: fullQuery, connectorIds }, Date.now());
    if (viewer) await setProjectOwner(project.id, viewer.id);
    await spendCredits(viewer, "search", project.id, Date.now());
    await recordAudit({ actor: viewer?.email, workspaceId: workspace.id, action: "arama.yapıldı", objectType: "proje", objectId: project.id, detail: text });
  }
  await rememberWorkspace(workspace.id);
  await collectProject(project.id);
  redirect(`/proje/${project.id}`);
}

export async function deleteProjectAction(formData: FormData): Promise<void> {
  const { viewer, project } = await authorize(String(formData.get("projectId") ?? ""));
  if (!project || (await getWorkspace(project.workspaceId))?.kind !== "live") return;
  await deleteProject(project.id);
  await recordAudit({ actor: viewer?.email, workspaceId: project.workspaceId, action: "proje.silindi", objectType: "proje", objectId: project.id, detail: project.name });
  redirect("/projeler");
}

export type PreviewState = { ok: true; preview: PreviewResult } | { ok: false; message: string } | null;

export async function previewQueryAction(query: string, connectorIds: string[]): Promise<PreviewState> {
  await enterAction();
  const validated = validateQuery(query.trim());
  if (!validated.ok) return { ok: false, message: validated.message };
  const preview = await previewCollection(query.trim(), connectorIds);
  return preview ? { ok: true, preview } : { ok: false, message: "Sorgu aranabilir kelime içermiyor." };
}
