import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { InvitationList, MemberList, PoolLedger, SetupPrompt, StatTiles } from "@/components/admin/panels";
import { InviteForm, OrganizationSettingsForm, PoolForm } from "@/components/forms/admin-forms";
import { BUTTON_SECONDARY, PageContainer, PageHeading, Panel } from "@/components/ui";
import { formatNumber } from "@/lib/format";
import { requireSysadmin } from "@/server/auth/session";
import { setOrganizationSuspendedAction } from "@/server/actions/auth";
import { requestStart } from "@/server/context";
import { listOpenInvitations } from "@/server/repositories/invitations";
import { creditsSpentSince, getOrganization, listPoolLedger, seatsInUse } from "@/server/repositories/organizations";
import { listOrgUsers } from "@/server/repositories/users";

export const metadata: Metadata = { title: "Kurum" };

const MONTH_MS = 30 * 86_400_000;

/** Sistem yöneticisi için tek kurumun yönetimi: yöneticiler, yetkiler, hesaplar, davetler, havuz. */
export default async function OrganizationPage({ params }: PageProps<"/sistem/kurum/[id]">) {
  const { id } = await params;
  const now = await requestStart();
  const viewer = await requireSysadmin();
  if (!viewer) return <SetupPrompt />;
  const organization = await getOrganization(id);
  if (!organization) notFound();

  const members = await listOrgUsers(organization.id);
  const suspended = organization.suspendedAt !== null;

  return (
    <PageContainer>
      <p className="mb-2 text-[0.8125rem]">
        <Link href="/sistem" className="font-medium text-brand-strong hover:underline">
          ← Kurumlar
        </Link>
      </p>
      <PageHeading
        title={organization.name}
        lead={suspended ? "Kurum askıda: kullanıcıları giriş yapamaz. Verileri ve kredileri korunur." : "Kurumun yöneticilerini atayın, yetkilerini belirleyin ve kredi havuzunu yönetin."}
        actions={
          <form action={setOrganizationSuspendedAction}>
            <input type="hidden" name="orgId" value={organization.id} />
            <input type="hidden" name="suspended" value={suspended ? "0" : "1"} />
            <button type="submit" className={BUTTON_SECONDARY}>
              {suspended ? "Askıyı kaldır" : "Askıya al"}
            </button>
          </form>
        }
      />

      <div className="flex flex-col gap-5">
        <StatTiles
          stats={[
            { label: "Kredi havuzu", value: formatNumber(organization.creditPool), note: "dağıtılmayı bekleyen" },
            { label: "Kullanıcılardaki kredi", value: formatNumber(members.reduce((sum, member) => sum + member.credits, 0)) },
            {
              label: "Koltuk",
              value: `${formatNumber(await seatsInUse(organization.id, now))} / ${organization.seatLimit === null ? "∞" : formatNumber(organization.seatLimit)}`,
              note: "etkin hesaplar ve bekleyen davetler",
            },
            { label: "Son 30 günde harcanan", value: formatNumber(await creditsSpentSince(organization.id, now - MONTH_MS)) },
          ]}
        />

        <Panel title="Hesaplar" hint="Kurum yöneticisinin yetkilerini buradan verir ya da geri alırsınız. Yönetici kendi yetkisini değiştiremez.">
          <MemberList members={members} viewer={viewer} now={now} />
        </Panel>

        <Panel title="Kurum yöneticisi davet et" hint="Davet edilen kişi bağlantıyı açıp parolasını kendisi belirler. Seçtiğiniz yetkiler hesabı açıldığında tanımlanır.">
          <InviteForm orgId={organization.id} role="admin" allowCredits domains={organization.domains} />
        </Panel>

        <Panel title="Kullanıcı yetkilendir" hint="Kurum yöneticisine e-posta yetkilendirme yetkisi verdiyseniz bunu kendisi de yapabilir.">
          <InviteForm orgId={organization.id} role="analyst" allowCredits domains={organization.domains} />
        </Panel>

        <Panel title="Bekleyen davetler">
          <InvitationList invitations={await listOpenInvitations(organization.id)} viewer={viewer} now={now} />
        </Panel>

        <Panel title="Kredi havuzu" hint="Havuza yüklenen krediyi kurum içinde, kredi dağıtımı yetkisi olan yönetici kullanıcılara dağıtır.">
          <div className="grid gap-6 lg:grid-cols-[16rem_minmax(0,1fr)]">
            <PoolForm orgId={organization.id} />
            <PoolLedger entries={await listPoolLedger(organization.id, 30)} />
          </div>
        </Panel>

        <Panel title="Kurum bilgileri">
          <OrganizationSettingsForm orgId={organization.id} values={{ name: organization.name, seatLimit: organization.seatLimit, domains: organization.domains }} />
        </Panel>
      </div>
    </PageContainer>
  );
}
