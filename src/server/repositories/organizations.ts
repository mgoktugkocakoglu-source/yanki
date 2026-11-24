import { randomUUID } from "node:crypto";
import { execute, queryAll, queryOne, transaction } from "../db/client";
import { recordUserLedger } from "./users";

/**
 * Kurumlar ve kurum kredi havuzu.
 *
 * Kredi iki aşamada akar: sistem yöneticisi kurumun havuzunu doldurur, kurum
 * içinde yetkili kişi havuzdan kullanıcılara dağıtır. Havuz ve kullanıcı
 * bakiyesi aynı veritabanı işleminde değişir; kredi yoktan var olmaz.
 */

export interface Organization {
  id: string;
  name: string;
  creditPool: number;
  /** En çok kaç etkin hesap (bekleyen davetler dahil); null ise sınırsız. */
  seatLimit: number | null;
  /** İzin verilen e-posta alan adları; boşsa her alan adı kabul edilir. */
  domains: string[];
  createdAt: number;
  suspendedAt: number | null;
}

interface OrganizationRow {
  id: string;
  name: string;
  credit_pool: number;
  seat_limit: number | null;
  created_at: number;
  suspended_at: number | null;
}

const COLUMNS = "o.id, o.name, o.credit_pool, o.seat_limit, o.created_at, o.suspended_at";

async function listDomains(orgId: string): Promise<string[]> {
  return (await queryAll<{ domain: string }>("SELECT domain FROM organization_domains WHERE org_id = ? ORDER BY domain", [orgId])).map((row) => row.domain);
}

async function toOrganization(row: OrganizationRow): Promise<Organization> {
  return {
    id: row.id,
    name: row.name,
    creditPool: row.credit_pool,
    seatLimit: row.seat_limit,
    domains: await listDomains(row.id),
    createdAt: row.created_at,
    suspendedAt: row.suspended_at,
  };
}

export async function getOrganization(id: string): Promise<Organization | null> {
  const row = await queryOne<OrganizationRow>(`SELECT ${COLUMNS} FROM organizations o WHERE o.id = ?`, [id]);
  return row ? await toOrganization(row) : null;
}

export interface OrganizationSummary extends Organization {
  adminCount: number;
  userCount: number;
  /** Kullanıcıların elindeki toplam kredi. */
  userCredits: number;
}

export async function listOrganizations(): Promise<OrganizationSummary[]> {
  return await Promise.all(
    (
      await queryAll<OrganizationRow & { admin_count: number; user_count: number; user_credits: number }>(
        `SELECT ${COLUMNS},
            (SELECT COUNT(*) FROM users u WHERE u.org_id = o.id AND u.role = 'admin') AS admin_count,
            (SELECT COUNT(*) FROM users u WHERE u.org_id = o.id) AS user_count,
            (SELECT COALESCE(SUM(u.credits), 0) FROM users u WHERE u.org_id = o.id) AS user_credits
     FROM organizations o ORDER BY lower(o.name)`,
      )
    ).map(async (row) => ({ ...(await toOrganization(row)), adminCount: row.admin_count, userCount: row.user_count, userCredits: row.user_credits })),
  );
}

/** Dolu koltuk: etkin hesaplar ve süresi dolmamış bekleyen davetler. */
export async function seatsInUse(orgId: string, now: number): Promise<number> {
  const users = (await queryOne<{ count: number }>("SELECT COUNT(*) AS count FROM users WHERE org_id = ? AND disabled_at IS NULL", [orgId]))?.count ?? 0;
  const invites =
    (
      await queryOne<{ count: number }>("SELECT COUNT(*) AS count FROM invitations WHERE org_id = ? AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > ?", [
        orgId,
        now,
      ])
    )?.count ?? 0;
  return users + invites;
}

export interface OrganizationInput {
  name: string;
  seatLimit: number | null;
  domains: readonly string[];
}

async function replaceDomains(orgId: string, domains: readonly string[]): Promise<void> {
  await execute("DELETE FROM organization_domains WHERE org_id = ?", [orgId]);
  for (const domain of new Set(domains)) await execute("INSERT INTO organization_domains (org_id, domain) VALUES (?, ?)", [orgId, domain]);
}

async function nameTaken(name: string, exceptId: string | null): Promise<boolean> {
  return (await queryOne("SELECT 1 FROM organizations WHERE lower(name) = lower(?) AND id <> ?", [name, exceptId ?? ""])) !== undefined;
}

/** Aynı adda kurum varsa null döner. */
export async function createOrganization(input: OrganizationInput, initialPool: number, actor: string, now: number): Promise<Organization | null> {
  const name = input.name.trim();
  if (await nameTaken(name, null)) return null;
  const id = randomUUID();
  await transaction(async () => {
    await execute("INSERT INTO organizations (id, name, credit_pool, seat_limit, created_at) VALUES (?, ?, 0, ?, ?)", [id, name, input.seatLimit, now]);
    await replaceDomains(id, input.domains);
    if (initialPool > 0) await changePool(id, initialPool, "ilk yükleme", actor, null, now);
  });
  return getOrganization(id);
}

