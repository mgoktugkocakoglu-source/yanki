import type { Metadata } from "next";
import Link from "next/link";
import { SetupPrompt, StatTiles } from "@/components/admin/panels";
import { AddFeedForm } from "@/components/forms/news-forms";
import { BUTTON_SECONDARY, PageContainer, PageHeading, Panel } from "@/components/ui";
import { formatDay, formatNumber, formatRelative } from "@/lib/format";
import { DAY_MS } from "@/lib/time";
import { requireSysadmin } from "@/server/auth/session";
import { config } from "@/server/config";
import { requestStart } from "@/server/context";
import { crawlNowAction, setFeedEnabledAction } from "@/server/actions/news";
import { archiveStats, articleCountsByFeed, listFeeds, type NewsFeed } from "@/server/repositories/news";

export const metadata: Metadata = { title: "Haber arşivi" };

/** Durum hem işaret hem yazıyla verilir; renk tek başına bilgi taşımaz. */
function feedStatus(feed: NewsFeed): { mark: string; label: string; tone: string } {
  if (!feed.enabled) return { mark: "—", label: "Kapalı", tone: "text-ink-muted" };
  switch (feed.lastStatus) {
    case "ok":
    case "unchanged":
      return { mark: "✓", label: "Çalışıyor", tone: "text-positive-ink" };
    case "error":
      return { mark: "!", label: `Yanıt vermiyor (${feed.failures}. deneme)`, tone: "text-negative-ink" };
    case "robots":
      return { mark: "⦸", label: "Site taramaya kapatmış", tone: "text-negative-ink" };
    default:
      return { mark: "…", label: "Henüz taranmadı", tone: "text-ink-muted" };
  }
}

/** Sistem yöneticisi: haber arşivinin kaynakları, sağlığı ve gerçek ölçüleri. */
export default async function NewsArchivePage() {
  const now = await requestStart();
  const viewer = await requireSysadmin();
  if (!viewer) return <SetupPrompt />;

  const stats = archiveStats(now - DAY_MS);
  const feeds = listFeeds();
  const counts = articleCountsByFeed();

  return (
    <PageContainer>
      <PageHeading
        title="Haber arşivi"
        lead="Yayıncıların kendi akışları projelerden bağımsız olarak sürekli taranır ve başlıklar burada birikir. Konular bu arşivden eşleştirilir; yeni açılan bir konu arşivdeki geçmiş haberlerle hemen dolar."
        actions={
          <form action={crawlNowAction}>
            <button type="submit" className={BUTTON_SECONDARY}>
              Şimdi tara
            </button>
          </form>
        }
      />

      <div className="flex flex-col gap-5">
        <StatTiles
          stats={[
            { label: "Arşivdeki başlık", value: formatNumber(stats.articles), note: `son 24 saatte ${formatNumber(stats.addedSince)} yeni` },
            { label: "Yayıncı", value: formatNumber(stats.outlets), note: `${formatNumber(stats.activeFeeds)} açık akış` },
            {
              label: "Sorunlu akış",
              value: formatNumber(stats.failingFeeds + stats.blockedFeeds),
              note: `${formatNumber(stats.failingFeeds)} yanıt vermiyor · ${formatNumber(stats.blockedFeeds)} taramaya kapalı`,
            },
            {
              label: "Son tarama",
              value: stats.lastCrawlAt ? formatRelative(stats.lastCrawlAt, now) : "—",
              note: config.newsIntervalMinutes > 0 ? `${config.newsIntervalMinutes} dakikada bir` : "zamanlanmış tarama kapalı",
            },
          ]}
        />

        <Panel
          title="Akışlar"
          hint={`Başlıklar ${config.newsRetentionDays} gün saklanır${stats.oldestPublishedAt ? `; arşivdeki en eski haber ${formatDay(stats.oldestPublishedAt)} tarihli` : ""}. Yalnızca başlık, kısa özet ve bağlantı tutulur.`}
        >
          {feeds.length === 0 ? (
            <p className="text-ink-soft">Henüz akış yok. İlk tarama başlangıç listesini kendiliğinden yükler; “Şimdi tara” ile hemen başlatabilirsiniz.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[52rem] border-collapse text-left text-[0.875rem]">
                <thead>
                  <tr className="text-[0.75rem] text-ink-muted">
                    <th scope="col" className="pb-2 pr-4 font-medium">
                      Yayın
                    </th>
                    <th scope="col" className="pb-2 pr-4 font-medium">
                      Akış
                    </th>
                    <th scope="col" className="pb-2 pr-4 font-medium">
                      Durum
                    </th>
                    <th scope="col" className="pb-2 pr-4 text-right font-medium">
                      Arşivde
                    </th>
                    <th scope="col" className="pb-2 pr-4 font-medium">
                      Son başarılı tarama
                    </th>
                    <th scope="col" className="pb-2 font-medium">
                      <span className="sr-only">İşlem</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {feeds.map((feed) => {
                    const status = feedStatus(feed);
                    return (
                      <tr key={feed.id} className="border-t border-line align-top">
                        <th scope="row" className="py-2 pr-4 font-medium">
                          {feed.outlet}
                          {feed.origin === "manual" ? <span className="ml-1.5 rounded bg-sunken px-1.5 py-0.5 text-[0.6875rem] font-medium text-ink-soft">elle eklendi</span> : null}
                        </th>
                        <td className="reading max-w-[22rem] break-all py-2 pr-4 text-[0.8125rem] text-ink-soft">{feed.url}</td>
                        <td className={`py-2 pr-4 ${status.tone}`}>
                          <span aria-hidden="true">{status.mark} </span>
                          {status.label}
                          {feed.enabled && feed.lastError ? <span className="block text-[0.75rem] text-ink-muted">{feed.lastError}</span> : null}
                        </td>
                        <td className="reading py-2 pr-4 text-right">{formatNumber(counts.get(feed.id) ?? 0)}</td>
                        <td className="py-2 pr-4 text-ink-soft">{feed.lastOkAt ? formatRelative(feed.lastOkAt, now) : "—"}</td>
                        <td className="py-2 text-right">
                          <form action={setFeedEnabledAction}>
                            <input type="hidden" name="feedId" value={feed.id} />
                            <input type="hidden" name="enabled" value={feed.enabled ? "0" : "1"} />
                            <button type="submit" className="text-[0.8125rem] font-medium text-brand-strong hover:underline">
                              {feed.enabled ? "Kapat" : "Aç"}
                            </button>
                          </form>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <Panel title="Akış ekle" hint="Adres kaydedilmeden önce denenir: sitenin robots.txt dosyası taramaya izin vermeli ve akışta tarihli haber bulunmalıdır.">
          <AddFeedForm />
        </Panel>

        <p className="text-[0.875rem] text-ink-muted">
          <Link href="/sistem" className="font-medium text-brand-strong hover:underline">
            ← Sistem yönetimi
          </Link>
        </p>
      </div>
    </PageContainer>
  );
}
