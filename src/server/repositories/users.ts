import { createHash, randomBytes, randomUUID } from "node:crypto";
import { cleanPermissions, type Permission, type UserRole } from "@/domain/permissions";
import { execute, queryAll, queryOne, transaction } from "../db/client";

/**
 * Kullanıcılar, yetkiler, oturumlar, kullanıcı kredileri ve konu sahipliği.
 *
 * Hiç kullanıcı yokken giriş zorunlu değildir (tek kullanıcılı yerel kurulum).
 * İlk sistem yöneticisi oluşturulduğu andan itibaren panel oturum ister.
 */

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  /** Bağlı olduğu kurum; sistem yöneticisinde null. */
  orgId: string | null;
  /** Kurum yöneticisine verilen yetkiler; diğer rollerde boştur. */
  permissions: Permission[];
  /** Kalan kredi. Sistem yöneticisinden kredi düşülmez. */
  credits: number;
  createdAt: number;
  disabledAt: number | null;
  lastLoginAt: number | null;
}

interface UserRow {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  org_id: string | null;
  credits: number;
  created_at: number;
  disabled_at: number | null;
  last_login_at: number | null;
}

const USER_COLUMNS = "u.id, u.email, u.name, u.role, u.org_id, u.credits, u.created_at, u.disabled_at, u.last_login_at";

function loadPermissions(userId: string): Permission[] {
  return cleanPermissions(queryAll<{ permission: string }>("SELECT permission FROM user_permissions WHERE user_id = ?", [userId]).map((row) => row.permission));
}

function toUser(row: UserRow): User {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    orgId: row.org_id,
    permissions: row.role === "admin" ? loadPermissions(row.id) : [],
    credits: row.credits,
    createdAt: row.created_at,
    disabledAt: row.disabled_at,
    lastLoginAt: row.last_login_at,
  };
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function countUsers(): number {
  return queryOne<{ count: number }>("SELECT COUNT(*) AS count FROM users")?.count ?? 0;
}

export function listUsers(): User[] {
  return queryAll<UserRow>(`SELECT ${USER_COLUMNS} FROM users u ORDER BY u.created_at`).map(toUser);
}

/** Kurumun üyeleri: önce yöneticiler, sonra eklenme sırasıyla kullanıcılar. */
export function listOrgUsers(orgId: string): User[] {
  return queryAll<UserRow>(`SELECT ${USER_COLUMNS} FROM users u WHERE u.org_id = ? ORDER BY (u.role = 'admin') DESC, u.created_at`, [orgId]).map(toUser);
}

export function getUser(id: string): User | null {
  const row = queryOne<UserRow>(`SELECT ${USER_COLUMNS} FROM users u WHERE u.id = ?`, [id]);
  return row ? toUser(row) : null;
}

export function emailTaken(email: string): boolean {
  return queryOne("SELECT 1 FROM users WHERE email = ?", [normalizeEmail(email)]) !== undefined;
}

/** Giriş için: kullanıcı ve saklanan parola özeti. */
export function getCredentials(email: string): { user: User; passwordHash: string } | null {
  const row = queryOne<UserRow & { password_hash: string }>(`SELECT ${USER_COLUMNS}, u.password_hash FROM users u WHERE u.email = ?`, [normalizeEmail(email)]);
  return row ? { user: toUser(row), passwordHash: row.password_hash } : null;
}

export function getPasswordHash(userId: string): string | null {
  return queryOne<{ password_hash: string }>("SELECT password_hash FROM users WHERE id = ?", [userId])?.password_hash ?? null;
}

export interface NewUser {
  email: string;
  name: string;
  role: UserRole;
  /** Sistem yöneticisi için null; diğer roller için zorunlu. */
  orgId: string | null;
  passwordHash: string;
  credits: number;
  permissions?: readonly Permission[];
  /** Yetkileri veren kişi (denetim için). */
  grantedBy?: string;
}

/** Kullanıcıyı ekler. Çağıran, açık bir veritabanı işlemi içinde olmalıdır. */
export function insertUser(input: NewUser, now: number): User {
  const permissions = input.role === "admin" ? cleanPermissions(input.permissions ?? []) : [];
  const user: User = {
    id: randomUUID(),
    email: normalizeEmail(input.email),
    name: input.name.trim(),
    role: input.role,
    orgId: input.role === "sysadmin" ? null : input.orgId,
    permissions,
    credits: Math.max(0, Math.trunc(input.credits)),
    createdAt: now,
    disabledAt: null,
    lastLoginAt: null,
  };
  execute("INSERT INTO users (id, email, name, role, org_id, password_hash, credits, created_at, password_changed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", [
    user.id,
    user.email,
    user.name,
    user.role,
    user.orgId,
    input.passwordHash,
    user.credits,
    now,
    now,
  ]);
  for (const permission of permissions) {
    execute("INSERT INTO user_permissions (user_id, permission, granted_by, granted_at) VALUES (?, ?, ?, ?)", [user.id, permission, input.grantedBy ?? "sistem", now]);
  }
  if (user.credits > 0) recordUserLedger(user.id, user.credits, "başlangıç kredisi", null, now);
  return user;
}

/** E-posta zaten kayıtlıysa null döner. */
export function createUser(input: NewUser, now: number): User | null {
  if (emailTaken(input.email)) return null;
  return transaction(() => insertUser(input, now));
}

export function setUserDisabled(id: string, disabled: boolean, now: number): void {
  transaction(() => {
    execute("UPDATE users SET disabled_at = ? WHERE id = ?", [disabled ? now : null, id]);
    if (disabled) execute("DELETE FROM sessions WHERE user_id = ?", [id]);
  });
}

