import type { RawItem, SourceType } from "@/domain/types";
import { bucketStart, DAY_MS, HOUR_MS, localWeekdayAndHour } from "@/lib/time";
import type { DemoEvent, DemoProjectSpec, DemoSource, Stance, TopicCorpus } from "./types";

/**
 * Demo içerik üreteci. Tohumlu bir rastgele sayı üreteci kullanır; aynı proje
 * tanımı her zaman aynı içerik dizisini verir (yalnızca tarihler "şimdi"ye
 * göre kayar). Üretilen her şey kurgusaldır.
 */

/** 30 günlük dönemin bir önceki dönemiyle karşılaştırılabilmesi için 60 günden uzun. */
export const DEMO_DAYS = 75;
const CONNECTOR_ID = "demo";

const SOCIAL_SOURCES: readonly DemoSource[] = [
  { sourceType: "social", name: "Mikroblog (demo)", share: 46 },
  { sourceType: "social", name: "Fotoğraf ağı (demo)", share: 8 },
  { sourceType: "review", name: "Şikâyet platformu (demo)", share: 13 },
  { sourceType: "forum", name: "Forum (demo)", share: 9 },
  { sourceType: "video", name: "Video platformu (demo)", share: 4 },
];
/** Olağan günlerde haberlerin toplam içindeki payı. */
const NEWS_SHARE = 0.2;

const NEWS_OUTLETS = [
  { domain: "ornekhaber.example", name: "Örnek Haber" },
  { domain: "gundemanadolu.example", name: "Gündem Anadolu" },
  { domain: "ekonomipostasi.example", name: "Ekonomi Postası" },
  { domain: "sehirbulteni.example", name: "Şehir Bülteni" },
  { domain: "yerelgazete.example", name: "Yerel Gazete" },
  { domain: "sabahajansi.example", name: "Sabah Ajansı" },
  { domain: "teknoakis.example", name: "Tekno Akış" },
] as const;

const FIRST_NAMES = ["Ayça", "Kerem", "Elif", "Mert", "Zeynep", "Onur", "Selin", "Burak", "Deniz", "Ece", "Emre", "Gizem", "Tolga", "İrem", "Cem", "Derya", "Barış", "Sibel", "Umut", "Nil"];
const INITIALS = "ABCDEFGHKLMNOPRSTUYZ";

/** Yerel saate göre günün saatlerinin göreli yoğunluğu. */
const HOUR_WEIGHTS = [1, 0.6, 0.4, 0.3, 0.3, 0.5, 1.2, 2.4, 3.8, 4.6, 5, 5.2, 5, 4.6, 4.2, 4, 4.2, 4.6, 5.2, 5.8, 6, 5.2, 3.6, 2];
/** Pazartesi → Pazar. */
const WEEKDAY_WEIGHTS = [1.05, 1.1, 1.08, 1.04, 1, 0.82, 0.74];

type Random = () => number;

