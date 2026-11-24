import Link from "next/link";
import type { ReactNode } from "react";
import { PERMISSION_INFO, PERMISSIONS, ROLE_LABELS, type Permission } from "@/domain/permissions";
import { formatDateTime, formatNumber, formatRelative, formatSigned } from "@/lib/format";
import { canAssignCredits, canInvite, canManageAccount, isSysadmin } from "@/server/auth/access";
import { setUserRoleAction } from "@/server/actions/auth";
import type { Invitation } from "@/server/repositories/invitations";
import type { PoolEntry } from "@/server/repositories/organizations";
import type { User } from "@/server/repositories/users";
import { CreditForm, PermissionsForm, RowAction } from "../forms/admin-forms";
import { BUTTON_PRIMARY, BUTTON_SECONDARY, EmptyState, PageContainer } from "../ui";

/**
 * Sistem ve kurum yönetimi panellerinin ortak parçaları. Hangi düğmenin
 * görüneceğine `auth/access.ts` karar verir; aynı kural sunucu işlevinde
 * yeniden denetlenir.
 */

/** Hiç hesap yokken yönetim ekranlarının gösterdiği kurulum çağrısı. */
export function SetupPrompt() {
  return (
    <PageContainer>
      <EmptyState
        title="Henüz hesap tanımlı değil"
        action={
          <Link href="/giris" className={BUTTON_PRIMARY}>
            Sistem yöneticisi hesabını oluştur
          </Link>
        }
      >
        Panel şu an giriş istemeden açılıyor. Sistem yöneticisi hesabını oluşturduğunuzda giriş zorunlu olur; kurumları, kurum yöneticilerini ve yetkilerini siz tanımlarsınız.
      </EmptyState>
    </PageContainer>
  );
}

export interface Stat {
  label: string;
  value: ReactNode;
  note?: string;
}

export function StatTiles({ stats }: { stats: Stat[] }) {
  return (
    <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {stats.map((stat) => (
        <div key={stat.label} className="rounded-xl border border-line bg-surface p-4 shadow-[var(--shadow-card)]">
          <dt className="text-[0.8125rem] text-ink-muted">{stat.label}</dt>
          <dd className="reading mt-1 text-[1.5rem] font-semibold leading-tight">{stat.value}</dd>
          {stat.note ? <dd className="mt-0.5 text-[0.8125rem] text-ink-muted">{stat.note}</dd> : null}
        </div>
      ))}
    </dl>
  );
}

function Badge({ children }: { children: ReactNode }) {
  return <span className="rounded bg-sunken px-1.5 py-0.5 text-[0.75rem] font-medium text-ink-soft">{children}</span>;
}

