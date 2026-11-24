import { beforeAll, describe, expect, it } from "vitest";
import { normalizeLanguage } from "@/lib/analysis/language";
import {
  can,
  canAssignCredits,
  canInvite,
  canManageAccount,
  canSeeProject,
  CREDIT_COSTS,
  creditShortage,
  emailAllowed,
  parseDomains,
  spendCredits,
  visibleProjects,
} from "@/server/auth/access";
import { hashPassword, verifyPassword } from "@/server/auth/passwords";
import { queryOne } from "@/server/db/client";
import { ensureSeeded } from "@/server/setup/seed";
import {
  acceptInvitation,
  createInvitation,
  createPasswordReset,
  getInvitationByToken,
  getResetTarget,
  INVITE_TTL_MS,
  listOpenInvitations,
  markResetUsed,
  revokeInvitation,
} from "@/server/repositories/invitations";
import {
  adjustPool,
  createOrganization,
  getOrganization,
  listPoolLedger,
  seatsInUse,
  setOrganizationSuspended,
  transferCredits,
  type Organization,
} from "@/server/repositories/organizations";
import { createProject, listProjects } from "@/server/repositories/projects";
import { listAllAuditEvents, listOrgAuditEvents, recordAudit } from "@/server/repositories/runs";
import {
  adjustCredits,
  countUsers,
  createSession,
  createUser,
  deleteSession,
  getCredentials,
  getPasswordHash,
  getSessionUser,
  getUser,
  listLedger,
  SESSION_TTL_MS,
  setPassword,
  setPermissions,
  setProjectOwner,
  setUserDisabled,
  setUserRole,
  type User,
  listProjectOwners,
} from "@/server/repositories/users";
import { getWorkspaceByKind } from "@/server/repositories/workspaces";

/** Üç katmanlı yetki: sistem yöneticisi, kurum yöneticisi, kullanıcı; kurumlar, davetler, krediler. */

const NOW = Date.parse("2026-11-12T14:30:00+03:00");
const SYSTEM = "sistem@yanki.example";
let sysadmin: User;
let kurumA: Organization;
let kurumB: Organization;
let adminA: User;
let adminB: User;
let zeynep: User;
let mehmet: User;

const fresh = async (user: User): Promise<User> => (await getUser(user.id))!;

beforeAll(async () => {
  await ensureSeeded(NOW);
  sysadmin = (await createUser(
    { email: " Sistem@Yanki.example ", name: "Sistem", role: "sysadmin", orgId: null, passwordHash: hashPassword("cok-gizli-parola"), credits: 0 },
    NOW,
  ))!;
  kurumA = (await createOrganization({ name: "A Kurumu", seatLimit: 4, domains: ["a.gov.example"] }, 100, SYSTEM, NOW))!;
  kurumB = (await createOrganization({ name: "B Kurumu", seatLimit: null, domains: [] }, 0, SYSTEM, NOW))!;
  adminA = (await createUser(
    {
      email: "yonetici@a.gov.example",
      name: "A Yönetici",
      role: "admin",
      orgId: kurumA.id,
      passwordHash: hashPassword("yonetici-parola"),
      credits: 0,
      permissions: ["users.invite"],
      grantedBy: SYSTEM,
    },
    NOW,
  ))!;
  adminB = (await createUser(
    {
      email: "yonetici@b.example",
      name: "B Yönetici",
      role: "admin",
      orgId: kurumB.id,
      passwordHash: "x",
      credits: 0,
      permissions: ["users.invite", "users.manage", "credits.assign", "projects.viewAll", "audit.view"],
    },
    NOW,
  ))!;
  zeynep = (await createUser(
    { email: "zeynep@a.gov.example", name: "Zeynep", role: "analyst", orgId: kurumA.id, passwordHash: hashPassword("zeynep-parolasi"), credits: 12 },
    NOW,
  ))!;
  mehmet = (await createUser(
    { email: "mehmet@a.gov.example", name: "Mehmet", role: "analyst", orgId: kurumA.id, passwordHash: hashPassword("mehmet-parolasi"), credits: 1 },
    NOW,
  ))!;
});

