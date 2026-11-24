import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { EmptyState, PageContainer, PageHeading, Panel } from "@/components/ui";
import type { AuditEvent } from "@/domain/types";
import { formatDateTime } from "@/lib/format";
import { can, isSysadmin } from "@/server/auth/access";
import { homePath } from "@/server/auth/session";
import { loadWorkspaceContext } from "@/server/context";
import { listAllAuditEvents, listAuditEvents, listOrgAuditEvents } from "@/server/repositories/runs";

export const metadata: Metadata = { title: "Denetim izi" };

const PAGE_SIZE = 200;

/** Eylem kodlarının okunur karşılıkları. */
const ACTION_LABELS: Record<string, string> = {
  kurulum: "İlk kurulum",
  "haber-akışı.eklendi": "Haber akışı eklendi",
  "haber-akışı.açıldı": "Haber akışı açıldı",
  "haber-akışı.kapatıldı": "Haber akışı kapatıldı",
  "proje.oluşturuldu": "Proje oluşturuldu",
  "proje.güncellendi": "Proje güncellendi",
  "proje.silindi": "Proje silindi",
  "konular.güncellendi": "Konular güncellendi",
  "tarama.elle": "Elle tarama",
  "ton.düzeltildi": "Ton düzeltildi",
  "ilgisiz.işaretlendi": "İlgisiz işaretlendi",
  "ilgisiz.geri-alındı": "İlgisiz işareti kaldırıldı",
  "dışa-aktarım.csv": "CSV dışa aktarıldı",
  "oturum.açıldı": "Giriş yapıldı",
  "kullanıcı.oluşturuldu": "Hesap oluşturuldu",
  "kullanıcı.kapatıldı": "Hesap kapatıldı",
  "kullanıcı.açıldı": "Hesap yeniden açıldı",
  "kurum.oluşturuldu": "Kurum açıldı",
  "kurum.güncellendi": "Kurum bilgileri değişti",
  "kurum.askıya-alındı": "Kurum askıya alındı",
  "kurum.açıldı": "Kurumun askısı kaldırıldı",
  "havuz.değişti": "Kredi havuzu değişti",
  "kredi.değişti": "Kullanıcı kredisi değişti",
  "yetki.değişti": "Yetkiler değişti",
  "rol.değişti": "Rol değişti",
  "davet.oluşturuldu": "E-posta yetkilendirildi",
  "davet.iptal": "Davet iptal edildi",
  "davet.kabul": "Davet kabul edildi",
  "parola.sıfırlama-bağlantısı": "Parola sıfırlama bağlantısı üretildi",
  "parola.sıfırlandı": "Parola sıfırlandı",
  "parola.değişti": "Parola değişti",
};

export default async function AuditPage() {
  const { workspace, viewer } = await loadWorkspaceContext();
  // Kapsam role göre değişir: sistem yöneticisi tüm kayıtları, yetkili kurum yöneticisi
  // yalnızca kendi kurumununkileri görür; kullanıcılar bu ekrana giremez.
  let events: AuditEvent[];
  if (viewer === null) events = await listAuditEvents(workspace.id, PAGE_SIZE);
  else if (isSysadmin(viewer)) events = await listAllAuditEvents(PAGE_SIZE);
  else if (viewer.orgId !== null && can(viewer, "audit.view")) events = await listOrgAuditEvents(viewer.orgId, PAGE_SIZE);
  else redirect(homePath(viewer));

  return (
    <PageContainer>
      <PageHeading
        title="Denetim izi"
        lead="Kim, ne zaman, neyi değiştirdi ya da dışa aktardı. Kayıtlarda içerik metni tutulmaz; yalnızca eylem ve ilgili nesnenin kimliği yazılır."
      />
      {events.length === 0 ? (
        <EmptyState title="Henüz kayıt yok">Proje oluşturma, arama tanımı değişikliği, ton düzeltmesi ve dışa aktarma gibi eylemler burada listelenir.</EmptyState>
      ) : (
        <Panel>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[42rem] border-collapse text-left text-[0.875rem]">
              <thead>
                <tr className="text-[0.75rem] text-ink-muted">
                  <th scope="col" className="pb-2 pr-4 font-medium">
                    Zaman
                  </th>
                  <th scope="col" className="pb-2 pr-4 font-medium">
                    Kullanıcı
                  </th>
                  <th scope="col" className="pb-2 pr-4 font-medium">
                    Eylem
                  </th>
                  <th scope="col" className="pb-2 pr-4 font-medium">
                    Nesne
                  </th>
                  <th scope="col" className="pb-2 font-medium">
                    Ayrıntı
                  </th>
                </tr>
              </thead>
              <tbody>
                {events.map((event) => (
                  <tr key={event.id} className="border-t border-line align-top">
                    <td className="reading whitespace-nowrap py-2 pr-4 text-ink-soft">{formatDateTime(event.createdAt)}</td>
                    <td className="py-2 pr-4">{event.actor}</td>
                    <td className="py-2 pr-4 font-medium">{ACTION_LABELS[event.action] ?? event.action}</td>
                    <td className="py-2 pr-4 text-ink-soft">
                      {event.objectType}
                      {event.objectId ? <span className="reading ml-1.5 text-[0.75rem] text-ink-muted">{event.objectId.slice(0, 8)}</span> : null}
                    </td>
                    <td className="py-2 text-ink-soft">{event.detail ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}
    </PageContainer>
  );
}
