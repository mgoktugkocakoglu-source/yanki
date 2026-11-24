"use client";

import { CircleAlert, Info, TriangleAlert, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { netTone, share } from "@/domain/metrics";
import { formatChange, formatCompact, formatDateTime, formatFullDate, formatNumber, formatPercent, formatRelative, formatSigned, formatTime } from "@/lib/format";
import { projectHref } from "@/lib/links";
import type { AnomalyLevel } from "@/lib/stats/anomaly";
import type { LiveMention, LiveSnapshot } from "@/server/services/live";
import { EchoGlyph, Logo, reachLevel } from "./brand";
import { VolumeChart } from "./charts/volume-chart";
import { ToneChip } from "./ui";

/**
 * Komuta merkezi: duvar ekranı için koyu, tam ekran, kendini yenileyen görünüm.
 * Sunucudan gelen ilk görüntüyle açılır, sonra belirli aralıklarla yoklar.
 */

const POLL_INTERVAL_MS = 20_000;

const ALERT_STYLE: Record<AnomalyLevel, { label: string; color: string; icon: typeof Info }> = {
  critical: { label: "Kritik", color: "var(--critical)", icon: CircleAlert },
  attention: { label: "Dikkat", color: "var(--warning)", icon: TriangleAlert },
  info: { label: "Bilgi", color: "var(--brand)", icon: Info },
};

function useSnapshot(initial: LiveSnapshot): { snapshot: LiveSnapshot; freshIds: ReadonlySet<string>; stale: boolean } {
  const [snapshot, setSnapshot] = useState(initial);
  const [freshIds, setFreshIds] = useState<ReadonlySet<string>>(new Set());
  const [stale, setStale] = useState(false);
  const knownIds = useRef(new Set(initial.mentions.map((mention) => mention.id)));

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const response = await fetch(`/api/proje/${initial.projectId}/canli`, { cache: "no-store" });
        if (!response.ok) throw new Error(String(response.status));
        const next = (await response.json()) as LiveSnapshot;
        if (cancelled) return;
        setFreshIds(new Set(next.mentions.filter((mention) => !knownIds.current.has(mention.id)).map((mention) => mention.id)));
        next.mentions.forEach((mention) => knownIds.current.add(mention.id));
        setSnapshot(next);
        setStale(false);
      } catch {
        // Bağlantı koptuysa eski görüntü ekranda kalır; kullanıcıya bunun eski olduğu söylenir.
        if (!cancelled) setStale(true);
      }
    };
    const timer = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [initial.projectId]);

  return { snapshot, freshIds, stale };
}

function subscribeToSeconds(onTick: () => void): () => void {
  const timer = setInterval(onTick, 1000);
  return () => clearInterval(timer);
}

/** Saniyeye yuvarlanmış şimdiki zaman; iki tik arasında değeri sabittir. */
function currentSecond(): number {
  return Math.floor(Date.now() / 1000) * 1000;
}

/** Saat yalnızca tarayıcıda çalışır; sunucu çıktısıyla uyuşmazlık olmasın diye sunucuda boştur. */
function Clock() {
  const now = useSyncExternalStore<number | null>(subscribeToSeconds, currentSecond, () => null);

  return (
    <div className="text-right">
      <div className="reading text-[2.25rem] font-medium leading-none tracking-tight">{now === null ? "––:––" : formatTime(now)}</div>
      <div className="mt-1 text-[0.8125rem] text-ink-muted">{now === null ? " " : formatFullDate(now)}</div>
    </div>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div>
      <div className="text-[0.8125rem] text-ink-muted">{label}</div>
      <div className="mt-1 text-[2.75rem] font-semibold leading-none tracking-tight">{value}</div>
      {note ? <div className="mt-1.5 text-[0.8125rem] text-ink-soft">{note}</div> : null}
    </div>
  );
}

