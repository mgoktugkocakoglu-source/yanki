import { queryToTopicTerms } from "@/lib/query";
import { QuerySummary } from "@/components/query-summary";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProjectForm } from "@/components/forms/project-form";
import { TopicsForm } from "@/components/forms/topics-form";
import { BUTTON_SECONDARY, PageContainer, PageHeading, Panel } from "@/components/ui";
import { deleteProjectAction } from "@/server/actions/projects";
import { loadProjectContext } from "@/server/context";
import { listTopics } from "@/server/repositories/projects";
import { connectorOptions } from "@/server/services/connector-options";

export const metadata: Metadata = { title: "Ayarlar" };

export default async function SettingsPage({ params }: PageProps<"/proje/[id]/ayarlar">) {
  const { id } = await params;
  const context = await loadProjectContext(id);
  if (!context) notFound();

  const { project, workspace } = context;
  const isDemo = workspace.kind === "demo";
  const topicsText = (await listTopics(project.id)).map((topic) => `${topic.groupName} | ${topic.name} | ${queryToTopicTerms(topic.query)}`).join("\n");

  return (
    <PageContainer>
      <PageHeading
        title="Ayarlar"
        lead={
          isDemo
            ? "Demo projelerinin arama tanımı sabittir; konuları ise değiştirip sonucun analizlere nasıl yansıdığını deneyebilirsiniz."
            : "Arama tanımındaki değişiklik bundan sonra toplanan içeriklere uygulanır; daha önce toplananlar silinmez."
        }
      />

      <div className="flex max-w-[64rem] flex-col gap-5">
        <Panel title={isDemo ? "Arama tanımı (salt okunur)" : "Proje ve arama tanımı"}>
          {isDemo ? (
            <QuerySummary query={project.query} />
          ) : (
            <ProjectForm
              projectId={project.id}
              initial={{ name: project.name, description: project.description, query: project.query, connectorIds: project.connectorIds }}
              connectors={connectorOptions()}
            />
          )}
        </Panel>

        <Panel title="Konular" hint="İçerikleri konulara ayıran kurallar. Her grup analiz ekranında ayrı bir karne olarak görünür.">
          <TopicsForm projectId={project.id} initialText={topicsText} readOnly={false} />
        </Panel>

        {isDemo ? null : (
          <Panel title="Projeyi sil" hint="Proje, toplanan tüm içerikleri ve tarama geçmişiyle birlikte kalıcı olarak silinir. Bu işlem geri alınamaz.">
            <form action={deleteProjectAction}>
              <input type="hidden" name="projectId" value={project.id} />
              <button type="submit" className={`${BUTTON_SECONDARY} border-negative/50 text-negative-ink hover:border-negative`}>
                “{project.name}” projesini sil
              </button>
            </form>
          </Panel>
        )}
      </div>
    </PageContainer>
  );
}
