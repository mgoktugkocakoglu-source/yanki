"use client";

import { useActionState } from "react";
import { loginAction, setupSysadminAction, type AuthState } from "@/server/actions/auth";
import { BUTTON_PRIMARY, INPUT } from "../ui";

const INITIAL: AuthState = { ok: false, message: "" };
const LABEL = "mb-1 block text-[0.875rem] font-medium";

function Status({ state, pending }: { state: AuthState; pending: boolean }) {
  return (
    <p role="status" aria-live="polite" className={`min-h-5 text-[0.875rem] ${state.ok ? "text-positive-ink" : "text-negative-ink"}`}>
      {pending ? "" : state.message}
    </p>
  );
}

export function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, INITIAL);
  return (
    <form action={action} className="flex flex-col gap-4">
      <div>
        <label htmlFor="giris-eposta" className={LABEL}>
          E-posta
        </label>
        <input id="giris-eposta" name="email" type="email" required autoComplete="username" className={INPUT} />
      </div>
      <div>
        <label htmlFor="giris-parola" className={LABEL}>
          Parola
        </label>
        <input id="giris-parola" name="password" type="password" required autoComplete="current-password" className={INPUT} />
      </div>
      <button type="submit" disabled={pending} className={BUTTON_PRIMARY}>
        {pending ? "Giriş yapılıyor…" : "Giriş yap"}
      </button>
      <Status state={state} pending={pending} />
    </form>
  );
}

export function SetupForm({ minPasswordLength }: { minPasswordLength: number }) {
  const [state, action, pending] = useActionState(setupSysadminAction, INITIAL);
  return (
    <form action={action} className="flex flex-col gap-4">
      <div>
        <label htmlFor="kurulum-ad" className={LABEL}>
          Ad soyad
        </label>
        <input id="kurulum-ad" name="name" type="text" required minLength={2} maxLength={80} autoComplete="name" className={INPUT} />
      </div>
      <div>
        <label htmlFor="kurulum-eposta" className={LABEL}>
          E-posta
        </label>
        <input id="kurulum-eposta" name="email" type="email" required autoComplete="username" className={INPUT} />
      </div>
      <div>
        <label htmlFor="kurulum-parola" className={LABEL}>
          Parola
        </label>
        <input
          id="kurulum-parola"
          name="password"
          type="password"
          required
          minLength={minPasswordLength}
          autoComplete="new-password"
          aria-describedby="kurulum-parola-notu"
          className={INPUT}
        />
        <p id="kurulum-parola-notu" className="mt-1 text-[0.8125rem] text-ink-muted">
          En az {minPasswordLength} karakter.
        </p>
      </div>
      <button type="submit" disabled={pending} className={BUTTON_PRIMARY}>
        {pending ? "Oluşturuluyor…" : "Sistem yöneticisi hesabını oluştur"}
      </button>
      <Status state={state} pending={pending} />
    </form>
  );
}
