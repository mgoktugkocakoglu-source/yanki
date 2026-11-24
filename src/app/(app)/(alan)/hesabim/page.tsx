import type { Metadata } from "next";
import { PermissionSummary, SetupPrompt } from "@/components/admin/panels";
import { ChangePasswordForm } from "@/components/forms/admin-forms";
import { PageContainer, PageHeading, Panel } from "@/components/ui";
import { ROLE_LABELS } from "@/domain/permissions";
import { formatDateTime, formatNumber, formatSigned } from "@/lib/format";
import { CREDIT_COSTS, CREDIT_LABELS, type CreditAction } from "@/server/auth/access";
import { PASSWORD_MIN_LENGTH } from "@/server/auth/passwords";
import { requireUser } from "@/server/auth/session";
import { requestStart } from "@/server/context";
import { getOrganization } from "@/server/repositories/organizations";
import { listLedger } from "@/server/repositories/users";

export const metadata: Metadata = { title: "Hesabım" };

/** Kişinin kendi hesabı: kimlik bilgileri, kredi hareketleri ve parola. */
export default async function AccountPage() {
  await requestStart();
  const viewer = await requireUser();
  if (!viewer) return <SetupPrompt />;

  const organization = viewer.orgId ? getOrganization(viewer.orgId) : null;
  const ledger = viewer.role === "sysadmin" ? [] : listLedger(viewer.id, 40);
  const facts: [string, string][] = [
    ["Ad soyad", viewer.name],
    ["E-posta", viewer.email],
    ["Rol", ROLE_LABELS[viewer.role]],
    ["Kurum", organization?.name ?? "Kurum dışı (platform)"],
    ["Son giriş", viewer.lastLoginAt === null ? "—" : formatDateTime(viewer.lastLoginAt)],
  ];

  return (
    <PageContainer>
      <PageHeading title="Hesabım" />
      <div className="flex max-w-[60rem] flex-col gap-5">
        <Panel title="Bilgiler" hint="Ad ve e-posta değişikliği için yöneticinize başvurun.">
          <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
            {facts.map(([label, value]) => (
              <div key={label}>
                <dt className="text-[0.8125rem] text-ink-muted">{label}</dt>
                <dd className="break-words font-medium">{value}</dd>
              </div>
            ))}
          </dl>
        </Panel>

        {viewer.role === "admin" ? (
          <Panel title="Yetkilerim" hint="Yetkileri sistem yöneticisi verir ve geri alır.">
            <PermissionSummary granted={viewer.permissions} />
          </Panel>
        ) : null}

        {viewer.role === "sysadmin" ? null : (
          <Panel
            title="Kredilerim"
            hint="Krediyi kurum yöneticiniz kurum havuzundan dağıtır."
            aside={
              <span>
                Kalan <span className="reading text-[1.0625rem] font-semibold text-ink">{formatNumber(viewer.credits)}</span>
              </span>
            }
          >
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_16rem]">
              {ledger.length === 0 ? (
                <p className="text-ink-soft">Henüz kredi hareketi yok.</p>
              ) : (
                <table className="w-full border-collapse text-left text-[0.875rem]">
                  <thead>
                    <tr className="text-[0.75rem] text-ink-muted">
                      <th scope="col" className="pb-2 pr-4 font-medium">
                        Zaman
                      </th>
                      <th scope="col" className="pb-2 pr-4 font-medium">
                        Hareket
                      </th>
                      <th scope="col" className="pb-2 text-right font-medium">
                        Kredi
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {ledger.map((entry, index) => (
                      <tr key={index} className="border-t border-line">
                        <td className="reading whitespace-nowrap py-2 pr-4 text-ink-soft">{formatDateTime(entry.createdAt)}</td>
                        <td className="py-2 pr-4 first-letter:uppercase">{entry.reason}</td>
                        <td className="reading py-2 text-right font-medium">{formatSigned(entry.delta)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <dl className="flex flex-col gap-2 self-start rounded-lg bg-sunken/60 p-3 text-[0.875rem]">
                {(Object.keys(CREDIT_COSTS) as CreditAction[]).map((action) => (
                  <div key={action} className="flex items-baseline justify-between gap-4">
                    <dt className="text-ink-soft first-letter:uppercase">{CREDIT_LABELS[action]}</dt>
                    <dd className="reading font-medium">{CREDIT_COSTS[action]}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </Panel>
        )}

        <Panel title="Parola" hint="Parolanızı değiştirdiğinizde diğer cihazlardaki oturumlarınız kapanır.">
          <ChangePasswordForm minLength={PASSWORD_MIN_LENGTH} />
        </Panel>
      </div>
    </PageContainer>
  );
}
