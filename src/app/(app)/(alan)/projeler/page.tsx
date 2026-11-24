import { QuerySummary } from "@/components/query-summary";
import { Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { BUTTON_PRIMARY, EmptyState, PageContainer, PageHeading } from "@/components/ui";
import { formatNumber, formatRelative } from "@/lib/format";
import { projectHref } from "@/lib/links";
import { resolveRange } from "@/lib/time";
import { getConnector } from "@/server/collectors/registry";
import { loadWorkspaceContext } from "@/server/context";
import { latestCollectedAt } from "@/server/repositories/mentions";
import { summarize } from "@/server/repositories/metrics";

export const metadata: Metadata = { title: "Projeler" };

export default async function ProjectsPage() {
  const { workspace, projects, now } = await loadWorkspaceContext();
  const lastWeek = resolveRange("7g", now);
  const isLive = workspace.kind === "live";

  return (
    <PageContainer>
      <PageHeading
        title="Projeler"
        lead={
          isLive
            ? "Her proje izlediğiniz bir kurum, marka, rakip ya da konudur; kendi arama tanımı ve kaynakları vardır."
            : `${workspace.name}: bu alandaki projeler kaynak taramaz.`
        }
        actions={
          <Link href="/projeler/yeni" className={BUTTON_PRIMARY}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            Yeni proje
          </Link>
        }
      />

      {projects.length === 0 ? (
        <EmptyState
          title="İlk projenizi açın"
          action={
            <Link href="/projeler/yeni" className={BUTTON_PRIMARY}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              Yeni proje
            </Link>
          }
        >
          İzlemek istediğiniz adı ve varsa yaygın yazımlarını girin. Kaydetmeden önce gerçek kaynaklardan örnek içerik görüp kelimeleri ayarlayabilirsiniz; ilk sonuçlar birkaç
          saniyede gelir.
        </EmptyState>
      ) : (
        <ul className="grid gap-4 lg:grid-cols-2">
          {await Promise.all(
            projects.map(async (project) => {
              const week = await summarize({ projectId: project.id, range: lastWeek });
              const collectedAt = await latestCollectedAt(project.id);
              const connectorNames = project.connectorIds.map((id) => getConnector(id)?.descriptor.name).filter(Boolean);
              return (
                <li key={project.id}>
                  <Link href={projectHref(project.id)} className="group block h-full rounded-lg border border-line bg-surface p-5 transition-colors hover:border-brand">
                    <div className="flex items-baseline justify-between gap-4">
                      <h2 className="font-display text-[1.35rem] font-medium leading-tight group-hover:text-brand-strong">{project.name}</h2>
                      <span className="shrink-0 text-right text-[0.8125rem] text-ink-muted">
                        <span className="reading block text-[1.0625rem] font-medium text-ink">{formatNumber(week.total)}</span>
                        son 7 gün
                      </span>
                    </div>
                    {project.description ? <p className="mt-1 text-ink-soft">{project.description}</p> : null}
                    <QuerySummary query={project.query} className="mt-3" />
                    <p className="mt-3 text-[0.8125rem] text-ink-muted">
                      {isLive ? (connectorNames.length > 0 ? connectorNames.join(" · ") : "Kaynak seçilmemiş") : "Kaynak taranmıyor"}
                      {isLive && collectedAt ? ` · son içerik ${formatRelative(collectedAt, now)}` : ""}
                    </p>
                  </Link>
                </li>
              );
            }),
          )}
        </ul>
      )}
    </PageContainer>
  );
}
