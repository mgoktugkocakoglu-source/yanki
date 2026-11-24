import type { Metadata } from "next";
import { TokenCard, TokenHeading, TokenInvalid } from "@/components/admin/token-card";
import { TokenPasswordForm } from "@/components/forms/admin-forms";
import { PASSWORD_MIN_LENGTH } from "@/server/auth/passwords";
import { requestStart } from "@/server/context";
import { getResetTarget } from "@/server/repositories/invitations";

export const metadata: Metadata = { title: "Parola sıfırlama", robots: { index: false, follow: false } };

/** Yöneticinin ürettiği tek kullanımlık bağlantı: kişi yeni parolasını belirler. */
async function Reset({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const now = await requestStart();
  const target = await getResetTarget(token, now);
  if (!target) return <TokenInvalid kind="parola sıfırlama" />;

  return (
    <>
      <TokenHeading title="Yeni parola belirleyin">
        <span className="reading break-all font-medium text-ink">{target.email}</span> hesabı için yeni parolanızı yazın. Kaydettiğinizde açık oturumlarınız kapanır ve yeni parolayla giriş yaparsınız.
      </TokenHeading>
      <div className="mt-6">
        <TokenPasswordForm mode="reset" token={token} minLength={PASSWORD_MIN_LENGTH} />
      </div>
    </>
  );
}

export default function ResetPage({ params }: PageProps<"/parola/[token]">) {
  return (
    <TokenCard>
      <Reset params={params} />
    </TokenCard>
  );
}