describe("parola", () => {
  it("özet tuzludur ve yalnızca doğru parolayla doğrulanır", () => {
    const first = hashPassword("ayni-parola-123");
    const second = hashPassword("ayni-parola-123");
    expect(first).not.toBe(second);
    expect(first).not.toContain("ayni-parola-123");
    expect(verifyPassword("ayni-parola-123", first)).toBe(true);
    expect(verifyPassword("ayni-parola-124", first)).toBe(false);
    expect(verifyPassword("x", "bozuk-kayit")).toBe(false);
    expect(verifyPassword("x", "scrypt$0$8$1$AA$AA")).toBe(false);
  });
});

describe("kullanıcılar", () => {
  it("e-postayı sadeleştirir, yineleneni reddeder, parola özetini kullanıcı nesnesinde taşımaz", async () => {
    expect(sysadmin.email).toBe("sistem@yanki.example");
    expect(sysadmin.orgId).toBeNull();
    expect(await countUsers()).toBe(5);
    expect(await createUser({ email: "ZEYNEP@a.gov.example", name: "Kopya", role: "analyst", orgId: kurumA.id, passwordHash: "x", credits: 0 }, NOW)).toBeNull();
    expect(Object.keys((await getUser(zeynep.id))!)).not.toContain("passwordHash");
    expect(verifyPassword("zeynep-parolasi", (await getCredentials("Zeynep@A.gov.example"))!.passwordHash)).toBe(true);
    expect(await getCredentials("olmayan@kurum.example")).toBeNull();
  });

  it("sistem yöneticisi kurum dışıdır; diğer roller kurumsuz kaydedilemez", async () => {
    await expect(createUser({ email: "kurumsuz@a.gov.example", name: "Kurumsuz", role: "analyst", orgId: null, passwordHash: "x", credits: 0 }, NOW)).rejects.toThrow();
    expect(await countUsers()).toBe(5);
  });
});

describe("yetkiler", () => {
  it("sistem yöneticisi her yetkiye sahiptir; kurum yöneticisi yalnızca verilene; kullanıcı hiçbirine", () => {
    expect(can(sysadmin, "audit.view")).toBe(true);
    expect(can(adminA, "users.invite")).toBe(true);
    expect(can(adminA, "credits.assign")).toBe(false);
    expect(can(zeynep, "users.invite")).toBe(false);
    expect(can(null, "users.invite")).toBe(false);
  });

  it("kullanıcıya yetki yazılmaz; yöneticilikten alınanın yetkileri silinir", async () => {
    await setPermissions(zeynep.id, ["users.invite"], SYSTEM, NOW);
    expect((await fresh(zeynep)).permissions).toEqual([]);

    expect(await setUserRole(mehmet.id, "admin")).toBe(true);
    await setPermissions(mehmet.id, ["credits.assign", "audit.view"], SYSTEM, NOW);
    expect((await fresh(mehmet)).permissions).toEqual(["credits.assign", "audit.view"]);
    await setPermissions(mehmet.id, ["audit.view"], SYSTEM, NOW);
    expect((await fresh(mehmet)).permissions).toEqual(["audit.view"]);
    expect(await setUserRole(mehmet.id, "analyst")).toBe(true);
    expect((await fresh(mehmet)).permissions).toEqual([]);
    expect(await setUserRole(mehmet.id, "admin")).toBe(true);
    expect((await fresh(mehmet)).permissions).toEqual([]);
    await setUserRole(mehmet.id, "analyst");
    expect(await setUserRole(sysadmin.id, "analyst")).toBe(false);
  });

  it("kurum yöneticisi yalnızca kendi kurumuna ve yalnızca kullanıcı davet eder", () => {
    expect(canInvite(adminA, kurumA.id, "analyst")).toBe(true);
    expect(canInvite(adminA, kurumA.id, "admin")).toBe(false);
    expect(canInvite(adminA, kurumB.id, "analyst")).toBe(false);
    expect(canInvite(zeynep, kurumA.id, "analyst")).toBe(false);
    expect(canInvite(sysadmin, kurumB.id, "admin")).toBe(true);
  });

  it("hesap yönetimi ve kredi dağıtımı kurum sınırını ve yetkiyi gözetir", () => {
    // adminA'da hesap yönetimi yetkisi yok.
    expect(canManageAccount(adminA, zeynep)).toBe(false);
    // adminB tüm yetkilere sahip ama başka kurumun kullanıcısına dokunamaz.
    expect(canManageAccount(adminB, zeynep)).toBe(false);
    expect(canAssignCredits(adminB, zeynep)).toBe(false);
    expect(canAssignCredits(adminB, adminB)).toBe(true);
    // Yönetici başka yöneticiyi, kendini ve sistem yöneticisini yönetemez.
    expect(canManageAccount(adminB, adminB)).toBe(false);
    expect(canManageAccount(adminB, sysadmin)).toBe(false);
    expect(canManageAccount(sysadmin, adminA)).toBe(true);
    expect(canManageAccount(sysadmin, sysadmin)).toBe(false);
    expect(canAssignCredits(sysadmin, sysadmin)).toBe(false);
    expect(canManageAccount(zeynep, mehmet)).toBe(false);
  });

  it("izinli alan adı listesi e-postayı sınırlar; liste boşsa her adres geçer", () => {
    expect(emailAllowed(kurumA.domains, "yeni@a.gov.example")).toBe(true);
    expect(emailAllowed(kurumA.domains, "yeni@baska.example")).toBe(false);
    expect(emailAllowed(kurumA.domains, "yeni@kotu-a.gov.example")).toBe(false);
    expect(emailAllowed([], "herkes@her.yer")).toBe(true);
    expect(parseDomains(" @Kurum.gov.tr, alt.kurum.gov.tr\nkurum.gov.tr ")).toEqual({ domains: ["kurum.gov.tr", "alt.kurum.gov.tr"], invalid: [] });
    expect(parseDomains("gecersiz, a@b.c").invalid).toEqual(["gecersiz", "a@b.c"]);
  });
});

