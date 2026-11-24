import { redirect } from "next/navigation";
import { homePath, requireUser } from "@/server/auth/session";
import { requestStart } from "@/server/context";

/** Eski adres: kişi rolüne göre kendi yönetim paneline gider. */
export default async function UsersRedirect() {
  await requestStart();
  const viewer = await requireUser();
  redirect(viewer ? homePath(viewer) : "/sistem");
}
