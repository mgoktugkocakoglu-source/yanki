"use client";

import { Check, Copy } from "lucide-react";
import { startTransition, useActionState, useEffect, useRef, useState, type FormEvent } from "react";
import { PERMISSION_INFO, PERMISSIONS, type Permission } from "@/domain/permissions";
import {
  acceptInvitationAction,
  addPoolCreditsAction,
  assignCreditsAction,
  changePasswordAction,
  createOrganizationAction,
  createResetLinkAction,
  inviteAction,
  resetPasswordAction,
  revokeInvitationAction,
  setPermissionsAction,
  setUserDisabledAction,
  updateOrganizationAction,
  type AuthState,
} from "@/server/actions/auth";
import { BUTTON_PRIMARY, BUTTON_SECONDARY, INPUT } from "../ui";

/** Yönetim panellerinin formları: kurum, yetki, davet, kredi ve parola. */

const INITIAL: AuthState = { ok: false, message: "" };
const LABEL = "mb-1 block text-[0.875rem] font-medium";
const NOTE = "mt-1 text-[0.8125rem] text-ink-muted";

type FormAction = (previous: AuthState, formData: FormData) => Promise<AuthState>;

/**
 * Form durumu. Tarayıcının işlev sonrası formu boşaltmasını engeller: hata
 * olduğunda yazılanlar (ve işaretlenen yetkiler) yerinde kalır, yalnızca
 * başarılı işlemden sonra form temizlenir.
 */
function useKeptForm(serverAction: FormAction) {
  const [state, action, pending] = useActionState(serverAction, INITIAL);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) ref.current?.reset();
  }, [state]);
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    startTransition(() => action(data));
  };
  return { state, action, pending, onSubmit, ref };
}

function Status({ state, pending }: { state: AuthState; pending: boolean }) {
  if (pending || state.message === "") return <p role="status" aria-live="polite" className="sr-only" />;
  return (
    <p role="status" aria-live="polite" className={`text-[0.875rem] ${state.ok ? "text-positive-ink" : "text-negative-ink"}`}>
      {state.ok ? "✓ " : "! "}
      {state.message}
    </p>
  );
}

