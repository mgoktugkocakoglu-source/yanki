import type { Metadata } from "next";
import { TokenCard, TokenHeading, TokenInvalid } from "@/components/admin/token-card";
import { TokenPasswordForm } from "@/components/forms/admin-forms";
import { ROLE_LABELS } from "@/domain/permissions";
import { PASSWORD_MIN_LENGTH } from "@/server/auth/passwords";
import { requestStart } from "@/server/context";
import { getInvitationByToken } from "@/server/repositories/invitations";
import { getOrganization } from "@/server/repositories/organizations";

export const metadata: Metadata = { title: "Davet", robots: { index: false, follow: false } };

/** Davet bağlantısı: yetkilendirilen kişi parolasını belirler ve hesabı açılır. */
async function Invitation({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const now = await requestStart();
  const invitation = await getInvitationByToken(token, now);
  const organization = invitation ? await getOrganization(invitation.orgId) : null;
  if (!invitation || !organization || organization.suspendedAt !== null) return <TokenInvalid kind="davet" />;

  return (
    <>
      <TokenHeading title={`Hoş geldiniz, ${invitation.name}`}>
        <span className="font-medium text-ink">{organization.name}</span> sizi Yankı&apos;ya {ROLE_LABELS[invitation.role].toLocaleLowerCase("tr")} olarak davet etti. Giriş e-postanız{" "}
        <span className="reading break-all font-medium text-ink">{invitation.email}</span>. Parolanızı belirleyin.
      </TokenHeading>
      <div className="mt-6">
        <TokenPasswordForm mode="invite" token={token} minLength={PASSWORD_MIN_LENGTH} />
      </div>
    </>
  );
}

export default function InvitationPage({ params }: PageProps<"/davet/[token]">) {
  return (
    <TokenCard>
      <Invitation params={params} />
    </TokenCard>
  );
}
