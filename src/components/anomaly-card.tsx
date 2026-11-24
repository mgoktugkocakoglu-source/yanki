import { ArrowRight, CircleAlert, Info, TriangleAlert, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { formatDateTime, formatDayLong, formatNumber, formatPercent } from "@/lib/format";
import type { AnomalyLevel } from "@/lib/stats/anomaly";
import type { ExplainedAnomaly } from "@/server/services/alerts";

/**
 * Olağan dışı hareket kartı: ne oldu, neden oldu, kanıt nerede.
 * Düzey renkle değil, simge + etiketle bildirilir.
 */

const LEVELS: Record<AnomalyLevel, { label: string; icon: LucideIcon; color: string }> = {
  critical: { label: "Kritik", icon: CircleAlert, color: "var(--critical)" },
  attention: { label: "Dikkat", icon: TriangleAlert, color: "var(--warning)" },
  info: { label: "Bilgi", icon: Info, color: "var(--brand)" },
};

interface AnomalyCardProps {
  anomaly: ExplainedAnomaly;
  mentionsHref: string;
  /** Kısa sürüm: genel bakıştaki yan sütun için. */
  compact?: boolean;
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[0.75rem] text-ink-muted">{label}</dt>
      <dd className="mt-0.5 text-[0.875rem]">{children}</dd>
    </div>
  );
}

export function AnomalyCard({ anomaly, mentionsHref, compact = false }: AnomalyCardProps) {
  const level = LEVELS[anomaly.level];
  const Icon = level.icon;
  const { explanation } = anomaly;
  const when = anomaly.bucket === "day" ? formatDayLong(anomaly.bucketStart) : formatDateTime(anomaly.bucketStart);
  const evidenceHref = `${mentionsHref}?bas=${anomaly.range.from}&bit=${anomaly.range.to}`;

  return (
    <article id={`hareket-${anomaly.bucketStart}`} className="rounded-lg border border-line bg-surface p-4" style={{ borderLeft: `3px solid ${level.color}` }}>
      <header className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
        <span className="inline-flex items-center gap-1 text-[0.8125rem] font-semibold" style={{ color: level.color }}>
          <Icon className="h-4 w-4" aria-hidden="true" />
          {level.label}
        </span>
        <h3 className="text-[0.9375rem] font-semibold">{when}</h3>
        <span className="reading ml-auto text-[0.8125rem] text-ink-soft" title="Sağlam z-skoru: olağan düzeyden uzaklık">
          {formatNumber(anomaly.observed)} bahsetme · z {anomaly.score.toLocaleString("tr-TR")}
        </span>
      </header>

      <p className="mt-2 text-[0.9375rem] leading-relaxed text-ink-soft">{explanation.headline}</p>

      {explanation.stories[0] && explanation.stories[0].publications >= 2 ? (
        <p className="mt-2 border-l-2 border-line-strong pl-3 font-display text-[1.05rem] leading-snug">
          “{explanation.stories[0].title}”<span className="reading ml-2 font-sans text-[0.75rem] text-ink-muted">{formatNumber(explanation.stories[0].publications)} yayın</span>
        </p>
      ) : null}

      {compact ? null : (
        <dl className="mt-3 grid gap-x-6 gap-y-3 sm:grid-cols-3">
          <Fact label="Artışın kaynağı">
            {explanation.sources
              .filter((source) => source.excessShare > 0.02)
              .map((source) => `${source.label} ${formatPercent(source.excessShare)}`)
              .join(" · ") || "—"}
          </Fact>
          <Fact label="Konular">{explanation.topics.map((topic) => `${topic.name} (${formatNumber(topic.count)})`).join(" · ") || "Tanımlı konularla eşleşme yok"}</Fact>
          <Fact label="Olumsuz oranı">
            <span className="reading">
              {formatPercent(anomaly.baselineNegativeShare)} → {formatPercent(anomaly.negativeShare)}
            </span>
          </Fact>
        </dl>
      )}

      {explanation.terms.length > 0 ? (
        <p className="mt-3 flex flex-wrap items-center gap-1.5 text-[0.8125rem] text-ink-muted">
          Öne çıkan kelimeler:
          {explanation.terms.map((term) => (
            <span key={term} className="rounded bg-saffron-wash px-1.5 py-0.5 text-ink">
              {term}
            </span>
          ))}
        </p>
      ) : null}

      <Link href={evidenceHref} className="mt-3 inline-flex items-center gap-1 rounded text-[0.875rem] font-semibold text-brand-strong hover:underline">
        Bu aralığın içeriklerini gör
        <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
      </Link>
    </article>
  );
}
