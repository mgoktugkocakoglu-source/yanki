import { matchQuery, parseQuery } from "@/lib/query";
import { listSearchTexts, replaceMentionTopics } from "../repositories/mentions";
import { listTopics } from "../repositories/projects";

/** Bir projede yeniden etiketlenebilecek en çok içerik sayısı. */
const RETAG_LIMIT = 200_000;

/**
 * Konu tanımları değiştiğinde projenin tüm içeriklerini baştan etiketler.
 * Konu sorguları yalnızca metne bakar (alan filtresi içeremez), bu yüzden
 * saklanan arama metni yeterlidir.
 */
export async function retagProject(projectId: string): Promise<number> {
  const topics = (await listTopics(projectId)).map((topic) => ({ id: topic.id, ast: parseQuery(topic.query) }));
  const assignments: Array<{ mentionId: string; topicId: string }> = [];

  for (const { id, searchText } of await listSearchTexts({ projectId, includeIrrelevant: true }, RETAG_LIMIT)) {
    const tokens = searchText.split(" ");
    for (const topic of topics) {
      if (matchQuery(topic.ast, tokens).matched) assignments.push({ mentionId: id, topicId: topic.id });
    }
  }
  await replaceMentionTopics(projectId, assignments);
  return assignments.length;
}
