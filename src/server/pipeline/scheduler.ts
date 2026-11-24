import { config } from "../config";
import { listProjects } from "../repositories/projects";
import { getWorkspaceByKind } from "../repositories/workspaces";
import { collectProject } from "./collect";

/**
 * Süreç içi zamanlayıcı: canlı projeleri belirli aralıklarla tarar.
 * Tek süreçli yerel kurulum içindir; çok düğümlü kurulumda yerini dayanıklı
 * bir iş kuyruğu almalıdır (bkz. README, yol haritası).
 */

const TIMER_KEY = Symbol.for("yanki.scheduler.timer");
type GlobalWithTimer = typeof globalThis & { [TIMER_KEY]?: NodeJS.Timeout };

const FIRST_RUN_DELAY_MS = 20_000;

async function collectAllLiveProjects(): Promise<void> {
  const workspace = getWorkspaceByKind("live");
  if (!workspace) return;
  for (const project of listProjects(workspace.id)) {
    try {
      await collectProject(project.id);
    } catch (error) {
      // Bir projedeki hata diğerlerinin taranmasını engellememeli.
      console.error(`[yankı] "${project.name}" taranamadı:`, error);
    }
  }
}

export function startScheduler(): void {
  const minutes = config.collectionIntervalMinutes;
  const holder = globalThis as GlobalWithTimer;
  if (minutes === 0 || holder[TIMER_KEY]) return;

  const tick = () => void collectAllLiveProjects();
  setTimeout(tick, FIRST_RUN_DELAY_MS).unref();
  holder[TIMER_KEY] = setInterval(tick, minutes * 60_000);
  holder[TIMER_KEY].unref();
}
