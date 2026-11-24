import { findHighlights, type QueryNode } from "@/lib/query";
import { tokenizeWithSpans } from "@/lib/text/normalize";

/**
 * Metni, sorgularla eşleşen kelimeleri işaretleyerek gösterir. Dış kaynaklı
 * içerik her zaman düz metin olarak basılır; HTML olarak yorumlanmaz.
 */

interface Segment {
  text: string;
  marked: boolean;
}

function toSegments(text: string, queries: readonly QueryNode[]): Segment[] {
  const spans = tokenizeWithSpans(text);
  const tokens = spans.map((span) => span.token);

  // Kelime aralıklarını karakter aralıklarına çevir ve çakışanları birleştir.
  const ranges = queries
    .flatMap((query) => findHighlights(query, tokens))
    .map(([start, end]) => [spans[start].start, spans[end - 1].end] as const)
    .sort((a, b) => a[0] - b[0]);

  const segments: Segment[] = [];
  let cursor = 0;
  for (const [start, end] of ranges) {
    if (end <= cursor) continue;
    const from = Math.max(start, cursor);
    if (from > cursor) segments.push({ text: text.slice(cursor, from), marked: false });
    segments.push({ text: text.slice(from, end), marked: true });
    cursor = end;
  }
  if (cursor < text.length) segments.push({ text: text.slice(cursor), marked: false });
  return segments;
}

export function Highlighted({ text, queries }: { text: string; queries: readonly QueryNode[] }) {
  if (queries.length === 0) return <>{text}</>;
  return (
    <>
      {toSegments(text, queries).map((segment, index) =>
        segment.marked ? <mark key={index}>{segment.text}</mark> : <span key={index}>{segment.text}</span>,
      )}
    </>
  );
}
