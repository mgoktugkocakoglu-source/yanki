import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { config } from "../config";
import { countUsers, createSession, deleteSession, getSessionUser, SESSION_TTL_MS, type User } from "../repositories/users";
import { isOrgAdmin, isSysadmin, type Viewer } from "./access";

/**
 * Oturum: çerezdeki anahtar veritabanındaki özetiyle eşleştirilir. Çerez
 * `httpOnly` ve `sameSite=lax`tır; üretimde yalnızca HTTPS üzerinden gider.
 */

const SESSION_COOKIE = "yanki_oturum";
export const LOGIN_PATH = "/giris";

/** En az bir kullanıcı tanımlandıysa panel oturum ister. */
export async function authEnabled(): Promise<boolean> {
  return (await countUsers()) > 0;
}

/**
 * İsteğin kullanıcısı. Bilerek önbelleğe alınmaz: bir sunucu işlevi krediyi
 * düştükten sonra aynı istekte çizilen sayfa güncel bakiyeyi göstermelidir.
 */
export async function currentUser(): Promise<User | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return token ? await getSessionUser(token, Date.now()) : null;
}

/**
 * Sayfalar ve sunucu işlevleri için: giriş zorunluysa ve oturum yoksa giriş
 * ekranına yönlendirir. Giriş zorunlu değilse null döner.
 */
export async function requireUser(): Promise<Viewer> {
  if (!(await authEnabled())) return null;
  const user = await currentUser();
  if (!user) redirect(LOGIN_PATH);
  return user;
}

/** Rolüne göre kişinin ana ekranı. */
export function homePath(viewer: Viewer): string {
  if (isSysadmin(viewer)) return "/sistem";
  return isOrgAdmin(viewer) ? "/yonetim" : "/ara";
}

/** Yalnızca sistem yöneticisi; giriş zorunlu değilse (hiç kullanıcı yok) null döner. */
export async function requireSysadmin(): Promise<Viewer> {
  const user = await requireUser();
  if (user && !isSysadmin(user)) redirect(homePath(user));
  return user;
}

/** Yalnızca kurum yöneticisi; giriş zorunlu değilse null döner. Sistem yöneticisi kendi paneline gider. */
export async function requireOrgAdmin(): Promise<Viewer> {
  const user = await requireUser();
  if (user && !isOrgAdmin(user)) redirect(homePath(user));
  return user;
}

/** Açık oturumun çerezdeki anahtarı (parola değişiminde bu oturum korunur). */
export async function currentToken(): Promise<string | null> {
  return (await cookies()).get(SESSION_COOKIE)?.value ?? null;
}

export async function startSession(userId: string): Promise<void> {
  const token = await createSession(userId, Date.now());
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: config.isProduction,
    path: "/",
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  });
}

export async function endSession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) await deleteSession(token);
  store.delete(SESSION_COOKIE);
}

/** Sunucu işlevinin başında çağrılır: giriş zorunluysa oturumu doğrular ve kullanıcıyı döndürür. */
export async function enterAction(): Promise<Viewer> {
  return requireUser();
}
