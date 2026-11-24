import { AsyncLocalStorage } from "node:async_hooks";
import fs from "node:fs";
import { config } from "../config";
import { MIGRATIONS } from "./schema";

/**
 * PostgreSQL bağlantısı. İki sürücü aynı arayüzün arkasındadır:
 *
 *   - `DATABASE_URL` tanımlıysa gerçek bir PostgreSQL sunucusuna bağlantı
 *     havuzu (`pg`) açılır. Kurum kurulumu budur.
 *   - Tanımlı değilse uygulamayla birlikte gelen gömülü PostgreSQL (PGlite)
 *     kullanılır: yerel geliştirmede `data/pg` klasörüne yazar, testlerde
 *     bellekte çalışır. Ayrı bir sunucu kurmak gerekmez.
 *
 * Depolar SQL'i `?` yer tutucularıyla yazar; sürücüye giderken `$1, $2 …`
 * biçimine çevrilir. Kullanıcı girdisi SQL metnine girmez, yalnızca parametredir.
 *
 * Bağlantı süreç başına tektir ve geliştirme sırasında sıcak yeniden
 * yüklemeden etkilenmemesi için `globalThis` üzerinde tutulur.
 */

export type SqlValue = string | number | boolean | null | readonly string[] | readonly number[];
export type SqlParams = SqlValue[];

interface QueryResult {
  rows: unknown[];
  affected: number;
}

/** Tek bir bağlantı ya da işlem üzerinde sorgu çalıştırabilen şey. */
interface Executor {
  run(sql: string, params: SqlParams): Promise<QueryResult>;
}

interface Driver extends Executor {
  /** `work` tek bir işlem içinde, kendisine ayrılmış bağlantıyla çalışır. */
  transaction<Result>(work: (executor: Executor) => Promise<Result>): Promise<Result>;
  /** Parametresiz, çok ifadeli SQL (göçler). */
  exec(sql: string): Promise<void>;
}

/** PostgreSQL tür kimlikleri: BIGINT ve NUMERIC varsayılan olarak metin döner; sayıya çevrilir. */
const INT8_OID = 20;
const NUMERIC_OID = 1700;

/** `?` yer tutucularını `$1, $2 …` biçimine çevirir; tırnak içindeki soru işaretlerine dokunmaz. */
export function toPositional(sql: string): string {
  let index = 0;
  let inString = false;
  let result = "";
  for (const char of sql) {
    if (char === "'") inString = !inString;
    result += char === "?" && !inString ? `$${(index += 1)}` : char;
  }
  return result;
}

async function openServerDriver(url: string): Promise<Driver> {
  const { Pool, types } = await import("pg");
  types.setTypeParser(INT8_OID, Number);
  types.setTypeParser(NUMERIC_OID, Number);
  const pool = new Pool({ connectionString: url, max: config.databasePoolSize });
  const run = async (target: { query: (sql: string, params: unknown[]) => Promise<{ rows: unknown[]; rowCount: number | null }> }, sql: string, params: SqlParams) => {
    const result = await target.query(sql, params as unknown[]);
    return { rows: result.rows, affected: result.rowCount ?? 0 };
  };
  return {
    run: (sql, params) => run(pool, sql, params),
    exec: async (sql) => {
      await pool.query(sql);
    },
    async transaction(work) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const result = await work({ run: (sql, params) => run(client, sql, params) });
        await client.query("COMMIT");
        return result;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
  };
}

async function openEmbeddedDriver(directory: string): Promise<Driver> {
  const { PGlite } = await import("@electric-sql/pglite");
  const inMemory = directory === ":memory:";
  if (!inMemory) fs.mkdirSync(directory, { recursive: true });
  const database = new PGlite(inMemory ? undefined : directory, { parsers: { [INT8_OID]: Number, [NUMERIC_OID]: Number } });
  await database.waitReady;
  type Target = { query: (sql: string, params: unknown[]) => Promise<{ rows: unknown[]; affectedRows?: number }> };
  const run = async (target: Target, sql: string, params: SqlParams) => {
    const result = await target.query(sql, params as unknown[]);
    return { rows: result.rows, affected: result.affectedRows ?? 0 };
  };
  return {
    run: (sql, params) => run(database, sql, params),
    exec: async (sql) => {
      await database.exec(sql);
    },
    transaction: (work) => database.transaction((tx) => work({ run: (sql, params) => run(tx, sql, params) })),
  };
}

async function migrate(driver: Driver): Promise<void> {
  await driver.exec("CREATE TABLE IF NOT EXISTS schema_migrations (version BIGINT PRIMARY KEY, applied_at BIGINT NOT NULL)");
  const { rows } = await driver.run("SELECT COALESCE(MAX(version), 0) AS version FROM schema_migrations", []);
  const applied = (rows[0] as { version: number }).version;
  for (let version = applied; version < MIGRATIONS.length; version += 1) {
    // Göç ve sürüm kaydı aynı işlemde: yarım uygulanmış göç kalmaz.
    await driver.exec(`BEGIN;\n${MIGRATIONS[version]}\nINSERT INTO schema_migrations (version, applied_at) VALUES (${version + 1}, ${Date.now()});\nCOMMIT;`);
  }
}

async function open(): Promise<Driver> {
  const driver = config.databaseUrl ? await openServerDriver(config.databaseUrl) : await openEmbeddedDriver(config.embeddedDatabaseDir);
  await migrate(driver);
  return driver;
}

const GLOBAL_KEY = Symbol.for("yanki.database");
type GlobalWithDatabase = typeof globalThis & { [GLOBAL_KEY]?: Promise<Driver> };

function getDriver(): Promise<Driver> {
  const holder = globalThis as GlobalWithDatabase;
  holder[GLOBAL_KEY] ??= open();
  return holder[GLOBAL_KEY];
}

/** Süren işlemin bağlantısı; işlem içinden yapılan her sorgu aynı bağlantıdan gider. */
const activeTransaction = new AsyncLocalStorage<Executor>();

async function run(sql: string, params: SqlParams): Promise<QueryResult> {
  const executor = activeTransaction.getStore() ?? (await getDriver());
  return executor.run(toPositional(sql), params);
}

/** Birden çok satır döndüren sorgu. */
export async function queryAll<Row>(sql: string, params: SqlParams = []): Promise<Row[]> {
  return (await run(sql, params)).rows as Row[];
}

/** Tek satır döndüren sorgu; satır yoksa undefined. */
export async function queryOne<Row>(sql: string, params: SqlParams = []): Promise<Row | undefined> {
  return (await run(sql, params)).rows[0] as Row | undefined;
}

/** Yazma işlemi; etkilenen satır sayısını döndürür. */
export async function execute(sql: string, params: SqlParams = []): Promise<number> {
  return (await run(sql, params)).affected;
}

/**
 * `work` tek bir işlem (transaction) içinde çalışır; hata olursa geri alınır.
 * İç içe çağrılırsa dıştaki işleme katılır.
 */
export async function transaction<Result>(work: () => Promise<Result>): Promise<Result> {
  if (activeTransaction.getStore()) return work();
  const driver = await getDriver();
  return driver.transaction((executor) => activeTransaction.run(executor, work));
}
