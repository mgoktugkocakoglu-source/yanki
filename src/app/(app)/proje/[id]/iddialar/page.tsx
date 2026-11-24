import { ExternalLink } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ClaimsButton } from "@/components/forms/claims-button";
import { EmptyState, PageContainer, PageHeading, Tag } from "@/components/ui";
import { formatDateTime, formatNumber, formatRelative } from "@/lib/format";
import { mentionsHref } from "@/lib/links";
import { RANGE_PRESETS, type RangeKey } from "@/lib/time";
import { getAiProvider } from "@/server/ai/provider";
import { loadProjectContext, readRange } from "@/server/context";
import { getLatestClaimRun, type Claim } from "@/server/repositories/claims";
import { CLAIM_MENTION_LIMIT } from "@/server/services/claims";

export const metadata: Metadata = { title: "İddialar" };

/** Bir iddianın altında bağlantısı verilen en çok dayanak içerik. */
const EVIDENCE_LINKS = 5;

function evidenceHref(projectId: string, rangeKey: RangeKey, mentionId: string): string {
  const base = mentionsHref(projectId, { rangeKey });
  return `${base}${base.includes("?") ? "&" : "?"}secili=${encodeURIComponent(mentionId)}`;
}

function ClaimCard({ claim, index, projectId, rangeKey, searched }: { claim: Claim; index: number; projectId: string; rangeKey: RangeKey; searched: boolean }) {
  const platforms = Object.entries(claim.platforms).sort((a, b) => b[1] - a[1]);
  return (
    <li className="rounded-xl border border-line bg-surface p-5 shadow-[var(--shadow-card)]">
      <div className="flex gap-3">
        <span className="reading mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-sunken text-[0.8125rem] font-semibold text-ink-soft" aria-hidden="true">
          {index + 1}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-[1.0625rem] font-semibold leading-snug">{claim.text}</h2>
          <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.8125rem] text-ink-muted">
            <span>
              <span className="reading text-ink">{formatNumber(claim.mentionIds.length)}</span> içerikte
            </span>
            <span>
              incelenen içeriklerde ilk görülme <span className="reading text-ink-soft">{formatDateTime(claim.firstSeenAt)}</span>
            </span>
            {platforms.map(([name, count]) => (
              <Tag key={name}>
                {name} · {formatNumber(count)}
              </Tag>
            ))}
          </p>

          <div className="mt-4 rounded-lg border border-line bg-paper p-3.5">
            {claim.checks.length > 0 ? (
              <>
                <p className="text-[0.8125rem] font-semibold">Yayımlanmış doğrulamalar</p>
                <ul className="mt-2 flex flex-col gap-2.5">
                  {claim.checks.map((check) => (
                    <li key={check.url} className="text-[0.9375rem]">
                      <span className="font-semibold">{check.publisherName}</span>
                      {check.rating ? (
                        <>
                          {" "}
                          bu iddiayı <span className="rounded bg-sunken px-1.5 py-0.5 font-medium">{check.rating}</span> olarak değerlendirdi
                        </>
                      ) : (
                        " bu iddiayı inceledi"
                      )}
                      {check.reviewDate ? <span className="text-ink-muted"> · {formatDateTime(check.reviewDate)}</span> : null}
                      <a href={check.url} target="_blank" rel="noopener noreferrer" className="mt-0.5 flex items-start gap-1 text-[0.875rem] font-medium text-brand-strong hover:underline">
                        <span>{check.title || check.claimText || check.url}</span>
                        <ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      </a>
                    </li>
                  ))}
                </ul>
                <p className="mt-3 text-[0.75rem] text-ink-muted">Değerlendirme, adı yazılı kuruluşa aittir. Kaydı bu iddiayla dil modeli eşleştirdi; bağlantıdan doğrulayın.</p>
              </>
            ) : !searched ? (
              <p className="text-[0.875rem] text-ink-soft">Bu iddia için yayımlanmış doğrulama araması yapılmadı.</p>
            ) : (
              <p className="text-[0.875rem] text-ink-soft">
                Eşleşen yayımlanmış doğrulama bulunamadı. Bu, iddianın doğru ya da yanlış olduğunu göstermez; değerlendirme için dayanak içeriklere bakın.
              </p>
            )}
          </div>

          <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.8125rem] text-ink-muted">
            <span>Dayanak içerikler:</span>
            {claim.mentionIds.slice(0, EVIDENCE_LINKS).map((mentionId, evidenceIndex) => (
              <Link key={mentionId} href={evidenceHref(projectId, rangeKey, mentionId)} className="font-medium text-brand-strong hover:underline">
                {evidenceIndex + 1}. içerik
              </Link>
            ))}
            {claim.mentionIds.length > EVIDENCE_LINKS ? <span>ve {formatNumber(claim.mentionIds.length - EVIDENCE_LINKS)} içerik daha</span> : null}
          </p>
        </div>
      </div>
    </li>
  );
}

