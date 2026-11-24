"use server";

import { refresh } from "next/cache";
import { SENTIMENTS, type Sentiment } from "@/domain/types";
import { getMention, setIrrelevant, setSentimentOverride } from "../repositories/mentions";
import { recordAudit } from "../repositories/runs";
import { authorize } from "./shared";

/** İçerik düzeltmeleri: ton ve ilgisiz işareti. */

export async function setToneAction(mentionId: string, sentiment: Sentiment | null): Promise<void> {
  if (sentiment !== null && !SENTIMENTS.includes(sentiment)) return;
  const mention = await getMention(mentionId);
  if (!mention) return;
  const { viewer, project: allowed } = await authorize(mention.projectId);
  if (!allowed) return;
  await setSentimentOverride(mentionId, sentiment);
  await recordAudit({
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
  const mention = await getMention(mentionId);
  if (!mention) return;
  const { viewer, project: allowed } = await authorize(mention.projectId);
  if (!allowed) return;
  await setIrrelevant(mentionId, isIrrelevant);
  await recordAudit({
    actor: viewer?.email,
    workspaceId: mention.workspaceId,
    action: isIrrelevant ? "ilgisiz.işaretlendi" : "ilgisiz.geri-alındı",
    objectType: "bahsetme",
    objectId: mentionId,
  });
  refresh();
}