export async function updateOrganization(id: string, input: OrganizationInput): Promise<boolean> {
  const name = input.name.trim();
  if (await nameTaken(name, id)) return false;
  await transaction(async () => {
    await execute("UPDATE organizations SET name = ?, seat_limit = ? WHERE id = ?", [name, input.seatLimit, id]);
    await replaceDomains(id, input.domains);
  });
  return true;
}

/** Askıya alınan kurumun kullanıcıları giremez; açık oturumları da kapanır. */
export async function setOrganizationSuspended(id: string, suspended: boolean, now: number): Promise<void> {
  await transaction(async () => {
    await execute("UPDATE organizations SET suspended_at = ? WHERE id = ?", [suspended ? now : null, id]);
    if (suspended) await execute("DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE org_id = ?)", [id]);
  });
}

/* ── Kredi havuzu ─────────────────────────────────────────────────────── */

/** Havuzu değiştirir ve kurum defterine yazar. Açık bir işlem içinde çağrılır; havuz eksiye düşecekse false döner. */
export async function changePool(orgId: string, delta: number, reason: string, actor: string, userId: string | null, now: number): Promise<boolean> {
  const changed = await execute("UPDATE organizations SET credit_pool = credit_pool + ? WHERE id = ? AND credit_pool + ? >= 0", [delta, orgId, delta]);
  if (changed === 0) return false;
  await execute("INSERT INTO organization_ledger (id, org_id, delta, reason, actor, user_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)", [
    randomUUID(),
    orgId,
    delta,
    reason,
    actor,
    userId,
    now,
  ]);
  return true;
}

/** Sistem yöneticisinin havuza yüklemesi ya da düzeltmesi. */
export async function adjustPool(orgId: string, delta: number, reason: string, actor: string, now: number): Promise<boolean> {
  if (!Number.isInteger(delta) || delta === 0) return false;
  return await transaction(async () => changePool(orgId, delta, reason, actor, null, now));
}

export type TransferResult = "ok" | "pool" | "balance" | "invalid";

/**
 * Havuz ile kullanıcı arasında kredi aktarır: artı tutar havuzdan kullanıcıya,
 * eksi tutar kullanıcıdan havuza. İki bakiye birlikte değişir ya da hiç değişmez.
 */
export async function transferCredits(orgId: string, userId: string, amount: number, actor: string, now: number): Promise<TransferResult> {
  if (!Number.isInteger(amount) || amount === 0) return "invalid";
  return await transaction(async () => {
    const pool = (await queryOne<{ credit_pool: number }>("SELECT credit_pool FROM organizations WHERE id = ?", [orgId]))?.credit_pool;
    const balance = (await queryOne<{ credits: number }>("SELECT credits FROM users WHERE id = ? AND org_id = ?", [userId, orgId]))?.credits;
    if (pool === undefined || balance === undefined) return "invalid";
    if (pool - amount < 0) return "pool";
    if (balance + amount < 0) return "balance";
    await execute("UPDATE users SET credits = credits + ? WHERE id = ?", [amount, userId]);
    await recordUserLedger(userId, amount, amount > 0 ? "kurum havuzundan" : "kurum havuzuna iade", null, now);
    await changePool(orgId, -amount, amount > 0 ? "kullanıcıya dağıtım" : "kullanıcıdan iade", actor, userId, now);
    return "ok";
  });
}

export interface PoolEntry {
  delta: number;
  reason: string;
  actor: string;
  /** İlgili kullanıcının e-postası; havuz yüklemelerinde null. */
  userEmail: string | null;
  createdAt: number;
}

export async function listPoolLedger(orgId: string, limit: number): Promise<PoolEntry[]> {
  return (
    await queryAll<{ delta: number; reason: string; actor: string; user_email: string | null; created_at: number }>(
      `SELECT l.delta, l.reason, l.actor, u.email AS user_email, l.created_at
     FROM organization_ledger l LEFT JOIN users u ON u.id = l.user_id
     WHERE l.org_id = ? ORDER BY l.created_at DESC, l.seq DESC LIMIT ?`,
      [orgId, limit],
    )
  ).map((row) => ({ delta: row.delta, reason: row.reason, actor: row.actor, userEmail: row.user_email, createdAt: row.created_at }));
}

/** Kurum kullanıcılarının belirtilen andan beri harcadığı kredi (artı sayı). */
export async function creditsSpentSince(orgId: string | null, since: number): Promise<number> {
  const scope = orgId === null ? "" : "AND u.org_id = ?";
  const row = await queryOne<{ spent: number }>(
    `SELECT COALESCE(-SUM(l.delta), 0) AS spent
     FROM credit_ledger l JOIN users u ON u.id = l.user_id
     WHERE l.delta < 0 AND l.reason NOT LIKE 'kurum havuzu%' AND l.created_at >= ? ${scope}`,
    orgId === null ? [since] : [since, orgId],
  );
  return row?.spent ?? 0;
}