describe("oturum", () => {
  it("veritabanında anahtarın kendisi değil özeti saklanır; süre dolunca ve çıkışta geçersizdir", async () => {
    const token = await createSession(zeynep.id, NOW);
    expect(await queryOne("SELECT 1 FROM sessions WHERE token_hash = ?", [token])).toBeUndefined();
    expect((await getSessionUser(token, NOW + 1000))?.id).toBe(zeynep.id);
    expect(await getSessionUser("uydurma-anahtar", NOW)).toBeNull();
    expect(await getSessionUser(token, NOW + SESSION_TTL_MS + 1)).toBeNull();
    await deleteSession(token);
    expect(await getSessionUser(token, NOW + 1000)).toBeNull();
  });

  it("kapatılan kullanıcının açık oturumları düşer ve yeniden giremez", async () => {
    const token = await createSession(mehmet.id, NOW);
    await setUserDisabled(mehmet.id, true, NOW);
    expect(await getSessionUser(token, NOW + 1)).toBeNull();
    expect(await getSessionUser(await createSession(mehmet.id, NOW), NOW + 1)).toBeNull();
    await setUserDisabled(mehmet.id, false, NOW);
    expect((await getUser(mehmet.id))?.disabledAt).toBeNull();
  });

  it("askıya alınan kurumun oturumları kapanır; sistem yöneticisi etkilenmez", async () => {
    const admin = await createSession(adminB.id, NOW);
    const system = await createSession(sysadmin.id, NOW);
    await setOrganizationSuspended(kurumB.id, true, NOW);
    expect(await getSessionUser(admin, NOW + 1)).toBeNull();
    expect(await getSessionUser(await createSession(adminB.id, NOW), NOW + 1)).toBeNull();
    expect((await getSessionUser(system, NOW + 1))?.id).toBe(sysadmin.id);
    await setOrganizationSuspended(kurumB.id, false, NOW);
    expect((await getSessionUser(await createSession(adminB.id, NOW), NOW + 1))?.permissions).toHaveLength(5);
  });

  it("parola değişince seçilen dışındaki oturumlar kapanır", async () => {
    const kept = await createSession(zeynep.id, NOW);
    const other = await createSession(zeynep.id, NOW);
    await setPassword(zeynep.id, hashPassword("yepyeni-parola-1"), NOW, kept);
    expect((await getSessionUser(kept, NOW + 1))?.id).toBe(zeynep.id);
    expect(await getSessionUser(other, NOW + 1)).toBeNull();
    expect(verifyPassword("yepyeni-parola-1", (await getPasswordHash(zeynep.id))!)).toBe(true);
  });
});

