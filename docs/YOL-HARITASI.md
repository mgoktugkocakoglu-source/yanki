# Yol haritası (iç belge)

Bu belge ekip içindir; sitede yayımlanmaz. Buradaki başlıklar henüz üründe yoktur.

Ürünün yönü: marka izleme değil, **gündem tarama**. Hedef; geniş kaynak kapsamı, yapay zekâ destekli çözümleme, dillere göre anahtar kelimeyle arama ve dezenformasyonla mücadele araçları olan bir sosyal dinleme platformu.

## Sırada

- **X ve geniş kaynak kapsamı.** X ve YouTube bağlayıcıları yazıldı (`src/server/collectors/x.ts`, `youtube.ts`); gerçek API anahtarıyla henüz denenmedi. Ardından lisanslı sağlayıcılar üzerinden TikTok, Instagram ve Reddit. Koşullar `src/server/collectors/registry.ts` içindeki `PLANNED_SOURCES` listesinde.
- **Anlatı kümeleme.** Aynı iddiayı ya da hikâyeyi farklı sözlerle anlatan içeriklerin tek anlatı altında toplanması.

## İçgörü özellikleri (24 Kasım 2026)

Yapıldı: dönem raporu ve PDF çıktısı (`src/components/report-view.tsx`), salt okunur paylaşım bağlantısı (`/paylasim/[token]`), düz yazıyla soru (`src/server/services/ai-ask.ts`), uyarı duyarlılığı (düşük/orta/yüksek; yalnızca Uyarılar ekranında), platforma göre olumsuz oranının seyri (Analizler).

Sırada: rapor içeriğini seçme (özel rapor), grafik başına isteğe bağlı yapay zekâ yorumu, Genel Bakış ve bildirimlerde duyarlılık ayarının kalıcı saklanması, e-posta ile uyarı.

Ertelendi: sosyal medya yönetimi (gönderi planlama, onay akışı, gelen kutusu). Kurumun kendi hesapları adına işlem yapmayı gerektirir; kullanıcı girişi ve platform onaylarından sonra ayrı modül olarak ele alınacak.

## Yeni platform ekleme

Altyapı her platform için aynıdır; yeni bir kaynak şu adımlarla eklenir:

1. `src/server/collectors/<ad>.ts` içinde `Connector` yazılır: `descriptor` (ad, tür, koşullar, `requiredSetting`, varsa `dailyLimit` ve `minIntervalMinutes`), `isConfigured` ve `collect`. Sorgu `collectors/query.ts` yardımcılarıyla kurulur; `collect` yalnızca aday getirir, eşleşme yerelde yapılır.
2. Anahtar `src/server/config.ts` içinde okunur, `.env.example` dosyasına yazılır.
3. Bağlayıcı `registry.ts` içindeki `ALL_CONNECTORS` listesine eklenir, varsa `PLANNED_SOURCES` kaydı silinir.

Bunlar yapıldığında platform kendiliğinden arama ekranındaki seçimde, proje formunda, Kaynaklar ekranında, zamanlayıcıda, platforma göre duygu dağılımında ve tanıtım sitesindeki sayılarda görünür. Anahtar girilene kadar "anahtar bekleniyor" olarak durur.

Platform durumu (24 Kasım 2026):

| Platform | Durum | Eksik |
|---|---|---|
| Haber siteleri, Google Haberler, Bluesky, YouTube | Çalışıyor | — |
| X | Kod hazır, gerçek anahtarla denenmedi | `X_BEARER_TOKEN` (ücretli) |
| Reddit | Kod hazır, gerçek anahtarla denenmedi; yalnızca gönderiler | Reddit ile ticari anlaşma, `REDDIT_CLIENT_ID` + `REDDIT_CLIENT_SECRET` |
| Instagram | Yok | Meta onayı. API yalnızca etiket araması veriyor (haftada 30 etiket): toplama planına "etiket" kipi ve haftalık etiket sayacı gerekir |
| Facebook | Yok | Meta onayı. Anahtar kelime araması yok: projeye "izlenecek sayfalar" listesi ve sayfa akışı okuyan bağlayıcı gerekir |
| TikTok | Yok | Lisanslı veri sağlayıcısı; bağlayıcı sağlayıcının API'sine göre yazılır |
| Tumblr | Yok | Koşulların incelenmesi; yalnızca etiket araması |

## Planlanan

