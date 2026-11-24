import type { TimeRange } from "@/domain/types";
import { formatNumber } from "@/lib/format";
import type { RangeKey } from "@/lib/time";
import { getAiProvider } from "@/server/ai/provider";
import { countAiClassified } from "@/server/repositories/mentions";
import { CLASSIFY_RUN_LIMIT } from "@/server/services/ai-classify";
import { AiClassifyButton } from "./forms/ai-classify-button";

/**
 * Duygu dağılımının altındaki not: tonun neyle belirlendiğini söyler ve
 * sağlayıcı açıksa dil modeliyle sınıflandırmayı başlatır.
 */
export async function AiClassifyNote({ projectId, rangeKey, range, total }: { projectId: string; rangeKey: RangeKey; range: TimeRange; total: number }) {
  const provider = getAiProvider();
  const classified = await countAiClassified({ projectId, range });
  const remaining = total - classified;

  return (
    <div className="mt-4 border-t border-line pt-3 text-[0.8125rem] text-ink-muted">
      {classified === 0 ? (
        <p>Ton, sözlük ve kural tabanlı bir çözümleyiciyle belirlenir; yanlış bulduğunuz içeriği Bahsedilmeler ekranında düzeltebilirsiniz.</p>
      ) : (
        <p>
          {remaining > 0
            ? `Dönemdeki ${formatNumber(total)} içeriğin ${formatNumber(classified)} tanesinde ton dil modeliyle, kalanında sözlük ve kurallarla belirlendi.`
            : `Dönemdeki ${formatNumber(total)} içeriğin tümünde ton dil modeliyle belirlendi.`}{" "}
          İnsan düzeltmesi her zaman önceliklidir.
        </p>
      )}
      {provider && remaining > 0 ? (
        <p className="mt-2">
          Sınıflandırmada içerik metinleri {provider.label} hizmetine (<span className="reading">{provider.classifyModel}</span>) gönderilir ve kullanım ücretlendirilir. Her
          basışta en çok {formatNumber(CLASSIFY_RUN_LIMIT)} içerik işlenir.
        </p>
      ) : null}
      {/* Sıra bittiğinde de yerinde kalır; son çalıştırmanın sonucu kaybolmasın. */}
      {provider ? <AiClassifyButton projectId={projectId} rangeKey={rangeKey} remaining={remaining} /> : null}
    </div>
  );
}
