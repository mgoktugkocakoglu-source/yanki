# Araştırma notları

**Tarih:** 12–13 Kasım 2026

Bu belge, Yankı'nın ilk sürümündeki tasarım kararlarının dayandığı araştırmayı özetler. Üç ayrı çalışmadan oluşur: veri kaynaklarının canlı testi, Türkiye'de kamu alımı gereksinimleri, rakiplerin metrikleri ve kullanıcı şikâyetleri. Daha önce hazırlanan iki belgeyi (rakip matrisi ve ana plan) tekrar etmez; onları tamamlar.

**Güven düzeyi.** "Doğrulandı" denen her şey bu makineden yapılan gerçek bir istekle ya da resmî bir belgeyle görülmüştür. "Doğrulanamadı" denenler özellikle işaretlidir. Hukuki konular bilgi amaçlıdır; sözleşme ve ihale öncesinde bir hukukçuyla teyit edilmelidir.

## 1. Veri kaynakları: gerçekte ne erişilebilir?

Her uç nokta 12 Kasım 2026'da bu makineden çağrılarak denendi.

### Anahtarsız çalışanlar

| Kaynak | Sonuç | Yankı'daki durumu |
|---|---|---|
| Yayıncı RSS akışları | 20 yayından 19'u çalışıyor (AA, TRT Haber, Hürriyet, Sabah, NTV, Sözcü, Cumhuriyet, Habertürk, Milliyet, BBC Türkçe, DW Türkçe, Euronews, Diken, Webtekno, ShiftDelete, DonanımHaber, Bloomberg HT, Dünya, Ekonomim). T24'e bu ağdan ulaşılamadı. | Bağlı |
| Bluesky gönderi araması | Yalnızca `api.bsky.app` üzerinde ve `cursor` parametresi olmadan çalışıyor; `lang=tr` süzgeci işliyor. Davranış belgelenmemiş. | Bağlı |
| Google Haberler RSS araması | Çalışıyor; arama başına en çok 100 başlık, bağlantılar Google yönlendirmesi. | Bağlı, "yalnızca kişisel kullanım" etiketiyle |
| App Store yorum akışı | Çalışıyor; uygulama başına en yeni 500 yorum. e-Devlet gibi kamu uygulamaları için değerli. | Sıradaki bağlayıcı |
| Mastodon etiket akışı | Çalışıyor ama hacim çok düşük (`#belediye` için 12 ayda 40 gönderi). | Eklenmedi |
| GDELT | 26 isteğin 19'u hız sınırına takıldı; Türkçe karakterli hiçbir sorgu başarılı olmadı. | Eklenmedi |
| Hacker News, Stack Exchange | Çalışıyor ama Türkçe içerik yok denecek kadar az. | Eklenmedi |

### Çalışmayanlar ve anahtar gerektirenler

