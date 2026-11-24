/**
 * Sunucu başlarken bir kez çalışır: canlı projelerin zamanlanmış taramasını başlatır.
 * Derleme sırasında ve Node dışı çalışma zamanlarında hiçbir şey yapmaz.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NEXT_PHASE === "phase-production-build") return;
  const { startScheduler } = await import("./server/pipeline/scheduler");
  startScheduler();
}
