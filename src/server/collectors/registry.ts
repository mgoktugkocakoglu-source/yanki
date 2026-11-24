import { config } from "../config";
import { blueskyConnector } from "./bluesky";
import { googleNewsConnector } from "./google-news";
import { publisherFeedsConnector } from "./publisher-feeds";
import { redditConnector } from "./reddit";
import type { Connector, PlannedSource } from "./types";
import { xConnector } from "./x";
import { youtubeConnector } from "./youtube";

/**
 * Kapsam kaydı: hangi kaynak gerçekten bağlı, hangisi hangi koşulu bekliyor.
 * Arayüzdeki "Kaynaklar" ekranı bu dosyanın doğrudan yansımasıdır.
 */

const ALL_CONNECTORS: readonly Connector[] = [publisherFeedsConnector, googleNewsConnector, blueskyConnector, xConnector, youtubeConnector, redditConnector];

/** Bu kurulumda kullanılmasına izin verilen bağlayıcı mı? */
export function isConnectorAllowed(connector: Connector): boolean {
  return config.deployment === "local" || connector.descriptor.access === "open";
}

/** Hem koşulu uygun hem anahtarı tanımlı: gerçekten çalıştırılabilir. */
export function isConnectorUsable(connector: Connector): boolean {
  return isConnectorAllowed(connector) && connector.isConfigured();
}

export function listConnectors(): Connector[] {
  return [...ALL_CONNECTORS];
}

export function getConnector(id: string): Connector | undefined {
  return ALL_CONNECTORS.find((connector) => connector.descriptor.id === id);
}

/** Yeni projede varsayılan olarak açık gelen bağlayıcılar. */
export function defaultConnectorIds(): string[] {
  return ALL_CONNECTORS.filter(isConnectorUsable).map((connector) => connector.descriptor.id);
}

/**
 * Henüz bağlanmamış kaynaklar ve bağlanmaları için gereken koşul.
 * Kaynak: 12 Kasım 2026 tarihli erişim araştırması.
 */
export const PLANNED_SOURCES: readonly PlannedSource[] = [
  { name: "Instagram", sourceType: "social", requirement: "İşletme hesabı ve Meta uygulama onayı; yalnızca etiket araması, haftada 30 etiket." },
  { name: "Facebook", sourceType: "social", requirement: "Meta uygulama onayı; anahtar kelime araması yok, yalnızca belirlenen herkese açık sayfalar okunabilir." },
  { name: "TikTok", sourceType: "video", requirement: "Ticari kullanıma açık bir arama API'si yok; lisanslı veri sağlayıcısı gerekir." },
  { name: "Tumblr", sourceType: "blog", requirement: "Resmî API yalnızca etiket araması sunuyor; kullanım koşulları henüz incelenmedi." },
  { name: "Ekşi Sözlük", sourceType: "forum", requirement: "Kullanım koşulları ticari kullanımı yazılı izne bağlıyor." },
  { name: "Şikayetvar", sourceType: "review", requirement: "robots.txt arama ve şikâyet sayfalarını taramaya kapatıyor; yayıncı anlaşması gerekir." },
  { name: "Uygulama mağazası yorumları", sourceType: "review", requirement: "App Store yorum akışı anahtarsız erişilebilir; bağlayıcısı sıradaki sürümde." },
  { name: "TV, radyo ve basılı yayın", sourceType: "broadcast", requirement: "Lisanslı medya takip sağlayıcısı üzerinden." },
];