| Kaynak | Durum |
|---|---|
| Reddit | Anahtarsız arama 403 ile engelli. Kasım 2025'ten beri yeni API istemcileri onaya tabi; ticari kullanım yazılı anlaşma istiyor. |
| X (Twitter) | Kullandıkça öde: okunan gönderi başına 0,005 ABD doları, ücretsiz katman yok. Günde 10.000 gönderi okumak yaklaşık 50 dolar. [Fiyat sayfası](https://docs.x.com/x-api/getting-started/pricing) |
| YouTube | Anahtarsız arama yok. Ücretsiz API anahtarıyla günde 100 arama. [Kota belgesi](https://developers.google.com/youtube/v3/determine_quota_cost) |
| Instagram | Yalnızca etiket araması; işletme hesabı ve uygulama onayı gerekir; haftada 30 etiket, yalnızca son 24 saat. [Belge](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-facebook-login/hashtag-search) |
| TikTok | Ticari kullanıma açık arama API'si yok; araştırma API'si Türkiye'yi kapsamıyor. [Belge](https://developers.tiktok.com/products/research-api/) |

### Kullanım koşulları

- **Google Haberler ve Bing Haberler RSS:** Akışların kendi telif notu kullanımı "kişisel, ticari olmayan" ile sınırlıyor. Satılan bir üründe kullanılamaz; yerini lisanslı bir haber sağlayıcısı almalı.
- **Yayıncı akışları:** İçerik telif altında. Başlık, kısa özet ve bağlantı saklamak düşük riskli kalıptır; Hürriyet, Milliyet, NTV ve Webtekno akışlarındaki tam metni yeniden yayımlamak lisans gerektirir. Yankı bu yüzden haberlerde yalnızca kısa bir alıntı saklar.
- **Ekşi Sözlük:** [Kullanım koşulları](https://eksisozluk.com/registration/eula) ticari kullanımı yazılı izne bağlıyor; `robots.txt` yapay zekâ tarayıcılarını açıkça yasaklıyor.
- **Şikayetvar:** [`robots.txt`](https://www.sikayetvar.com/robots.txt) arama ve şikâyet ayrıntı sayfalarını taramaya kapatıyor.
- **Telegram:** [Koşullar](https://telegram.org/tos/content-licensing) platformdan veri kazımayı yasaklıyor.

**Sonuç.** Anahtarsız kaynaklar bir prototip için yeterli, satılan bir ürün için yetersizdir. Sosyal medyanın asıl hacmi (X, Instagram, TikTok) ücretli ya da onaya bağlıdır; veri lisansı maliyeti altyapı maliyetini geçebilir.

## 2. Kamu kurumlarına satış: gereksinimler

### En önemli dört bulgu

1. **Kurum içinde çalışan model güvenli varsayılandır.** KVKK'nın üretken yapay zekâ rehberi (24 Kasım 2025), yurt dışında barındırılan bir yapay zekâ hizmetini kullanmayı yurt dışına veri aktarımı sayıyor ve hesabın herkese açık olmasının gönderileri serbestçe işlenebilir kılmadığını belirtiyor. [Rehber](https://www.kvkk.gov.tr/Icerik/8547/uretken-yapay-zeka-ve-kisisel-verilerin-korunmasi-rehberi-15-soruda)
2. **Bulut yasak değil, ama veri Türkiye'de ve kurum denetiminde kalmalı.** Bilgi ve İletişim Güvenliği Rehberi artık Siber Güvenlik Başkanlığı'na bağlı; Temmuz 2026'da içeriğinin değişmediği ve uyumun zorunlu olduğu teyit edildi. [Sıkça sorulan sorular](https://cdn.siberguvenlik.gov.tr/dokuman/26/07/260702174807_Bilgi%20ve%20%C4%B0leti%C5%9Fim%20G%C3%BCvenli%C4%9Fi%20S%C4%B1k%C3%A7a%20Sorulan%20Sorular%20Dok%C3%BCman%C4%B1.pdf)
3. **Olağan alım yolu, doğrudan teminle yıllık aboneliktir.** 2026 için 22/d sınırı büyükşehir sınırları içinde 1.021.827 TL. [Tebliğ](https://www.alomaliye.com/2026/01/22/kamu-ihale-tebligi-no-2026-1-4734-sayili-kanun-esik-degerler-ve-parasal-limitler/) Açık ihalede Kamu Bilişim Yetki Belgesi istenir; bu belge ISO 27001 şartı taşır. [Yetkilendirme](https://www.alomaliye.com/2022/06/29/kamu-bilisim-hizmet-alimi-katilimcilarin-yetkilendirilmesi/)
4. **Kişi takibi itibar ve hukuk riskidir.** Anayasa Mahkemesi kolluğun "sanal devriye" yetkisini iptal etti (E.2018/91, K.2020/10). Bir belediyenin "kurum kimliğine zarar verebilecek hesapların takibi" içeren sözleşmesi basında "fişleme" olarak haberleştirildi. Yankı bu yüzden kişi değil konu ve kurum odaklıdır; hesap dosyası tutmaz.

### Şartnamelerde yinelenen istekler

Sekiz belge incelendi (bir vakıf üniversitesi şartnamesi, Beşiktaş Belediyesi şartnamesi, İletişim Başkanlığı CİMER yapay zekâ gereksinim belgesi, İzmir Büyükşehir ihale ilanı, bir bakanlığın bilgi güvenliği kontrol listesi, bir Sayıştay raporu ve iki basın haberi). Örneklem küçüktür; sıklıklar yön gösterir.

| İstek | Yankı v0.1 |
|---|---|
| Duygu ve algı analizi, konu sınıflandırması | Var (sözlük tabanlı) |
| İl, ilçe, mahalle kırılımı; "Mahalle Karnesi" | Var (konu grupları) |
| Anomali ve erken uyarı | Var |
| Pano ve dışa aktarma | Pano var; yalnızca CSV |
| Günlük, haftalık, aylık rapor; PDF, Excel, Word | Yok |
| LDAP, iki adımlı doğrulama, rol tabanlı yetki, giriş kayıtları | Yok |
| Kurum sunucusunda çalışma, verinin dışarı çıkmaması | Mimari uygun; kurulum paketi yok |
| KVKK ve gizlilik hükümleri, yurt dışına aktarım yasağı | Dışarıya model çağrısı yok |
| Sızma testi, OWASP, kaynak kod analizi | Yapılmadı |
| Mobil uygulama ve anlık bildirim | Yok |
| Kaynak kod, model ve belgelerin teslimi; eğitim | Kod açık ve belgeli |

Kaynaklar: [CİMER gereksinim belgesi](https://tubitak.gov.tr/sites/default/files/2025-02/CBIB_CIMER_Teknik_Ister_Dokumani.pdf), [Beşiktaş şartnamesi](https://www.ito.org.tr/documents/sartname(15).pdf), [Sayıştay raporu](https://kararlar.sayistay.gov.tr/reports/download/47o87weYy6-ankara-kalkinma-ajansi).

### KVKK'dan tasarıma yansıyanlar

- Saklama ve imha politikası zorunlu; periyodik imha aralığı altı ayı geçemez. [Yönetmelik](https://www.kvkk.gov.tr/Icerik/5441/KISISEL-VERILERIN-SILINMESI-YOK-EDILMESI-VEYA-ANONIM-HALE-GETIRILMESI-HAKKINDA-YONETMELIK)
- Kamu kurumlarının kişisel veriyi internette paylaşması için ilke kararı (2026/1301): geçerli dayanak, maskeleme, süre sınırı. Vatandaş gönderilerini yeniden gösteren bülten ve raporlar bunun kapsamındadır. [Duyuru](https://www.kvkk.gov.tr/Icerik/8835/kamu-tuzel-kisiligini-haiz-veri-sorumlulari-tarafindan-kisisel-verilerin-internet-ortaminda-paylasilmasi-hakkinda-kisisel-verileri-koruma-kurulunun-01-07-2026-tarihli-ve-2026-1301-sayili-ilke-kararina-iliskin-kamuoyu-duyurusu)
- Özel nitelikli veri (siyasi görüş, din, sağlık) meşru menfaate dayanarak işlenemez. Kişiler hakkında siyasi ya da dinî sınıflandırma yapılmamalıdır.
- "Dezenformasyon" etiketi TCK 217/A nedeniyle hukuken yüklüdür; otomatik etiket yerine "incelenecek iddia" ve insan kararı kullanılmalıdır.
- Web siteleri ve mobil uygulamalar için WCAG 2.2 A düzeyi zorunlu (2025/10 sayılı Genelge). [Genelge](https://www.alomaliye.com/2025/06/21/web-siteleri-ve-mobil-uygulamalarin-erisilebilirligi-2025-10/)

Doğrulanamayanlar: kazıma ya da sosyal medya izlemeye özgü bir Kurul kararı bulunamadı; bir hizmet olarak yazılımın 5651 kapsamında yer sağlayıcı sayılıp sayılmayacağı belirsiz; DMO Tekno Katalog'un yazılım için güncel koşulları okunamadı.

### Kurum içinde çalışabilecek Türkçe modeller

| Model | Görev | Lisans |
|---|---|---|
| [dbmdz/bert-base-turkish-cased](https://huggingface.co/dbmdz/bert-base-turkish-cased) | İnce ayar için temel | MIT |
| [ytu-ce-cosmos/modernbert-tr-base](https://huggingface.co/ytu-ce-cosmos/modernbert-tr-base) | Uzun bağlamlı temel (2026) | Apache-2.0 |
| [VRLLab/TurkishBERTweet](https://huggingface.co/VRLLab/TurkishBERTweet) | Tweet dili; ton ve nefret söylemi eklentileri | MIT |
| [ytu-ce-cosmos/modernbert-tr-pii-ner](https://huggingface.co/ytu-ce-cosmos/modernbert-tr-pii-ner) | Kişisel veri tespiti (25 tür) | Apache-2.0 |
| [Trendyol/Trendyol-LLM-8B-T1](https://huggingface.co/Trendyol/Trendyol-LLM-8B-T1) | Özet ve açıklama için dil modeli | Apache-2.0 |
| [BAAI/bge-m3](https://huggingface.co/BAAI/bge-m3) | Çok dilli gömme | MIT |

En çok indirilen Türkçe ton modelinin ([savasy/bert-base-turkish-sentiment-cased](https://huggingface.co/savasy/bert-base-turkish-sentiment-cased)) beyan edilmiş bir lisansı yok ve yalnızca iki sınıflı. Üç sınıflı bir modeli MIT ya da Apache lisanslı bir temel üzerinde kendi verinizle eğitmek daha sağlam yoldur.

## 3. Rakipler: nerede açık var?

### Fiyat (Brand24, resmî fiyat sayfası)

| Paket | Aylık (yıllık ödemede) | Anahtar kelime | Aylık bahsetme | Yenileme |
|---|---|---|---|---|
| Individual | 199 USD | 3 | 2.000 | 12 saatte bir |
| Team | 299 USD | 7 | 10.000 | Saatlik |
| Pro | 399 USD | 12 | 40.000 | Gerçek zamanlı |
| Business | 599 USD | 25 | 100.000 | Gerçek zamanlı |

Şubat 2026'da fiyatlar %20–33 arttı. Anomali açıklaması, yapay zekâ asistanı, PDF rapor ve demografi Pro ve üzeri paketlere bağlı; gelişmiş Boolean arama yalnızca Business ve üzerinde.

### Kullanıcıların en çok yinelediği şikâyetler

İnceleme siteleri doğrudan erişimi engelledi; bulgular arama motoru alıntılarına ve ikincil derlemelere dayanır, sıklıklar yön gösterir.

| Şikâyet | Yankı'nın yanıtı |
|---|---|
| İlgisiz, gürültülü sonuçlar; elle temizlik | Kaydetmeden önce gerçek kaynaklardan önizleme; "ilgisiz" işareti; Türkçe ek farkında eşleşme |
| Ton analizi ironiyi ve İngilizce dışı dilleri kaçırıyor; doğruluk yayımlanmıyor | Karar kanıtıyla birlikte; kullanıcı düzeltmesi; sınırlar açıkça yazılı. Ölçülmüş doğruluk henüz yok |
| Güvenilmeyen metrikler (erişim, gösterim, reklam eşdeğeri) | Her metriğin formülü bir tık ötede; erişim verisi yoksa sayı uydurulmaz; reklam eşdeğeri yok |
| Dik öğrenme eğrisi; Boolean yalnızca pahalı pakette | Sihirbaz ve tam sorgu dili herkese açık; Türkçe işleçler; yazarken doğrulama |
| Çizelgeler eyleme götürmüyor | Pano yerine bülten: ne değişti, neden, nereye bakmalı |
| Yüksek fiyat, ani zam, otomatik yenileme | Ürün değil iş modeli konusu |
| Instagram, TikTok, LinkedIn kapsamı zayıf | Çözülmedi; herkes için aynı erişim kısıtı |

Brand24'ün kendi belgeleri sosyal erişim için birbiriyle çelişen üç tanım veriyor ve bileşik skorlarının (Presence, Reputation, Influence) ağırlıklarını yayımlamıyor. Hiçbir sağlayıcı Türkçe doğruluk rakamı yayımlamıyor; Brandwatch Türkçe için "en fazla %75 güven" diyor.

### 2026'da kategorinin tabanı

Sohbet asistanı, yapay zekâyla yazılan Boolean sorgu, sıçrama açıklaması, yapay zekâ yanıtlarında görünürlük takibi ve MCP sunucusu artık büyük oyuncuların hepsinde var (Brand24, Meltwater, Sprinklr, Hootsuite/Talkwalker). Momentuma göre sıralanan anlatı kümeleme Pulsar dışında hâlâ nadir. Türkiye'deki oyuncularda (BoomSonar, Somera, MTM) bu yeniliklere dair resmî duyuru bulunamadı.

### Tasarımda bilerek kaçınılanlar

Trafik ışığı renkli ton pastası, kelime bulutu, çift eksenli hacim-erişim çizgisi, on iki eşit kutuluk pano, mavi-beyaz kenar çubuklu düzen, formülü görünmeyen bileşik skor, her sekmeye eklenmiş "yapay zekâ özeti" kutusu. Yankı'da ton tek bir bölmeli şeritle, konular sıralı çubuklarla, kaynaklar sırt grafiğiyle gösterilir; hiçbir grafikte iki ölçek yoktur.

## 4. Bu sürümde doğrulananlar

| Doğrulama | Sonuç |
|---|---|
| Testler | 137 test geçiyor |
| SQL derleyici ile bellek içi eşleştirici | 11 sorguda birebir aynı sonuç |
| Liste, sayım, zaman serisi, kaynak dağılımı | Aynı toplam |
| Canlı toplama ("e-Devlet" sorgusu, 13 Kasım 2026) | 20 akıştan 866 aday, Google Haberler'den 136, Bluesky'dan 25; 116 eşleşme |
| Üretim derlemesi | Başarılı; tüm sayfalar kısmi ön işleme ile |
| Palet | 5 kategorik renk ve ton çifti, açık ve koyu yüzeyde renk körlüğü benzetiminden geçti |

Ölçülmeyenler: ton çözümleyicinin gerçek veride doğruluğu, yük altında performans, erişilebilirlik denetimi (yalnızca tasarım kurallarına uyuldu, bağımsız test yapılmadı).
