import { notFound } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { AppShell, ShellSkeleton } from "@/components/shell/app-shell";
import { loadProjectContext } from "@/server/context";

/** Proje sayfalarının ortak iskeleti: yan menü, bağlam çubuğu ve içerik. */

async function ProjectShell({ params, children }: { params: Promise<{ id: string }>; children: ReactNode }) {
  const { id } = await params;
  const context = await loadProjectContext(id);
  if (!context) notFound();
  return (
    <AppShell workspace={context.workspace} workspaces={context.workspaces} projects={context.siblings} project={context.project} viewer={context.viewer}>
      {children}
    </AppShell>
  );
}

export default function ProjectLayout({ params, children }: LayoutProps<"/proje/[id]">) {
  return (
    <Suspense fallback={<ShellSkeleton />}>
      <ProjectShell params={params}>{children}</ProjectShell>
    </Suspense>
  );
}
