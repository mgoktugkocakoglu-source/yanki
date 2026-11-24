"use server";

import { redirect } from "next/navigation";
import { visibleProjects } from "../auth/access";
import { enterAction } from "../auth/session";
import { rememberWorkspace } from "../context";
import { listProjects } from "../repositories/projects";
import { getWorkspace } from "../repositories/workspaces";

/** Çalışma alanı seçimi. */

export async function selectWorkspaceAction(formData: FormData): Promise<void> {
  const viewer = await enterAction();
  const workspace = getWorkspace(String(formData.get("workspaceId") ?? ""));
  if (!workspace) return;
  await rememberWorkspace(workspace.id);
  const [firstProject] = visibleProjects(viewer, listProjects(workspace.id));
  redirect(firstProject ? `/proje/${firstProject.id}` : "/projeler");
}
