import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { InvitationList, MemberList, PermissionSummary, PoolLedger, SetupPrompt, StatTiles } from "@/components/admin/panels";
import { InviteForm } from "@/components/forms/admin-forms";
import { PageContainer, PageHeading, Panel } from "@/components/ui";
import { formatNumber } from "@/lib/format";
import { can, CREDIT_COSTS, CREDIT_LABELS, type CreditAction } from "@/server/auth/access";
import { requireOrgAdmin } from "@/server/auth/session";
import { requestStart } from "@/server/context";
import { listOpenInvitations } from "@/server/repositories/invitations";
import { creditsSpentSince, getOrganization, listPoolLedger, seatsInUse } from "@/server/repositories/organizations";
import { listOrgUsers } from "@/server/repositories/users";

export const metadata: Metadata = { title: "Kurum yönetimi" };

const MONTH_MS = 30 * 86_400_000;

/**
 * Kurum yöneticisinin paneli. Yönetici yalnızca kendi kurumunu görür ve
 * yalnızca sistem yöneticisinin verdiği yetkilerin bölümleri açılır.
 */
export default async function OrganizationAdminPage() {
  const now = await requestStart();
  const viewer = await requireOrgAdmin();
  if (!viewer) return <SetupPrompt />;
  const organization = viewer.orgId ? await getOrganization(viewer.orgId) : null;
  if (!organization) notFound();

  const members = await listOrgUsers(organization.id);
  const invitations = await listOpenInvitations(organization.id);
  const mayInvite = can(viewer, "users.invite");
  const mayAssign = can(viewer, "credits.assign");

  return (
    <PageContainer>
      <PageHeading
        title="Kurum yönetimi"
        lead={`${organization.name}: kurumunuzdaki hesaplar, davetler ve krediler. Bu ekranda yapabildikleriniz, sistem yöneticisinin size verdiği yetkilerle sınırlıdır.`}
      />

      <div className="flex flex-col gap-5">
        <StatTiles
          stats={[
            { label: "Kurum kredi havuzu", value: formatNumber(organization.creditPool), note: "dağıtılmayı bekleyen" },
            { label: "Kullanıcılardaki kredi", value: formatNumber(members.reduce((sum, member) => sum + member.credits, 0)) },
            {
              label: "Koltuk",
              value: `${formatNumber(await seatsInUse(organization.id, now))} / ${organization.seatLimit === null ? "∞" : formatNumber(organization.seatLimit)}`,
              note: "etkin hesaplar ve bekleyen davetler",
            },
            { label: "Son 30 günde harcanan", value: formatNumber(await creditsSpentSince(organization.id, now - MONTH_MS)) },
          ]}
        />

        <Panel title="Yetkileriniz" hint="Yetkileri sistem yöneticisi verir ve geri alır.">
          <PermissionSummary granted={viewer.permissions} />
        </Panel>

        {mayInvite ? (
          <Panel title="E-posta yetkilendir" hint="Yetkilendirdiğiniz kişi davet bağlantısını açıp parolasını kendisi belirler; hesabı o anda açılır.">
            <InviteForm role="analyst" allowCredits={mayAssign} domains={organization.domains} />
          </Panel>
        ) : null}

        <Panel title="Hesaplar">
          <MemberList members={members} viewer={viewer} now={now} />
        </Panel>

        {mayInvite || invitations.length > 0 ? (
          <Panel title="Bekleyen davetler">
            <InvitationList invitations={invitations} viewer={viewer} now={now} />
          </Panel>
        ) : null}

        {mayAssign ? (
          <Panel title="Havuz hareketleri" hint="Havuzu sistem yöneticisi doldurur; siz kullanıcılara dağıtırsınız.">
            <PoolLedger entries={await listPoolLedger(organization.id, 30)} />
          </Panel>
        ) : null}

        <Panel title="Kredi tarifesi" hint="Kredi yalnızca işlem başarıyla bittiğinde düşülür.">
          <dl className="grid gap-x-8 gap-y-2 sm:grid-cols-2">
            {(Object.keys(CREDIT_COSTS) as CreditAction[]).map((action) => (
              <div key={action} className="flex items-baseline justify-between gap-4 border-b border-line pb-2">
                <dt className="text-ink-soft first-letter:uppercase">{CREDIT_LABELS[action]}</dt>
                <dd className="reading font-medium">{CREDIT_COSTS[action]} kredi</dd>
              </div>
            ))}
          </dl>
        </Panel>
      </div>
    </PageContainer>
  );
}