export default async function ClaimsPage({ params, searchParams }: PageProps<"/proje/[id]/iddialar">) {
  const { id } = await params;
  const context = await loadProjectContext(id);
  if (!context) notFound();

  const { project, now } = context;
  const rangeKey = readRange(await searchParams);
  const provider = getAiProvider();
  const run = getLatestClaimRun(project.id, rangeKey);
  const matched = run ? run.claims.filter((claim) => claim.checks.length > 0).length : 0;

  return (
    <PageContainer>
      <PageHeading
        title="İddialar"
        lead="İçeriklerde ileri sürülen, kontrol edilebilir olgusal iddialar ve bunlar hakkında doğrulama kuruluşlarının yayımladığı değerlendirmeler. Yankı doğru ya da yanlış hükmü vermez."
        actions={provider ? <ClaimsButton projectId={project.id} rangeKey={rangeKey} hasRun={run !== null} /> : null}
      />

      {!run ? (
        <EmptyState title={provider ? "Henüz iddia taraması yapılmadı" : "İddia taraması kapalı"}>
          {provider
            ? `"İddiaları tara" düğmesine bastığınızda ${RANGE_PRESETS[rangeKey].label.toLocaleLowerCase("tr")} içindeki en yeni ${formatNumber(CLAIM_MENTION_LIMIT)} içeriğin metni ${provider.label} hizmetine gönderilir; model iddiaları çıkarır, ardından yayımlanmış doğrulamalar aranır.`
            : "İddia taraması bir dil modeli gerektirir. Açmak için .env.local dosyasına ANTHROPIC_API_KEY yazıp sunucuyu yeniden başlatın."}
        </EmptyState>
      ) : (
        <div className="flex max-w-[64rem] flex-col gap-4">
          <p className="text-[0.8125rem] text-ink-muted">
            {RANGE_PRESETS[run.rangeKey].label} · {formatRelative(run.createdAt, now)} tarandı · model: <span className="reading">{run.model}</span> · dönemdeki{" "}
            {formatNumber(run.mentionsTotal)} içeriğin en yeni {formatNumber(run.mentionsSent)} tanesi incelendi · {formatNumber(run.claims.length)} iddia
            {run.factCheckStatus === "ok" ? `, ${formatNumber(matched)} tanesinde yayımlanmış doğrulama var` : ""}. İddia metinleri dil modeli çıktısıdır; hata içerebilir.
          </p>

          {run.factCheckStatus !== "ok" ? (
            <p className="rounded-lg border border-dashed border-line-strong bg-surface p-3.5 text-[0.875rem] text-ink-soft">
              <span className="font-semibold text-ink">Yayımlanmış doğrulamalar aranamadı.</span>{" "}
              {run.factCheckStatus === "disabled" ? "Doğrulama araması için Google API anahtarı tanımlı değil." : run.factCheckMessage}
            </p>
          ) : null}

          {run.claims.length === 0 ? (
            <EmptyState title="Kontrol edilmeye değer iddia bulunamadı">İncelenen içerikler görüş, soru ya da duyuru ağırlıklı; model somut bir olgusal iddia çıkarmadı.</EmptyState>
          ) : (
            <ol className="flex flex-col gap-3">
              {run.claims.map((claim, index) => (
                <ClaimCard key={claim.id} claim={claim} index={index} projectId={project.id} rangeKey={rangeKey} searched={run.factCheckStatus === "ok"} />
              ))}
            </ol>
          )}
        </div>
      )}
    </PageContainer>
  );
}
