/**
 * Çözüm kaydı: Yankı'nın hangi kullanım alanına ve kurum türüne nasıl hizmet
 * ettiğinin tek kaynağı. Tanıtım sitesindeki "Çözümler" menüsü, dizin sayfası
 * ve çözüm sayfaları bu kayıttan üretilir.
 *
 * Kural: bir çözüm ancak panelde çalışan bir karşılığı varsa `available` olur.
 * Karşılığı henüz yazılmamış çözümler `planned` olarak burada durur ve sitede
 * gösterilmez; modülü yazıldığında durumu değiştirmek yeterlidir.
 */

export type SolutionGroup = "use-case" | "organization";

export const SOLUTION_GROUP_LABELS: Record<SolutionGroup, string> = {
  "use-case": "Kullanım alanı",
  organization: "Kurum türü",
};

/** Sayfadaki canlı önizlemenin türü; her biri panelin gerçek bir bileşenidir. */
export type SolutionPreviewKind = "alerts" | "tone" | "compare" | "stories" | "topics" | "briefing" | "sources" | "mentions" | "workspaces";

/** Önizlemenin ve "demoda aç" bağlantısının kullandığı demo çalışma alanı. */
export type SolutionDemo = "public";

/** "Demoda aç" bağlantısının hedefi. */
export type SolutionTarget =
  { kind: "project"; section: "" | "bahsetmeler" | "analiz" | "uyarilar" | "kaynaklar" | "iddialar"; query?: string } | { kind: "workspace"; path: "/karsilastirma" | "/projeler" };

export interface SolutionStep {
  title: string;
  text: string;
}

export interface Solution {
  slug: string;
  group: SolutionGroup;
  status: "available" | "planned";
  /** Menüde ve kartlarda görünen kısa ad. */
  name: string;
  /** Menü ve dizin kartındaki tek cümle. */
  summary: string;
  /** Çözüm sayfasının başlığı ve giriş paragrafı. */
  headline: string;
  lead: string;
  steps: SolutionStep[];
  /** Bugünkü sınırlar. Ekip içi bilgidir; sitede gösterilmez. */
  limits: string[];
  demo: SolutionDemo;
  preview: SolutionPreviewKind;
  target: SolutionTarget;
  targetLabel: string;
  /** Planlanan çözümler için: eksik olan modül. */
  missing?: string;
}

type Available = Omit<Solution, "status" | "missing">;
type Planned = Pick<Solution, "slug" | "group" | "name" | "summary"> & { missing: string };