function hashSeed(text: string): number {
  let hash = 2166136261;
  for (const char of text) {
    hash ^= char.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** mulberry32: küçük, hızlı, tohumlu üreteç. */
function createRandom(seed: number): Random {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<Item>(random: Random, items: readonly Item[]): Item {
  return items[Math.floor(random() * items.length)];
}

function pickWeighted<Item>(random: Random, items: readonly Item[], weightOf: (item: Item) => number): Item {
  const total = items.reduce((sum, item) => sum + weightOf(item), 0);
  let threshold = random() * total;
  for (const item of items) {
    threshold -= weightOf(item);
    if (threshold <= 0) return item;
  }
  return items[items.length - 1];
}

/** Box–Muller ile yaklaşık normal dağılım. */
function gaussian(random: Random): number {
  const u = Math.max(random(), 1e-9);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * random());
}

interface Author {
  name: string;
  handle: string;
  followers: number;
}

function createAuthor(random: Random, minimumFollowers = 12): Author {
  const first = pick(random, FIRST_NAMES);
  const initial = INITIALS[Math.floor(random() * INITIALS.length)];
  const number = Math.floor(random() * 90) + 10;
  const followers = Math.round(Math.exp(5.4 + gaussian(random) * 1.5));
  return {
    name: `${first} ${initial}.`,
    handle: `${first.toLocaleLowerCase("tr-TR")}_${initial.toLowerCase()}${number}.demo`,
    followers: Math.min(480_000, Math.max(minimumFollowers, followers)),
  };
}

function fillTemplate(random: Random, template: string, spec: DemoProjectSpec): string {
  return template
    .replaceAll("{marka}", () => pick(random, spec.brandForms))
    .replaceAll("{rakip}", () => (spec.rivals.length > 0 ? pick(random, spec.rivals) : "başka bir firma"))
    .replaceAll("{yer}", () => pick(random, spec.places))
    .replaceAll("{n}", () => String(Math.floor(random() * 7) + 2));
}

function pickStanceText(random: Random, topic: TopicCorpus): { text: string; isNegative: boolean } {
  const [negative, positive] = topic.mix;
  const roll = random();
  const key: keyof Stance = roll < negative ? "negative" : roll < negative + positive ? "positive" : "neutral";
  const pool = topic[key].length > 0 ? topic[key] : topic.negative;
  return { text: pick(random, pool), isNegative: key === "negative" };
}

/** Günün içinden, yoğunluk eğrisine uygun bir an seçer; `latest`ten sonrasını vermez. */
function pickMoment(random: Random, dayStart: number, latest: number): number | null {
  const lastHour = Math.min(23, Math.floor((latest - dayStart) / HOUR_MS));
  if (lastHour < 0) return null;
  const hours = HOUR_WEIGHTS.slice(0, lastHour + 1).map((weight, hour) => ({ hour, weight }));
  const { hour } = pickWeighted(random, hours, (entry) => entry.weight);
  const moment = dayStart + hour * HOUR_MS + Math.floor(random() * HOUR_MS);
  return moment < latest ? moment : null;
}

/** Günün ne kadarının geride kaldığı (yoğunluk ağırlıklı); bugünün hacmini ölçekler. */
function elapsedShare(dayStart: number, now: number): number {
  const elapsedHours = Math.min(24, Math.max(0, (now - dayStart) / HOUR_MS));
  const total = HOUR_WEIGHTS.reduce((sum, weight) => sum + weight, 0);
  const done = HOUR_WEIGHTS.reduce((sum, weight, hour) => sum + weight * Math.min(1, Math.max(0, elapsedHours - hour)), 0);
  return done / total;
}

interface Draft {
  sourceType: SourceType;
  sourceName: string;
  title: string;
  content: string;
  author: Author | null;
  outletName: string | null;
  /** Etkileşimi büyüten çarpan: olay günlerinde ve olumsuz iletilerde yüksek. */
  heat: number;
}

function draftNews(random: Random, headline: { title: string; summary: string }, heat: number): Draft {
  const outlet = pick(random, NEWS_OUTLETS);
  return {
    sourceType: "news",
    sourceName: outlet.domain,
    title: headline.title,
    content: headline.summary,
    author: null,
    outletName: outlet.name,
    heat,
  };
}

function draftPost(random: Random, source: DemoSource, text: string, heat: number, minimumFollowers?: number): Draft {
  const needsTitle = source.sourceType === "review" || source.sourceType === "forum";
  const firstSentence = text.split(/(?<=[.!?])\s/)[0];
  return {
    sourceType: source.sourceType,
    sourceName: source.name,
    title: needsTitle ? firstSentence.replace(/[.!?]+$/, "") : "",
    content: text,
    author: createAuthor(random, minimumFollowers),
    outletName: null,
    heat,
  };
}

function draftRegular(random: Random, spec: DemoProjectSpec): Draft {
  if (random() < NEWS_SHARE) return draftNews(random, pick(random, spec.news), 1);

  const topic = pickWeighted(random, spec.corpus, (entry) => entry.weight);
  const { text, isNegative } = pickStanceText(random, topic);
  const source = pickWeighted(random, SOCIAL_SOURCES, (entry) => entry.share);
  return draftPost(random, source, fillTemplate(random, text, spec), isNegative ? 1.5 : 1);
}

function draftEvent(random: Random, spec: DemoProjectSpec, event: DemoEvent): Draft {
  if (random() < event.newsShare) return draftNews(random, pick(random, event.headlines), 3);

  const source = pickWeighted(random, SOCIAL_SOURCES.slice(0, 3), (entry) => entry.share);
  // Olaylarda birkaç geniş kitleli hesap da konuşur; yayılımı onlar büyütür.
  const minimumFollowers = random() < 0.08 ? 40_000 : undefined;
  return draftPost(random, source, fillTemplate(random, pick(random, event.posts), spec), 3, minimumFollowers);
}

function toRawItem(random: Random, draft: Draft, publishedAt: number, index: number): RawItem {
  const followers = draft.author?.followers ?? null;
  const isNews = draft.sourceType === "news";
  const baseLikes = followers === null ? 0 : Math.pow(followers, 0.55) * random() * draft.heat;
  const likes = isNews ? null : Math.round(baseLikes);

  return {
    connectorId: CONNECTOR_ID,
    sourceType: draft.sourceType,
    sourceName: draft.sourceName,
    externalId: `demo:${index}`,
    url: "",
    title: draft.title,
    content: draft.content,
    authorName: draft.author?.name ?? draft.outletName,
    authorHandle: draft.author?.handle ?? null,
    authorFollowers: followers,
    language: "tr",
    publishedAt,
    likes,
    comments: likes === null ? null : Math.round(likes * (0.1 + random() * 0.2)),
    shares: likes === null ? null : Math.round(likes * (0.05 + random() * 0.25)),
    views: draft.sourceType === "video" && followers !== null ? Math.round(followers * (1 + random() * 7)) : null,
  };
}

/** Bir demo projesi için son `DEMO_DAYS` günün ham içeriklerini üretir. */
export function generateRawItems(spec: DemoProjectSpec, now: number): RawItem[] {
  const random = createRandom(hashSeed(spec.name));
  const today = bucketStart(now, "day");
  const items: RawItem[] = [];

  for (let daysAgo = DEMO_DAYS - 1; daysAgo >= 0; daysAgo -= 1) {
    const dayStart = today - daysAgo * DAY_MS;
    const { weekday } = localWeekdayAndHour(dayStart);
    const dayShare = daysAgo === 0 ? elapsedShare(dayStart, now) : 1;
    const regularCount = Math.round(spec.dailyVolume * WEEKDAY_WEIGHTS[weekday] * (0.8 + random() * 0.4) * dayShare);

    const drafts: Draft[] = Array.from({ length: regularCount }, () => draftRegular(random, spec));
    for (const event of spec.events) {
      const boost = event.boost[event.daysAgo - daysAgo];
      if (boost === undefined) continue;
      const extra = Math.round(spec.dailyVolume * boost * dayShare);
      for (let count = 0; count < extra; count += 1) drafts.push(draftEvent(random, spec, event));
    }

    for (const draft of drafts) {
      const moment = pickMoment(random, dayStart, now);
      if (moment !== null) items.push(toRawItem(random, draft, moment, items.length));
    }
  }
  return items;
}
