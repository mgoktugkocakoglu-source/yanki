import type { Metadata } from "next";
import Link from "next/link";
import { SetupPrompt, StatTiles } from "@/components/admin/panels";
import { NewOrganizationForm } from "@/components/forms/admin-forms";
import { PageContainer, PageHeading, Panel } from "@/components/ui";
import { formatNumber } from "@/lib/format";
import { requireSysadmin } from "@/server/auth/session";
import { requestStart } from "@/server/context";
import { creditsSpentSince, listOrganizations } from "@/server/repositories/organizations";

export const metadata: Metadata = { title: "Sistem yönetimi" };

const MONTH_MS = 30 * 86_400_000;

/** Sistem yöneticisinin paneli: kurumlar, kredi havuzları ve genel durum. */
export default async function SystemPage() {
  const now = await requestStart();
  const viewer = await requireSysadmin();
  if (!viewer) return <SetupPrompt />;

  const organizations = listOrganizations();
  const accounts = organizations.reduce((sum, organization) => sum + organization.userCount, 0);
  const pooled = organizations.reduce((sum, organization) => sum + organization.creditPool, 0);
  const held = organizations.reduce((sum, organization) => sum + organization.userCredits, 0);

  return (
    <PageContainer>
      <PageHeading
        title="Sistem yönetimi"
        lead="Kurumları açın, kurum yöneticilerini atayın, yetkilerini belirleyin ve kredi havuzlarını doldurun. Kurum içindeki günlük işleri, verdiğiniz yetkiler ölçüsünde kurum yöneticisi yürütür."
      />

      <div className="flex flex-col gap-5">
        <StatTiles
          stats={[
            { label: "Kurum", value: formatNumber(organizations.length), note: `${formatNumber(organizations.filter((organization) => organization.suspendedAt !== null).length)} askıda` },
            { label: "Hesap", value: formatNumber(accounts), note: "kurum yöneticileri ve kullanıcılar" },
            { label: "Dağıtılmamış kredi", value: formatNumber(pooled), note: `kullanıcılarda ${formatNumber(held)}` },
            { label: "Son 30 günde harcanan", value: formatNumber(creditsSpentSince(null, now - MONTH_MS)), note: "tüm kurumlar" },
          ]}
        />

        <Panel title="Kurumlar">
          {organizations.length === 0 ? (
            <p className="text-ink-soft">Henüz kurum yok. Aşağıdan ilk kurumu açın; ardından kurumun sayfasında yöneticisini davet edin.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[44rem] border-collapse text-left text-[0.875rem]">
                <thead>
                  <tr className="text-[0.75rem] text-ink-muted">
                    <th scope="col" className="pb-2 pr-4 font-medium">
                      Kurum
                    </th>
                    <th scope="col" className="pb-2 pr-4 font-medium">
                      Durum
                    </th>
                    <th scope="col" className="pb-2 pr-4 text-right font-medium">
                      Yönetici
                    </th>
                    <th scope="col" className="pb-2 pr-4 text-right font-medium">
                      Hesap / koltuk
                    </th>
                    <th scope="col" className="pb-2 pr-4 text-right font-medium">
                      Havuz
                    </th>
                    <th scope="col" className="pb-2 text-right font-medium">
                      Kullanıcılarda
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {organizations.map((organization) => (
                    <tr key={organization.id} className="border-t border-line">
                      <th scope="row" className="py-2.5 pr-4 font-medium">
                        <Link href={`/sistem/kurum/${organization.id}`} className="text-brand-strong hover:underline">
                          {organization.name}
                        </Link>
                      </th>
                      <td className="py-2.5 pr-4 text-ink-soft">{organization.suspendedAt !== null ? "Askıda" : organization.adminCount === 0 ? "Yönetici atanmadı" : "Etkin"}</td>
                      <td className="reading py-2.5 pr-4 text-right">{formatNumber(organization.adminCount)}</td>
                      <td className="reading py-2.5 pr-4 text-right">
                        {formatNumber(organization.userCount)} / {organization.seatLimit === null ? "sınırsız" : formatNumber(organization.seatLimit)}
                      </td>
                      <td className="reading py-2.5 pr-4 text-right font-medium">{formatNumber(organization.creditPool)}</td>
                      <td className="reading py-2.5 text-right">{formatNumber(organization.userCredits)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <Panel title="Yeni kurum" hint="Kurum açıldıktan sonra kurum sayfasında yöneticisini davet eder ve yetkilerini seçersiniz.">
          <NewOrganizationForm />
        </Panel>
      </div>
    </PageContainer>
  );
}