const AVAILABLE: Available[] = [
  {
    slug: "gundem-ve-kamuoyu-takibi",
    group: "use-case",
    name: "Gündem ve kamuoyu takibi",
    summary: "Bir konunun gündeme nasıl girdiğini, kimlerin taşıdığını ve tonunu izleyin.",
    headline: "Gündem nereye dönüyor, ilk siz görün.",
    lead: "Anahtar kelimelerinizle bir konuyu tanımlayın; Yankı o konunun hacmini, tonunu ve en çok yayılan başlıklarını gün gün gösterir.",
    steps: [
      { title: "Konuyu tarif edin", text: "VE, VEYA, DEĞİL ve YAKIN işleçleriyle sorgu yazın; Türkçe çekim ekleri kendiliğinden eşleşir." },
      { title: "Yayılan hikâyeyi görün", text: "Aynı başlığın farklı yayınları tek satırda toplanır; kaç kaynakta, ilk ne zaman göründüğü yazılır." },
      { title: "Sıçramayı yakalayın", text: "Hacim olağan düzeyin dışına çıktığında gün işaretlenir ve öne çıkan konu ile kaynak gösterilir." },
    ],
    limits: ["Kapsam, bağlı kaynaklarla sınırlıdır; X ve YouTube kendi API anahtarınızı ister."],
    demo: "public",
    preview: "stories",
    target: { kind: "project", section: "" },
    targetLabel: "Genel Bakış'ı demoda aç",
  },
  {
    slug: "kriz-yonetimi",
    group: "use-case",
    name: "Kriz yönetimi",
    summary: "Olağan dışı hareketi, nedeniyle birlikte ve erken görün.",
    headline: "Kriz büyümeden haberiniz olsun.",
    lead: "Yankı her projenin kendi geçmişinden bir olağan düzey çıkarır; hacim ya da olumsuz içerik payı bunun dışına çıktığında uyarı üretir.",
    steps: [
      { title: "Eşik projeye özgüdür", text: "Olağan düzey, projenin önceki günlerinden hesaplanır; sabit bir sayı beklemez." },
      { title: "Uyarı açıklamasıyla gelir", text: "Artışın hangi kaynak türünden geldiği, en çok yayılan başlık ve öne çıkan kelimeler yazılır." },
      { title: "İçeriğe tek tıkla inin", text: "Her uyarı, o aralığın içeriklerini süzülmüş olarak açar." },
    ],
    limits: ["Uyarılar panelde görünür; e-posta ya da anlık bildirim henüz yok.", "Açıklama bir ilişki gösterir, nedensellik iddia etmez."],
    demo: "public",
    preview: "alerts",
    target: { kind: "project", section: "uyarilar" },
    targetLabel: "Uyarılar'ı demoda aç",
  },
  {
    slug: "itibar-yonetimi",
    group: "use-case",
    name: "İtibar yönetimi",
    summary: "Hakkınızdaki konuşmanın tonunu ve zaman içindeki seyrini izleyin.",
    headline: "İtibarınız bugün nerede duruyor?",
    lead: "Her içerik olumlu, olumsuz ya da nötr olarak etiketlenir; dağılım ve net ton önceki dönemle karşılaştırılır.",
    steps: [
      { title: "Tonu dönem dönem okuyun", text: "Olumlu içerik oranı ve net ton, önceki eşit uzunluktaki dönemle yan yana gösterilir." },
      { title: "Etiketi düzeltin", text: "Yanlış bulduğunuz tonu tek tıkla değiştirirsiniz; düzeltilen içerik işaretli kalır." },
      { title: "İroniyi ayırın", text: "Övgü kelimeleri bir aksaklıkla birlikte geçtiğinde içerik ironi şüphesiyle işaretlenir." },
    ],
    limits: ["Ton, sözlük ve kural tabanlı bir çözümleyiciyle belirlenir; doğruluğu henüz ölçülmüş bir veri kümesiyle raporlanmadı."],
    demo: "public",
    preview: "tone",
    target: { kind: "project", section: "" },
    targetLabel: "Genel Bakış'ı demoda aç",
  },
  {
    slug: "rekabet-analizi",
    group: "use-case",
    name: "Rekabet analizi",
    summary: "Kendinizi rakiplerle aynı ölçekte, yan yana görün.",
    headline: "Rakipleriniz ne kadar, nasıl konuşuluyor?",
    lead: "Her rakip için bir proje açın; Yankı ses payını, hacmi ve tonu aynı ölçekte karşılaştırır.",
    steps: [
      { title: "Ses payı", text: "Seçili dönemde toplam konuşmanın ne kadarının kime ait olduğu görünür." },
      { title: "Zaman içinde hacim", text: "Projeler aynı eksende çizilir; kimin ne zaman öne çıktığı okunur." },
      { title: "Ton karşılaştırması", text: "Her projenin olumlu, nötr ve olumsuz dağılımı yan yana durur." },
    ],
    limits: ["Karşılaştırma aynı çalışma alanındaki projeler arasında yapılır."],
    demo: "public",
    preview: "compare",
    target: { kind: "workspace", path: "/karsilastirma" },
    targetLabel: "Rakipler'i demoda aç",
  },
  {
    slug: "trend-arastirmasi",
    group: "use-case",
    name: "Trend araştırması",
    summary: "Hangi konuların yükseldiğini ve hangi saatlerde konuşulduğunu bulun.",
    headline: "Yükselen konuyu erken fark edin.",
    lead: "Konuları kendi sorgularıyla tanımlayın; Yankı her konunun hacmini, tonunu ve yoğunlaştığı gün ile saati gösterir.",
    steps: [
      { title: "Konu karnesi", text: "Her konu için hacim ve ton tek tabloda; olumsuz oranı en yüksek konu öne çıkar." },
      { title: "Gün ve saat haritası", text: "Konuşmanın haftanın hangi günü ve saatinde yoğunlaştığı görünür." },
      { title: "Yayılan başlıklar", text: "En çok yayın alan hikâyeler, kaynak sayısıyla birlikte sıralanır." },
    ],
    limits: ["Konular elle tanımlanır; kendiliğinden konu keşfi ve anlatı kümeleme henüz yok."],
    demo: "public",
    preview: "topics",
    target: { kind: "project", section: "analiz" },
    targetLabel: "Analizler'i demoda aç",
  },
  {
    slug: "dezenformasyonla-mucadele",
    group: "use-case",
    name: "Dezenformasyonla mücadele",
    summary: "İçeriklerde ileri sürülen iddiaları ayıklayın, yayımlanmış doğrulamalarla karşılaştırın.",
    headline: "Hangi iddia yayılıyor, kim doğrulamış?",
    lead: "Yankı bir konudaki içeriklerden kontrol edilebilir iddiaları çıkarır, aynı iddianın farklı anlatımlarını tek başlıkta toplar ve doğrulama kuruluşlarının bu iddia hakkında yayımladığı değerlendirmeleri yanına koyar. Hükmü Yankı vermez; kararı analist verir.",
    steps: [
      {
        title: "İddiaları ayıklayın",
        text: "Dil modeli, görüş ve yorumu ayırıp yalnızca kanıtla sınanabilecek önermeleri listeler; her iddianın kaç içerikte ve hangi platformlarda geçtiği yazılır.",
      },
      {
        title: "Yayımlanmış doğrulamayı görün",
        text: "Her iddia doğrulama kuruluşlarının arşivinde aranır; eşleşen kayıt, kuruluşun adı, verdiği derecelendirme ve bağlantısıyla gösterilir.",
      },
      { title: "Dayanağa inin", text: "Her iddia, onu taşıyan içeriklere bağlanır; analist kaynağı kendi gözüyle okur ve değerlendirmeyi kendisi yapar." },
    ],
    limits: [
      "Yankı doğru ya da yanlış hükmü vermez.",
      "Doğrulama araması Google Fact Check Tools API'ye bağlıdır; Türkçe kapsamı ölçülmedi.",
      "İddia çıkarımı dil modeli gerektirir ve en yeni 150 içeriğe bakar.",
      "Eşgüdümlü yayılım ve kaynak geçmişi işaretleri henüz yok.",
    ],
    demo: "public",
    preview: "stories",
    target: { kind: "project", section: "iddialar" },
    targetLabel: "İddialar'ı demoda aç",
  },
  {
    slug: "musteri-deneyimi",
    group: "use-case",
    name: "Müşteri ve vatandaş deneyimi",
    summary: "Şikâyetleri, destek taleplerini ve ayrılma sinyallerini ayırın.",
    headline: "Şikâyeti gürültüden ayırın.",
    lead: "Her içerik niyetine göre etiketlenir: şikâyet, destek talebi, övgü, ayrılma sinyali. İstediğinizi tek bir süzgeçle listelersiniz.",
    steps: [
      { title: "Niyete göre süzün", text: "Arama çubuğuna niyet:şikayet yazmak yeter; ton ve konu süzgeçleriyle birleştirilebilir." },
      { title: "Ayrıntıya bakın", text: "Bir içeriği seçtiğinizde tam metin, etkileşim ve konu etiketleri sağdaki panelde açılır." },
      { title: "Listeyi dışa aktarın", text: "Süzülmüş liste CSV olarak iner; ilgili ekibe iletilebilir." },
    ],
    limits: ["Yankı içeriği listeler ve etiketler; yanıt yazma ya da talep atama özelliği yok."],
    demo: "public",
    preview: "mentions",
    target: { kind: "project", section: "bahsetmeler", query: "niyet:şikayet" },
    targetLabel: "Şikâyetleri demoda aç",
  },
  {
    slug: "kamu-kurumlari-ve-belediyeler",
    group: "organization",
    name: "Kamu kurumları ve belediyeler",
    summary: "Hizmet başlıklarına ve mahallelere göre vatandaşın ne konuştuğunu görün.",
    headline: "Vatandaş hangi hizmeti, nerede konuşuyor?",
    lead: "Konuları hizmet başlıkları ve mahalleler olarak gruplayın; Yankı her biri için hacmi ve tonu ayrı ayrı gösterir. Veri kurulumun yapıldığı makinede kalır.",
    steps: [
      { title: "Mahalle karnesi", text: "Konu grupları mahalle olarak tanımlanabilir; hangi mahallede hangi şikâyetin öne çıktığı okunur." },
      { title: "Kurum içinde çalışır", text: "Tek uygulama ve tek veritabanı dosyası; içerik dışarıdaki bir servise gönderilmez." },
      { title: "Denetim izi", text: "Proje ve sorgu değişiklikleri ile dışa aktarmalar kayda geçer." },
    ],
    limits: ["Kişi dosyası çıkarılmaz; hesaplar platformlar arasında eşleştirilmez.", "Kullanıcı girişi ve rol yönetimi henüz yok."],
    demo: "public",
    preview: "topics",
    target: { kind: "project", section: "analiz" },
    targetLabel: "Analizler'i demoda aç",
  },
  {
    slug: "pr-ve-iletisim",
    group: "organization",
    name: "PR ve iletişim ekipleri",
    summary: "Dönemi dört cümlede okuyun, kanıtıyla birlikte paylaşın.",
    headline: "Dönem raporu, ölçümlerin kendisinden.",
    lead: "Dönem özeti ekrandaki ölçümlerden kurulur; her sayı kendi içerik listesine bağlanır.",
    steps: [
      { title: "Özet uydurmaz", text: "Dönemin özeti hesaplanan ölçümlerden üretilir; dil modeli çıktısı değildir." },
      { title: "Her sayının kanıtı var", text: "Özetteki bir sayıya tıkladığınızda onu oluşturan içerikler açılır." },
      { title: "Dışa aktarma", text: "Süzülmüş içerik listesi CSV olarak iner." },
    ],
    limits: ["PDF rapor ve zamanlanmış e-posta özeti henüz yok."],
    demo: "public",
    preview: "briefing",
    target: { kind: "project", section: "" },
    targetLabel: "Genel Bakış'ı demoda aç",
  },
  {
    slug: "medya",
    group: "organization",
    name: "Medya kuruluşları",
    summary: "Bir haberin hangi kaynak türünde, ne zaman yayıldığını izleyin.",
    headline: "Haber nerede başladı, nereye yayıldı?",
    lead: "Yankı haber sitelerini, sosyal ağları ve video platformlarını ayrı kaynak türleri olarak izler ve her birinin hacmini aynı zaman ekseninde gösterir.",
    steps: [
      { title: "Kaynak türüne göre seyir", text: "Haber, sosyal, forum ve video hacmi alt alta, aynı ölçekte çizilir." },
      { title: "Kapsam açıkça yazılır", text: "Hangi kaynağın bağlı olduğu, en son ne zaman çalıştığı ve ne getirdiği görünür." },
      { title: "Tam metin saklanmaz", text: "Haberlerde yalnızca başlık ve eşleşmenin çevresindeki kısa alıntı tutulur." },
    ],
    limits: ["TV, radyo ve basılı yayın kapsamda değil; lisanslı medya takip sağlayıcısı gerekir."],
    demo: "public",
    preview: "sources",
    target: { kind: "project", section: "kaynaklar" },
    targetLabel: "Kaynaklar'ı demoda aç",
  },
  {
    slug: "ajanslar",
    group: "organization",
    name: "Ajanslar",
    summary: "Her müşteriyi kendi çalışma alanında, birbirinden ayrı izleyin.",
    headline: "Her müşteri için ayrı bir çalışma alanı.",
    lead: "Çalışma alanları projeleri birbirinden ayırır; menüden tek tıkla geçilir ve her alanın kendi karşılaştırması olur.",
    steps: [
      { title: "Alanlar ayrıdır", text: "Bir çalışma alanının projeleri ve karşılaştırmaları diğerine karışmaz." },
      { title: "Proje başına sorgu ve konu", text: "Her projenin kendi arama sorgusu, konu listesi ve kaynak seçimi vardır." },
      { title: "Paylaşılabilir bağlantı", text: "Süzgeç ve dönem adres çubuğunda tutulur; aynı görünüm bağlantıyla açılır." },
    ],
    limits: ["Kullanıcı hesabı, müşteri erişimi ve markalı rapor henüz yok."],
    demo: "public",
    preview: "workspaces",
    target: { kind: "workspace", path: "/projeler" },
    targetLabel: "Projeler'i demoda aç",
  },
];

