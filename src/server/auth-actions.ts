"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { cleanPermissions, PERMISSION_INFO, ROLE_LABELS } from "@/domain/permissions";
import { can, canAssignCredits, canInvite, canManageAccount, emailAllowed, isSysadmin, parseDomains } from "./auth/access";
import { hashPassword, PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, verifyPassword } from "./auth/passwords";
import { currentToken, endSession, homePath, LOGIN_PATH, requireUser, startSession } from "./auth/session";
import { ensureSeeded } from "./demo/seed";
import { acceptInvitation, createInvitation, createPasswordReset, getInvitation, getInvitationByToken, getResetTarget, markResetUsed, revokeInvitation } from "./repositories/invitations";
import { adjustPool, createOrganization, getOrganization, seatsInUse, setOrganizationSuspended, transferCredits, updateOrganization } from "./repositories/organizations";
import { recordAudit } from "./repositories/runs";
import { countUsers, createUser, getCredentials, getPasswordHash, getUser, normalizeEmail, setPassword, setPermissions, setUserDisabled, setUserRole, touchLogin, type User } from "./repositories/users";

/**
 * Giriş, kurulum, kurum yönetimi, yetki atama, davet ve parola işlevleri.
 *
 * Her işlev önce oturumu doğrular, sonra `auth/access.ts` içindeki kurala
 * sorar. Arayüzde bir düğmenin gizlenmiş olması yetki denetimi değildir;
 * denetim her zaman burada yapılır. Yetkisiz istek, nesne yokmuş gibi yanıtlanır.
 */

export interface AuthState {
  ok: boolean;
  message: string;
  /** Üretilen tek kullanımlık bağlantının yolu (davet ya da parola sıfırlama). Yalnızca bir kez gösterilir. */
  link?: string;
}

const fail = (message: string): AuthState => ({ ok: false, message });
const done = (message: string, link?: string): AuthState => ({ ok: true, message, link });
const DENIED = "Bu işlem için yetkiniz yok.";

