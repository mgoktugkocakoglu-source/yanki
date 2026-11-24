import type { SourceType } from "@/domain/types";
import type { TopicInput } from "../repositories/projects";

/**
 * Demo verisinin tanım dili. Buradaki her kurum, kişi, yayın ve metin
 * KURGUSALDIR; gerçek bir kuruluşu ya da kişiyi temsil etmez. Metinler
 * sahte olsa da üzerlerinde çalışan çözümleyici, sorgu motoru ve analitik
 * gerçektir: demo, ürünün kendi motorunu sergiler.
 *
 * Şablon yer tutucuları: {marka} {rakip} {n} {yer}
 */

export interface Stance {
  negative: readonly string[];
  positive: readonly string[];
  neutral: readonly string[];
}

export interface TopicCorpus extends Stance {
  /** Göreli sıklık. */
  weight: number;
  /** Bu konuda tonların karışımı: [olumsuz, olumlu, nötr]. */
  mix: readonly [number, number, number];
}

export interface Headline {
  title: string;
  summary: string;
}

/** Planlı olay: belirli günlerde hacmi ve tonu değiştiren gelişme. */
export interface DemoEvent {
  /** Olay bugünden kaç gün önce başladı. */
  daysAgo: number;
  /** Günlere göre ek hacim çarpanı (olağan günlük hacmin katı). */
  boost: readonly number[];
  /** Olay günlerinde yayınların tekrarladığı haberler. */
  headlines: readonly Headline[];
  /** Olay günlerinde sosyal mecralarda görülen iletiler. */
  posts: readonly string[];
  /** Ek hacmin haber payı (kalanı sosyal). */
  newsShare: number;
}

export interface DemoProjectSpec {
  name: string;
  description: string;
  query: string;
  /** Metinlerde {marka} yerine geçen yazımlar. */
  brandForms: readonly string[];
  rivals: readonly string[];
  places: readonly string[];
  dailyVolume: number;
  topics: readonly TopicInput[];
  corpus: readonly TopicCorpus[];
  /** Olağan günlerin haberleri. */
  news: readonly Headline[];
  events: readonly DemoEvent[];
}

export interface DemoWorkspaceSpec {
  name: string;
  projects: readonly DemoProjectSpec[];
}

export interface DemoSource {
  sourceType: SourceType;
  name: string;
  /** Göreli pay. */
  share: number;
}