/** Karşılığı henüz yazılmamış çözümler. Sitede gösterilmez. */
const PLANNED: Planned[] = [
  {
    slug: "konum-analizi",
    group: "use-case",
    name: "Konum analizi",
    summary: "Konuşmanın coğrafi dağılımı.",
    missing: "İçerikten yer adı çıkarma ve harita görünümü; bugün yalnızca elle tanımlanan mahalle konuları var.",
  },
  {
    slug: "urun-analizi",
    group: "use-case",
    name: "Ürün analizi",
    summary: "Ürün ve özellik düzeyinde geri bildirim.",
    missing: "Ürün kataloğu ve özellik düzeyinde ton; bugün yalnızca elle tanımlanan konular var.",
  },
  {
    slug: "tuketici-icgoruleri",
    group: "use-case",
    name: "Tüketici içgörüleri",
    summary: "Kitle ve ilgi alanı çözümlemesi.",
    missing: "Kendiliğinden konu keşfi ve anlatı kümeleme.",
  },
  {
    slug: "sosyal-medya-pazarlamasi",
    group: "use-case",
    name: "Sosyal medya pazarlaması",
    summary: "Yayın planlama ve kampanya ölçümü.",
    missing: "Yayınlama, takvim ve kampanya ölçümü modülleri.",
  },
  { slug: "dijital-pazarlama", group: "use-case", name: "Dijital pazarlama", summary: "Reklam ve kanal performansı.", missing: "Reklam ve web analitiği bağlantıları." },
  { slug: "ilac-ve-saglik", group: "organization", name: "İlaç ve sağlık", summary: "Sektöre özel demo ve konu şablonları.", missing: "Sektör demo verisi ve konu şablonu." },
  { slug: "spor", group: "organization", name: "Spor", summary: "Sektöre özel demo ve konu şablonları.", missing: "Sektör demo verisi ve konu şablonu." },
  { slug: "finans", group: "organization", name: "Finansal hizmetler", summary: "Sektöre özel demo ve konu şablonları.", missing: "Sektör demo verisi ve konu şablonu." },
  { slug: "teknoloji", group: "organization", name: "Teknoloji", summary: "Sektöre özel demo ve konu şablonları.", missing: "Sektör demo verisi ve konu şablonu." },
];

export const SOLUTIONS: readonly Solution[] = AVAILABLE.map((solution) => ({ ...solution, status: "available" as const }));

export const PLANNED_SOLUTIONS: readonly Planned[] = PLANNED;

export const SOLUTION_GROUPS: readonly SolutionGroup[] = ["use-case", "organization"];

export function getSolution(slug: string): Solution | undefined {
  return SOLUTIONS.find((solution) => solution.slug === slug);
}

export function solutionsIn(group: SolutionGroup): Solution[] {
  return SOLUTIONS.filter((solution) => solution.group === group);
}

export function solutionHref(slug: string): string {
  return `/cozumler/${slug}`;
}
