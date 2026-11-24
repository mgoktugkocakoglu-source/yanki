"use server";

import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { isRangeKey } from "@/lib/time";
import { recordAudit } from "../repositories/runs";
import { ensureShare, getActiveShare, revokeShare } from "../repositories/shares";
import { authorize } from "./shared";

/** Rapor paylaşım bağlantıları. */

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