- **Yapay zekâ destekli çözümleme.** İlk adım yapıldı: Genel Bakış'ta isteğe bağlı yapay zekâ özeti (`src/server/ai/`, `src/server/services/ai-summary.ts`). Sağlayıcı bulut (Claude API); anahtar yokken kapalı. İkinci adım da yapıldı: dil modeliyle ton ve konu sınıflandırması (`src/server/services/ai-classify.ts`; elle başlatılır, sonuç `mentions.ai_sentiment` ve `mention_topics.source = 'ai'` içinde). Sırada: yeni toplanan içeriğin otomatik sınıflandırılması (maliyet tavanıyla), duygu/niyet/ironi alanları, etiketli kümeyle doğruluk ölçümü, sıçrama açıklaması ve `AiProvider` arayüzüne takılacak yerel model (kamu kurumları için; bkz. `docs/ARASTIRMA.md`, KVKK rehberi).
- **Çok dilli arama.** Anahtar kelimelerin dile göre tanımlanması; Türkçe dışındaki dillerde de eke duyarlı eşleşme.
- **Dezenformasyonla mücadele modülü.** İlk adım yapıldı: "İddialar" ekranı (`src/server/services/claims.ts`, `src/server/factcheck/google.ts`) iddiaları çıkarır ve yayımlanmış doğrulamalarla eşleştirir; hüküm vermez. Tasarım, Full Fact ve Meedan Check'in yöntemini izler (iddia bul, mevcut doğrulamayla eşleştir, kararı insana bırak). Sırada: Fact Check Tools API'nin Google projesinde etkinleştirilip Türkçe kapsamının ölçülmesi; Teyit / Doğruluk Payı / Doğrula kayıtlarının doğrudan okunması (izin gerekir); iddianın zaman içindeki yayılımı ve ilk kaynağı (tüm içerikler üzerinden); eşgüdümlü yayılım işaretleri; kaynak geçmişi. Çözüm sayfası (`dezenformasyonla-mucadele`) eşleştirme çalışır hâle gelince yayına alınacak.
- **Kullanıcılar, kurumlar ve yetkiler (yapıldı, 24 Kasım 2026).** Üç katman: sistem yöneticisi, kurum yöneticisi (yetkileri sistem yöneticisi verir), kullanıcı. Kurumlar (koltuk sınırı, izinli alan adları, askıya alma), kurum kredi havuzu ve defteri, davet bağlantısıyla e-posta yetkilendirme, parola sıfırlama bağlantısı ve parola değiştirme, kurum bazlı denetim izi (`src/domain/permissions.ts`, `src/server/auth/`, `src/server/repositories/{users,organizations,invitations}.ts`, `src/server/auth-actions.ts`). Eksikler: davet ve sıfırlama bağlantısının e-postayla gönderilmesi (SMTP), kullanıcının kendi başına "parolamı unuttum" akışı, iki adımlı doğrulama, LDAP/SSO, birden çok sistem yöneticisi, kurum başına ayrı çalışma alanı ve ortak konuların kuruma özel olması (hazır gündem konuları şu an tüm kurumlara ortak), konuyu başka kullanıcıyla paylaşma, kurum bazlı kredi tarifesi ve aylık kota, zamanlayıcının taradığı konular için kredi, giriş denemesi sınırının süreçler arası paylaşılması, sistem yöneticisi parolası unutulursa kurtarma yolu.
- **Aramada dil seçimi (yapıldı).** Arama ekranında tek dil seçilebiliyor; seçim sorguya `dil:` süzgeci olarak eklenir. Birden çok dil seçimi ve Türkçe dışı dillerde eke duyarlı eşleşme yok.

Yapıldı: kargo demosu kaldırıldı. Panelin girişi arama ekranı (`/ara`); canlı alanda üç hazır gündem projesi gerçek kaynaklardan toplanıyor (`src/server/demo/agenda.ts`). Kurgusal belediye demosu, ekranları dolu göstermek ve testler için duruyor.

## Çözümler

Tanıtım sitesindeki "Çözümler" menüsü ve `/cozumler` sayfaları `src/domain/solutions.ts` kaydından üretilir. Kayıtta iki liste var:

- **Yayında (10):** panelde çalışan bir ekrana karşılık gelenler. Her sayfa o ekranın canlı önizlemesini gösterir. Bugünkü sınırlar kayıtta (`limits`) durur ama sitede gösterilmez (kullanıcı kararı, 24 Kasım 2026).
- **Planlanan (10, sitede görünmez):** dezenformasyonla mücadele, konum analizi, ürün analizi, tüketici içgörüleri, sosyal medya pazarlaması, dijital pazarlama ve dört sektör (ilaç ve sağlık, spor, finans, teknoloji). Her birinin yanında eksik olan modül yazılı.

Bir modül yazıldığında yapılacak iş: kaydı `PLANNED` listesinden `AVAILABLE` listesine taşımak ve önizleme türünü belirlemek. Hedef, planlananların tümünün kodlanması.

## Sınırlar

- Kişi dosyası çıkarılmaz, hesaplar platformlar arasında eşleştirilmez, kimlik tespiti yapılmaz.
- Kullanım koşullarını çiğneyen kazıma yapılmaz.