/** Tek kullanımlık bağlantı: tam adres bir kez gösterilir ve kopyalanabilir. */
function OneTimeLink({ path, label }: { path: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const url = `${typeof window === "undefined" ? "" : window.location.origin}${path}`;
  return (
    <div className="rounded-lg border border-line-strong bg-sunken p-3">
      <label htmlFor={`baglanti-${path}`} className="mb-1 block text-[0.8125rem] font-medium">
        {label}
      </label>
      <div className="flex flex-wrap gap-2">
        <input id={`baglanti-${path}`} readOnly value={url} onFocus={(event) => event.currentTarget.select()} className={`${INPUT} reading min-w-0 flex-1 text-[0.8125rem]`} />
        <button
          type="button"
          className={BUTTON_SECONDARY}
          onClick={() => {
            void navigator.clipboard.writeText(url).then(() => setCopied(true));
          }}
        >
          {copied ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
          {copied ? "Kopyalandı" : "Kopyala"}
        </button>
      </div>
      <p className={NOTE}>Bağlantıyı kişiye güvenli bir yoldan iletin. Sayfayı kapattığınızda yeniden gösterilmez.</p>
    </div>
  );
}

function PermissionBoxes({ idPrefix, granted }: { idPrefix: string; granted: readonly Permission[] }) {
  return (
    <fieldset>
      <legend className={LABEL}>Yetkiler</legend>
      <ul className="grid gap-2 sm:grid-cols-2">
        {PERMISSIONS.map((permission) => (
          <li key={permission}>
            <label htmlFor={`${idPrefix}-${permission}`} className="flex h-full cursor-pointer items-start gap-2.5 rounded-lg border border-line p-3 hover:border-line-strong">
              <input id={`${idPrefix}-${permission}`} type="checkbox" name="permissions" value={permission} defaultChecked={granted.includes(permission)} className="mt-1" />
              <span>
                <span className="block text-[0.875rem] font-medium">{PERMISSION_INFO[permission].label}</span>
                <span className="block text-[0.8125rem] text-ink-muted">{PERMISSION_INFO[permission].description}</span>
              </span>
            </label>
          </li>
        ))}
      </ul>
    </fieldset>
  );
}

/* ── Kurum ────────────────────────────────────────────────────────────── */

interface OrganizationFields {
  name: string;
  seatLimit: number | null;
  domains: string[];
}

function OrganizationInputs({ idPrefix, values }: { idPrefix: string; values?: OrganizationFields }) {
  return (
    <>
      <div className="sm:col-span-2">
        <label htmlFor={`${idPrefix}-ad`} className={LABEL}>
          Kurum adı
        </label>
        <input id={`${idPrefix}-ad`} name="name" type="text" required minLength={2} maxLength={120} defaultValue={values?.name} autoComplete="off" className={INPUT} />
      </div>
      <div>
        <label htmlFor={`${idPrefix}-koltuk`} className={LABEL}>
          Koltuk sınırı
        </label>
        <input
          id={`${idPrefix}-koltuk`}
          name="seatLimit"
          type="number"
          min={1}
          max={100000}
          defaultValue={values?.seatLimit ?? ""}
          aria-describedby={`${idPrefix}-koltuk-notu`}
          className={INPUT}
        />
        <p id={`${idPrefix}-koltuk-notu`} className={NOTE}>
          Etkin hesap ve bekleyen davet toplamı. Boş bırakılırsa sınırsız.
        </p>
      </div>
      <div>
        <label htmlFor={`${idPrefix}-alan`} className={LABEL}>
          İzinli e-posta alan adları
        </label>
        <input
          id={`${idPrefix}-alan`}
          name="domains"
          type="text"
          defaultValue={values?.domains.join(", ")}
          placeholder="kurum.gov.tr"
          autoComplete="off"
          aria-describedby={`${idPrefix}-alan-notu`}
          className={INPUT}
        />
        <p id={`${idPrefix}-alan-notu`} className={NOTE}>
          Virgülle ayırın. Boş bırakılırsa her adres yetkilendirilebilir.
        </p>
      </div>
    </>
  );
}

export function NewOrganizationForm() {
  const { state, action, pending, onSubmit, ref } = useKeptForm(createOrganizationAction);
  return (
    <form ref={ref} action={action} onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
      <OrganizationInputs idPrefix="yeni-kurum" />
      <div>
        <label htmlFor="yeni-kurum-havuz" className={LABEL}>
          Başlangıç kredi havuzu
        </label>
        <input id="yeni-kurum-havuz" name="pool" type="number" min={0} max={1000000} defaultValue={1000} required className={INPUT} />
      </div>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <button type="submit" disabled={pending} className={BUTTON_PRIMARY}>
          {pending ? "Açılıyor…" : "Kurumu aç"}
        </button>
        <Status state={state} pending={pending} />
      </div>
    </form>
  );
}

export function OrganizationSettingsForm({ orgId, values }: { orgId: string; values: OrganizationFields }) {
  const { state, action, pending, onSubmit, ref } = useKeptForm(updateOrganizationAction);
  return (
    <form ref={ref} action={action} onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
      <input type="hidden" name="orgId" value={orgId} />
      <OrganizationInputs idPrefix="kurum" values={values} />
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <button type="submit" disabled={pending} className={BUTTON_SECONDARY}>
          {pending ? "Kaydediliyor…" : "Kaydet"}
        </button>
        <Status state={state} pending={pending} />
      </div>
    </form>
  );
}

export function PoolForm({ orgId }: { orgId: string }) {
  const { state, action, pending, onSubmit, ref } = useKeptForm(addPoolCreditsAction);
  return (
    <form ref={ref} action={action} onSubmit={onSubmit} className="flex flex-col gap-2">
      <input type="hidden" name="orgId" value={orgId} />
      <label htmlFor="havuz-tutar" className={LABEL}>
        Havuza yüklenecek kredi
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <input id="havuz-tutar" name="amount" type="number" min={-1000000} max={1000000} defaultValue={500} required aria-describedby="havuz-notu" className={`${INPUT} w-32`} />
        <button type="submit" disabled={pending} className={BUTTON_PRIMARY}>
          {pending ? "Yükleniyor…" : "Yükle"}
        </button>
      </div>
      <p id="havuz-notu" className={NOTE}>
        Eksi sayı, dağıtılmamış krediyi havuzdan geri alır.
      </p>
      <Status state={state} pending={pending} />
    </form>
  );
}

/* ── Yetkiler ─────────────────────────────────────────────────────────── */

export function PermissionsForm({ userId, granted }: { userId: string; granted: readonly Permission[] }) {
  const { state, action, pending, onSubmit, ref } = useKeptForm(setPermissionsAction);
  return (
    <form ref={ref} action={action} onSubmit={onSubmit} className="flex flex-col gap-3">
      <input type="hidden" name="userId" value={userId} />
      <PermissionBoxes idPrefix={`yetki-${userId}`} granted={granted} />
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className={BUTTON_SECONDARY}>
          {pending ? "Kaydediliyor…" : "Yetkileri kaydet"}
        </button>
        <Status state={state} pending={pending} />
      </div>
    </form>
  );
}

/* ── Davet ────────────────────────────────────────────────────────────── */

interface InviteFormProps {
  /** Sistem yöneticisi için hedef kurum; kurum yöneticisinde sunucu kendi kurumunu kullanır. */
  orgId?: string;
  /** Davet edilecek rol. Kurum yöneticisini yalnızca sistem yöneticisi davet eder. */
  role: "admin" | "analyst";
  /** Davetle birlikte kredi tanımlanabilir mi? */
  allowCredits: boolean;
  /** İzinli alan adları (bilgi için). */
  domains: readonly string[];
}

export function InviteForm({ orgId, role, allowCredits, domains }: InviteFormProps) {
  const { state, action, pending, onSubmit, ref } = useKeptForm(inviteAction);
  const id = `davet-${role}`;
  return (
    <form ref={ref} action={action} onSubmit={onSubmit} className="flex flex-col gap-4">
      {orgId ? <input type="hidden" name="orgId" value={orgId} /> : null}
      <input type="hidden" name="role" value={role} />
      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label htmlFor={`${id}-ad`} className={LABEL}>
            Ad soyad
          </label>
          <input id={`${id}-ad`} name="name" type="text" required minLength={2} maxLength={80} autoComplete="off" className={INPUT} />
        </div>
        <div>
          <label htmlFor={`${id}-eposta`} className={LABEL}>
            E-posta
          </label>
          <input id={`${id}-eposta`} name="email" type="email" required autoComplete="off" aria-describedby={domains.length > 0 ? `${id}-alan` : undefined} className={INPUT} />
          {domains.length > 0 ? (
            <p id={`${id}-alan`} className={NOTE}>
              İzinli alan adları: {domains.join(", ")}
            </p>
          ) : null}
        </div>
        {allowCredits ? (
          <div>
            <label htmlFor={`${id}-kredi`} className={LABEL}>
              Başlangıç kredisi
            </label>
            <input
              id={`${id}-kredi`}
              name="credits"
              type="number"
              min={0}
              max={1000000}
              defaultValue={role === "admin" ? 0 : 100}
              required
              aria-describedby={`${id}-kredi-notu`}
              className={INPUT}
            />
            <p id={`${id}-kredi-notu`} className={NOTE}>
              Kurum havuzundan ayrılır.
            </p>
          </div>
        ) : null}
      </div>
      {role === "admin" ? <PermissionBoxes idPrefix={id} granted={[]} /> : null}
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className={BUTTON_PRIMARY}>
          {pending ? "Yetkilendiriliyor…" : role === "admin" ? "Kurum yöneticisi davet et" : "E-postayı yetkilendir"}
        </button>
        <Status state={state} pending={pending} />
      </div>
      {state.ok && state.link && !pending ? <OneTimeLink path={state.link} label="Davet bağlantısı" /> : null}
    </form>
  );
}

/* ── Satır eylemleri ──────────────────────────────────────────────────── */

export function CreditForm({ userId, name }: { userId: string; name: string }) {
  const { state, action, pending, onSubmit, ref } = useKeptForm(assignCreditsAction);
  return (
    <form ref={ref} action={action} onSubmit={onSubmit} className="flex flex-col items-end gap-1">
      <input type="hidden" name="userId" value={userId} />
      <div className="flex items-center gap-2">
        <label htmlFor={`kredi-${userId}`} className="sr-only">
          {name} için havuzdan verilecek kredi (geri almak için eksi sayı)
        </label>
        <input id={`kredi-${userId}`} name="amount" type="number" min={-1000000} max={1000000} defaultValue={50} required className={`${INPUT} w-24`} />
        <button type="submit" disabled={pending} className={`${BUTTON_SECONDARY} whitespace-nowrap`}>
          Kredi ver
        </button>
      </div>
      <Status state={state} pending={pending} />
    </form>
  );
}

const ROW_ACTIONS = {
  disable: setUserDisabledAction,
  reset: createResetLinkAction,
  revoke: revokeInvitationAction,
} as const;

interface RowActionProps {
  kind: keyof typeof ROW_ACTIONS;
  /** Gizli alanlar: hedef kimliği ve varsa ek değerler. */
  fields: Record<string, string>;
  label: string;
}

/** Tek düğmeli satır eylemi; sonucu (ve üretilen bağlantıyı) düğmenin altında gösterir. */
export function RowAction({ kind, fields, label }: RowActionProps) {
  const { state, action, pending, onSubmit, ref } = useKeptForm(ROW_ACTIONS[kind]);
  return (
    <form ref={ref} action={action} onSubmit={onSubmit} className="flex flex-col items-end gap-1">
      {Object.entries(fields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <button type="submit" disabled={pending} className={`${BUTTON_SECONDARY} whitespace-nowrap`}>
        {label}
      </button>
      <Status state={state} pending={pending} />
      {state.ok && state.link && !pending ? <OneTimeLink path={state.link} label="Parola sıfırlama bağlantısı" /> : null}
    </form>
  );
}

/* ── Parola ───────────────────────────────────────────────────────────── */

function NewPasswordInputs({ idPrefix, minLength }: { idPrefix: string; minLength: number }) {
  return (
    <>
      <div>
        <label htmlFor={`${idPrefix}-parola`} className={LABEL}>
          Yeni parola
        </label>
        <input
          id={`${idPrefix}-parola`}
          name="password"
          type="password"
          required
          minLength={minLength}
          autoComplete="new-password"
          aria-describedby={`${idPrefix}-notu`}
          className={INPUT}
        />
        <p id={`${idPrefix}-notu`} className={NOTE}>
          En az {minLength} karakter.
        </p>
      </div>
      <div>
        <label htmlFor={`${idPrefix}-tekrar`} className={LABEL}>
          Yeni parola (tekrar)
        </label>
        <input id={`${idPrefix}-tekrar`} name="passwordRepeat" type="password" required minLength={minLength} autoComplete="new-password" className={INPUT} />
      </div>
    </>
  );
}

/** Davet kabulü ve parola sıfırlama: bağlantıyı açan kişi parolasını belirler. */
export function TokenPasswordForm({ mode, token, minLength }: { mode: "invite" | "reset"; token: string; minLength: number }) {
  const { state, action, pending, onSubmit, ref } = useKeptForm(mode === "invite" ? acceptInvitationAction : resetPasswordAction);
  return (
    <form ref={ref} action={action} onSubmit={onSubmit} className="flex flex-col gap-4">
      <input type="hidden" name="token" value={token} />
      <NewPasswordInputs idPrefix={mode} minLength={minLength} />
      <button type="submit" disabled={pending} className={BUTTON_PRIMARY}>
        {pending ? "Kaydediliyor…" : mode === "invite" ? "Hesabımı oluştur" : "Parolayı kaydet"}
      </button>
      <Status state={state} pending={pending} />
    </form>
  );
}

export function ChangePasswordForm({ minLength }: { minLength: number }) {
  const { state, action, pending, onSubmit, ref } = useKeptForm(changePasswordAction);
  return (
    <form ref={ref} action={action} onSubmit={onSubmit} className="grid max-w-[28rem] gap-4">
      <div>
        <label htmlFor="mevcut-parola" className={LABEL}>
          Mevcut parola
        </label>
        <input id="mevcut-parola" name="current" type="password" required autoComplete="current-password" className={INPUT} />
      </div>
      <NewPasswordInputs idPrefix="degistir" minLength={minLength} />
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className={BUTTON_PRIMARY}>
          {pending ? "Değiştiriliyor…" : "Parolayı değiştir"}
        </button>
        <Status state={state} pending={pending} />
      </div>
    </form>
  );
}
