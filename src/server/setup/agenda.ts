import { defaultConnectorIds } from "../collectors/registry";
import { execute, queryOne } from "../db/client";
import { createProject, listProjects } from "../repositories/projects";
import { getWorkspaceByKind } from "../repositories/workspaces";

/**
 * Hazır gündem projeleri. Kurgusal değildir: canlı çalışma alanında açılır ve
 * içerikleri bağlı kaynaklardan gerçek olarak toplanır. Yalnızca bir kez
 * kurulur; kullanıcı silerse geri gelmez.
 */

export const AGENDA_PROJECTS = [
  {
    name: "COP31",
    description: "BM İklim Değişikliği Konferansı (COP31) çevresindeki haberler ve paylaşımlar.",
    query: 'COP31 OR "COP 31"',
  },
  {
    name: "İsrail seçimleri",
    description: "İsrail'deki seçim ve koalisyon süreci hakkında Türkçe ve İngilizce içerikler.",
    query: "(İsrail OR Israel) (seçim* OR election* OR koalisyon OR coalition OR Knesset)",
  },
  {
    name: "İran–İsrail gerilimi",
    description: "İran ve İsrail'in birlikte anıldığı haberler ve paylaşımlar.",
    query: "(İran OR Iran) (İsrail OR Israel)",
  },
] as const;

const SEEDED_KEY = "agenda_seeded";
let checked = false;

/** Gündem projelerini (henüz kurulmadıysa) açar; yeni açılanların kimliklerini döndürür. */
export async function seedAgendaProjects(now: number): Promise<string[]> {
  if (checked) return [];
  checked = true;
  if (await queryOne<{ value: string }>("SELECT value FROM app_meta WHERE key = ?", [SEEDED_KEY])) return [];

  const workspace = await getWorkspaceByKind("live");
  const connectorIds = defaultConnectorIds();
  if (!workspace || connectorIds.length === 0) return [];

  const existing = new Set((await listProjects(workspace.id)).map((project) => project.name));
  const created = (await Promise.all(AGENDA_PROJECTS.filter((spec) => !existing.has(spec.name)).map(
      async (spec, index) => (await createProject(workspace.id, { name: spec.name, description: spec.description, query: spec.query, connectorIds }, now + index)).id,
    )));
  await execute("INSERT INTO app_meta (key, value) VALUES (?, ?)", [SEEDED_KEY, String(now)]);
  return created;
}
