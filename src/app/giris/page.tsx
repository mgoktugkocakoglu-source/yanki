import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Logo } from "@/components/brand";
import { LoginForm, SetupForm } from "@/components/forms/auth-forms";
import { PASSWORD_MIN_LENGTH } from "@/server/auth/passwords";
import { authEnabled, currentUser, homePath } from "@/server/auth/session";
import { requestStart } from "@/server/context";

export const metadata: Metadata = { title: "Giriş" };

/** Giriş ekranı. Hiç kullanıcı yoksa sistem yöneticisi hesabının oluşturulduğu kurulum formu gösterilir. */
async function Entry() {
  await requestStart();
  if (!await authEnabled()) {
    return (
      <>
        <h1 className="text-[1.375rem] font-semibold tracking-[-0.02em]">Sistem yöneticisi hesabı</h1>
        <p className="mt-1 text-[0.9375rem] text-ink-soft">
          Bu hesap platformun sahibidir: kurumları açar, kurum yöneticilerini atar ve yetkilerini belirler. Oluşturulduğunda panel giriş istemeye başlar.
        </p>
        <div className="mt-6">
          <SetupForm minPasswordLength={PASSWORD_MIN_LENGTH} />
        </div>
      </>
    );
  }
  const user = await currentUser();
  if (user) redirect(homePath(user));
  return (
    <>
      <h1 className="text-[1.375rem] font-semibold tracking-[-0.02em]">Giriş yapın</h1>
      <p className="mt-1 text-[0.9375rem] text-ink-soft">Hesabınız, kurum yöneticinizin gönderdiği davet bağlantısıyla açılır.</p>
      <div className="mt-6">
        <LoginForm />
      </div>
    </>
  );
}

export default function LoginPage() {
  return (
    <main id="icerik" className="flex min-h-screen items-center justify-center bg-paper px-4 py-10">
      <div className="w-full max-w-[26rem]">
        <Link href="/" aria-label="Yankı ana sayfa" className="mb-6 inline-block rounded">
          <Logo />
        </Link>
        <div className="rounded-2xl border border-line bg-surface p-6 shadow-[var(--shadow-card)] sm:p-8">
          <Suspense fallback={<div className="skeleton h-64 rounded-lg" aria-hidden="true" />}>
            <Entry />
          </Suspense>
        </div>
      </div>
    </main>
  );
}
