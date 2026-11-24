/**
 * Bağlayıcıları canlı kaynaklara karşı dener; veritabanına hiçbir şey yazmaz.
 *
 *   npm run kaynak-dene -- "aranacak ifade"
 */
import { previewCollection } from "@/server/pipeline/collect";
import { listConnectors } from "@/server/collectors/registry";

const query = process.argv[2] ?? "belediye";

async function main(): Promise<void> {
  const connectorIds = listConnectors().map((connector) => connector.descriptor.id);
  const started = Date.now();
  const preview = await previewCollection(query, connectorIds);
  if (!preview) {
    console.error("Sorgu aranabilir kelime içermiyor.");
    process.exitCode = 1;
    return;
  }

  console.log(`Sorgu: ${query}`);
  console.log(`Aranan ifadeler: ${preview.keywords.join(", ")}`);
  console.table(preview.connectors);
  console.log(`Toplam eşleşme: ${preview.totalMatched} (${Date.now() - started} ms)`);
  for (const sample of preview.samples) {
    console.log(`- [${sample.sourceName}] ${new Date(sample.publishedAt).toISOString()} ${sample.title || sample.content.slice(0, 110)}`);
  }
}

void main();
