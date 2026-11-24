import { XMLParser } from "fast-xml-parser";
import { htmlToText } from "@/lib/text/html";

/**
 * RSS 2.0, Atom ve RDF akışlarını ortak bir biçime indirir.
 *
 * Türkiye'deki yayıncı akışları standarttan epey sapar (bağlantısı
 * `atom:link` içinde olanlar, açıklamasında ham <img> taşıyanlar, tarihinde
 * varlık kodu bulunanlar). Ayrıştırıcı bu yüzden bilerek hoşgörülüdür.
 */

export interface FeedEntry {
  id: string;
  title: string;
  url: string;
  /** Düz metne çevrilmiş özet ya da gövde. */
  text: string;
  author: string | null;
  publishedAt: number | null;
  /** Google Haberler gibi derleyicilerde asıl yayıncı. */
  sourceName: string | null;
  sourceUrl: string | null;
}

type XmlNode = string | number | boolean | null | undefined | XmlObject | XmlNode[];
interface XmlObject {
  [key: string]: XmlNode;
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  htmlEntities: true,
  trimValues: true,
  parseTagValue: false,
  parseAttributeValue: false,
});

function isObject(node: XmlNode): node is XmlObject {
  return typeof node === "object" && node !== null && !Array.isArray(node);
}

function asArray(node: XmlNode): XmlNode[] {
  if (node === undefined || node === null) return [];
  return Array.isArray(node) ? node : [node];
}

/** Düğümün metin içeriği; öznitelikli ya da karışık içerikli düğümleri de çözer. */
function textOf(node: XmlNode): string {
  if (node === undefined || node === null) return "";
  if (Array.isArray(node)) return textOf(node[0]);
  if (isObject(node)) return textOf(node["#text"]);
  return String(node);
}

function firstText(item: XmlObject, keys: readonly string[]): string {
  for (const key of keys) {
    const value = textOf(item[key]).trim();
    if (value) return value;
  }
  return "";
}

/** RSS'te düz metin, Atom'da href özniteliği, bazı akışlarda yalnızca atom:link. */
function linkOf(item: XmlObject): string {
  const candidates = [...asArray(item.link), ...asArray(item["atom:link"])];
  let fallback = "";
  for (const candidate of candidates) {
    if (isObject(candidate)) {
      const href = textOf(candidate["@_href"]);
      const rel = textOf(candidate["@_rel"]);
      if (href && (rel === "" || rel === "alternate")) return href;
      fallback ||= href || textOf(candidate);
    } else {
      const text = textOf(candidate).trim();
      if (text) return text;
    }
  }
  return fallback;
}

function authorOf(item: XmlObject): string | null {
  const author = item.author;
  const name = isObject(author) ? textOf(author.name) : textOf(author);
  return (name || textOf(item["dc:creator"])).trim() || null;
}

function parseDate(value: string): number | null {
  if (!value) return null;
  const timestamp = Date.parse(value.replace(/\s+/g, " "));
  return Number.isNaN(timestamp) ? null : timestamp;
}

function toEntry(item: XmlObject): FeedEntry | null {
  const title = htmlToText(firstText(item, ["title"]));
  const url = linkOf(item);
  if (!title || !url) return null;

  const body = firstText(item, ["content:encoded", "content", "text", "description", "summary"]);
  const source = item.source;
  return {
    id: firstText(item, ["guid", "id"]) || url,
    title,
    url,
    text: htmlToText(body),
    author: authorOf(item),
    publishedAt: parseDate(firstText(item, ["pubDate", "published", "updated", "dc:date"])),
    sourceName: textOf(source).trim() || null,
    sourceUrl: isObject(source) ? textOf(source["@_url"]) || null : null,
  };
}

function findItems(document: XmlObject): XmlNode[] {
  const rss = document.rss;
  if (isObject(rss) && isObject(rss.channel)) return asArray(rss.channel.item);

  const feed = document.feed;
  if (isObject(feed)) return asArray(feed.entry);

  const rdf = document["rdf:RDF"];
  if (isObject(rdf)) return asArray(rdf.item);

  return [];
}

/** Akış XML'ini girişlere çevirir. Tanınmayan biçimde boş dizi döner. */
export function parseFeed(xml: string): FeedEntry[] {
  // Baştaki BOM bazı akışlarda XML bildiriminden önce gelir.
  const document = parser.parse(xml.replace(/^﻿/, "")) as XmlObject;
  return findItems(document)
    .filter(isObject)
    .map(toEntry)
    .filter((entry): entry is FeedEntry => entry !== null);
}

/**
 * Haber site haritasını (sitemaps.org + Google News uzantısı) girişlere çevirir.
 * Yalnızca `news:news` bilgisi taşıyan adresler alınır; özet içermez.
 */
export function parseNewsSitemap(xml: string): FeedEntry[] {
  const document = parser.parse(xml.replace(/^﻿/, "")) as XmlObject;
  const urlset = document.urlset;
  if (!isObject(urlset)) return [];
  const entries: FeedEntry[] = [];
  for (const node of asArray(urlset.url)) {
    if (!isObject(node)) continue;
    const news = node["news:news"];
    if (!isObject(news)) continue;
    const url = textOf(node.loc).trim();
    const title = htmlToText(textOf(news["news:title"]));
    if (!url || !title) continue;
    entries.push({
      id: url,
      title,
      url,
      text: "",
      author: null,
      publishedAt: parseDate(textOf(news["news:publication_date"])),
      sourceName: null,
      sourceUrl: null,
    });
  }
  return entries;
}
