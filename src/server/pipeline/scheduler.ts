import { config } from "../config";
import { listProjects } from "../repositories/projects";
import { getWorkspaceByKind } from "../repositories/workspaces";
import { crawlNews } from "../news/crawler";
import { collectProject } from "./collect";

/**
 * Süreç içi zamanlayıcı: haber arşivini ve canlı projeleri belirli aralıklarla tarar.
 * Tek süreçli yerel kurulum içindir; çok düğümlü kurulumda yerini dayanıklı
 * bir iş kuyruğu almalıdır (bkz. README, yol haritası).
 */

const TIMER_KEY = Symbol.for("yanki.scheduler.timer");
const NEWS_TIMER_KEY = Symbol.for("yanki.scheduler.news");
type GlobalWithTimer = typeof globalThis & { [TIMER_KEY]?: NodeJS.Timeout; [NEWS_TIMER_KEY]?: NodeJS.Timeout };

const FIRST_RUN_DELAY_MS = 20_000;
const NEWS_FIRST_RUN_DELAY_MS = 5_000;

async function collectAllLiveProjects(): Promise<void> {
  const workspace = await getWorkspaceByKind("live");
  if (!workspace) return;
  for (const project of await listProjects(workspace.id)) {
    try {
      await collectProject(project.id);
    } catch (error) {
      // Bir projedeki hata diğerlerinin taranmasını engellememeli.
      console.error(`[yankı] "${project.name}" taranamadı:`, error);
    }
  }
}

/** Haber arşivini projelerden bağımsız olarak, kendi aralığıyla tarar. */
function startNewsCrawler(holder: GlobalWithTimer): void {
  const minutes = config.newsIntervalMinutes;
  if (minutes === 0 || holder[NEWS_TIMER_KEY]) return;
  const tick = () =>
    void crawlNews().catch((error: unknown) => {
      console.error("[yankı] haber arşivi taranamadı:", error);
    });
  setTimeout(tick, NEWS_FIRST_RUN_DELAY_MS).unref();
  holder[NEWS_TIMER_KEY] = setInterval(tick, minutes * 60_000);
  holder[NEWS_TIMER_KEY].unref();
}

export function startScheduler(): void {
  const minutes = config.collectionIntervalMinutes;
  const holder = globalThis as GlobalWithTimer;
  startNewsCrawler(holder);
  if (minutes === 0 || holder[TIMER_KEY]) return;

  const tick = () => void collectAllLiveProjects();
  setTimeout(tick, FIRST_RUN_DELAY_MS).unref();
  holder[TIMER_KEY] = setInterval(tick, minutes * 60_000);
  holder[TIMER_KEY].unref();
}
