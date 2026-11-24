import { randomUUID } from "node:crypto";
import { cleanPermissions, type Permission } from "@/domain/permissions";
import { execute, queryAll, queryOne, transaction } from "../db/client";
import { changePool, seatsInUse } from "./organizations";
import { emailTaken, hashToken, insertUser, newToken, normalizeEmail, type User } from "./users";

/**
 * Davetler (e-posta yetkilendirme) ve parola sıfırlama bağlantıları.
 *
 * Yetkili kişi bir e-postayı kuruma yetkilendirir; tek kullanımlık bağlantıyı
 * açan kişi parolasını kendisi belirler. Böylece parolayı hesabın sahibinden
 * başka kimse bilmez. Veritabanında bağlantı anahtarının yalnızca özeti durur.
 * Davetle verilen kredi, davet anında kurum havuzundan ayrılır; iptal edilirse
 * havuza döner.
 */

export const INVITE_TTL_MS = 7 * 86_400_000;
export const RESET_TTL_MS = 86_400_000;

export interface Invitation {
  id: string;
  orgId: string;
  email: string;
  name: string;
  role: "admin" | "analyst";
  credits: number;
  permissions: Permission[];
  invitedBy: string;
  createdAt: number;
  expiresAt: number;
}

interface InvitationRow {
  id: string;
  org_id: string;
  email: string;
  name: string;
  role: "admin" | "analyst";
  credits: number;
  permissions: string;
  invited_by: string;
  created_at: number;
  expires_at: number;
}

const COLUMNS = "id, org_id, email, name, role, credits, permissions, invited_by, created_at, expires_at";
const OPEN = "accepted_at IS NULL AND revoked_at IS NULL";

function parsePermissions(text: string): Permission[] {
  try {
    const parsed: unknown = JSON.parse(text);
    return Array.isArray(parsed) ? cleanPermissions(parsed) : [];
  } catch {
    return [];
  }
}

function toInvitation(row: InvitationRow): Invitation {
  return {
    id: row.id,
    orgId: row.org_id,
    email: row.email,
    name: row.name,
    role: row.role,
    credits: row.credits,
    permissions: row.role === "admin" ? parsePermissions(row.permissions) : [],
    invitedBy: row.invited_by,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
  };
}

export interface InvitationInput {
  orgId: string;
  email: string;
  name: string;
  role: "admin" | "analyst";
  credits: number;
  permissions: readonly Permission[];
  invitedBy: string;
}

export type InvitationResult =
  | { ok: true; invitation: Invitation; token: string }
  /** exists: e-posta kayıtlı · pending: bekleyen davet var · seats: koltuk dolu · pool: havuz yetmiyor */
  | { ok: false; reason: "exists" | "pending" | "seats" | "pool" };

export async function createInvitation(input: InvitationInput, now: number): Promise<InvitationResult> {
  const email = normalizeEmail(input.email);
  const credits = Math.max(0, Math.trunc(input.credits));
  const permissions = input.role === "admin" ? cleanPermissions(input.permissions) : [];
  return await transaction(async (): Promise<InvitationResult> => {
      if (await emailTaken(email)) return { ok: false, reason: "exists" };
      if (await queryOne(`SELECT 1 FROM invitations WHERE email = ? AND ${OPEN} AND expires_at > ?`, [email, now])) return { ok: false, reason: "pending" };
      const limit = (await queryOne<{ seat_limit: number | null }>("SELECT seat_limit FROM organizations WHERE id = ?", [input.orgId]))?.seat_limit ?? null;
      if (limit !== null && await seatsInUse(input.orgId, now) >= limit) return { ok: false, reason: "seats" };
      if (credits > 0 && !await changePool(input.orgId, -credits, "davet için ayrıldı", input.invitedBy, null, now)) return { ok: false, reason: "pool" };

      const token = newToken();
      const invitation: Invitation = {
        id: randomUUID(),
        orgId: input.orgId,
        email,
        name: input.name.trim(),
        role: input.role,
        credits,
        permissions,
        invitedBy: input.invitedBy,
        createdAt: now,
        expiresAt: now + INVITE_TTL_MS,
      };
      await execute(
              "INSERT INTO invitations (id, token_hash, org_id, email, name, role, credits, permissions, invited_by, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
              [invitation.id, hashToken(token), invitation.orgId, email, invitation.name, invitation.role, credits, JSON.stringify(permissions), invitation.invitedBy, now, invitation.expiresAt],
            );
      return { ok: true, invitation, token };
    });
}