function FeedItem({ mention, isFresh, now }: { mention: LiveMention; isFresh: boolean; now: number }) {
  return (
    <li className={`border-b border-line px-4 py-3 last:border-b-0 ${isFresh ? "rise-in bg-brand-wash" : ""}`}>
      <div className="flex items-center gap-2 text-[0.75rem] text-ink-muted">
        <span className="truncate font-medium text-ink-soft">{mention.sourceName}</span>
        {mention.author && mention.author !== mention.sourceName ? <span className="truncate">{mention.author}</span> : null}
        <time className="reading ml-auto shrink-0" title={formatDateTime(mention.publishedAt)}>
          {formatRelative(mention.publishedAt, now)}
        </time>
      </div>
      <p className="mt-1 text-[0.9375rem] leading-snug">{mention.text}</p>
      <div className="mt-1.5 flex items-center gap-3 text-[0.75rem] text-ink-muted">
        <ToneChip sentiment={mention.sentiment} />
        {mention.reach !== null ? (
          <span className="inline-flex items-center gap-1">
            <EchoGlyph level={reachLevel(mention.reach)} tone={mention.sentiment} className="h-3.5 w-4" />
            <span className="reading">{formatCompact(mention.reach)}</span>
          </span>
        ) : null}
        {mention.engagement !== null ? <span className="reading">{formatCompact(mention.engagement)} etkileşim</span> : null}
      </div>
    </li>
  );
}

