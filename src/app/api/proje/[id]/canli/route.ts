import type { NextRequest } from "next/server";
import { loadProjectContext } from "@/server/context";
import { getLiveSnapshot } from "@/server/services/live";

/** Komuta merkezinin yoklama uç noktası: son 24 saatin anlık görüntüsü. */
export async function GET(_request: NextRequest, context: RouteContext<"/api/proje/[id]/canli">) {
  const { id } = await context.params;
  const loaded = await loadProjectContext(id);
  if (!loaded) return Response.json({ error: "Proje bulunamadı." }, { status: 404 });

  return Response.json(await getLiveSnapshot(loaded.project, loaded.workspace, loaded.now), {
    headers: { "Cache-Control": "no-store" },
  });
}
