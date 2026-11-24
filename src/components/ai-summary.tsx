import Link from "next/link";
import { formatNumber, formatRelative } from "@/lib/format";
import { mentionsHref } from "@/lib/links";
import { RANGE_PRESETS, type RangeKey } from "@/lib/time";
import { ITEM_TEXT_LIMIT } from "@/server/ai/prompt";
import { getAiProvider } from "@/server/ai/provider";
import { getLatestAiSummary } from "@/server/repositories/ai-summaries";
import { SUMMARY_MENTION_LIMIT } from "@/server/services/ai-summary";
import { AiSummaryButton } from "./forms/ai-summary-button";
import { Panel } from "./ui";

/**
 * Yapay zekâ özeti paneli. Hesaplanan "Dönemin özeti"nden ayrıdır: buradaki
 * metin bir dil modeli çıktısıdır ve öyle etiketlenir. Sağlayıcı yoksa panel
 * kapalı olduğunu ve nasıl açılacağını söyler.
 */

const EVIDENCE_LINKS = 4;

function evidenceHref(projectId: string, rangeKey: RangeKey, mentionId: string): string {
  const base = mentionsHref(projectId, { rangeKey });
  return `${base}${base.includes("?") ? "&" : "?"}secili=${encodeURIComponent(mentionId)}`;
}

export async function AiSummaryPanel({ projectId, rangeKey, now }: { projectId: string; rangeKey: RangeKey; now: number }) {
  const provider = getAiProvider();
  const latest = await getLatestAiSummary(projectId, rangeKey);

  if (!provider && !latest) {
    return (
      <Panel title="Yapay zekâ özeti" hint="Kapalı. Bu kurulumda hiçbir içerik bir dil modeline gönderilmiyor.">
        <p className="max-w-[80ch] text-ink-soft">
          Açmak için <code className="reading rounded bg-sunken px-1 py-0.5 text-[0.875em]">.env.local</code> dosyasına{" "}
          <code className="reading rounded bg-sunken px-1 py-0.5 text-[0.875em]">ANTHROPIC_API_KEY</code> yazıp sunucuyu yeniden başlatın. Açıldığında özet yalnızca siz
          istediğinizde üretilir; o dönemin içerik metinleri Anthropic&apos;e gönderilir ve kullanım başına ücretlendirilir.
        </p>
      </Panel>
    );
  }

  return (
    <Panel
      title="Yapay zekâ özeti"
      hint="Dil modeli çıktısıdır; hata içerebilir. Temaların altındaki içeriklerden doğrulayın."
      aside={provider ? <AiSummaryButton projectId={projectId} rangeKey={rangeKey} hasSummary={latest !== null} /> : null}
    >
      {latest ? (
        <>
          <p className="max-w-[90ch] whitespace-pre-line text-[1.0625rem] leading-[1.75] text-ink">{latest.summary}</p>
          {latest.themes.length > 0 ? (
            <ul className="mt-4 flex flex-col gap-3">
              {latest.themes.map((theme, index) => (
                <li key={index} className="rounded-lg border border-line p-3.5">
                  <p className="font-semibold">{theme.title}</p>
                  <p className="mt-1 text-ink-soft">{theme.description}</p>
                  {theme.mentionIds.length > 0 ? (
                    <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.8125rem] text-ink-muted">
                      <span>Dayanak: {formatNumber(theme.mentionIds.length)} içerik</span>
                      {theme.mentionIds.slice(0, EVIDENCE_LINKS).map((mentionId, evidenceIndex) => (
                        <Link key={mentionId} href={evidenceHref(projectId, rangeKey, mentionId)} className="font-medium text-brand-strong hover:underline">
                          {evidenceIndex + 1}. içerik
                        </Link>
                      ))}
                    </p>
                  ) : (
                    <p className="mt-2 text-[0.8125rem] text-ink-muted">Model bu tema için dayanak içerik göstermedi.</p>
                  )}
                </li>
              ))}
            </ul>
          ) : null}
          <p className="mt-4 border-t border-line pt-3 text-[0.8125rem] text-ink-muted">
            {RANGE_PRESETS[latest.rangeKey].label} · {formatRelative(latest.createdAt, now)} üretildi · model: <span className="reading">{latest.model}</span> · dönemdeki{" "}
            {formatNumber(latest.mentionsTotal)} içeriğin en yeni {formatNumber(latest.mentionsSent)} tanesi gönderildi (her birinin ilk {ITEM_TEXT_LIMIT} karakteri)
            {latest.inputTokens !== null && latest.outputTokens !== null ? ` · ${formatNumber(latest.inputTokens)} girdi, ${formatNumber(latest.outputTokens)} çıktı tokenı` : ""}.
          </p>
        </>
      ) : (
        <p className="max-w-[80ch] text-ink-soft">
          Henüz özet üretilmedi. Düğmeye bastığınızda seçili dönemin en yeni {formatNumber(SUMMARY_MENTION_LIMIT)} içeriğinin metni {provider?.label} hizmetine (
          <span className="reading">{provider?.model}</span>) gönderilir; içerik kurum dışına çıkar ve kullanım ücretlendirilir.
        </p>
      )}
    </Panel>
  );
}
