import { Suspense, type ReactNode } from "react";
import { AppShell, ShellSkeleton } from "@/components/shell/app-shell";
import { loadWorkspaceContext } from "@/server/context";

/** Çalışma alanı sayfalarının iskeleti: karşılaştırma, projeler, denetim izi. */

async function WorkspaceShell({ children }: { children: ReactNode }) {
  const context = await loadWorkspaceContext();
  return (
    <AppShell workspace={context.workspace} workspaces={context.workspaces} projects={context.projects} project={null} viewer={context.viewer}>
      {children}
    </AppShell>
  );
}

export default function WorkspaceLayout({ children }: LayoutProps<"/">) {
  return (
    <Suspense fallback={<ShellSkeleton />}>
      <WorkspaceShell>{children}</WorkspaceShell>
    </Suspense>
  );
}
