import type { RawItem, SourceType } from "@/domain/types";

/**
 * Bağlayıcı sözleşmesi ve kapsam kaydı.
 *
 * Her bağlayıcı ne yapabildiğini ve hangi koşullarla kullanılabildiğini
 * kendisi bildirir; arayüz bu kaydı olduğu gibi gösterir. Erişimi olmayan bir
 * kaynak "çalışıyor" gibi sunulmaz: ya gerçekten veri getirir ya da
 * "planlanan" olarak listelenir.
 */

/** Kaynağın kullanım koşulu sınıfı. */
export type AccessClass =
  /** Koşullar kurumsal kullanıma engel görünmüyor. */
  | "open"
  /** Kaynağın kendi koşulları yalnızca kişisel, ticari olmayan kullanıma izin veriyor. */
  | "personal-only";

export interface ConnectorDescriptor {
  id: string;
  name: string;
  sourceType: SourceType;
  summary: string;
  access: AccessClass;
  /** Koşulların insan tarafından okunur özeti. */
  terms: string;
  /** Çalışması için gereken ortam değişkeni (API anahtarı); yoksa anahtarsızdır. */
  requiredSetting?: string;
  /** Ücretli kaynak: yalnızca son taramadan sonrası istenir, günlük sınır uygulanır, önizlemede aranmaz. */
  metered?: boolean;
  /** Bir günde okunabilecek en çok içerik (maliyet ya da kota tavanı); tavansızsa tanımsız. */
  dailyLimit?: number;
  /** Kota korumak için iki tarama arasında beklenecek en az süre (dakika). */
  minIntervalMinutes?: number;
  capabilities: {
    /** Kaynak anahtar kelimeyle aranabiliyor mu, yoksa akış yerelde mi süzülüyor? */
    keywordSearch: boolean;
    /** İlk taramada ne kadar geriye gidilebiliyor. */
    history: string;
    engagement: boolean;
    authorFollowers: boolean;
    /** Saklanan içerik: tam metin mi, başlık + özet mi. */
    stores: string;
  };
}

export interface CollectRequest {
  /** Kaynakta aranacak ifadeler (kullanıcının yazdığı haliyle). */
  keywords: string[];
  /** Zorunlu gruplar: her gruptan en az bir ifade geçmeli (bkz. lib/query/plan.ts). */
  groups: string[][];
  /** Sorgu tek dile sabitlenmişse o dil; kaynak destekliyorsa süzgeç olarak iletilir. */
  language: string | null;
  /** Bu andan eski içerik istenmez (epoch ms). */
  since: number;
  /** Bu taramada okunabilecek en çok içerik; sınırsızsa null. */
  maxItems: number | null;
}

export interface CollectResult {
  items: RawItem[];
  /** Kısmi sorunlar: "19 akıştan 2'si yanıt vermedi" gibi. */
  notes: string[];
}

export interface Connector {
  descriptor: ConnectorDescriptor;
  /** Gereken anahtar tanımlı mı? Anahtarsız kaynaklarda her zaman true. */
  isConfigured(): boolean;
  collect(request: CollectRequest): Promise<CollectResult>;
}

/** Henüz bağlanmamış kaynak: neyin eksik olduğu açıkça yazılır. */
export interface PlannedSource {
  name: string;
  sourceType: SourceType | "broadcast";
  requirement: string;
}
