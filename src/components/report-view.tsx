import { QuerySummary } from "@/components/query-summary";
import type { ReactNode } from "react";
import { share } from "@/domain/metrics";
import type { Project } from "@/domain/types";
import { formatChange, formatCompact, formatDateTime, formatNumber, formatPercent } from "@/lib/format";
import { RANGE_PRESETS, type RangeKey } from "@/lib/time";
import { getLatestAiSummary } from "@/server/repositories/ai-summaries";
import { getLatestClaimRun } from "@/server/repositories/claims";
import { getOverview } from "@/server/services/overview";
import { Logo } from "./brand";
import { PlatformTone } from "./charts/platform-tone";

/**
 * Dönem raporu: yazdırmaya ve salt okunur paylaşıma uygun tek sayfa.
 * Bağlantı içermez; her sayı panelin kullandığı hesaplardan gelir. Dil modeli
 * çıktıları (özet, iddialar) yalnızca daha önce üretildiyse ve etiketiyle yer alır.
 */

function Section({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section className="break-inside-avoid border-t border-line pt-5">
      <h2 className="text-[1.0625rem] font-semibold">{title}</h2>
      {note ? <p className="mt-0.5 text-[0.8125rem] text-ink-muted">{note}</p> : null}
      <div className="mt-3">{children}</div>
    </section>
  );
}

const LEVEL_LABEL = { info: "bilgi", attention: "dikkat", critical: "kritik" } as const;

