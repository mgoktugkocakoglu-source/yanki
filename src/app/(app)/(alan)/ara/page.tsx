import { QuerySummary } from "@/components/query-summary";
import { SlidersHorizontal } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { SearchBox } from "@/components/forms/search-box";
import { BUTTON_SECONDARY, PageContainer, PageHeading, Panel } from "@/components/ui";
import { formatNumber, formatRelative } from "@/lib/format";
import { projectHref } from "@/lib/links";
import { resolveRange } from "@/lib/time";
import { loadVisibleProjects } from "@/server/auth/access";
import { requireUser } from "@/server/auth/session";
import { requestStart } from "@/server/context";
import { latestCollectedAt } from "@/server/repositories/mentions";
import { summarize } from "@/server/repositories/metrics";
import { listProjects } from "@/server/repositories/projects";
import { getWorkspaceByKind } from "@/server/repositories/workspaces";
import { connectorOptions } from "@/server/services/connector-options";

export const metadata: Metadata = { title: "Arama" };

/** Gündem araması: panelin giriş ekranı. Sonuçlar gerçek kaynaklardan gelir. */
export default async function SearchPage() {
  const now = await requestStart();
  const viewer = await requireUser();
  const workspace = await getWorkspaceByKind("live");
  const projects = workspace ? await loadVisibleProjects(viewer, await listProjects(workspace.id)) : [];
  const lastWeek = resolveRange("7g", now);
  const platforms = connectorOptions().map((option) => ({
    id: option.id,
    name: option.name,
    usable: option.allowed,
    reason: option.allowed ? null : option.missingSetting ? "anahtar bekleniyor" : "bu kurulumda kapalı",
  }));

  return (
    <PageContainer>
      <PageHeading
        title="Gündemde ne arıyorsunuz?"
        lead="Bir konu, olay ya da kurum yazın. Yankı seçtiğiniz platformları tarar, bulduklarını tek ekranda toplar ve konuyu izlemeye alır."
        actions={
          <Link href="/projeler/yeni" className={BUTTON_SECONDARY}>
            <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
            Proje kur
          </Link>
        }
      />

      <div className="flex flex-col gap-5">
        <Panel>
          <SearchBox platforms={platforms} />
          <p className="text-[0.8125rem] text-ink-muted">
            Yazdığınız kelimelerin hepsi birlikte aranır; Türkçe ekler kendiliğinden yakalanır. Aynı konunun farklı yazımlarını virgülle ayırın: e-Devlet, edevlet. Kaynakları ve
            ayrıntıları kendiniz belirlemek için{" "}
            <Link href="/projeler/yeni" className="font-medium text-brand-strong hover:underline">
              Proje kur
            </Link>
            .
          </p>
        </Panel>

        <section aria-labelledby="konular-basligi">
          <h2 id="konular-basligi" className="mb-3 text-[0.9375rem] font-semibold">
            İzlenen konular
          </h2>
          {projects.length === 0 ? (
            <p className="rounded-xl border border-line bg-surface p-4 text-ink-soft">Henüz izlenen konu yok. Yukarıdan ilk aramanızı yapın.</p>
          ) : (
            <ul className="grid gap-4 lg:grid-cols-2">
              {await Promise.all(
                projects.map(async (project) => {
                  const week = await summarize({ projectId: project.id, range: lastWeek });
                  const collectedAt = await latestCollectedAt(project.id);
                  return (
                    <li key={project.id}>
                      <Link
                        href={projectHref(project.id)}
                        className="group block h-full rounded-xl border border-line bg-surface p-5 shadow-[var(--shadow-card)] transition-colors hover:border-brand"
                      >
                        <div className="flex items-baseline justify-between gap-4">
                          <h3 className="text-[1.0625rem] font-semibold group-hover:text-brand-strong">{project.name}</h3>
                          <span className="shrink-0 text-right text-[0.8125rem] text-ink-muted">
                            <span className="reading block text-[1.0625rem] font-medium text-ink">{formatNumber(week.total)}</span>
                            son 7 gün
                          </span>
                        </div>
                        {project.description ? <p className="mt-1 text-ink-soft">{project.description}</p> : null}
                        <QuerySummary query={project.query} className="mt-3" />
                        <p className="mt-3 text-[0.8125rem] text-ink-muted">
                          {collectedAt ? `Son içerik ${formatRelative(collectedAt, now)} toplandı` : "Henüz içerik toplanmadı; ilk tarama sürüyor olabilir"}
                        </p>
                      </Link>
                    </li>
                  );
                }),
              )}
            </ul>
          )}
        </section>
      </div>
    </PageContainer>
  );
}
