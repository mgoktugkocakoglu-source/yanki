/**
 * Roller ve yetkiler.
 *
 * Üç katman vardır:
 *  - Sistem yöneticisi: platformun sahibi. Kurumları açar, kurum yöneticilerini
 *    atar, onlara yetki verir ve kurum kredi havuzlarını doldurur. Kurum dışıdır.
 *  - Kurum yöneticisi: kendi kurumunda, yalnızca sistem yöneticisinin verdiği
 *    yetkiler kadar iş yapar. Kendi yetkisini ya da başkasının rolünü değiştiremez.
 *  - Kullanıcı (analist): kendi konularında çalışır, kredisini harcar.
 */

export const USER_ROLES = ["sysadmin", "admin", "analyst"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const ROLE_LABELS: Record<UserRole, string> = {
  sysadmin: "Sistem yöneticisi",
  admin: "Kurum yöneticisi",
  analyst: "Kullanıcı",
};

/** Kurum yöneticisine tek tek verilebilen yetkiler. */
export const PERMISSIONS = ["users.invite", "users.manage", "credits.assign", "projects.viewAll", "audit.view"] as const;
export type Permission = (typeof PERMISSIONS)[number];

export const PERMISSION_INFO: Record<Permission, { label: string; description: string }> = {
  "users.invite": {
    label: "E-posta yetkilendirme",
    description: "Kuruma yeni kullanıcı davet eder; bekleyen daveti iptal eder.",
  },
  "users.manage": {
    label: "Hesap yönetimi",
    description: "Kullanıcı hesaplarını kapatır, yeniden açar ve parola sıfırlama bağlantısı üretir.",
  },
  "credits.assign": {
    label: "Kredi dağıtımı",
    description: "Kurum havuzundaki krediyi kullanıcılara dağıtır ya da geri alır.",
  },
  "projects.viewAll": {
    label: "Tüm konuları görme",
    description: "Kurumdaki bütün kullanıcıların izlediği konuları görür.",
  },
  "audit.view": {
    label: "Denetim izi",
    description: "Kurumdaki kullanıcıların işlem kayıtlarını görür.",
  },
};

export function isPermission(value: unknown): value is Permission {
  return typeof value === "string" && (PERMISSIONS as readonly string[]).includes(value);
}

/** Dışarıdan gelen listeyi tanınan, yinelenmeyen yetkilere indirger. */
export function cleanPermissions(values: readonly unknown[]): Permission[] {
  return PERMISSIONS.filter((permission) => values.includes(permission));
}
