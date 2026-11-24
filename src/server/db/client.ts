import fs from "node:fs";
import path from "node:path";
import { DatabaseSync, type SQLInputValue, type StatementSync } from "node:sqlite";
import { sqlFold, sqlNearMatch, sqlTextMatch } from "@/lib/query/sql";
import { config } from "../config";
import { MIGRATIONS } from "./schema";

/**
 * SQLite bağlantısı (Node'un yerleşik `node:sqlite` sürücüsü; yerel derleme
 * gerektirmez). Bağlantı süreç başına tektir ve geliştirme sırasında sıcak
 * yeniden yüklemeden etkilenmemesi için `globalThis` üzerinde tutulur.
 */

export type SqlParams = SQLInputValue[];

const GLOBAL_KEY = Symbol.for("yanki.database");
type GlobalWithDatabase = typeof globalThis & { [GLOBAL_KEY]?: DatabaseSync };

function migrate(database: DatabaseSync): void {
  const row = database.prepare("PRAGMA user_version").get() as { user_version: number };
  for (let version = row.user_version; version < MIGRATIONS.length; version += 1) {
    database.exec("BEGIN");
    try {
      database.exec(MIGRATIONS[version]);
      database.exec(`PRAGMA user_version = ${version + 1}`);
      database.exec("COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
  }
}

function registerQueryFunctions(database: DatabaseSync): void {
  const options = { deterministic: true };
  database.function("yq_text", options, sqlTextMatch);
  database.function("yq_near", options, sqlNearMatch);
  database.function("yq_fold", options, sqlFold);
}

export function openDatabase(filePath: string): DatabaseSync {
  if (filePath !== ":memory:") {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
  }
  const database = new DatabaseSync(filePath);
  database.exec("PRAGMA journal_mode = WAL");
  database.exec("PRAGMA synchronous = NORMAL");
  database.exec("PRAGMA foreign_keys = ON");
  database.exec("PRAGMA busy_timeout = 5000");
  registerQueryFunctions(database);
  migrate(database);
  return database;
}

export function getDatabase(): DatabaseSync {
  const holder = globalThis as GlobalWithDatabase;
  holder[GLOBAL_KEY] ??= openDatabase(config.databasePath);
  return holder[GLOBAL_KEY];
}

/** Hazırlanmış ifade önbelleği; aynı SQL her seferinde yeniden derlenmez. */
const STATEMENT_CACHE_LIMIT = 300;
const statementCache = new WeakMap<DatabaseSync, Map<string, StatementSync>>();

function prepare(sql: string): StatementSync {
  const database = getDatabase();
  let cache = statementCache.get(database);
  if (!cache) {
    cache = new Map();
    statementCache.set(database, cache);
  }
  let statement = cache.get(sql);
  if (!statement) {
    if (cache.size >= STATEMENT_CACHE_LIMIT) cache.clear();
    statement = database.prepare(sql);
    cache.set(sql, statement);
  }
  return statement;
}

/** Birden çok satır döndüren sorgu. */
export function queryAll<Row>(sql: string, params: SqlParams = []): Row[] {
  return prepare(sql).all(...params) as Row[];
}

/** Tek satır döndüren sorgu; satır yoksa undefined. */
export function queryOne<Row>(sql: string, params: SqlParams = []): Row | undefined {
  return prepare(sql).get(...params) as Row | undefined;
}

/** Yazma işlemi; etkilenen satır sayısını döndürür. */
export function execute(sql: string, params: SqlParams = []): number {
  return Number(prepare(sql).run(...params).changes);
}

/** `work` tek bir işlem (transaction) içinde çalışır; hata olursa geri alınır. */
export function transaction<Result>(work: () => Result): Result {
  const database = getDatabase();
  database.exec("BEGIN IMMEDIATE");
  try {
    const result = work();
    database.exec("COMMIT");
    return result;
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}