const emailSchema = z.string().trim().toLowerCase().email("Geçerli bir e-posta adresi yazın.").max(200);
const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Parola en az ${PASSWORD_MIN_LENGTH} karakter olmalı.`)
  .max(PASSWORD_MAX_LENGTH, "Parola çok uzun.");
const nameSchema = z.string().trim().min(2, "Ad en az 2 karakter olmalı.").max(80, "Ad en çok 80 karakter olabilir.");
const creditSchema = z.coerce.number().int("Kredi tam sayı olmalı.").min(0, "Kredi eksi olamaz.").max(1_000_000, "Kredi çok büyük.");
const amountSchema = z.coerce
  .number()
  .int("Tutar tam sayı olmalı.")
  .min(-1_000_000)
  .max(1_000_000)
  .refine((value) => value !== 0, "Tutar sıfır olamaz.");

const text = (formData: FormData, key: string): string => String(formData.get(key) ?? "");

/** Oturumdaki kişi; giriş zorunlu değilse (hiç kullanıcı yok) null. */
async function signedIn(): Promise<User | null> {
  return requireUser();
}

/* ── Deneme sınırı ────────────────────────────────────────────────────── */

const MAX_FAILURES = 5;
const LOCK_MS = 15 * 60_000;
const failures = new Map<string, { count: number; lockedUntil: number }>();

function isLocked(email: string, now: number): boolean {
  const entry = failures.get(email);
  if (entry && entry.lockedUntil !== 0 && entry.lockedUntil <= now) failures.delete(email);
  return (failures.get(email)?.lockedUntil ?? 0) > now;
}

function recordFailure(email: string, now: number): void {
  const count = (failures.get(email)?.count ?? 0) + 1;
  failures.set(email, { count, lockedUntil: count >= MAX_FAILURES ? now + LOCK_MS : 0 });
}

/* ── Giriş, çıkış, ilk kurulum ────────────────────────────────────────── */

export async function loginAction(_previous: AuthState, formData: FormData): Promise<AuthState> {
  ensureSeeded();
  const email = normalizeEmail(text(formData, "email"));
  const password = text(formData, "password");
  const now = Date.now();
  if (!email || !password) return fail("E-posta ve parolanızı yazın.");
  if (isLocked(email, now)) return fail("Çok fazla hatalı deneme yapıldı. 15 dakika sonra yeniden deneyin.");

  const credentials = getCredentials(email);
  // Kullanıcı yoksa da aynı süre harcansın ve aynı ileti dönsün: hangi e-postanın kayıtlı olduğu sızmaz.
  const valid = credentials ? verifyPassword(password, credentials.passwordHash) : (verifyPassword(password, hashPassword("yer-tutucu-parola")), false);
  if (!credentials || !valid || credentials.user.disabledAt !== null) {
    recordFailure(email, now);
    return fail("E-posta ya da parola hatalı.");
  }
  const { user } = credentials;
  if (user.orgId !== null && getOrganization(user.orgId)?.suspendedAt !== null) {
    return fail("Kurumunuzun erişimi askıya alınmış. Kurum yöneticinize başvurun.");
  }

  failures.delete(email);
  touchLogin(user.id, now);
  await startSession(user.id);
  recordAudit({ workspaceId: null, action: "oturum.açıldı", objectType: "kullanıcı", objectId: user.id, actor: user.email });
  redirect(homePath(user));
}

export async function logoutAction(): Promise<void> {
  await endSession();
  redirect(LOGIN_PATH);
}

/** İlk sistem yöneticisi: yalnızca hiç kullanıcı yokken çalışır. */
export async function setupSysadminAction(_previous: AuthState, formData: FormData): Promise<AuthState> {
  ensureSeeded();
  if (countUsers() > 0) return fail("Kurulum zaten yapılmış. Giriş yapın.");

  const parsed = z.object({ name: nameSchema, email: emailSchema, password: passwordSchema }).safeParse({
    name: text(formData, "name"),
    email: text(formData, "email"),
    password: text(formData, "password"),
  });
  if (!parsed.success) return fail(parsed.error.issues[0].message);

  const now = Date.now();
  const user = createUser({ ...parsed.data, role: "sysadmin", orgId: null, passwordHash: hashPassword(parsed.data.password), credits: 0 }, now);
  if (!user) return fail("Bu e-posta zaten kayıtlı.");
  touchLogin(user.id, now);
  await startSession(user.id);
  recordAudit({ workspaceId: null, action: "kullanıcı.oluşturuldu", objectType: "kullanıcı", objectId: user.id, detail: "ilk sistem yöneticisi", actor: user.email });
  redirect("/sistem");
}

/* ── Kurumlar (sistem yöneticisi) ─────────────────────────────────────── */

const organizationSchema = z.object({
  name: z.string().trim().min(2, "Kurum adı en az 2 karakter olmalı.").max(120, "Kurum adı en çok 120 karakter olabilir."),
  seatLimit: z
    .string()
    .trim()
    .transform((value) => (value === "" ? null : Number(value)))
    .refine((value) => value === null || (Number.isInteger(value) && value > 0 && value <= 100_000), "Koltuk sayısı artı bir tam sayı olmalı ya da boş bırakılmalı."),
  domains: z.string().max(2000),
});

function readOrganization(formData: FormData): { ok: true; name: string; seatLimit: number | null; domains: string[] } | { ok: false; message: string } {
  const parsed = organizationSchema.safeParse({ name: text(formData, "name"), seatLimit: text(formData, "seatLimit"), domains: text(formData, "domains") });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const { domains, invalid } = parseDomains(parsed.data.domains);
  if (invalid.length > 0) return { ok: false, message: `Alan adı geçersiz: ${invalid.slice(0, 3).join(", ")}. Örnek: kurum.gov.tr` };
  return { ok: true, name: parsed.data.name, seatLimit: parsed.data.seatLimit, domains };
}

export async function createOrganizationAction(_previous: AuthState, formData: FormData): Promise<AuthState> {
  const viewer = await signedIn();
  if (!isSysadmin(viewer)) return fail(DENIED);
  const input = readOrganization(formData);
  if (!input.ok) return fail(input.message);
  const pool = creditSchema.safeParse(text(formData, "pool") || "0");
  if (!pool.success) return fail(pool.error.issues[0].message);

  const organization = createOrganization(input, pool.data, viewer.email, Date.now());
  if (!organization) return fail("Bu adda bir kurum zaten var.");
  recordAudit({ workspaceId: null, action: "kurum.oluşturuldu", objectType: "kurum", objectId: organization.id, detail: `${organization.name}; havuz ${pool.data}`, actor: viewer.email, orgId: organization.id });
  redirect(`/sistem/kurum/${organization.id}`);
}

export async function updateOrganizationAction(_previous: AuthState, formData: FormData): Promise<AuthState> {
  const viewer = await signedIn();
  if (!isSysadmin(viewer)) return fail(DENIED);
  const organization = getOrganization(text(formData, "orgId"));
  if (!organization) return fail("Kurum bulunamadı.");
  const input = readOrganization(formData);
  if (!input.ok) return fail(input.message);
  if (input.seatLimit !== null && input.seatLimit < seatsInUse(organization.id, Date.now())) {
    return fail("Koltuk sayısı, şu an dolu olan koltuklardan az olamaz. Önce hesap kapatın ya da davet iptal edin.");
  }

  if (!updateOrganization(organization.id, input)) return fail("Bu adda başka bir kurum var.");
  recordAudit({
    workspaceId: null,
    action: "kurum.güncellendi",
    objectType: "kurum",
    objectId: organization.id,
    detail: `koltuk ${input.seatLimit ?? "sınırsız"}; alan adları ${input.domains.join(", ") || "serbest"}`,
    actor: viewer.email,
    orgId: organization.id,
  });
  refresh();
  return done("Kurum bilgileri kaydedildi.");
}

export async function setOrganizationSuspendedAction(formData: FormData): Promise<void> {
  const viewer = await signedIn();
  const organization = getOrganization(text(formData, "orgId"));
  if (!isSysadmin(viewer) || !organization) return;
  const suspended = formData.get("suspended") === "1";
  setOrganizationSuspended(organization.id, suspended, Date.now());
  recordAudit({ workspaceId: null, action: suspended ? "kurum.askıya-alındı" : "kurum.açıldı", objectType: "kurum", objectId: organization.id, actor: viewer.email, orgId: organization.id });
  refresh();
}

/** Kurum havuzuna kredi yükler; eksi tutar düzeltmedir. */
export async function addPoolCreditsAction(_previous: AuthState, formData: FormData): Promise<AuthState> {
  const viewer = await signedIn();
  if (!isSysadmin(viewer)) return fail(DENIED);
  const organization = getOrganization(text(formData, "orgId"));
  if (!organization) return fail("Kurum bulunamadı.");
  const amount = amountSchema.safeParse(text(formData, "amount"));
  if (!amount.success) return fail(amount.error.issues[0].message);

  if (!adjustPool(organization.id, amount.data, amount.data > 0 ? "sistem yüklemesi" : "sistem düzeltmesi", viewer.email, Date.now())) {
    return fail(`Havuzda yalnızca ${organization.creditPool} kredi var; bundan fazlası geri alınamaz.`);
  }
  recordAudit({ workspaceId: null, action: "havuz.değişti", objectType: "kurum", objectId: organization.id, detail: `${amount.data > 0 ? "+" : ""}${amount.data}`, actor: viewer.email, orgId: organization.id });
  refresh();
  return done(amount.data > 0 ? `${amount.data} kredi havuza yüklendi.` : `${-amount.data} kredi havuzdan geri alındı.`);
}

/* ── Yetki ve rol atama (sistem yöneticisi) ───────────────────────────── */

/** Kurum yöneticisinin yetkilerini işaretlenen listeyle değiştirir. */
export async function setPermissionsAction(_previous: AuthState, formData: FormData): Promise<AuthState> {
  const viewer = await signedIn();
  if (!isSysadmin(viewer)) return fail(DENIED);
  const target = getUser(text(formData, "userId"));
  if (!target || target.role !== "admin") return fail("Kurum yöneticisi bulunamadı.");

  const permissions = cleanPermissions(formData.getAll("permissions"));
  setPermissions(target.id, permissions, viewer.email, Date.now());
  recordAudit({
    workspaceId: null,
    action: "yetki.değişti",
    objectType: "kullanıcı",
    objectId: target.id,
    detail: `${target.email}: ${permissions.map((permission) => PERMISSION_INFO[permission].label).join(", ") || "yetki yok"}`,
    actor: viewer.email,
    orgId: target.orgId,
  });
  refresh();
  return done("Yetkiler kaydedildi.");
}

/** Kullanıcıyı kurum yöneticisi yapar ya da yöneticilikten alır. */
export async function setUserRoleAction(formData: FormData): Promise<void> {
  const viewer = await signedIn();
  const target = getUser(text(formData, "userId"));
  const role = z.enum(["admin", "analyst"]).safeParse(text(formData, "role"));
  if (!isSysadmin(viewer) || !target || !role.success) return;
  if (!setUserRole(target.id, role.data)) return;
  recordAudit({ workspaceId: null, action: "rol.değişti", objectType: "kullanıcı", objectId: target.id, detail: `${target.email}: ${ROLE_LABELS[role.data]}`, actor: viewer.email, orgId: target.orgId });
  refresh();
}

/* ── Davet: e-posta yetkilendirme ─────────────────────────────────────── */

const INVITE_FAILURES = {
  exists: "Bu e-posta zaten kayıtlı.",
  pending: "Bu e-posta için bekleyen bir davet var. Yenisini göndermek için önce onu iptal edin.",
  seats: "Kurumun koltuk sınırı dolu. Sistem yöneticisinden koltuk artışı isteyin ya da bir hesabı kapatın.",
  pool: "Kurum havuzunda bu kadar kredi yok.",
} as const;

export async function inviteAction(_previous: AuthState, formData: FormData): Promise<AuthState> {
  const viewer = await signedIn();
  if (!viewer) return fail(DENIED);
  const parsed = z
    .object({ name: nameSchema, email: emailSchema, role: z.enum(["admin", "analyst"]), credits: creditSchema })
    .safeParse({ name: text(formData, "name"), email: text(formData, "email"), role: text(formData, "role") || "analyst", credits: text(formData, "credits") || "0" });
  if (!parsed.success) return fail(parsed.error.issues[0].message);

  // Kurum yöneticisi yalnızca kendi kurumuna davet eder; formdaki kurum kimliğine güvenilmez.
  const orgId = isSysadmin(viewer) ? text(formData, "orgId") : (viewer.orgId ?? "");
  const organization = getOrganization(orgId);
  if (!organization || !canInvite(viewer, organization.id, parsed.data.role)) return fail(DENIED);
  if (organization.suspendedAt !== null) return fail("Askıdaki kuruma davet gönderilemez.");
  if (!emailAllowed(organization.domains, parsed.data.email)) {
    return fail(`Bu kuruma yalnızca şu alan adlarından e-posta yetkilendirilebilir: ${organization.domains.join(", ")}`);
  }
  if (parsed.data.credits > 0 && !can(viewer, "credits.assign")) return fail("Kredi tanımlamak için kredi dağıtımı yetkisi gerekir. Krediyi 0 bırakın.");

  // Yönetici yetkilerini yalnızca sistem yöneticisi belirler.
  const permissions = parsed.data.role === "admin" && isSysadmin(viewer) ? cleanPermissions(formData.getAll("permissions")) : [];
  const result = createInvitation({ orgId: organization.id, ...parsed.data, permissions, invitedBy: viewer.email }, Date.now());
  if (!result.ok) return fail(INVITE_FAILURES[result.reason]);

  recordAudit({
    workspaceId: null,
    action: "davet.oluşturuldu",
    objectType: "davet",
    objectId: result.invitation.id,
    detail: `${result.invitation.email}; ${ROLE_LABELS[result.invitation.role]}; ${result.invitation.credits} kredi`,
    actor: viewer.email,
    orgId: organization.id,
  });
  refresh();
  return done(`${result.invitation.email} yetkilendirildi. Bağlantı 7 gün geçerlidir ve yalnızca şimdi gösterilir.`, `/davet/${result.token}`);
}

export async function revokeInvitationAction(_previous: AuthState, formData: FormData): Promise<AuthState> {
  const viewer = await signedIn();
  const invitation = getInvitation(text(formData, "invitationId"));
  if (!viewer || !invitation || !canInvite(viewer, invitation.orgId, invitation.role)) return fail(DENIED);
  if (!revokeInvitation(invitation.id, viewer.email, Date.now())) return fail("Davet zaten sonuçlanmış.");
  recordAudit({ workspaceId: null, action: "davet.iptal", objectType: "davet", objectId: invitation.id, detail: invitation.email, actor: viewer.email, orgId: invitation.orgId });
  refresh();
  return done("Davet iptal edildi.");
}

/** Davet bağlantısını açan kişi parolasını belirler; hesabı o anda açılır. */
export async function acceptInvitationAction(_previous: AuthState, formData: FormData): Promise<AuthState> {
  ensureSeeded();
  const token = text(formData, "token");
  const password = passwordSchema.safeParse(text(formData, "password"));
  if (!password.success) return fail(password.error.issues[0].message);
  if (password.data !== text(formData, "passwordRepeat")) return fail("Parolalar aynı değil.");

  const now = Date.now();
  const invitation = getInvitationByToken(token, now);
  if (!invitation || getOrganization(invitation.orgId)?.suspendedAt !== null) return fail("Bu davet bağlantısı geçerli değil ya da süresi dolmuş. Yöneticinizden yeni bir davet isteyin.");
  const user = acceptInvitation(token, hashPassword(password.data), now);
  if (!user) return fail("Bu davet bağlantısı geçerli değil ya da süresi dolmuş. Yöneticinizden yeni bir davet isteyin.");

  touchLogin(user.id, now);
  await startSession(user.id);
  recordAudit({ workspaceId: null, action: "davet.kabul", objectType: "kullanıcı", objectId: user.id, detail: ROLE_LABELS[user.role], actor: user.email });
  redirect(homePath(user));
}

/* ── Kredi dağıtımı ───────────────────────────────────────────────────── */

/** Kurum havuzundan kullanıcıya kredi aktarır; eksi tutar krediyi havuza geri alır. */
export async function assignCreditsAction(_previous: AuthState, formData: FormData): Promise<AuthState> {
  const viewer = await signedIn();
  const target = getUser(text(formData, "userId"));
  if (!viewer || !target || !canAssignCredits(viewer, target) || target.orgId === null) return fail(DENIED);
  const amount = amountSchema.safeParse(text(formData, "amount"));
  if (!amount.success) return fail(amount.error.issues[0].message);

  const result = transferCredits(target.orgId, target.id, amount.data, viewer.email, Date.now());
  if (result === "pool") return fail("Kurum havuzunda bu kadar kredi yok.");
  if (result === "balance") return fail(`Kullanıcının yalnızca ${target.credits} kredisi var.`);
  if (result !== "ok") return fail("Kredi aktarılamadı.");
  recordAudit({ workspaceId: null, action: "kredi.değişti", objectType: "kullanıcı", objectId: target.id, detail: `${target.email}: ${amount.data > 0 ? "+" : ""}${amount.data}`, actor: viewer.email, orgId: target.orgId });
  refresh();
  return done(amount.data > 0 ? `${amount.data} kredi verildi.` : `${-amount.data} kredi havuza alındı.`);
}

/* ── Hesap yönetimi ───────────────────────────────────────────────────── */

export async function setUserDisabledAction(_previous: AuthState, formData: FormData): Promise<AuthState> {
  const viewer = await signedIn();
  const target = getUser(text(formData, "userId"));
  if (!viewer || !target || !canManageAccount(viewer, target)) return fail(DENIED);
  const disabled = formData.get("disabled") === "1";
  const now = Date.now();
  if (!disabled && target.orgId !== null) {
    const limit = getOrganization(target.orgId)?.seatLimit ?? null;
    if (limit !== null && seatsInUse(target.orgId, now) >= limit) return fail(INVITE_FAILURES.seats);
  }

  setUserDisabled(target.id, disabled, now);
  recordAudit({ workspaceId: null, action: disabled ? "kullanıcı.kapatıldı" : "kullanıcı.açıldı", objectType: "kullanıcı", objectId: target.id, detail: target.email, actor: viewer.email, orgId: target.orgId });
  refresh();
  return done(disabled ? "Hesap kapatıldı." : "Hesap yeniden açıldı.");
}

/** Kullanıcı için tek kullanımlık parola sıfırlama bağlantısı üretir. */
export async function createResetLinkAction(_previous: AuthState, formData: FormData): Promise<AuthState> {
  const viewer = await signedIn();
  const target = getUser(text(formData, "userId"));
  if (!viewer || !target || !canManageAccount(viewer, target)) return fail(DENIED);
  if (target.disabledAt !== null) return fail("Kapalı hesap için bağlantı üretilemez.");

  const token = createPasswordReset(target.id, viewer.email, Date.now());
  recordAudit({ workspaceId: null, action: "parola.sıfırlama-bağlantısı", objectType: "kullanıcı", objectId: target.id, detail: target.email, actor: viewer.email, orgId: target.orgId });
  return done("Bağlantı 24 saat geçerlidir ve yalnızca şimdi gösterilir.", `/parola/${token}`);
}

export async function resetPasswordAction(_previous: AuthState, formData: FormData): Promise<AuthState> {
  ensureSeeded();
  const token = text(formData, "token");
  const password = passwordSchema.safeParse(text(formData, "password"));
  if (!password.success) return fail(password.error.issues[0].message);
  if (password.data !== text(formData, "passwordRepeat")) return fail("Parolalar aynı değil.");

  const now = Date.now();
  const target = getResetTarget(token, now);
  if (!target) return fail("Bu bağlantı geçerli değil ya da süresi dolmuş. Yöneticinizden yenisini isteyin.");
  setPassword(target.userId, hashPassword(password.data), now);
  markResetUsed(token, now);
  failures.delete(target.email);
  recordAudit({ workspaceId: null, action: "parola.sıfırlandı", objectType: "kullanıcı", objectId: target.userId, actor: target.email });
  redirect(LOGIN_PATH);
}

/** Kişi kendi parolasını değiştirir; diğer cihazlardaki oturumları kapanır. */
export async function changePasswordAction(_previous: AuthState, formData: FormData): Promise<AuthState> {
  const viewer = await signedIn();
  if (!viewer) return fail(DENIED);
  const password = passwordSchema.safeParse(text(formData, "password"));
  if (!password.success) return fail(password.error.issues[0].message);
  if (password.data !== text(formData, "passwordRepeat")) return fail("Yeni parolalar aynı değil.");

  const stored = getPasswordHash(viewer.id);
  if (!stored || !verifyPassword(text(formData, "current"), stored)) return fail("Mevcut parolanız hatalı.");
  if (verifyPassword(password.data, stored)) return fail("Yeni parola eskisinden farklı olmalı.");

  setPassword(viewer.id, hashPassword(password.data), Date.now(), await currentToken());
  recordAudit({ workspaceId: null, action: "parola.değişti", objectType: "kullanıcı", objectId: viewer.id, actor: viewer.email });
  return done("Parolanız değişti. Diğer cihazlardaki oturumlarınız kapatıldı.");
}
