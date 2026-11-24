import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CommandCenter } from "@/components/command-center";
import { loadProjectContext } from "@/server/context";
import { getLiveSnapshot } from "@/server/services/live";

export const metadata: Metadata = { title: "Komuta merkezi" };

async function LiveBoard({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const context = await loadProjectContext(id);
  if (!context) notFound();
  return <CommandCenter initial={getLiveSnapshot(context.project, context.workspace, context.now)} />;
}

export default function CommandCenterPage({ params }: PageProps<"/komuta/[id]">) {
  return (
    <Suspense fallback={<div className="theme-dark min-h-screen bg-paper" />}>
      <LiveBoard params={params} />
    </Suspense>
  );
}
