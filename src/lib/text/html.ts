import { decodeHTML } from "entities";

/**
 * Kaynaklardan gelen HTML parçalarını düz metne çevirir. Dış içerik hiçbir
 * zaman HTML olarak işlenmez; arayüz yalnızca bu düz metni gösterir.
 */

const BLOCK_TAGS = /<\/?(?:p|div|br|li|ul|ol|h[1-6]|tr|blockquote)\b[^>]*>/gi;
const SCRIPT_OR_STYLE = /<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi;
const ANY_TAG = /<[^>]+>/g;

export function htmlToText(html: string): string {
  const withoutCode = html.replace(SCRIPT_OR_STYLE, " ");
  const withBreaks = withoutCode.replace(BLOCK_TAGS, " ");
  const withoutTags = withBreaks.replace(ANY_TAG, "");
  return decodeHTML(withoutTags).replace(/\s+/g, " ").trim();
}

/**
 * Uzun metinden, verilen konumu içeren okunabilir bir alıntı keser.
 * Haber akışlarında tam metin yerine başlık + kısa alıntı saklamak için.
 */
export function excerptAround(text: string, focusIndex: number, maxLength: number): string {
  if (text.length <= maxLength) return text;

  const half = Math.floor(maxLength / 2);
  let start = Math.max(0, Math.min(focusIndex - half, text.length - maxLength));
  let end = start + maxLength;

  // Kelime ortasından kesmemek için en yakın boşluğa çekil.
  if (start > 0) {
    const nextSpace = text.indexOf(" ", start);
    if (nextSpace !== -1 && nextSpace < start + 30) start = nextSpace + 1;
  }
  if (end < text.length) {
    const previousSpace = text.lastIndexOf(" ", end);
    if (previousSpace > end - 30) end = previousSpace;
  }
  return `${start > 0 ? "… " : ""}${text.slice(start, end).trim()}${end < text.length ? " …" : ""}`;
}
