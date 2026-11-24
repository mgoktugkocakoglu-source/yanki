import type { Permission } from "@/domain/permissions";
import type { Project } from "@/domain/types";
import { adjustCredits, listProjectOwners, type ProjectOwner, type User } from "../repositories/users";

/**
 * Erişim ve kredi kuralları (saf işlevler; oturumdan bağımsız sınanır).
 * Kimin neyi yapabildiği yalnızca burada tanımlıdır; sayfalar ve sunucu
 * işlevleri bu işlevleri çağırır, kendi rol karşılaştırmasını yazmaz.
 *
 * `viewer` null ise giriş zorunlu değildir (hiç kullanıcı tanımlanmamış yerel
 * kurulum): her şey görünür, kredi düşülmez, yönetim ekranları kapalıdır.
 */

export type Viewer = User | null;

/** İşlem başına kredi. Sistem yöneticisinden ve girişsiz kurulumda düşülmez. */
export const CREDIT_COSTS = {
  search: 1,
  ask: 2,
  summary: 5,
  classify: 5,
  claims: 10,
} as const;
export type CreditAction = keyof typeof CREDIT_COSTS;

export const CREDIT_LABELS: Record<CreditAction, string> = {
  search: "arama",
  ask: "soru",
  summary: "yapay zekâ özeti",
  classify: "sınıflandırma",
  claims: "iddia taraması",
};

/* ── Roller ve yetkiler ───────────────────────────────────────────────── */

export function isSysadmin(viewer: Viewer): viewer is User & { role: "sysadmin" } {
  return viewer?.role === "sysadmin";
}

/** Kurum yöneticisi mi (yetkilerinden bağımsız)? */
export function isOrgAdmin(viewer: Viewer): viewer is User & { role: "admin"; orgId: string } {
  return viewer?.role === "admin" && viewer.orgId !== null;
}

/**
 * Kişinin yetkisi var mı? Sistem yöneticisi her yetkiye sahiptir; kurum
 * yöneticisi yalnızca kendisine verilenlere; kullanıcı hiçbirine.
 */
export function can(viewer: Viewer, permission: Permission): boolean {
  if (isSysadmin(viewer)) return true;
  return isOrgAdmin(viewer) && viewer.permissions.includes(permission);
}

/** Bu kuruma, bu rolde birini davet edebilir mi? Kurum yöneticisini yalnızca sistem yöneticisi atar. */
export function canInvite(viewer: Viewer, orgId: string, role: "admin" | "analyst"): boolean {
  if (isSysadmin(viewer)) return true;
  return role === "analyst" && isOrgAdmin(viewer) && viewer.orgId === orgId && can(viewer, "users.invite");
}

/**
 * Hesabı kapatabilir / parolasını sıfırlatabilir mi? Kurum yöneticisi yalnızca
 * kendi kurumundaki kullanıcıları yönetir; diğer yöneticilere ve kendine dokunamaz.
 */
export function canManageAccount(viewer: Viewer, target: User): boolean {
  if (!viewer || viewer.id === target.id || target.role === "sysadmin") return false;
  if (isSysadmin(viewer)) return true;
  return target.role === "analyst" && target.orgId === viewer.orgId && can(viewer, "users.manage");
}

/** Kurum havuzundan bu kişiye kredi aktarabilir mi? Hedef bir kuruma bağlı olmalıdır. */
export function canAssignCredits(viewer: Viewer, target: User): boolean {
  if (!viewer || target.orgId === null) return false;
  if (isSysadmin(viewer)) return true;
  return target.orgId === viewer.orgId && can(viewer, "credits.assign");
}

/** E-posta kurumun izinli alan adlarından birinde mi? Liste boşsa her adres kabul edilir. */
export function emailAllowed(domains: readonly string[], email: string): boolean {
  if (domains.length === 0) return true;
  const domain = email.trim().toLowerCase().split("@").pop() ?? "";
  return domains.includes(domain);
}

const DOMAIN_PATTERN = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/;

/** Serbest metinden alan adı listesi: virgül, boşluk ya da satırla ayrılır; baştaki @ atılır. */
export function parseDomains(text: string): { domains: string[]; invalid: string[] } {
  const entries = text
    .split(/[\s,;]+/)
    .map((entry) => entry.trim().toLowerCase().replace(/^@/, ""))
    .filter((entry) => entry !== "");
  return {
    domains: [...new Set(entries.filter((entry) => DOMAIN_PATTERN.test(entry)))],
    invalid: entries.filter((entry) => !DOMAIN_PATTERN.test(entry)),
  };
}

/* ── Konu görünürlüğü ─────────────────────────────────────────────────── */

/**
 * Kullanıcı kendi konularını ve sahibi olmayan (ortak) konuları görür. Kurum
 * yöneticisi, yetkisi varsa kendi kurumundaki herkesin konularını da görür;
 * başka kurumun konusunu hiçbir kurum yöneticisi göremez. Sistem yöneticisi
 * hepsini görür.
 */
export function visibleProjects(viewer: Viewer, projects: Project[], owners: ReadonlyMap<string, ProjectOwner>): Project[] {
  if (viewer === null || isSysadmin(viewer)) return projects;
  const wholeOrg = can(viewer, "projects.viewAll");
  return projects.filter((project) => {
    const owner = owners.get(project.id);
    if (owner === undefined || owner.userId === viewer.id) return true;
    return wholeOrg && owner.orgId !== null && owner.orgId === viewer.orgId;
  });
}

export function canSeeProject(viewer: Viewer, project: Project, owners: ReadonlyMap<string, ProjectOwner>): boolean {
  return visibleProjects(viewer, [project], owners).length === 1;
}

/** `visibleProjects`, konu sahiplerini veritabanından yükleyerek. */
export async function loadVisibleProjects(viewer: Viewer, projects: Project[]): Promise<Project[]> {
  if (viewer === null || isSysadmin(viewer)) return projects;
  return visibleProjects(viewer, projects, await listProjectOwners());
}

/** `canSeeProject`, konu sahiplerini veritabanından yükleyerek. */
export async function loadCanSeeProject(viewer: Viewer, project: Project): Promise<boolean> {
  return (await loadVisibleProjects(viewer, [project])).length === 1;
}

/* ── Krediler ─────────────────────────────────────────────────────────── */

function isUnmetered(viewer: Viewer): boolean {
  return viewer === null || isSysadmin(viewer);
}

/** Kredi yetmiyorsa kullanıcıya gösterilecek ileti, yetiyorsa null. Düşüm yapmaz. */
export function creditShortage(viewer: Viewer, action: CreditAction): string | null {
  if (isUnmetered(viewer)) return null;
  const cost = CREDIT_COSTS[action];
  return viewer!.credits >= cost ? null : `Bu işlem ${cost} kredi gerektiriyor; kalan krediniz ${viewer!.credits}. Kurum yöneticinizden kredi isteyin.`;
}

/** İşlem başarıyla bittikten sonra krediyi düşer. Düşülemezse (eşzamanlı harcama) false döner. */
export async function spendCredits(viewer: Viewer, action: CreditAction, objectId: string | null, now: number): Promise<boolean> {
  if (isUnmetered(viewer)) return true;
  return await adjustCredits(viewer!.id, -CREDIT_COSTS[action], CREDIT_LABELS[action], objectId, now);
}