export async function getInvitation(id: string): Promise<Invitation | null> {
  const row = await queryOne<InvitationRow>(`SELECT ${COLUMNS} FROM invitations WHERE id = ? AND ${OPEN}`, [id]);
  return row ? toInvitation(row) : null;
}

/** Bağlantıdaki anahtarla geçerli (kabul edilmemiş, iptal edilmemiş, süresi dolmamış) davet. */
export async function getInvitationByToken(token: string, now: number): Promise<Invitation | null> {
  const row = await queryOne<InvitationRow>(`SELECT ${COLUMNS} FROM invitations WHERE token_hash = ? AND ${OPEN} AND expires_at > ?`, [hashToken(token), now]);
  return row ? toInvitation(row) : null;
}

/** Kurumun sonuçlanmamış davetleri; süresi dolanlar da listelenir ki iptal edilip kredisi geri alınabilsin. */
export async function listOpenInvitations(orgId: string): Promise<Invitation[]> {
  return (await queryAll<InvitationRow>(`SELECT ${COLUMNS} FROM invitations WHERE org_id = ? AND ${OPEN} ORDER BY created_at DESC`, [orgId])).map(toInvitation);
}

/** Daveti iptal eder ve ayrılan krediyi havuza geri koyar. */
export async function revokeInvitation(id: string, actor: string, now: number): Promise<boolean> {
  return await transaction(async () => {
      const row = await queryOne<{ org_id: string; credits: number }>(`SELECT org_id, credits FROM invitations WHERE id = ? AND ${OPEN}`, [id]);
      if (!row) return false;
      await execute("UPDATE invitations SET revoked_at = ? WHERE id = ?", [now, id]);
      if (row.credits > 0) await changePool(row.org_id, row.credits, "davet iptali", actor, null, now);
      return true;
    });
}

/** Daveti kabul eder: hesabı açar, yetkileri ve ayrılan krediyi tanımlar. Davet geçersizse null. */
export async function acceptInvitation(token: string, passwordHash: string, now: number): Promise<User | null> {
  return await transaction(async () => {
      const invitation = await getInvitationByToken(token, now);
      if (!invitation || await emailTaken(invitation.email)) return null;
      await execute("UPDATE invitations SET accepted_at = ? WHERE id = ?", [now, invitation.id]);
      return insertUser(
        {
          email: invitation.email,
          name: invitation.name,
          role: invitation.role,
          orgId: invitation.orgId,
          passwordHash,
          credits: invitation.credits,
          permissions: invitation.permissions,
          grantedBy: invitation.invitedBy,
        },
        now,
      );
    });
}

/* ── Parola sıfırlama ─────────────────────────────────────────────────── */

/** Kullanıcı için tek kullanımlık sıfırlama anahtarı üretir; önceki kullanılmamış anahtarlar geçersiz olur. */
export async function createPasswordReset(userId: string, createdBy: string, now: number): Promise<string> {
  const token = newToken();
  await transaction(async () => {
        await execute("DELETE FROM password_resets WHERE user_id = ? AND used_at IS NULL", [userId]);
        await execute("INSERT INTO password_resets (token_hash, user_id, created_by, created_at, expires_at) VALUES (?, ?, ?, ?, ?)", [hashToken(token), userId, createdBy, now, now + RESET_TTL_MS]);
      });
  return token;
}

/** Geçerli sıfırlama anahtarının kullanıcısı (kimlik ve e-posta); yoksa null. */
export async function getResetTarget(token: string, now: number): Promise<{ userId: string; email: string } | null> {
  const row = await queryOne<{ user_id: string; email: string }>(
      `SELECT r.user_id, u.email FROM password_resets r JOIN users u ON u.id = r.user_id
     WHERE r.token_hash = ? AND r.used_at IS NULL AND r.expires_at > ? AND u.disabled_at IS NULL`,
      [hashToken(token), now],
    );
  return row ? { userId: row.user_id, email: row.email } : null;
}

export async function markResetUsed(token: string, now: number): Promise<void> {
  await execute("UPDATE password_resets SET used_at = ? WHERE token_hash = ?", [now, hashToken(token)]);
}
