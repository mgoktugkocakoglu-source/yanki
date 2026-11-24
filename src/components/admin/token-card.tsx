import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { Logo } from "../brand";
import { BUTTON_SECONDARY } from "../ui";

/** Davet ve parola sıfırlama bağlantılarının açıldığı, panel dışı tek kartlı sayfa. */
export function TokenCard({ children }: { children: ReactNode }) {
  return (
    <main id="icerik" className="flex min-h-screen items-center justify-center bg-paper px-4 py-10">
      <div className="w-full max-w-[26rem]">
        <Link href="/" aria-label="Yankı ana sayfa" className="mb-6 inline-block rounded">
          <Logo />
        </Link>
        <div className="rounded-2xl border border-line bg-surface p-6 shadow-[var(--shadow-card)] sm:p-8">
          <Suspense fallback={<div className="skeleton h-64 rounded-lg" aria-hidden="true" />}>{children}</Suspense>
        </div>
      </div>
    </main>
  );
}

export function TokenHeading({ title, children }: { title: string; children: ReactNode }) {
  return (
    <>
      <h1 className="text-[1.375rem] font-semibold tracking-[-0.02em]">{title}</h1>
      <p className="mt-1 text-[0.9375rem] text-ink-soft">{children}</p>
    </>
  );
}

/** Geçersiz ya da süresi dolmuş bağlantı. */
export function TokenInvalid({ kind }: { kind: "davet" | "parola sıfırlama" }) {
  return (
    <>
      <TokenHeading title="Bağlantı geçerli değil">Bu {kind} bağlantısı kullanılmış, iptal edilmiş ya da süresi dolmuş. Yöneticinizden yenisini isteyin.</TokenHeading>
      <Link href="/giris" className={`${BUTTON_SECONDARY} mt-6`}>
        Giriş ekranına dön
      </Link>
    </>
  );
}