export function CommandCenter({ initial }: { initial: LiveSnapshot }) {
  const { snapshot, freshIds, stale } = useSnapshot(initial);
  const { summary } = snapshot;
  const net = netTone(summary.positive, summary.negative);
  const change = snapshot.previousTotal === null ? null : formatChange(summary.total, snapshot.previousTotal);
  const maxTopic = Math.max(1, ...snapshot.topics.map((topic) => topic.total));

  return (
    <div className="theme-dark flex min-h-screen flex-col bg-paper text-ink">
      <header className="flex flex-wrap items-center gap-x-6 gap-y-3 border-b border-line px-6 py-4">
        <Logo />
        <div className="min-w-0">
          <h1 className="truncate font-display text-[1.6rem] font-medium leading-tight">{snapshot.projectName}</h1>
          <p className="flex items-center gap-2 text-[0.8125rem] text-ink-muted">
            <span className="relative inline-flex h-2.5 w-2.5">
              <span className={`absolute inset-0 rounded-full ${stale ? "bg-warning" : "bg-positive"}`} />
              {stale ? null : <span className="echo-pulse absolute -inset-1.5 rounded-full border border-positive" />}
            </span>
            {stale ? "Bağlantı koptu; son görüntü gösteriliyor" : `Canlı · ${POLL_INTERVAL_MS / 1000} saniyede bir yenilenir`}
            {snapshot.isDemo ? <span className="rounded-full border border-saffron/50 px-2 py-0.5 font-semibold text-saffron">Demo · kurgusal veri</span> : null}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-6">
          <Clock />
          <Link
            href={projectHref(snapshot.projectId)}
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-line px-3 text-[0.875rem] font-medium text-ink-soft hover:border-line-strong hover:text-ink"
          >
            <X className="h-4 w-4" aria-hidden="true" />
            Kapat
          </Link>
        </div>
      </header>

      <div className="grid flex-1 gap-5 p-6 xl:grid-cols-[minmax(0,1fr)_26rem]">
        <div className="flex min-w-0 flex-col gap-5">
          <section className="grid gap-6 rounded-lg border border-line bg-surface p-6 sm:grid-cols-3" aria-label="Son 24 saat">
            <Stat label="Son 24 saatte bahsetme" value={formatNumber(summary.total)} note={change ? `önceki 24 saate göre ${change}` : undefined} />
            <Stat label="Olumsuz oranı" value={summary.total > 0 ? formatPercent(share(summary.negative, summary.total)) : "—"} note={`${formatNumber(summary.negative)} olumsuz içerik`} />
            <Stat label="Net ton" value={net === null ? "—" : formatSigned(net)} note="(olumlu − olumsuz) ÷ (olumlu + olumsuz) × 100" />
          </section>

          <section className="rounded-lg border border-line bg-surface p-6" aria-labelledby="komuta-hacim">
            <h2 id="komuta-hacim" className="mb-4 text-[0.9375rem] font-semibold">
              Saat saat hacim ve ton
            </h2>
            <VolumeChart points={snapshot.series} bucket="hour" markers={snapshot.markers} mentionsHref={projectHref(snapshot.projectId, "bahsetmeler")} height={260} />
          </section>

          <div className="grid gap-5 lg:grid-cols-2">
            <section className="rounded-lg border border-line bg-surface p-6" aria-labelledby="komuta-uyari">
              <h2 id="komuta-uyari" className="mb-3 text-[0.9375rem] font-semibold">
                Olağan dışı hareketler
              </h2>
              {snapshot.alerts.length === 0 ? (
                <p className="text-ink-soft">Son 24 saatte hacim ve ton olağan sınırlar içinde.</p>
              ) : (
                <ul className="flex flex-col gap-4">
                  {snapshot.alerts.map((alert) => {
                    const style = ALERT_STYLE[alert.level];
                    const Icon = style.icon;
                    return (
                      <li key={alert.bucketStart} className="border-l-2 pl-3" style={{ borderColor: style.color }}>
                        <p className="flex items-center gap-1.5 text-[0.8125rem] font-semibold" style={{ color: style.color }}>
                          <Icon className="h-4 w-4" aria-hidden="true" />
                          {style.label}
                          <span className="reading font-normal text-ink-muted">{formatDateTime(alert.bucketStart)}</span>
                        </p>
                        <p className="mt-1 text-ink-soft">{alert.headline}</p>
                        {alert.story ? <p className="mt-1 font-display text-[1.05rem] leading-snug">“{alert.story}”</p> : null}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            <section className="rounded-lg border border-line bg-surface p-6" aria-labelledby="komuta-konu">
              <h2 id="komuta-konu" className="mb-3 text-[0.9375rem] font-semibold">
                Bugünün konuları
              </h2>
              {snapshot.topics.length === 0 ? (
                <p className="text-ink-soft">Son 24 saatte tanımlı konularla eşleşen içerik yok.</p>
              ) : (
                <ul className="flex flex-col gap-2.5">
                  {snapshot.topics.map((topic) => (
                    <li key={topic.name} className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] items-center gap-3">
                      <span className="truncate font-medium">{topic.name}</span>
                      <span className="flex items-center gap-2">
                        <span className="flex h-3 gap-0.5 overflow-hidden rounded-r" style={{ width: `${Math.max(2, (topic.total / maxTopic) * 100)}%` }}>
                          {topic.negative > 0 ? <span className="bg-negative" style={{ flex: topic.negative }} /> : null}
                          {topic.total - topic.negative > 0 ? <span className="bg-neutral" style={{ flex: topic.total - topic.negative }} /> : null}
                        </span>
                        <span className="reading shrink-0 text-[0.8125rem]">{formatNumber(topic.total)}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-3 text-[0.75rem] text-ink-muted">Çubuğun kırmızı kısmı olumsuz içeriktir.</p>
            </section>
          </div>
        </div>

        <section className="flex min-h-0 flex-col rounded-lg border border-line bg-surface" aria-labelledby="komuta-akis">
          <h2 id="komuta-akis" className="border-b border-line px-4 py-3 text-[0.9375rem] font-semibold">
            Akış
          </h2>
          {snapshot.mentions.length === 0 ? (
            <p className="p-4 text-ink-soft">Son 24 saatte içerik yok.</p>
          ) : (
            <ol className="min-h-0 flex-1 overflow-y-auto" aria-live="polite">
              {snapshot.mentions.map((mention) => (
                <FeedItem key={mention.id} mention={mention} isFresh={freshIds.has(mention.id)} now={snapshot.generatedAt} />
              ))}
            </ol>
          )}
        </section>
      </div>
    </div>
  );
}
