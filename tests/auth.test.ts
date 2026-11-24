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

const fresh = (user: User): User => getUser(user.id)!;

beforeAll(() => {
  ensureSeeded(NOW);
  sysadmin = createUser({ email: " Sistem@Yanki.example ", name: "Sistem", role: "sysadmin", orgId: null, passwordHash: hashPassword("cok-gizli-parola"), credits: 0 }, NOW)!;
  kurumA = createOrganization({ name: "A Kurumu", seatLimit: 4, domains: ["a.gov.example"] }, 100, SYSTEM, NOW)!;
  kurumB = createOrganization({ name: "B Kurumu", seatLimit: null, domains: [] }, 0, SYSTEM, NOW)!;
  adminA = createUser({ email: "yonetici@a.gov.example", name: "A Yönetici", role: "admin", orgId: kurumA.id, passwordHash: hashPassword("yonetici-parola"), credits: 0, permissions: ["users.invite"], grantedBy: SYSTEM }, NOW)!;
  adminB = createUser({ email: "yonetici@b.example", name: "B Yönetici", role: "admin", orgId: kurumB.id, passwordHash: "x", credits: 0, permissions: ["users.invite", "users.manage", "credits.assign", "projects.viewAll", "audit.view"] }, NOW)!;
  zeynep = createUser({ email: "zeynep@a.gov.example", name: "Zeynep", role: "analyst", orgId: kurumA.id, passwordHash: hashPassword("zeynep-parolasi"), credits: 12 }, NOW)!;
  mehmet = createUser({ email: "mehmet@a.gov.example", name: "Mehmet", role: "analyst", orgId: kurumA.id, passwordHash: hashPassword("mehmet-parolasi"), credits: 1 }, NOW)!;
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
  it("e-postayı sadeleştirir, yineleneni reddeder, parola özetini kullanıcı nesnesinde taşımaz", () => {
    expect(sysadmin.email).toBe("sistem@yanki.example");
    expect(sysadmin.orgId).toBeNull();
    expect(countUsers()).toBe(5);
    expect(createUser({ email: "ZEYNEP@a.gov.example", name: "Kopya", role: "analyst", orgId: kurumA.id, passwordHash: "x", credits: 0 }, NOW)).toBeNull();
    expect(Object.keys(getUser(zeynep.id)!)).not.toContain("passwordHash");
    expect(verifyPassword("zeynep-parolasi", getCredentials("Zeynep@A.gov.example")!.passwordHash)).toBe(true);
    expect(getCredentials("olmayan@kurum.example")).toBeNull();
  });

  it("sistem yöneticisi kurum dışıdır; diğer roller kurumsuz kaydedilemez", () => {
    expect(() => createUser({ email: "kurumsuz@a.gov.example", name: "Kurumsuz", role: "analyst", orgId: null, passwordHash: "x", credits: 0 }, NOW)).toThrow();
    expect(countUsers()).toBe(5);
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

  it("kullanıcıya yetki yazılmaz; yöneticilikten alınanın yetkileri silinir", () => {
    setPermissions(zeynep.id, ["users.invite"], SYSTEM, NOW);
    expect(fresh(zeynep).permissions).toEqual([]);

    expect(setUserRole(mehmet.id, "admin")).toBe(true);
    setPermissions(mehmet.id, ["credits.assign", "audit.view"], SYSTEM, NOW);
    expect(fresh(mehmet).permissions).toEqual(["credits.assign", "audit.view"]);
    setPermissions(mehmet.id, ["audit.view"], SYSTEM, NOW);
    expect(fresh(mehmet).permissions).toEqual(["audit.view"]);
    expect(setUserRole(mehmet.id, "analyst")).toBe(true);
    expect(fresh(mehmet).permissions).toEqual([]);
    expect(setUserRole(mehmet.id, "admin")).toBe(true);
    expect(fresh(mehmet).permissions).toEqual([]);
    setUserRole(mehmet.id, "analyst");
    expect(setUserRole(sysadmin.id, "analyst")).toBe(false);
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
  it("veritabanında anahtarın kendisi değil özeti saklanır; süre dolunca ve çıkışta geçersizdir", () => {
    const token = createSession(zeynep.id, NOW);
    expect(queryOne("SELECT 1 FROM sessions WHERE token_hash = ?", [token])).toBeUndefined();
    expect(getSessionUser(token, NOW + 1000)?.id).toBe(zeynep.id);
    expect(getSessionUser("uydurma-anahtar", NOW)).toBeNull();
    expect(getSessionUser(token, NOW + SESSION_TTL_MS + 1)).toBeNull();
    deleteSession(token);
    expect(getSessionUser(token, NOW + 1000)).toBeNull();
  });

  it("kapatılan kullanıcının açık oturumları düşer ve yeniden giremez", () => {
    const token = createSession(mehmet.id, NOW);
    setUserDisabled(mehmet.id, true, NOW);
    expect(getSessionUser(token, NOW + 1)).toBeNull();
    expect(getSessionUser(createSession(mehmet.id, NOW), NOW + 1)).toBeNull();
    setUserDisabled(mehmet.id, false, NOW);
    expect(getUser(mehmet.id)?.disabledAt).toBeNull();
  });

  it("askıya alınan kurumun oturumları kapanır; sistem yöneticisi etkilenmez", () => {
    const admin = createSession(adminB.id, NOW);
    const system = createSession(sysadmin.id, NOW);
    setOrganizationSuspended(kurumB.id, true, NOW);
    expect(getSessionUser(admin, NOW + 1)).toBeNull();
    expect(getSessionUser(createSession(adminB.id, NOW), NOW + 1)).toBeNull();
    expect(getSessionUser(system, NOW + 1)?.id).toBe(sysadmin.id);
    setOrganizationSuspended(kurumB.id, false, NOW);
    expect(getSessionUser(createSession(adminB.id, NOW), NOW + 1)?.permissions).toHaveLength(5);
  });

  it("parola değişince seçilen dışındaki oturumlar kapanır", () => {
    const kept = createSession(zeynep.id, NOW);
    const other = createSession(zeynep.id, NOW);
    setPassword(zeynep.id, hashPassword("yepyeni-parola-1"), NOW, kept);
    expect(getSessionUser(kept, NOW + 1)?.id).toBe(zeynep.id);
    expect(getSessionUser(other, NOW + 1)).toBeNull();
    expect(verifyPassword("yepyeni-parola-1", getPasswordHash(zeynep.id)!)).toBe(true);
  });
});

describe("krediler", () => {
  it("bakiye eksiye düşmez ve her değişiklik deftere yazılır", () => {
    expect(adjustCredits(mehmet.id, -5, "sınama", null, NOW)).toBe(false);
    expect(getUser(mehmet.id)?.credits).toBe(1);
    expect(adjustCredits(mehmet.id, 0, "boş", null, NOW)).toBe(false);
    expect(listLedger(mehmet.id, 10).map((entry) => entry.delta)).toEqual([1]);
  });

  it("kredi havuzdan kullanıcıya akar; toplam korunur, havuz ve bakiye eksiye düşmez", () => {
    const total = () => getOrganization(kurumA.id)!.creditPool + fresh(zeynep).credits + fresh(mehmet).credits + fresh(adminA).credits;
    const before = total();
    expect(getOrganization(kurumA.id)!.creditPool).toBe(100);

    expect(transferCredits(kurumA.id, mehmet.id, 30, adminA.email, NOW + 1)).toBe("ok");
    expect(fresh(mehmet).credits).toBe(31);
    expect(getOrganization(kurumA.id)!.creditPool).toBe(70);
    expect(transferCredits(kurumA.id, mehmet.id, 71, adminA.email, NOW + 2)).toBe("pool");
    expect(transferCredits(kurumA.id, mehmet.id, -32, adminA.email, NOW + 2)).toBe("balance");
    expect(transferCredits(kurumA.id, mehmet.id, -11, adminA.email, NOW + 3)).toBe("ok");
    expect(fresh(mehmet).credits).toBe(20);
    expect(total()).toBe(before);

    // Başka kurumun kullanıcısına bu havuzdan kredi verilemez.
    expect(transferCredits(kurumA.id, adminB.id, 5, SYSTEM, NOW)).toBe("invalid");
    expect(transferCredits(kurumA.id, mehmet.id, 0, SYSTEM, NOW)).toBe("invalid");
    expect(adjustPool(kurumA.id, -1000, "sistem düzeltmesi", SYSTEM, NOW)).toBe(false);
    expect(listPoolLedger(kurumA.id, 10).map((entry) => entry.delta)).toEqual([11, -30, 100]);
    expect(listPoolLedger(kurumA.id, 1)[0].userEmail).toBe(mehmet.email);
  });

  it("yetersiz kredide iletir, yeterliyse işlem sonunda düşer; yalnızca sistem yöneticisinden ve girişsiz kurulumda düşmez", () => {
    const poor = { ...zeynep, credits: CREDIT_COSTS.claims - 1 };
    expect(creditShortage(poor, "claims")).toContain(String(CREDIT_COSTS.claims));
    expect(creditShortage(poor, "search")).toBeNull();
    expect(creditShortage(sysadmin, "claims")).toBeNull();
    expect(creditShortage(null, "claims")).toBeNull();
    // Kurum yöneticisi de kredisini harcar.
    expect(creditShortage(adminA, "search")).not.toBeNull();

    expect(spendCredits(getUser(zeynep.id), "summary", null, NOW)).toBe(true);
    expect(getUser(zeynep.id)?.credits).toBe(12 - CREDIT_COSTS.summary);
    expect(spendCredits(sysadmin, "claims", null, NOW)).toBe(true);
    expect(getUser(sysadmin.id)?.credits).toBe(0);
    expect(spendCredits(null, "claims", null, NOW)).toBe(true);
    // Eşzamanlı harcamada bakiye yetmezse düşüm reddedilir.
    expect(spendCredits({ ...getUser(zeynep.id)!, credits: 999 }, "claims", null, NOW)).toBe(false);
  });
});

describe("davet", () => {
  const invite = (email: string, credits = 0, role: "admin" | "analyst" = "analyst") =>
    createInvitation({ orgId: kurumA.id, email, name: "Davetli", role, credits, permissions: ["audit.view"], invitedBy: adminA.email }, NOW + 10);

  it("kredi davet anında havuzdan ayrılır; iptal edilince geri döner", () => {
    const pool = getOrganization(kurumA.id)!.creditPool;
    const result = invite("Ayse@a.gov.example", 25);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.invitation.email).toBe("ayse@a.gov.example");
    // Kullanıcı davetine yönetici yetkisi taşınmaz.
    expect(result.invitation.permissions).toEqual([]);
    expect(getOrganization(kurumA.id)!.creditPool).toBe(pool - 25);
    expect(queryOne("SELECT 1 FROM invitations WHERE token_hash = ?", [result.token])).toBeUndefined();
    expect(invite("ayse@a.gov.example")).toEqual({ ok: false, reason: "pending" });
    expect(invite("zeynep@a.gov.example")).toEqual({ ok: false, reason: "exists" });

    expect(revokeInvitation(result.invitation.id, adminA.email, NOW + 11)).toBe(true);
    expect(revokeInvitation(result.invitation.id, adminA.email, NOW + 12)).toBe(false);
    expect(getOrganization(kurumA.id)!.creditPool).toBe(pool);
    expect(getInvitationByToken(result.token, NOW + 13)).toBeNull();
    expect(acceptInvitation(result.token, "x", NOW + 13)).toBeNull();
    expect(invite("cokkredi@a.gov.example", 10_000)).toEqual({ ok: false, reason: "pool" });
  });

  it("kabul edilince hesap açılır, kredi ve yetkiler tanımlanır; bağlantı ikinci kez çalışmaz", () => {
    const result = invite("yardimci@a.gov.example", 10, "admin");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Koltuk sınırı 4: üç etkin hesap ve bu davet koltukları doldurur.
    expect(seatsInUse(kurumA.id, NOW + 20)).toBe(4);
    expect(invite("fazla@a.gov.example")).toEqual({ ok: false, reason: "seats" });

    const user = acceptInvitation(result.token, hashPassword("davetli-parolasi"), NOW + 20);
    expect(user).toMatchObject({ email: "yardimci@a.gov.example", role: "admin", orgId: kurumA.id, credits: 10, permissions: ["audit.view"] });
    expect(acceptInvitation(result.token, "x", NOW + 21)).toBeNull();
    expect(listOpenInvitations(kurumA.id)).toHaveLength(0);
    expect(listLedger(user!.id, 5).map((entry) => entry.delta)).toEqual([10]);
    expect(seatsInUse(kurumA.id, NOW + 22)).toBe(4);
  });

  it("süresi dolan davet kabul edilemez ve koltuk tutmaz", () => {
    const result = createInvitation({ orgId: kurumB.id, email: "gec@b.example", name: "Geç Kalan", role: "analyst", credits: 0, permissions: [], invitedBy: adminB.email }, NOW);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(seatsInUse(kurumB.id, NOW + 1)).toBe(2);
    expect(getInvitationByToken(result.token, NOW + INVITE_TTL_MS + 1)).toBeNull();
    expect(acceptInvitation(result.token, "x", NOW + INVITE_TTL_MS + 1)).toBeNull();
    expect(seatsInUse(kurumB.id, NOW + INVITE_TTL_MS + 1)).toBe(1);
    expect(listOpenInvitations(kurumB.id)).toHaveLength(1);
  });
});

describe("parola sıfırlama", () => {
  it("bağlantı tek kullanımlıktır; yenisi üretilince eskisi geçersiz olur", () => {
    const first = createPasswordReset(mehmet.id, adminA.email, NOW);
    const second = createPasswordReset(mehmet.id, adminA.email, NOW + 1);
    expect(getResetTarget(first, NOW + 2)).toBeNull();
    expect(getResetTarget(second, NOW + 2)).toEqual({ userId: mehmet.id, email: mehmet.email });
    expect(getResetTarget(second, NOW + 86_400_001)).toBeNull();
    markResetUsed(second, NOW + 3);
    expect(getResetTarget(second, NOW + 4)).toBeNull();
  });
});

describe("konu görünürlüğü", () => {
  it("kullanıcı kendi ve ortak konuları, yetkili yönetici kendi kurumunu, sistem yöneticisi hepsini görür", () => {
    const workspace = getWorkspaceByKind("live")!;
    const input = { description: "", connectorIds: [] };
    const shared = createProject(workspace.id, { ...input, name: "Ortak konu", query: "ortak" }, NOW);
    const hers = createProject(workspace.id, { ...input, name: "Brezilya seçimleri", query: "brezilya" }, NOW + 1);
    const his = createProject(workspace.id, { ...input, name: "COP31", query: "cop31" }, NOW + 2);
    setProjectOwner(hers.id, zeynep.id);
    setProjectOwner(his.id, mehmet.id);

    const all = listProjects(workspace.id);
    const names = (viewer: User | null) => visibleProjects(viewer, all).map((project) => project.name).sort();
    expect(names(zeynep)).toEqual(["Brezilya seçimleri", "Ortak konu"]);
    expect(names(mehmet)).toEqual(["COP31", "Ortak konu"]);
    // Yetkisi olmayan kurum yöneticisi kullanıcı gibi görür.
    expect(names(adminA)).toEqual(["Ortak konu"]);
    expect(names({ ...adminA, permissions: ["projects.viewAll"] })).toEqual(["Brezilya seçimleri", "COP31", "Ortak konu"]);
    // Tüm yetkilere sahip olsa da başka kurumun yöneticisi bu konuları göremez.
    expect(names(adminB)).toEqual(["Ortak konu"]);
    expect(names(sysadmin)).toHaveLength(3);
    expect(names(null)).toHaveLength(3);

    expect(canSeeProject(zeynep, his)).toBe(false);
    expect(canSeeProject(zeynep, hers)).toBe(true);
    expect(canSeeProject(mehmet, shared)).toBe(true);
    expect(canSeeProject(adminB, hers)).toBe(false);
  });
});

describe("denetim izi", () => {
  it("kayıt, işlemi yapanın kurumuna yazılır; kurum yöneticisi başka kurumun kaydını görmez", () => {
    recordAudit({ workspaceId: null, action: "sınama.a", objectType: "sınama", actor: zeynep.email }, NOW);
    recordAudit({ workspaceId: null, action: "sınama.b", objectType: "sınama", actor: adminB.email }, NOW);
    recordAudit({ workspaceId: null, action: "sınama.sistem", objectType: "sınama", actor: sysadmin.email, orgId: kurumA.id }, NOW);
    recordAudit({ workspaceId: null, action: "sınama.platform", objectType: "sınama", actor: sysadmin.email }, NOW);

    const actions = (orgId: string) => listOrgAuditEvents(orgId, 50).map((event) => event.action).filter((action) => action.startsWith("sınama."));
    expect(actions(kurumA.id).sort()).toEqual(["sınama.a", "sınama.sistem"]);
    expect(actions(kurumB.id)).toEqual(["sınama.b"]);
    expect(listAllAuditEvents(500).filter((event) => event.action.startsWith("sınama."))).toHaveLength(4);
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
