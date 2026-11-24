/**
 * Haber tarayıcısını canlı akışlara karşı bir kez çalıştırır ve akış akış rapor verir.
 *
 *   npm run haber-tara              → geçici bir veritabanında dener; kalıcı hiçbir şey yazmaz
 *   npm run haber-tara -- --kaydet  → asıl veritabanındaki arşive yazar
 */
import os from "node:os";
import path from "node:path";

const persist = process.argv.includes("--kaydet");
if (!persist) process.env.YANKI_DB_PATH = path.join(os.tmpdir(), `yanki-haber-deneme-${Date.now()}.db`);

async function main(): Promise<void> {
  const { crawlNews } = await import("@/server/news/crawler");
  const { archiveStats, articleCountsByFeed, listFeeds } = await import("@/server/repositories/news");

  const summary = await crawlNews();
  const counts = articleCountsByFeed();
  const feeds = listFeeds();
  console.table(
    feeds.map((feed) => ({
      yayın: feed.outlet,
      durum: feed.lastStatus ?? "taranmadı",
      akıştaki: feed.lastItemCount,
      arşive: counts.get(feed.id) ?? 0,
      not: feed.lastError ?? "",
      adres: feed.url,
    })),
  );
  const stats = archiveStats(0);
  console.log(
    `Akış: ${summary.feeds} · başarılı: ${summary.ok} · hatalı: ${summary.errors} · robots.txt engeli: ${summary.blocked} · ` +
      `yeni başlık: ${summary.inserted} · yayıncı: ${stats.outlets} · süre: ${Math.round(summary.durationMs / 1000)} sn`,
  );
  if (!persist) console.log(`Deneme veritabanı: ${process.env.YANKI_DB_PATH}`);
}

void main();