describe("krediler", () => {
  it("bakiye eksiye düşmez ve her değişiklik deftere yazılır", async () => {
    expect(await adjustCredits(mehmet.id, -5, "sınama", null, NOW)).toBe(false);
    expect((await getUser(mehmet.id))?.credits).toBe(1);
    expect(await adjustCredits(mehmet.id, 0, "boş", null, NOW)).toBe(false);
    expect((await listLedger(mehmet.id, 10)).map((entry) => entry.delta)).toEqual([1]);
  });

  it("kredi havuzdan kullanıcıya akar; toplam korunur, havuz ve bakiye eksiye düşmez", async () => {
    const total = async () => (await getOrganization(kurumA.id))!.creditPool + (await fresh(zeynep)).credits + (await fresh(mehmet)).credits + (await fresh(adminA)).credits;
    const before = await total();
    expect((await getOrganization(kurumA.id))!.creditPool).toBe(100);

    expect(await transferCredits(kurumA.id, mehmet.id, 30, adminA.email, NOW + 1)).toBe("ok");
    expect((await fresh(mehmet)).credits).toBe(31);
    expect((await getOrganization(kurumA.id))!.creditPool).toBe(70);
    expect(await transferCredits(kurumA.id, mehmet.id, 71, adminA.email, NOW + 2)).toBe("pool");
    expect(await transferCredits(kurumA.id, mehmet.id, -32, adminA.email, NOW + 2)).toBe("balance");
    expect(await transferCredits(kurumA.id, mehmet.id, -11, adminA.email, NOW + 3)).toBe("ok");
    expect((await fresh(mehmet)).credits).toBe(20);
    expect(await total()).toBe(before);

    // Başka kurumun kullanıcısına bu havuzdan kredi verilemez.
    expect(await transferCredits(kurumA.id, adminB.id, 5, SYSTEM, NOW)).toBe("invalid");
    expect(await transferCredits(kurumA.id, mehmet.id, 0, SYSTEM, NOW)).toBe("invalid");
    expect(await adjustPool(kurumA.id, -1000, "sistem düzeltmesi", SYSTEM, NOW)).toBe(false);
    expect((await listPoolLedger(kurumA.id, 10)).map((entry) => entry.delta)).toEqual([11, -30, 100]);
    expect((await listPoolLedger(kurumA.id, 1))[0].userEmail).toBe(mehmet.email);
  });

  it("yetersiz kredide iletir, yeterliyse işlem sonunda düşer; yalnızca sistem yöneticisinden ve girişsiz kurulumda düşmez", async () => {
    const poor = { ...zeynep, credits: CREDIT_COSTS.claims - 1 };
    expect(creditShortage(poor, "claims")).toContain(String(CREDIT_COSTS.claims));
    expect(creditShortage(poor, "search")).toBeNull();
    expect(creditShortage(sysadmin, "claims")).toBeNull();
    expect(creditShortage(null, "claims")).toBeNull();
    // Kurum yöneticisi de kredisini harcar.
    expect(creditShortage(adminA, "search")).not.toBeNull();

    expect(await spendCredits(await getUser(zeynep.id), "summary", null, NOW)).toBe(true);
    expect((await getUser(zeynep.id))?.credits).toBe(12 - CREDIT_COSTS.summary);
    expect(await spendCredits(sysadmin, "claims", null, NOW)).toBe(true);
    expect((await getUser(sysadmin.id))?.credits).toBe(0);
    expect(await spendCredits(null, "claims", null, NOW)).toBe(true);
    // Eşzamanlı harcamada bakiye yetmezse düşüm reddedilir.
    expect(await spendCredits({ ...(await getUser(zeynep.id))!, credits: 999 }, "claims", null, NOW)).toBe(false);
  });
});

