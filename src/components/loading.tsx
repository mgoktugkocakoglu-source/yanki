import { PageContainer } from "./ui";

/** Sayfa verisi gelene kadar gösterilen iskelet: yankı halkaları ve boş paneller. */
export function PageLoading() {
  return (
    <PageContainer>
      <div className="flex items-center gap-3 text-ink-muted" role="status">
        <svg viewBox="0 0 32 32" className="h-8 w-8" aria-hidden="true">
          <circle className="echo-pulse" cx="16" cy="16" r="14" fill="none" stroke="var(--brand)" strokeWidth="1.5" />
          <circle className="echo-pulse" cx="16" cy="16" r="14" fill="none" stroke="var(--brand)" strokeWidth="1.5" />
          <circle className="echo-pulse" cx="16" cy="16" r="14" fill="none" stroke="var(--brand)" strokeWidth="1.5" />
          <circle cx="16" cy="16" r="2.5" fill="var(--brand)" />
        </svg>
        <span>Yükleniyor…</span>
      </div>
      <div className="mt-6 space-y-3">
        <div className="skeleton h-7 w-3/4" />
        <div className="skeleton h-7 w-2/3" />
        <div className="skeleton h-7 w-1/2" />
      </div>
      <div className="mt-8 grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="skeleton h-72 rounded-lg" />
        <div className="skeleton h-72 rounded-lg" />
      </div>
    </PageContainer>
  );
}
