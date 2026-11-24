import { ExternalLink, FileText } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageContainer, PageHeading, Panel, BUTTON_PRIMARY, BUTTON_SECONDARY } from "@/components/ui";
import { formatRelative } from "@/lib/format";
import { RANGE_PRESETS } from "@/lib/time";
import { createReportShareAction, revokeReportShareAction } from "@/server/actions/reports";
import { loadProjectContext, readRange } from "@/server/context";
import { listActiveShares } from "@/server/repositories/shares";

export const metadata: Metadata = { title: "Rapor" };

/** Rapor: seçili dönemin tek sayfalık dökümü, PDF çıktısı ve salt okunur paylaşım bağlantıları. */
export default async function ReportPage({ params, searchParams }: PageProps<"/proje/[id]/rapor">) {
  const { id } = await params;
  const context = await loadProjectContext(id);
  if (!context) notFound();

  const { project, now } = context;
  const rangeKey = readRange(await searchParams);
  const shares = await listActiveShares(project.id);

  return (
    <PageContainer>
      <PageHeading
        title="Rapor"
        lead="Seçili dönemin ölçümleri, platform dağılımı, konular, öne çıkan hikâyeler ve varsa yapay zekâ özeti ile iddialar tek sayfada. Yazdırabilir, PDF olarak kaydedebilir ya da bağlantısını paylaşabilirsiniz."
      />

      <div className="flex max-w-[60rem] flex-col gap-5">
        <Panel title={`${RANGE_PRESETS[rangeKey].label} raporu`} hint="Dönemi sağ üstten değiştirebilirsiniz.">
          <form action={createReportShareAction}>
            <input type="hidden" name="projectId" value={project.id} />
            <input type="hidden" name="rangeKey" value={rangeKey} />
            <button type="submit" className={BUTTON_PRIMARY}>
              <FileText className="h-4 w-4" aria-hidden="true" />
              Raporu aç
            </button>
          </form>
          <p className="mt-3 max-w-[70ch] text-[0.8125rem] text-ink-muted">
            Rapor, paylaşılabilir bir bağlantıda açılır. Bağlantıyı bilen herkes raporu salt okunur görür; rapor her açılışta güncel veriyle çizilir. PDF için rapor
            sayfasındaki “Yazdır / PDF kaydet” düğmesini kullanın.
          </p>
        </Panel>

        <Panel title="Etkin paylaşım bağlantıları" hint="İptal edilen bağlantı bir daha açılmaz.">
          {shares.length === 0 ? (
            <p className="text-ink-soft">Henüz paylaşım bağlantısı oluşturulmadı.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-line">
              {shares.map((share) => (
                <li key={share.token} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <p className="font-medium">{RANGE_PRESETS[share.rangeKey].label}</p>
                    <p className="reading break-all text-[0.8125rem] text-ink-soft">/paylasim/{share.token}</p>
                    <p className="text-[0.75rem] text-ink-muted">{formatRelative(share.createdAt, now)} oluşturuldu</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Link href={`/paylasim/${share.token}`} target="_blank" className={BUTTON_SECONDARY}>
                      <ExternalLink className="h-4 w-4" aria-hidden="true" />
                      Aç
                    </Link>
                    <form action={revokeReportShareAction}>
                      <input type="hidden" name="token" value={share.token} />
                      <button type="submit" className={BUTTON_SECONDARY}>
                        İptal et
                      </button>
                    </form>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </PageContainer>
  );
}
