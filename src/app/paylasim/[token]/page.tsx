import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PrintButton } from "@/components/forms/print-button";
import { PageLoading } from "@/components/loading";
import { ReportView } from "@/components/report-view";
import { requestStart } from "@/server/context";
import { getProject } from "@/server/repositories/projects";
import { getActiveShare } from "@/server/repositories/shares";

export const metadata: Metadata = { title: "Dönem raporu", robots: { index: false, follow: false } };

/**
 * Salt okunur rapor. Bağlantıdaki anahtar geçerliyse projenin seçili dönem
 * raporu güncel veriyle çizilir; panelin başka hiçbir ekranına bağlantı vermez.
 */
async function SharedReport({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const now = await requestStart();
  const shareRecord = await getActiveShare(token);
  const project = shareRecord ? await getProject(shareRecord.projectId) : null;
  if (!shareRecord || !project) notFound();

  return (
    <main id="icerik" className="min-h-screen bg-paper py-6 print:bg-surface print:py-0">
      <div className="mx-auto mb-4 flex max-w-[52rem] items-center justify-between gap-3 px-6 print:hidden sm:px-10">
        <p className="text-[0.8125rem] text-ink-muted">Salt okunur rapor · her açılışta güncel veriyle çizilir</p>
        <PrintButton />
      </div>
      <div className="mx-auto max-w-[52rem] overflow-hidden rounded-xl border border-line shadow-[var(--shadow-card)] print:rounded-none print:border-0 print:shadow-none">
        <ReportView project={project} rangeKey={shareRecord.rangeKey} now={now} />
      </div>
    </main>
  );
}

export default function SharedReportPage({ params }: PageProps<"/paylasim/[token]">) {
  return (
    <Suspense fallback={<PageLoading />}>
      <SharedReport params={params} />
    </Suspense>
  );
}
