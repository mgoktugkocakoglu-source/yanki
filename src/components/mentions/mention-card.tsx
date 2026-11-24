import { ExternalLink, MessageCircle, MessagesSquare, Newspaper, PanelRightOpen, PenLine, Play, Star, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { SOURCE_TYPE_LABELS } from "@/domain/labels";
import { effectiveSentiment, type Mention, type SourceType } from "@/domain/types";
import { formatCompact, formatDateTime, formatNumber, formatRelative } from "@/lib/format";
import type { QueryNode } from "@/lib/query";
import { EchoGlyph, reachLevel } from "../brand";
import { emotionLabel, intentLabel, Tag, ToneChip } from "../ui";
import { Highlighted } from "./highlight";
import { MentionActions } from "./mention-actions";

/** Tek bir bahsetme: kaynak, metin, eşleşme kanıtı, çözümleme sonuçları ve düzeltme eylemleri. */

/** Gövde, başlığın yinelemesi mi? (Kısa gönderilerde başlık metnin kendisidir.) */
export function repeatsTitle(mention: Pick<Mention, "title" | "content">): boolean {
  const bare = (value: string | null) => (value ?? "").trim().replace(/[.!?…]+$/u, "");
  return bare(mention.title) !== "" && bare(mention.title) === bare(mention.content);
}

export const SOURCE_ICONS: Record<SourceType, LucideIcon> = {
  news: Newspaper,
  social: MessageCircle,
  forum: MessagesSquare,
  video: Play,
  review: Star,
  blog: PenLine,
};

const REACH_BASIS_LABEL = { followers: "takipçi", views: "görüntülenme", score: "puan" } as const;

interface MentionCardProps {
  mention: Mention;
  /** Vurgulanacak sorgular: proje sorgusu ve varsa kullanıcının süzgeci. */
  queries: readonly QueryNode[];
  topicNames: ReadonlyMap<string, string>;
  now: number;
  /** Düzeltme eylemleri gösterilsin mi (özet listelerde kapalı). */
  editable?: boolean;
  /** Ayrıntı panelini açan adres; verilirse "Detay" bağlantısı görünür. */
  detailHref?: string;
  /** Ayrıntı panelinde açık olan içerik mi? */
  selected?: boolean;
}

function Readings({ mention }: { mention: Mention }) {
  const tone = effectiveSentiment(mention);
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[0.8125rem] text-ink-soft">
      {mention.reach !== null && mention.reachBasis ? (
        <span className="inline-flex items-center gap-1.5" title="Erişim tabanı: olası en geniş kitle; gerçek görüntülenme değildir.">
          <EchoGlyph level={reachLevel(mention.reach)} tone={tone} className="h-4 w-[1.1rem]" />
          <span className="reading text-ink">{formatCompact(mention.reach)}</span>
          {REACH_BASIS_LABEL[mention.reachBasis]}
        </span>
      ) : null}
      {mention.engagement !== null ? (
        <span title={`Beğeni ${formatNumber(mention.likes ?? 0)} · yanıt ${formatNumber(mention.comments ?? 0)} · paylaşım ${formatNumber(mention.shares ?? 0)}`}>
          <span className="reading text-ink">{formatCompact(mention.engagement)}</span> etkileşim
        </span>
      ) : null}
    </div>
  );
}

export function MentionCard({ mention, queries, topicNames, now, editable = true, detailHref, selected = false }: MentionCardProps) {
  const Icon = SOURCE_ICONS[mention.sourceType];
  const tone = effectiveSentiment(mention);
  const emotion = emotionLabel(mention.emotion);
  const intent = intentLabel(mention.intent);
  const author = mention.authorHandle ? `@${mention.authorHandle}` : mention.authorName;

  return (
    <article
      className={`rounded-xl border bg-surface px-5 py-4 ${selected ? "border-brand shadow-[0_0_0_1px_var(--brand)]" : "border-line"} ${mention.isIrrelevant ? "opacity-60" : ""}`}
    >
      <header className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[0.8125rem] text-ink-soft">
        <span className="inline-flex items-center gap-1.5 font-medium text-ink">
          <Icon className="h-4 w-4 text-ink-muted" aria-hidden="true" />
          <span className="sr-only">{SOURCE_TYPE_LABELS[mention.sourceType]}:</span>
          {mention.sourceName}
        </span>
        {author && author !== mention.sourceName ? <span className="truncate">{author}</span> : null}
        <time dateTime={new Date(mention.publishedAt).toISOString()} title={formatDateTime(mention.publishedAt)} className="reading text-ink-muted">
          {formatRelative(mention.publishedAt, now)}
        </time>
        <span className="ml-auto flex items-center gap-1.5">
          {mention.isSarcastic ? <Tag title="Övgü kelimeleri bir aksaklıkla birlikte geçiyor; ton buna göre olumsuz sayıldı.">ironi şüphesi</Tag> : null}
          <ToneChip sentiment={tone} corrected={mention.sentimentOverride !== null} />
        </span>
      </header>

      {mention.title ? (
        <h3 className="mt-2 text-[1rem] font-semibold leading-snug">
          <Highlighted text={mention.title} queries={queries} />
        </h3>
      ) : null}
      {mention.content && !repeatsTitle(mention) ? (
        <p className={`${mention.title ? "mt-1" : "mt-2"} max-w-[86ch] whitespace-pre-line text-ink-soft`}>
          <Highlighted text={mention.content} queries={queries} />
        </p>
      ) : null}

      <footer className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {mention.topicIds.map((id) => (topicNames.has(id) ? <Tag key={id}>{topicNames.get(id)}</Tag> : null))}
          {intent ? <Tag>{intent}</Tag> : null}
          {emotion ? <Tag>{emotion}</Tag> : null}
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <Readings mention={mention} />
          {mention.url ? (
            <a
              href={mention.url}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="inline-flex items-center gap-1 rounded px-1.5 py-1 text-[0.8125rem] font-medium text-brand-strong hover:bg-brand-wash"
            >
              Kaynağa git
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            </a>
          ) : null}
          {detailHref ? (
            <Link
              href={detailHref}
              scroll={false}
              aria-current={selected ? "true" : undefined}
              className="inline-flex items-center gap-1 rounded px-1.5 py-1 text-[0.8125rem] font-medium text-brand-strong hover:bg-brand-wash"
            >
              <PanelRightOpen className="h-3.5 w-3.5" aria-hidden="true" />
              Detay
            </Link>
          ) : null}
          {editable ? (
            <MentionActions
              mentionId={mention.id}
              modelSentiment={mention.sentiment}
              override={mention.sentimentOverride}
              isIrrelevant={mention.isIrrelevant}
            />
          ) : null}
        </div>
      </footer>
    </article>
  );
}
