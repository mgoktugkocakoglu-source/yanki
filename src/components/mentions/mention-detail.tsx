import { ExternalLink, X } from "lucide-react";
import Link from "next/link";
import { EMOTION_LABELS, INTENT_LABELS, SENTIMENT_LABELS, SOURCE_TYPE_LABELS } from "@/domain/labels";
import { effectiveSentiment, type Mention } from "@/domain/types";
import { formatDateTime, formatDecimal, formatNumber } from "@/lib/format";
import type { QueryNode } from "@/lib/query";
import { BUTTON_SECONDARY, Tag, ToneChip } from "../ui";
import { Highlighted } from "./highlight";
import { repeatsTitle, SOURCE_ICONS } from "./mention-card";
import { MentionActions } from "./mention-actions";

/**
 * Bahsedilme ayrıntısı. Geniş ekranda listenin sağında yapışkan bir panel,
 * dar ekranda tüm ekranı kaplayan bir katmandır. Seçim adres çubuğunda
 * tutulur; bağlantı paylaşılabilir ve geri tuşu paneli kapatır.
 */

interface MentionDetailProps {
  mention: Mention;
  queries: readonly QueryNode[];
  topicNames: ReadonlyMap<string, string>;
  closeHref: string;
}

const REACH_BASIS = { followers: "takipçi sayısı", views: "görüntülenme", score: "puan" } as const;

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5">
      <dt className="text-[0.8125rem] text-ink-muted">{label}</dt>
      <dd className="text-right text-[0.875rem]">{children}</dd>
    </div>
  );
}

export function MentionDetail({ mention, queries, topicNames, closeHref }: MentionDetailProps) {
  const Icon = SOURCE_ICONS[mention.sourceType];
  const tone = effectiveSentiment(mention);
  const topics = mention.topicIds.map((id) => topicNames.get(id)).filter((name): name is string => Boolean(name));
  const author = mention.authorHandle ? `@${mention.authorHandle}` : mention.authorName;

  return (
    <aside
      aria-label="Bahsedilme ayrıntısı"
      className="fixed inset-0 z-40 overflow-y-auto bg-surface p-5 xl:sticky xl:inset-auto xl:top-[4.5rem] xl:z-auto xl:max-h-[calc(100vh-5.5rem)] xl:self-start xl:rounded-xl xl:border xl:border-line xl:shadow-[var(--shadow-card)]"
    >
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-[0.875rem] font-semibold">
            <Icon className="h-4 w-4 text-ink-muted" aria-hidden="true" />
            {mention.sourceName}
          </p>
          <p className="mt-0.5 truncate text-[0.8125rem] text-ink-muted">
            {SOURCE_TYPE_LABELS[mention.sourceType]}
            {author && author !== mention.sourceName ? ` · ${author}` : ""}
          </p>
        </div>
        <Link href={closeHref} scroll={false} className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-[0.8125rem] font-medium text-ink-soft hover:bg-sunken hover:text-ink">
          <X className="h-4 w-4" aria-hidden="true" />
          Kapat
        </Link>
      </header>

      <div className="mt-4 flex flex-wrap items-center gap-1.5">
        <ToneChip sentiment={tone} corrected={mention.sentimentOverride !== null} />
        {mention.isSarcastic ? <Tag>ironi şüphesi</Tag> : null}
        {mention.isIrrelevant ? <Tag>ilgisiz işaretli</Tag> : null}
      </div>

      {mention.title ? (
        <h2 className="mt-3 text-[1.0625rem] font-semibold leading-snug">
          <Highlighted text={mention.title} queries={queries} />
        </h2>
      ) : null}
      {mention.content && !repeatsTitle(mention) ? (
        <p className="mt-2 whitespace-pre-line leading-relaxed text-ink-soft">
          <Highlighted text={mention.content} queries={queries} />
        </p>
      ) : null}
      {mention.sourceType === "news" ? <p className="mt-2 text-[0.75rem] text-ink-muted">Haberlerde tam metin saklanmaz; eşleşmenin çevresinden kısa bir alıntı gösterilir.</p> : null}

      <dl className="mt-4 divide-y divide-line border-y border-line">
        <Row label="Yayın zamanı">
          <span className="reading">{formatDateTime(mention.publishedAt)}</span>
        </Row>
        <Row label="Ton kaynağı">
          {mention.sentimentOverride !== null ? (
            "insan düzeltmesi"
          ) : mention.aiSentiment !== null ? (
            <span>
              dil modeli (<span className="reading">{mention.aiModel}</span>)
              {mention.aiSentiment !== mention.sentiment ? ` · kural tabanlı sonuç: ${SENTIMENT_LABELS[mention.sentiment].toLocaleLowerCase("tr")}` : ""}
            </span>
          ) : (
            "sözlük ve kurallar"
          )}
        </Row>
        <Row label="Kural tabanlı puan">
          <span className="reading" title="−1 çok olumsuz, +1 çok olumlu. Güven, kanıtın gücüdür; kalibre edilmiş bir olasılık değildir.">
            {formatDecimal(mention.sentimentScore)} · güven {formatDecimal(mention.sentimentConfidence)}
          </span>
        </Row>
        <Row label="Duygu">{EMOTION_LABELS[mention.emotion]}</Row>
        <Row label="Niyet">{INTENT_LABELS[mention.intent]}</Row>
        <Row label="Etkileşim">
          {mention.engagement === null ? (
            <span className="text-ink-muted">kaynak vermiyor</span>
          ) : (
            <span className="reading">
              {formatNumber(mention.likes ?? 0)} beğeni · {formatNumber(mention.comments ?? 0)} yanıt · {formatNumber(mention.shares ?? 0)} paylaşım
            </span>
          )}
        </Row>
        <Row label="Tahmini erişim">
          {mention.reach === null || !mention.reachBasis ? (
            <span className="text-ink-muted">veri yok</span>
          ) : (
            <span className="reading">
              ≈ {formatNumber(mention.reach)} ({REACH_BASIS[mention.reachBasis]})
            </span>
          )}
        </Row>
        <Row label="Dil">
          <span className="reading">{mention.language}</span>
        </Row>
      </dl>

      {topics.length > 0 ? (
        <div className="mt-4">
          <p className="mb-1.5 text-[0.8125rem] text-ink-muted">Konular</p>
          <div className="flex flex-wrap gap-1.5">
            {topics.map((topic) => (
              <Tag key={topic}>{topic}</Tag>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mt-5 flex flex-wrap items-center gap-2">
        {mention.url ? (
          <a href={mention.url} target="_blank" rel="noopener noreferrer nofollow" className={BUTTON_SECONDARY}>
            Kaynağa git
            <ExternalLink className="h-4 w-4" aria-hidden="true" />
          </a>
        ) : (
          <span className="text-[0.8125rem] text-ink-muted">Demo içeriğinin kaynak bağlantısı yoktur.</span>
        )}
        <MentionActions mentionId={mention.id} modelSentiment={mention.sentiment} override={mention.sentimentOverride} isIrrelevant={mention.isIrrelevant} />
      </div>
    </aside>
  );
}