describe("davet", () => {
  const invite = async (email: string, credits = 0, role: "admin" | "analyst" = "analyst") =>
    createInvitation({ orgId: kurumA.id, email, name: "Davetli", role, credits, permissions: ["audit.view"], invitedBy: adminA.email }, NOW + 10);

  it("kredi davet anında havuzdan ayrılır; iptal edilince geri döner", async () => {
    const pool = (await getOrganization(kurumA.id))!.creditPool;
    const result = await invite("Ayse@a.gov.example", 25);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.invitation.email).toBe("ayse@a.gov.example");
    // Kullanıcı davetine yönetici yetkisi taşınmaz.
    expect(result.invitation.permissions).toEqual([]);
    expect((await getOrganization(kurumA.id))!.creditPool).toBe(pool - 25);
    expect(await queryOne("SELECT 1 FROM invitations WHERE token_hash = ?", [result.token])).toBeUndefined();
    expect(await invite("ayse@a.gov.example")).toEqual({ ok: false, reason: "pending" });
    expect(await invite("zeynep@a.gov.example")).toEqual({ ok: false, reason: "exists" });

    expect(await revokeInvitation(result.invitation.id, adminA.email, NOW + 11)).toBe(true);
    expect(await revokeInvitation(result.invitation.id, adminA.email, NOW + 12)).toBe(false);
    expect((await getOrganization(kurumA.id))!.creditPool).toBe(pool);
    expect(await getInvitationByToken(result.token, NOW + 13)).toBeNull();
    expect(await acceptInvitation(result.token, "x", NOW + 13)).toBeNull();
    expect(await invite("cokkredi@a.gov.example", 10_000)).toEqual({ ok: false, reason: "pool" });
  });

  it("kabul edilince hesap açılır, kredi ve yetkiler tanımlanır; bağlantı ikinci kez çalışmaz", async () => {
    const result = await invite("yardimci@a.gov.example", 10, "admin");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Koltuk sınırı 4: üç etkin hesap ve bu davet koltukları doldurur.
    expect(await seatsInUse(kurumA.id, NOW + 20)).toBe(4);
    expect(await invite("fazla@a.gov.example")).toEqual({ ok: false, reason: "seats" });

    const user = await acceptInvitation(result.token, hashPassword("davetli-parolasi"), NOW + 20);
    expect(user).toMatchObject({ email: "yardimci@a.gov.example", role: "admin", orgId: kurumA.id, credits: 10, permissions: ["audit.view"] });
    expect(await acceptInvitation(result.token, "x", NOW + 21)).toBeNull();
    expect(await listOpenInvitations(kurumA.id)).toHaveLength(0);
    expect((await listLedger(user!.id, 5)).map((entry) => entry.delta)).toEqual([10]);
    expect(await seatsInUse(kurumA.id, NOW + 22)).toBe(4);
  });

  it("süresi dolan davet kabul edilemez ve koltuk tutmaz", async () => {
    const result = await createInvitation(
      { orgId: kurumB.id, email: "gec@b.example", name: "Geç Kalan", role: "analyst", credits: 0, permissions: [], invitedBy: adminB.email },
      NOW,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(await seatsInUse(kurumB.id, NOW + 1)).toBe(2);
    expect(await getInvitationByToken(result.token, NOW + INVITE_TTL_MS + 1)).toBeNull();
    expect(await acceptInvitation(result.token, "x", NOW + INVITE_TTL_MS + 1)).toBeNull();
    expect(await seatsInUse(kurumB.id, NOW + INVITE_TTL_MS + 1)).toBe(1);
    expect(await listOpenInvitations(kurumB.id)).toHaveLength(1);
  });
});

