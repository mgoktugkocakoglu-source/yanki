"use server";

import { refresh } from "next/cache";
import { topicTermsToQuery, tryParseQuery, type QueryNode } from "@/lib/query";
import { retagProject } from "../pipeline/retag";
import { replaceTopics, type TopicInput } from "../repositories/projects";
import { recordAudit } from "../repositories/runs";
import { failure, authorize, type FormState } from "./shared";

/** Konu tanımları: kaydedilince projenin içerikleri yeniden etiketlenir. */

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

/** Her satır: "Grup | Konu adı | virgülle ayrılmış kelimeler". */
function parseTopicLines(text: string): { topics: TopicInput[] } | { error: string } {
  const topics: TopicInput[] = [];
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length > MAX_TOPICS) return { error: `En çok ${MAX_TOPICS} konu tanımlanabilir.` };

  for (const [index, line] of lines.entries()) {
    const [groupName, name, ...rest] = line.split("|").map((part) => part.trim());
    const query = rest.join("|").trim();
    if (!groupName || !name || !query) {
      return { error: `${index + 1}. satır eksik. Biçim: Grup | Konu adı | kelimeler` };
    }
    const topicQuery = topicTermsToQuery(query);
    const parsed = tryParseQuery(topicQuery);
    if (!topicQuery || !parsed.ok) return { error: `${index + 1}. satır (“${name}”): aranabilir en az bir kelime yazın.` };
    if (usesFieldFilter(parsed.ast)) {
      return { error: `${index + 1}. satır (“${name}”): konu sorguları yalnızca kelime içerebilir; alan filtresi kullanılamaz.` };
    }
    topics.push({ groupName, name, query: topicQuery });
  }
  return { topics };
}

export async function saveTopicsAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const { viewer, project } = await authorize(String(formData.get("projectId") ?? ""));
  if (!project) return failure("Proje bulunamadı.");

  const parsed = parseTopicLines(String(formData.get("topics") ?? ""));
  if ("error" in parsed) return failure(parsed.error, { topics: parsed.error });

  await replaceTopics(project.id, parsed.topics);
  const tagged = await retagProject(project.id);
  await recordAudit({
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