export function ReportView({ project, rangeKey, now }: { project: Project; rangeKey: RangeKey; now: number }) {
  const overview = getOverview(project, rangeKey, now);
  const { summary, previousSummary } = overview;
  const aiSummary = getLatestAiSummary(project.id, rangeKey);
  const claimRun = getLatestClaimRun(project.id, rangeKey);
  const topics = overview.topics.filter((topic) => topic.total > 0).slice(0, 8);

  const figures = [
    {
      label: "Toplam bahsedilme",
      value: formatNumber(summary.total),
      note: previousSummary ? `önceki döneme göre ${formatChange(summary.total, previousSummary.total)}` : "önceki dönem kapsam dışında",
    },
    {
      label: "Tahmini erişim",
      value: summary.reachKnown > 0 ? `≈ ${formatCompact(summary.reach)}` : "veri yok",
      note: summary.reachKnown > 0 ? `içeriğin ${formatPercent(share(summary.reachKnown, summary.total))} kadarında veri var` : "kaynaklar erişim verisi vermiyor",
    },
    { label: "Olumsuz içerik oranı", value: formatPercent(share(summary.negative, summary.total)), note: `${formatNumber(summary.negative)} içerik` },
    { label: "Olumlu içerik oranı", value: formatPercent(share(summary.positive, summary.total)), note: `${formatNumber(summary.positive)} içerik` },
  ];

  return (
    <article className="mx-auto flex max-w-[52rem] flex-col gap-6 bg-surface px-6 py-8 text-ink sm:px-10 print:max-w-none print:px-0 print:py-0">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[0.8125rem] font-semibold uppercase tracking-[0.08em] text-brand-strong">Dönem raporu</p>
          <h1 className="mt-1 text-[1.75rem] font-semibold leading-tight tracking-[-0.02em]">{project.name}</h1>
          <p className="mt-1 text-[0.9375rem] text-ink-soft">
            {RANGE_PRESETS[rangeKey].label} · <span className="reading">{formatDateTime(overview.range.from)}</span> –{" "}
            <span className="reading">{formatDateTime(overview.range.to)}</span>
          </p>
          <QuerySummary query={project.query} className="mt-2" />
        </div>
        <Logo />
      </header>

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {figures.map((figure) => (
          <div key={figure.label} className="rounded-lg border border-line p-3">
            <dt className="text-[0.75rem] font-medium text-ink-soft">{figure.label}</dt>
            <dd className="mt-1">
              <span className="reading block text-[1.375rem] font-semibold leading-none">{figure.value}</span>
              <span className="mt-1 block text-[0.75rem] text-ink-muted">{figure.note}</span>
            </dd>
          </div>
        ))}
      </dl>

      <Section title="Dönemin özeti" note="Bu cümleler ölçümlerden hesaplanır; dil modeli çıktısı değildir.">
        <p className="leading-relaxed">{overview.briefing.map((sentence) => sentence.map((part) => part.text).join("")).join(" ")}</p>
      </Section>

      <Section title="Platforma göre duygu dağılımı" note="Her satır kendi içinde %100'e ölçeklenir.">
        <PlatformTone overall={summary} rows={overview.platforms.map((row) => ({ ...row, label: row.key === "__news" ? "Haber siteleri" : row.key }))} />
      </Section>

      {topics.length > 0 ? (
        <Section title="Konular">
          <table className="w-full border-collapse text-left text-[0.875rem]">
            <thead>
              <tr className="text-[0.75rem] text-ink-muted">
                <th scope="col" className="pb-1.5 font-medium">
                  Konu
                </th>
                <th scope="col" className="pb-1.5 text-right font-medium">
                  İçerik
                </th>
                <th scope="col" className="pb-1.5 text-right font-medium">
                  Olumsuz
                </th>
                <th scope="col" className="pb-1.5 text-right font-medium">
                  Olumlu
                </th>
              </tr>
            </thead>
            <tbody>
              {topics.map((topic) => (
                <tr key={topic.id} className="border-t border-line">
                  <td className="py-1.5">{topic.name}</td>
                  <td className="reading py-1.5 text-right">{formatNumber(topic.total)}</td>
                  <td className="reading py-1.5 text-right">{formatPercent(share(topic.negative, topic.total))}</td>
                  <td className="reading py-1.5 text-right">{formatPercent(share(topic.positive, topic.total))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      ) : null}

      {overview.stories.length > 0 ? (
        <Section title="En çok yayılan hikâyeler" note="Aynı başlığın farklı yayınları tek satırda.">
          <ol className="flex flex-col gap-1.5">
            {overview.stories.map((story) => (
              <li key={story.storyKey} className="flex gap-3">
                <span className="reading w-8 shrink-0 text-right font-medium">{formatNumber(story.publications)}</span>
                <span>
                  {story.title} <span className="text-ink-muted">· {formatNumber(story.sources)} kaynak</span>
                </span>
              </li>
            ))}
          </ol>
        </Section>
      ) : null}

      <Section title="Olağan dışı hareketler" note="Projenin kendi geçmişine göre hacmi ya da olumsuz oranı sıçrayan günler.">
        {overview.anomalies.length === 0 ? (
          <p className="text-ink-soft">Bu dönemde olağan dışı bir hareket görülmedi.</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {overview.anomalies.slice(0, 8).map((anomaly) => (
              <li key={anomaly.bucketStart}>
                <span className="reading font-medium">{formatDateTime(anomaly.bucketStart)}</span> · {LEVEL_LABEL[anomaly.level]} ·{" "}
                <span className="reading">{formatNumber(anomaly.observed)}</span> içerik (olağan düzey <span className="reading">{formatNumber(Math.round(anomaly.baseline))}</span>),
                olumsuz oranı <span className="reading">{formatPercent(anomaly.negativeShare)}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {aiSummary ? (
        <Section
          title="Yapay zekâ özeti"
          note={`Dil modeli çıktısıdır (${aiSummary.model}); hata içerebilir. ${formatDateTime(aiSummary.createdAt)} tarihinde, en yeni ${formatNumber(aiSummary.mentionsSent)} içerikten üretildi.`}
        >
          <p className="whitespace-pre-line leading-relaxed">{aiSummary.summary}</p>
          {aiSummary.themes.length > 0 ? (
            <ul className="mt-3 flex flex-col gap-2">
              {aiSummary.themes.map((theme, index) => (
                <li key={index}>
                  <span className="font-semibold">{theme.title}.</span> {theme.description}
                </li>
              ))}
            </ul>
          ) : null}
        </Section>
      ) : null}

      {claimRun && claimRun.claims.length > 0 ? (
        <Section
          title="Öne çıkan iddialar"
          note={`İddia metinleri dil modeli çıktısıdır (${claimRun.model}). Yankı doğru ya da yanlış hükmü vermez; değerlendirmeler adı yazılı doğrulama kuruluşuna aittir.`}
        >
          <ol className="flex flex-col gap-2.5">
            {claimRun.claims.slice(0, 8).map((claim) => (
              <li key={claim.id}>
                {claim.text} <span className="text-ink-muted">· {formatNumber(claim.mentionIds.length)} içerikte</span>
                {claim.checks.map((check) => (
                  <span key={check.url} className="mt-0.5 block text-[0.875rem] text-ink-soft">
                    {check.publisherName}
                    {check.rating ? `: ${check.rating}` : ""} · <span className="reading break-all">{check.url}</span>
                  </span>
                ))}
              </li>
            ))}
          </ol>
        </Section>
      ) : null}

      <footer className="border-t border-line pt-4 text-[0.75rem] text-ink-muted">
        Yankı ile <span className="reading">{formatDateTime(now)}</span> tarihinde oluşturuldu. Ton, aksi belirtilmedikçe sözlük ve kural tabanlı çözümleyiciyle belirlenir.
      </footer>
    </article>
  );
}
