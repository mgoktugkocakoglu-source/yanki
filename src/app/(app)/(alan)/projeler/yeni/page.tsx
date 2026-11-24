import type { Metadata } from "next";
import { ProjectForm } from "@/components/forms/project-form";
import { EmptyState, PageContainer, PageHeading, Panel } from "@/components/ui";
import { defaultConnectorIds } from "@/server/collectors/registry";
import { requireUser } from "@/server/auth/session";
import { requestStart } from "@/server/context";
import { getWorkspaceByKind } from "@/server/repositories/workspaces";
import { connectorOptions } from "@/server/services/connector-options";

export const metadata: Metadata = { title: "Yeni proje" };

export default async function NewProjectPage() {
  await requestStart();
  await requireUser();
  // Yeni projeler her zaman canlı çalışma alanında açılır; demo alanları salt örnektir.
  const liveWorkspace = await getWorkspaceByKind("live");

  if (!liveWorkspace) {
    return (
      <PageContainer>
        <EmptyState title="Canlı çalışma alanı bulunamadı">Veritabanı beklenen biçimde kurulmamış görünüyor. Uygulamayı yeniden başlatmayı deneyin.</EmptyState>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <PageHeading
        title="Yeni proje"
        lead={`Proje “${liveWorkspace.name}” içinde açılır ve gerçek kaynakları tarar. Kaydetmeden önce “Önizle” ile aramanın ne getirdiğine bakın.`}
      />
      <Panel className="max-w-[64rem]">
        <ProjectForm workspaceId={liveWorkspace.id} initial={{ name: "", description: "", query: "", connectorIds: defaultConnectorIds() }} connectors={connectorOptions()} />
      </Panel>
    </PageContainer>
  );
}
