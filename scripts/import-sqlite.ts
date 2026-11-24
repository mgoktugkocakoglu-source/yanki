/**
 * Eski SQLite veritabanındaki veriyi PostgreSQL'e taşır. Bir kez çalıştırılır.
 *
 *   npm run sqlite-aktar                      → data/yanki.db dosyasından
 *   npm run sqlite-aktar -- yol/eski.db       → başka bir dosyadan
 *
 * Hedef, uygulamanın kullandığı veritabanıdır (`DATABASE_URL` ya da gömülü
 * PostgreSQL). Hedefte kayıt varsa hiçbir şey yazılmaz. Aktarım tek işlemdir:
 * yarıda kesilirse hedef boş kalır.
 */
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { execute, queryAll, queryOne, transaction, type SqlValue } from "@/server/db/client";

const BATCH_SIZE = 200;
/** Değeri veritabanının ürettiği sütunlar; aktarımda yazılmaz. */
const GENERATED_COLUMNS = new Set(["organization_ledger.seq", "credit_ledger.seq"]);

async function targetTables(): Promise<string[]> {
  // Yabancı anahtar sırası: şemadaki oluşturulma sırası (pg_class.oid) üst tabloları önce verir.
  const rows = await queryAll<{ name: string }>(
    `SELECT c.relname AS name FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname <> 'schema_migrations' ORDER BY c.oid`,
  );
  return rows.map((row) => row.name);
}

async function targetColumns(table: string): Promise<string[]> {
  const rows = await queryAll<{ name: string }>(
    "SELECT column_name AS name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = ? ORDER BY ordinal_position",
    [table],
  );
  return rows.map((row) => row.name).filter((column) => !GENERATED_COLUMNS.has(`${table}.${column}`));
}

async function copyTable(source: DatabaseSync, table: string): Promise<number> {
  const sourceColumns = new Set((source.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map((column) => column.name));
  if (sourceColumns.size === 0) return 0;
  const columns = (await targetColumns(table)).filter((column) => sourceColumns.has(column));
  // Ekleme sırası yalnızca satır kimliği olan tablolarda bilinir (defterlerin sırası buna dayanır).
  const hasRowId = !/WITHOUT ROWID/i.test((source.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?").get(table) as { sql: string }).sql);
  const rows = source.prepare(`SELECT ${columns.join(", ")} FROM ${table}${hasRowId ? " ORDER BY rowid" : ""}`).all() as Array<Record<string, SqlValue>>;

  for (let start = 0; start < rows.length; start += BATCH_SIZE) {
    const batch = rows.slice(start, start + BATCH_SIZE);
    const tuple = `(${columns.map(() => "?").join(", ")})`;
    await execute(
      `INSERT INTO ${table} (${columns.join(", ")}) VALUES ${batch.map(() => tuple).join(", ")}`,
      batch.flatMap((row) => columns.map((column) => row[column])),
    );
  }
  return rows.length;
}

async function main(): Promise<void> {
  const file = path.resolve(process.argv[2] ?? path.join("data", "yanki.db"));
  const existing = await queryOne<{ count: number }>("SELECT COUNT(*) AS count FROM workspaces");
  if ((existing?.count ?? 0) > 0) {
    console.error("Hedef veritabanında kayıt var; aktarım yapılmadı.");
    process.exitCode = 1;
    return;
  }
  const source = new DatabaseSync(file, { readOnly: true });
  const tables = await targetTables();
  const counts = await transaction(async () => {
    const copied: Array<{ tablo: string; satır: number }> = [];
    for (const table of tables) {
      const started = Date.now();
      const count = await copyTable(source, table);
      copied.push({ tablo: table, satır: count });
      if (count > 0) console.log(`${table}: ${count} satır (${Date.now() - started} ms)`);
    }
    // Kimliği veritabanının ürettiği tabloda sayaç, taşınan en büyük değerin üstüne alınır.
    await execute("SELECT setval(pg_get_serial_sequence('news_articles', 'id'), GREATEST((SELECT COALESCE(MAX(id), 0) FROM news_articles), 1))");
    return copied;
  });
  source.close();
  console.table(counts.filter((entry) => entry.satır > 0));
  console.log(`Aktarıldı: ${counts.reduce((sum, entry) => sum + entry.satır, 0)} satır (${file}).`);
}

main().catch((error) => {
  console.error("Aktarım başarısız; hedefe hiçbir şey yazılmadı.", error);
  process.exitCode = 1;
});
