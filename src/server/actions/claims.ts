"use server";

import { refresh } from "next/cache";
import { isRangeKey } from "@/lib/time";
import { creditShortage, spendCredits } from "../auth/access";
import { recordAudit } from "../repositories/runs";
import { scanClaims } from "../services/claims";
import { failure, authorize, type FormState } from "./shared";

/** İddia taraması. */

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
