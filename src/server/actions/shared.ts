import type { Project } from "@/domain/types";
import { buildCollectionPlan, tryParseQuery, type QueryNode } from "@/lib/query";
import { loadCanSeeProject, type Viewer } from "../auth/access";
import { enterAction } from "../auth/session";
import { getProject } from "../repositories/projects";

/**
 * Sunucu işlevlerinin ortak parçaları: form durumu, yetki denetimi ve arama
 * tanımı doğrulaması. Bu dosya bir sunucu işlevi dosyası değildir; işlev
 * dosyaları (`actions/*.ts`) buradan içe aktarır.
 */

export interface FormState {
  ok: boolean;
  message: string;
  /** Alan adı → hata iletisi. */
  errors: Record<string, string>;
}

export const failure = (message: string, errors: Record<string, string> = {}): FormState => ({ ok: false, message, errors });

/**
 * Her işlevin ilk adımı: oturumu doğrular (giriş zorunluysa), denetim izi için
 * kişiyi belirler ve istenen projeye erişimi denetler. Erişilemeyen proje
 * "yok" sayılır.
 */
export async function authorize(projectId: string): Promise<{ viewer: Viewer; project: Project | null }> {
  const viewer = await enterAction();
  const project = await getProject(projectId);
  return { viewer, project: project && (await loadCanSeeProject(viewer, project)) ? project : null };
}

export function validateQuery(query: string): { ok: true; ast: QueryNode } | { ok: false; message: string } {
  const parsed = tryParseQuery(query);
  if (!parsed.ok) return { ok: false, message: parsed.message };
  if (!buildCollectionPlan(parsed.ast)) {
    return { ok: false, message: "Kaynaklarda aranabilecek en az bir kelime yazın." };
  }
  return { ok: true, ast: parsed.ast };
}