/** Kurum içi rol değişikliği. Yöneticilikten alınan kişinin yetkileri de silinir. */
export function setUserRole(id: string, role: Exclude<UserRole, "sysadmin">): boolean {
  return transaction(() => {
    const changed = execute("UPDATE users SET role = ? WHERE id = ? AND role <> 'sysadmin' AND role <> ?", [role, id, role]);
    if (changed === 0) return false;
    if (role === "analyst") execute("DELETE FROM user_permissions WHERE user_id = ?", [id]);
    return true;
  });
}

/** Kurum yöneticisinin yetkilerini verilen listeyle değiştirir. */
export function setPermissions(userId: string, permissions: readonly Permission[], grantedBy: string, now: number): void {
  const wanted = cleanPermissions(permissions);
  transaction(() => {
    const current = new Set(loadPermissions(userId));
    for (const permission of current) {
      if (!wanted.includes(permission)) execute("DELETE FROM user_permissions WHERE user_id = ? AND permission = ?", [userId, permission]);
    }
    for (const permission of wanted) {
      if (!current.has(permission)) execute("INSERT INTO user_permissions (user_id, permission, granted_by, granted_at) VALUES (?, ?, ?, ?)", [userId, permission, grantedBy, now]);
    }
  });
}

/** Parolayı değiştirir ve (varsa korunacak olan dışında) tüm oturumları kapatır. */
export function setPassword(userId: string, passwordHash: string, now: number, keepToken: string | null = null): void {
  transaction(() => {
    execute("UPDATE users SET password_hash = ?, password_changed_at = ? WHERE id = ?", [passwordHash, now, userId]);
    execute("DELETE FROM sessions WHERE user_id = ? AND token_hash <> ?", [userId, keepToken ? hashToken(keepToken) : ""]);
  });
}

export function touchLogin(userId: string, now: number): void {
  execute("UPDATE users SET last_login_at = ? WHERE id = ?", [now, userId]);
}

/* ── Kullanıcı kredileri ──────────────────────────────────────────────── */

export function recordUserLedger(userId: string, delta: number, reason: string, objectId: string | null, now: number): void {
  execute("INSERT INTO credit_ledger (id, user_id, delta, reason, object_id, created_at) VALUES (?, ?, ?, ?, ?, ?)", [randomUUID(), userId, delta, reason, objectId, now]);
}

/**
 * Krediyi değiştirir ve deftere yazar. Bakiye eksiye düşecekse hiçbir şey
 * yapmaz ve false döner (denetim ve düşüm tek ifadede; yarış durumu olmaz).
 */
export function adjustCredits(userId: string, delta: number, reason: string, objectId: string | null, now: number): boolean {
  if (!Number.isInteger(delta) || delta === 0) return false;
  return transaction(() => {
    const changed = execute("UPDATE users SET credits = credits + ? WHERE id = ? AND credits + ? >= 0", [delta, userId, delta]);
    if (changed === 0) return false;
    recordUserLedger(userId, delta, reason, objectId, now);
    return true;
  });
}

export interface LedgerEntry {
  delta: number;
  reason: string;
  createdAt: number;
}

export function listLedger(userId: string, limit: number): LedgerEntry[] {
  return queryAll<{ delta: number; reason: string; created_at: number }>(
    "SELECT delta, reason, created_at FROM credit_ledger WHERE user_id = ? ORDER BY created_at DESC, rowid DESC LIMIT ?",
    [userId, limit],
  ).map((row) => ({ delta: row.delta, reason: row.reason, createdAt: row.created_at }));
}

/* ── Oturumlar ────────────────────────────────────────────────────────── */

export const SESSION_TTL_MS = 7 * 86_400_000;

/** Çerezde ve bağlantılarda taşınan anahtarların veritabanında saklanan özeti. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function newToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Yeni oturum açar ve çerezde tutulacak anahtarı döndürür; veritabanında yalnızca özeti saklanır. */
export function createSession(userId: string, now: number): string {
  const token = newToken();
  execute("DELETE FROM sessions WHERE expires_at <= ?", [now]);
  execute("INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)", [hashToken(token), userId, now, now + SESSION_TTL_MS]);
  return token;
}

/** Geçerli oturumun kullanıcısı; oturum yoksa, süresi dolduysa, kullanıcı kapatıldıysa ya da kurumu askıdaysa null. */
export function getSessionUser(token: string, now: number): User | null {
  const row = queryOne<UserRow>(
    `SELECT ${USER_COLUMNS}
     FROM sessions s JOIN users u ON u.id = s.user_id LEFT JOIN organizations o ON o.id = u.org_id
     WHERE s.token_hash = ? AND s.expires_at > ? AND u.disabled_at IS NULL AND o.suspended_at IS NULL`,
    [hashToken(token), now],
  );
  return row ? toUser(row) : null;
}

export function deleteSession(token: string): void {
  execute("DELETE FROM sessions WHERE token_hash = ?", [hashToken(token)]);
}

/* ── Konu sahipliği ───────────────────────────────────────────────────── */

export interface ProjectOwner {
  userId: string;
  orgId: string | null;
}

export function setProjectOwner(projectId: string, userId: string): void {
  execute("INSERT INTO project_owners (project_id, user_id) VALUES (?, ?) ON CONFLICT (project_id) DO UPDATE SET user_id = excluded.user_id", [projectId, userId]);
}

/** Proje kimliği → sahibi ve sahibinin kurumu. Kayıt yoksa proje ortaktır. */
export function listProjectOwners(): Map<string, ProjectOwner> {
  return new Map(
    queryAll<{ project_id: string; user_id: string; org_id: string | null }>(
      "SELECT p.project_id, p.user_id, u.org_id FROM project_owners p JOIN users u ON u.id = p.user_id",
    ).map((row) => [row.project_id, { userId: row.user_id, orgId: row.org_id }]),
  );
}