/** Verilen ve verilmeyen yetkilerin tam listesi. */
export function PermissionSummary({ granted }: { granted: readonly Permission[] }) {
  return (
    <ul className="grid gap-2 sm:grid-cols-2">
      {PERMISSIONS.map((permission) => {
        const has = granted.includes(permission);
        return (
          <li key={permission} className="flex items-start gap-2.5 rounded-lg border border-line p-3">
            <span aria-hidden="true" className={`reading mt-0.5 w-4 shrink-0 text-center font-semibold ${has ? "text-positive-ink" : "text-ink-muted"}`}>
              {has ? "✓" : "–"}
            </span>
            <span>
              <span className="block text-[0.875rem] font-medium">
                {PERMISSION_INFO[permission].label} <span className="font-normal text-ink-muted">· {has ? "verildi" : "verilmedi"}</span>
              </span>
              <span className="block text-[0.8125rem] text-ink-muted">{PERMISSION_INFO[permission].description}</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

interface MemberListProps {
  members: User[];
  viewer: User;
  now: number;
}

export function MemberList({ members, viewer, now }: MemberListProps) {
  if (members.length === 0) return <p className="text-ink-soft">Henüz hesap yok. Davet edilen kişi bağlantısını açıp parolasını belirlediğinde burada görünür.</p>;
  const system = isSysadmin(viewer);
  return (
    <ul className="flex flex-col divide-y divide-line">
      {members.map((member) => {
        const manageable = canManageAccount(viewer, member);
        return (
          <li key={member.id} className="py-4 first:pt-0 last:pb-0">
            <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 font-medium">
                  {member.name}
                  <Badge>{ROLE_LABELS[member.role]}</Badge>
                  {member.id === viewer.id ? <Badge>siz</Badge> : null}
                  {member.disabledAt !== null ? <Badge>kapalı</Badge> : null}
                </p>
                <p className="reading break-all text-[0.8125rem] text-ink-soft">{member.email}</p>
                <p className="text-[0.75rem] text-ink-muted">
                  {member.lastLoginAt === null ? "Henüz giriş yapmadı" : `Son giriş ${formatRelative(member.lastLoginAt, now)}`} · {formatRelative(member.createdAt, now)} katıldı
                </p>
              </div>
              <div className="flex flex-wrap items-start justify-end gap-3">
                <p className="pt-1.5 text-[0.875rem] text-ink-soft">
                  <span className="reading text-[1.0625rem] font-semibold text-ink">{formatNumber(member.credits)}</span> kredi
                </p>
                {canAssignCredits(viewer, member) ? <CreditForm userId={member.id} name={member.name} /> : null}
                {manageable && member.disabledAt === null ? <RowAction kind="reset" fields={{ userId: member.id }} label="Parola sıfırla" /> : null}
                {manageable ? (
                  <RowAction
                    kind="disable"
                    fields={{ userId: member.id, disabled: member.disabledAt === null ? "1" : "0" }}
                    label={member.disabledAt === null ? "Hesabı kapat" : "Yeniden aç"}
                  />
                ) : null}
                {system && member.role !== "sysadmin" ? (
                  <form action={setUserRoleAction}>
                    <input type="hidden" name="userId" value={member.id} />
                    <input type="hidden" name="role" value={member.role === "admin" ? "analyst" : "admin"} />
                    <button type="submit" className={BUTTON_SECONDARY}>
                      {member.role === "admin" ? "Yöneticilikten al" : "Kurum yöneticisi yap"}
                    </button>
                  </form>
                ) : null}
              </div>
            </div>
            {system && member.role === "admin" ? (
              <details className="mt-3 rounded-lg bg-sunken/60 p-3" open={member.permissions.length === 0}>
                <summary className="cursor-pointer text-[0.875rem] font-medium">
                  Yetkiler{" "}
                  <span className="font-normal text-ink-muted">
                    · {member.permissions.length} / {PERMISSIONS.length} verildi
                  </span>
                </summary>
                <div className="mt-3">
                  <PermissionsForm userId={member.id} granted={member.permissions} />
                </div>
              </details>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

export function InvitationList({ invitations, viewer, now }: { invitations: Invitation[]; viewer: User; now: number }) {
  if (invitations.length === 0) return <p className="text-ink-soft">Bekleyen davet yok.</p>;
  return (
    <ul className="flex flex-col divide-y divide-line">
      {invitations.map((invitation) => {
        const expired = invitation.expiresAt <= now;
        return (
          <li key={invitation.id} className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2 py-3 first:pt-0 last:pb-0">
            <div className="min-w-0">
              <p className="flex flex-wrap items-center gap-2 font-medium">
                {invitation.name}
                <Badge>{ROLE_LABELS[invitation.role]}</Badge>
                <Badge>{expired ? "süresi doldu" : "bekliyor"}</Badge>
              </p>
              <p className="reading break-all text-[0.8125rem] text-ink-soft">{invitation.email}</p>
              <p className="text-[0.75rem] text-ink-muted">
                {invitation.invitedBy} tarafından {formatRelative(invitation.createdAt, now)} yetkilendirildi · {formatNumber(invitation.credits)} kredi ayrıldı
                {expired ? "" : ` · ${formatDateTime(invitation.expiresAt)} tarihine kadar geçerli`}
              </p>
            </div>
            {canInvite(viewer, invitation.orgId, invitation.role) ? <RowAction kind="revoke" fields={{ invitationId: invitation.id }} label="İptal et" /> : null}
          </li>
        );
      })}
    </ul>
  );
}

export function PoolLedger({ entries }: { entries: PoolEntry[] }) {
  if (entries.length === 0) return <p className="text-ink-soft">Henüz hareket yok.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[34rem] border-collapse text-left text-[0.875rem]">
        <thead>
          <tr className="text-[0.75rem] text-ink-muted">
            <th scope="col" className="pb-2 pr-4 font-medium">
              Zaman
            </th>
            <th scope="col" className="pb-2 pr-4 text-right font-medium">
              Havuz
            </th>
            <th scope="col" className="pb-2 pr-4 font-medium">
              Hareket
            </th>
            <th scope="col" className="pb-2 font-medium">
              Yapan
            </th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry, index) => (
            <tr key={index} className="border-t border-line align-top">
              <td className="reading whitespace-nowrap py-2 pr-4 text-ink-soft">{formatDateTime(entry.createdAt)}</td>
              <td className="reading whitespace-nowrap py-2 pr-4 text-right font-medium">{formatSigned(entry.delta)}</td>
              <td className="py-2 pr-4">
                <span className="first-letter:uppercase">{entry.reason}</span>
                {entry.userEmail ? <span className="reading ml-1.5 text-[0.8125rem] text-ink-muted">{entry.userEmail}</span> : null}
              </td>
              <td className="reading py-2 text-[0.8125rem] text-ink-soft">{entry.actor}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