describe("parola sıfırlama", () => {
  it("bağlantı tek kullanımlıktır; yenisi üretilince eskisi geçersiz olur", async () => {
    const first = await createPasswordReset(mehmet.id, adminA.email, NOW);
    const second = await createPasswordReset(mehmet.id, adminA.email, NOW + 1);
    expect(await getResetTarget(first, NOW + 2)).toBeNull();
    expect(await getResetTarget(second, NOW + 2)).toEqual({ userId: mehmet.id, email: mehmet.email });
    expect(await getResetTarget(second, NOW + 86_400_001)).toBeNull();
    await markResetUsed(second, NOW + 3);
    expect(await getResetTarget(second, NOW + 4)).toBeNull();
  });
});

describe("konu görünürlüğü", () => {
  it("kullanıcı kendi ve ortak konuları, yetkili yönetici kendi kurumunu, sistem yöneticisi hepsini görür", async () => {
    const workspace = (await getWorkspaceByKind("live"))!;
    const input = { description: "", connectorIds: [] };
    const shared = await createProject(workspace.id, { ...input, name: "Ortak konu", query: "ortak" }, NOW);
    const hers = await createProject(workspace.id, { ...input, name: "Brezilya seçimleri", query: "brezilya" }, NOW + 1);
    const his = await createProject(workspace.id, { ...input, name: "COP31", query: "cop31" }, NOW + 2);
    await setProjectOwner(hers.id, zeynep.id);
    await setProjectOwner(his.id, mehmet.id);

    const all = await listProjects(workspace.id);
    const owners = await listProjectOwners();
    const names = (viewer: User | null) =>
      visibleProjects(viewer, all, owners)
        .map((project) => project.name)
        .sort();
    expect(names(zeynep)).toEqual(["Brezilya seçimleri", "Ortak konu"]);
    expect(names(mehmet)).toEqual(["COP31", "Ortak konu"]);
    // Yetkisi olmayan kurum yöneticisi kullanıcı gibi görür.
    expect(names(adminA)).toEqual(["Ortak konu"]);
    expect(names({ ...adminA, permissions: ["projects.viewAll"] })).toEqual(["Brezilya seçimleri", "COP31", "Ortak konu"]);
    // Tüm yetkilere sahip olsa da başka kurumun yöneticisi bu konuları göremez.
    expect(names(adminB)).toEqual(["Ortak konu"]);
    expect(names(sysadmin)).toHaveLength(3);
    expect(names(null)).toHaveLength(3);

    expect(canSeeProject(zeynep, his, owners)).toBe(false);
    expect(canSeeProject(zeynep, hers, owners)).toBe(true);
    expect(canSeeProject(mehmet, shared, owners)).toBe(true);
    expect(canSeeProject(adminB, hers, owners)).toBe(false);
  });
});

describe("denetim izi", () => {
  it("kayıt, işlemi yapanın kurumuna yazılır; kurum yöneticisi başka kurumun kaydını görmez", async () => {
    await recordAudit({ workspaceId: null, action: "sınama.a", objectType: "sınama", actor: zeynep.email }, NOW);
    await recordAudit({ workspaceId: null, action: "sınama.b", objectType: "sınama", actor: adminB.email }, NOW);
    await recordAudit({ workspaceId: null, action: "sınama.sistem", objectType: "sınama", actor: sysadmin.email, orgId: kurumA.id }, NOW);
    await recordAudit({ workspaceId: null, action: "sınama.platform", objectType: "sınama", actor: sysadmin.email }, NOW);

    const actions = async (orgId: string) => (await listOrgAuditEvents(orgId, 50)).map((event) => event.action).filter((action) => action.startsWith("sınama."));
    expect((await actions(kurumA.id)).sort()).toEqual(["sınama.a", "sınama.sistem"]);
    expect(await actions(kurumB.id)).toEqual(["sınama.b"]);
    expect((await listAllAuditEvents(500)).filter((event) => event.action.startsWith("sınama."))).toHaveLength(4);
  });
});

describe("dil etiketi", () => {
  it("bölgeli etiketi iki harfe indirir, tanınmayanı reddeder", () => {
    expect(normalizeLanguage("en-US")).toBe("en");
    expect(normalizeLanguage("pt_BR")).toBe("pt");
    expect(normalizeLanguage(" TR ")).toBe("tr");
    expect(normalizeLanguage("english")).toBeNull();
    expect(normalizeLanguage(null)).toBeNull();
  });
});
