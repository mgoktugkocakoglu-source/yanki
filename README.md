# Yankı

Türkçe öncelikli medya izleme ve sosyal dinleme platformu. Bir kurum, marka ya da konu hakkında haberlerde ve sosyal mecralarda ne konuşulduğunu toplar, tonunu çözümler, olağan dışı hareketleri nedenleriyle birlikte gösterir.

Bu depo, yerelde tek komutla çalışan ilk sürümdür (v0.1).

## Çalıştırma

Gereken tek şey Node.js 22.13 ya da daha yenisidir (24 ile geliştirildi). Docker ya da ayrı bir veritabanı kurulumu gerekmez.

```bash
npm install
npm run dev
```

Ardından <http://localhost:3000> adresini açın.

İlk açılışta veritabanı kendiliğinden kurulur (ayrı bir sunucu gerekmez; gömülü PostgreSQL `data/pg` klasörüne yazar) ve iki çalışma alanı oluşur:

| Çalışma alanı | İçerik |
|---|---|
| Çalışma alanım (canlı) | Arama ekranı (`/ara`) ve üç hazır gündem projesi: COP31, İsrail seçimleri, İran–İsrail gerilimi. İçerikler bağlı kaynaklardan gerçek olarak toplanır |

Panelde üretilmiş (kurgusal) içerik yoktur: görünen her şey bağlı kaynaklardan toplanmış gerçek içeriktir. `src/server/fixtures/` altındaki üretilmiş veri yalnızca otomatik testlerde yüklenir.

Kendi projenizi açmak için **Projeler → Yeni proje**. Kaydetmeden önce "Önizle" ile sorgunun gerçek kaynaklardan ne getirdiğini görebilirsiniz.

### Komutlar

| Komut | Ne yapar |
|---|---|
| `npm run dev` | Geliştirme sunucusu |
| `npm run build` ve `npm run start` | Üretim derlemesi ve sunucusu |
| `npm test` | Birim ve uçtan uca testler (bellek içi veritabanı) |
| `npm run lint` | Kod denetimi |
| `npm run typecheck` | Rota tiplerini üretir ve tip denetimi yapar |
| `npm run kaynak-dene -- "ifade"` | Bağlayıcıları canlı kaynaklara karşı dener; hiçbir şey kaydetmez |
| `npm run sqlite-aktar` | Eski SQLite dosyasındaki (`data/yanki.db`) veriyi PostgreSQL'e bir kez taşır; hedef doluysa dokunmaz |
| `npm run format` | Tüm kodu Prettier ile biçimlendirir (`format:check` yalnızca denetler) |
| `npm run haber-tara` | Haber tarayıcısını canlı akışlara karşı geçici bir veritabanında dener ve akış akış rapor verir (`-- --kaydet` ile asıl arşive yazar) |

### Yapılandırma

Tümü isteğe bağlıdır; örnekleri `.env.example` dosyasındadır.

| Değişken | Varsayılan | Anlamı |
|---|---|---|
| `DATABASE_URL` | boş | PostgreSQL bağlantı adresi (`postgres://kullanici:parola@sunucu:5432/veritabani`). Boşsa gömülü PostgreSQL kullanılır |
| `YANKI_DB_POOL_SIZE` | `10` | Bağlantı havuzundaki en çok bağlantı (yalnızca `DATABASE_URL` ile) |
| `YANKI_PG_DIR` | `data/pg` | Gömülü PostgreSQL'in veri klasörü |
| `YANKI_COLLECT_INTERVAL_MINUTES` | `15` | Canlı projelerin otomatik taranma aralığı; `0` kapatır |
| `YANKI_NEWS_INTERVAL_MINUTES` | `10` | Haber arşivinin akışları yeniden tarama aralığı; `0` kapatır |
| `YANKI_NEWS_RETENTION_DAYS` | `90` | Haber arşivinde başlıkların saklanma süresi (gün) |
| `YANKI_DEPLOYMENT` | `local` | `institution` yapılırsa yalnızca kişisel kullanıma izinli kaynaklar zorla kapanır |
| `YANKI_USER_AGENT` | `YankiBot/0.1 …` | Kaynaklara giden isteklerdeki tanıtıcı ad |

## Bu sürümde ne var

**Ekranlar**

- **Tanıtım sayfası** (`/`): Panelin kendi bileşenleri ve ortak gündem konularının gerçek verisiyle çizilir; müşteri logosu, kullanıcı sayısı gibi doğrulanamayan kanıt içermez. "Demoyu incele" çalışan paneli (`/panel`) açar.
- **Çözümler** (`/cozumler`, `/cozumler/[slug]`): Kullanım alanına ve kurum türüne göre sayfalar. `src/domain/solutions.ts` kaydından üretilir; yalnızca panelde karşılığı olan çözümler yayımlanır.
- **Genel Bakış**: Dört ölçüm kartı (toplam bahsedilme, tahmini erişim, olumlu içerik oranı, aktif uyarı), zaman içinde hacim, duygu dağılımı, dönemin özeti ve öne çıkan gelişmeler. Cümlelerdeki her ölçüm kanıtına bağlanır.
- **Bahsedilmeler**: Sorgu çubuğu, ton ve kaynak süzgeçleri, etkin süzgeç etiketleri, eşleşen kelimelerin vurgulanması, sağda ayrıntı paneli (`secili` parametresi), ton düzeltme, "ilgisiz" işaretleme, CSV dışa aktarma.
- **Analiz**: Konu karnesi (belediyeler için mahalle karnesi), gün ve saat yoğunluk haritası, niyet, duygu, kaynak ve yazar dağılımları.
- **Uyarılar**: Olağan dışı günler ve her birinin açıklaması: artışın kaynağı, en çok yayılan başlık, konular, öne çıkan kelimeler.
- **Rakipler** (`/karsilastirma`): Projeler arasında ses payı, zaman içinde hacim ve ton.
- **Kaynaklar**: Hangi kaynak bağlı, en son ne zaman çalıştı, ne getirdi, hangi koşulla kullanılabilir. "Sıfır içerik" ile "kaynağa ulaşılamadı" ayrı durumlardır.
- **Komuta merkezi**: Duvar ekranı için koyu, kendini yenileyen görünüm.
- **Denetim izi**: Proje, konu, ton düzeltmesi ve dışa aktarma kayıtları.

**Sorgu dili (iç kullanım)**

```text
("Örnek Kurum" OR ornekkurum) VE (fatura VEYA kesinti) DEĞİL çekiliş dil:tr
seçim YAKIN/5 (sonuç OR sandık)
gecik* ton:olumsuz -kaynak:haber takipçi:>5000
```

Türkçe ekler kendiliğinden yakalanır: `seçim` yazmak `seçimler`, `seçimde`, `seçimin` için yeterlidir, ama `kar` yazmak `karar` ya da `karşı`yı getirmez. Türkçe karakterli ve karaktersiz yazımlar (`şikayet`, `sikayet`) aynı sayılır. İşleçlerin Türkçe ve İngilizce biçimleri eşdeğerdir. Bu dil arayüzde gösterilmez: kullanıcı kelime listeleri girer, sorgu arka planda kurulur (`src/lib/query/plain.ts`).

**Bağlı kaynaklar**

| Kaynak | Tür | Koşul |
|---|---|---|
| Türkiye haber arşivi | 54 yayıncının 90 akışı sürekli taranır (`src/server/news/`); başlıklar 90 gün arşivde tutulur ve konular arşivden eşleştirilir | Başlık, kısa özet ve bağlantı saklanır; tam metin saklanmaz. robots.txt kurallarına uyulur |
| Bluesky | Herkese açık gönderi araması | Açık uç nokta; davranışı belgelenmemiştir, değişebilir |
| Google Haberler araması | Anahtar kelimeyle haber başlıkları | **Yalnızca kişisel kullanım.** Akışın kendi koşulu ticari kullanımı yasaklar |

| X (Twitter) | Resmî API ile gönderi araması | **Anahtar gerekir, ücretlidir.** `X_BEARER_TOKEN`; günlük okuma tavanı `YANKI_X_DAILY_POST_LIMIT` |
| YouTube | Resmî API ile video araması | **Anahtar gerekir, ücretsizdir.** `YOUTUBE_API_KEY`; en sık 30 dakikada bir taranır |

X ve YouTube bağlayıcıları resmî belgelere göre yazıldı ama **gerçek bir anahtarla henüz sınanmadı**. Anahtar tanımlı değilken Kaynaklar ekranında "anahtar bekleniyor" olarak görünürler. Tarama sıklığı `YANKI_COLLECT_INTERVAL_MINUTES` ile dakikaya kadar indirilebilir; X'te maliyeti günlük tavan sınırlar.

Instagram, Reddit, TikTok, Ekşi Sözlük, Şikayetvar ve TV/radyo **bağlı değildir**; her birinin neden bağlı olmadığı ve bağlanması için ne gerektiği Kaynaklar ekranında yazar.

## Bilinen sınırlar

Bunları bilerek kullanın; hiçbiri arayüzde gizlenmez.

- **Yapay zekâ özeti isteğe bağlıdır.** `.env.local` dosyasına `ANTHROPIC_API_KEY` yazılmadıkça kapalıdır ve hiçbir içerik dışarı gönderilmez. Açıkken yalnızca kullanıcı düğmeye bastığında çalışır; seçili dönemin en yeni 120 içeriğinin ilk 400 karakteri Claude API'ye gönderilir (yurt dışına veri aktarımıdır) ve kullanım başına ücretlendirilir. Çıktı "dil modeli çıktısı" olarak etiketlenir; her gönderim denetim izine yazılır.
- **Dil modeliyle ton ve konu sınıflandırması isteğe bağlıdır.** Genel Bakış'taki düğmeyle başlatılır; her basışta seçili dönemin sınıflandırılmamış en çok 300 içeriği 30'luk gruplarla gönderilir (varsayılan model `claude-haiku-5-5`). Sonuç ayrı sütunda saklanır: kural tabanlı sonuç silinmez, insan düzeltmesi her zaman önceliklidir (`effectiveSentiment`). Model yalnızca projenin tanımlı konularından seçer ve konu ekler, kural tabanlı eşleşmeyi kaldırmaz. Duygu, niyet ve ironi alanları hâlâ kural tabanlıdır. Doğruluğu etiketli bir veri kümesiyle ölçülmemiştir.
- **Giriş, sistem yöneticisi oluşturulana kadar zorunlu değildir.** Hiç hesap yokken panel giriş istemeden açılır (yerel kurulum). `/giris` ekranında sistem yöneticisi hesabı oluşturulduğu andan itibaren panel oturum ister. Parolalar scrypt ile özetlenir; oturum, davet ve sıfırlama anahtarlarının yalnızca özeti saklanır; beş hatalı denemeden sonra giriş 15 dakika kilitlenir. E-posta gönderimi yoktur: davet ve parola sıfırlama bağlantısı ekranda bir kez gösterilir, kişiye yetkili iletir. E-posta doğrulama, iki adımlı doğrulama ve kurumsal dizinle (LDAP/SSO) giriş yoktur. İnternete açık kurulumdan önce bağımsız bir güvenlik incelemesi yapılmalıdır.
- **Üç katmanlı yetki.** *Sistem yöneticisi* (platformun sahibi, kurum dışı) kurumları açar, kurum yöneticilerini atar, yetkilerini verir ve kurum kredi havuzunu doldurur (`/sistem`). *Kurum yöneticisi* yalnızca kendi kurumunda ve yalnızca kendisine verilen yetkiler kadar iş yapar (`/yonetim`): e-posta yetkilendirme, hesap yönetimi, kredi dağıtımı, tüm konuları görme, denetim izi. Kendi yetkisini ya da kimsenin rolünü değiştiremez. *Kullanıcı* kendi konularını ve ortak konuları görür, kredisini harcar (`/hesabim`). Kurallar tek yerdedir: `src/server/auth/access.ts`; roller ve yetki listesi `src/domain/permissions.ts`. Her sunucu işlevi kuralı yeniden denetler; düğmenin gizli olması denetim sayılmaz.
- **Kredi iki aşamada akar.** Sistem yöneticisi kurum havuzunu doldurur; kurum içinde yetkili kişi havuzdan kullanıcılara dağıtır. Havuz ve kullanıcı bakiyesi aynı veritabanı işleminde değişir, her hareket deftere yazılır. Davetle verilen kredi davet anında havuzdan ayrılır, iptalde geri döner. Kredi yalnızca işlem başarıyla bitince düşülür; sistem yöneticisinden düşülmez. Kurumun koltuk sınırı ve izinli e-posta alan adları davet sırasında denetlenir; askıya alınan kurumun kullanıcıları giremez.
- **Rapor bağlantısı parola istemez.** `/paylasim/<anahtar>` adresini bilen herkes raporu salt okunur görür; anahtar tahmin edilemez uzunluktadır ve Rapor ekranından iptal edilebilir. Kullanıcı girişi eklenene kadar erişim denetimi yalnızca budur.
- **Soru sorma yanıtı saklamaz.** Dönemin hesaplanmış ölçümleri ve en yeni 100 içerik dil modeline gönderilir; model yalnızca bu ölçümlerdeki sayıları kullanacak şekilde yönlendirilir, ama çıktı yine de hata içerebilir.
- **İddia taraması hüküm vermez.** "İddialar" ekranı dil modeliyle içeriklerden kontrol edilebilir iddiaları çıkarır (en yeni 150 içerik, en çok 12 iddia) ve Google Fact Check Tools API'de yayımlanmış doğrulamaları arar; bulunan kayıtların aynı iddiayla ilgili olup olmadığına yine dil modeli karar verir. Doğru/yanlış değerlendirmesi yalnızca adı ve bağlantısı gösterilen doğrulama kuruluşuna aittir. Arama için Google projesinde "Fact Check Tools API" etkin olmalıdır; değilse iddialar yine çıkarılır, eşleştirme yapılmaz. API'nin Türkçe kapsamı ölçülmedi.
- **Ton çözümleyici sözlük ve kural tabanlıdır.** Hızlı, çevrimdışı ve denetlenebilirdir, ama bir dil modeli değildir ve doğruluğu etiketli bir veri kümesiyle ölçülmemiştir. İroni tespiti yalnızca "övgü + hizmet aksaklığı" kalıbını ve `(!)` işaretini yakalar. Aynı metinde iki kuruma farklı ton (ör. "A iyi ama B kötü") ayrıştırılmaz.
- **Kapsam dardır.** Haber tarafı, yayıncıların kendi akışlarında yayımladığı başlık ve özetlerle sınırlıdır: makale sayfaları taranmaz, tam metin yoktur, akışı olmayan ya da akışı bizim tanıtıcımıza kapalı yayınlar (ör. İHA, DHA, T24) arşivde yer almaz. Arşiv, taramanın başladığı günden itibaren birikir; öncesine ait geçmiş yoktur. Sosyal tarafta yalnızca Bluesky vardır.
- **Erişim tahmini çoğu canlı içerikte yoktur.** Kaynak takipçi ya da görüntülenme vermiyorsa sayı uydurulmaz.
- **Zamanlayıcı süreç içindedir.** Sunucu kapalıyken tarama yapılmaz; ilk taramada en çok 7 gün geriye gidilir.
- **Sorgu değişikliği geçmişe uygulanmaz.** Daha önce toplanan içerikler silinmez ve yeniden süzülmez.

## Mimari

Tek bir Next.js uygulaması (modüler monolit) ve PostgreSQL. Kurum kurulumunda `DATABASE_URL` ile gerçek bir PostgreSQL sunucusuna bağlanır; geliştirmede ve testlerde uygulamayla gelen gömülü PostgreSQL (PGlite) kullanılır, böylece iki ortamda da aynı SQL çalışır. Bilerek küçük tutuldu: kanıtlanmış bir darboğaz olmadan Kafka, ayrı vektör veritabanı ya da mikroservis eklenmedi. Sınırlar ise ilk günden nettir; her katman bir üsttekinden habersizdir.

Sunucu yolu PostgreSQL 19 üzerinde sınandı (24 Kasım 2026): 214 testin tamamı ve üretim derlemesiyle 150 eşzamanlı istek. Testleri bir sunucuya karşı çalıştırmak için her test dosyasına boş bir veritabanı verip `DATABASE_URL` tanımlamak yeterlidir (`DATABASE_URL=postgres://… npx vitest run tests/auth.test.ts`); dosyalar aynı veritabanını paylaşmamalıdır.

```text
src/
  domain/          Alan tipleri, etiketler, metrik tanımları (bağımlılıksız)
  lib/
    text/          Türkçe normalizasyon, ek farkındalığı, HTML → düz metin
    query/         Sorgu dili: ayrıştırıcı, eşleştirici, SQL derleyici, toplama planı
    analysis/      Dil, ton, duygu, niyet (saf işlevler)
    stats/         Anomali tespiti
  server/
    db/            PostgreSQL bağlantısı (sunucu ya da gömülü) ve şema göçleri
    repositories/  Veri erişimi; tüm okumalar aynı süzgeçten geçer
    collectors/    Bağlayıcılar ve kapsam kaydı
    pipeline/      Ham içerik → bahsetme dönüşümü, toplama, zamanlayıcı
    services/      Ekranların veri hazırlığı (bülten, kök neden, karşılaştırma)
    news/          Haber arşivi: kaynak listesi ve tarayıcı
    auth/          Oturum, parola ve erişim kuralları
    setup/         İlk kurulum ve hazır gündem konuları
    fixtures/      Yalnızca testlerde yüklenen sınama verisi üreteci
    actions/       Sunucu işlevleri, alan alan (projeler, konular, toplama, yapay zekâ, rapor, yetki, haber arşivi)
  components/      Arayüz parçaları ve grafikler
  app/             Sayfalar ve uç noktalar
tests/             Birim ve uçtan uca testler
```

Üç tasarım kararı kodun geri kalanını belirler:

1. **Tek sorgu ağacı, üç kullanım.** Arama tanımı bir kez ayrıştırılır; aynı ağaç (a) toplanan içeriği süzer, (b) kayıtlı içerikte arar, (c) arayüzde eşleşen kelimeleri vurgular. Eşleşme kuralları tek yerde (`matcher.ts`) yaşar. Kayıtlı içerikte aramada veritabanı yalnızca kaba adayları getirir (`lib/query/probe.ts`), kesin kararı aynı eşleştirici verir; Türkçe ek kuralları SQL'de yeniden yazılmaz. Bir test, on bir sorgu için veritabanı yolunun sonucuyla bellek içi sonucun birebir aynı olduğunu doğrular.
2. **Tek süzgeç, tutarlı sayılar.** Liste, sayım, grafik ve dışa aktarma aynı `MentionFilter` ve aynı `buildWhere` işlevinden geçer. Grafikteki sayı ile listedeki sayının tutmaması yapısal olarak engellenir ve testle korunur.
3. **Kapsam dürüstlüğü.** Her bağlayıcı ne yapabildiğini ve hangi koşulla kullanılabildiğini kendisi bildirir. Veri toplanmayan dönem "sıfır" sayılmaz: anomali ve dönem karşılaştırması projenin kapsam başlangıcını gözetir.

**Ölçek yolu.** Depolama `repositories/` arkasındadır; PostgreSQL'e geçiş bu katmanla sınırlıdır. Büyük zaman serisi taramaları için ClickHouse, dayanıklı kuyruk için ayrı bir işçi süreci ancak ölçümle gerekçelendiğinde eklenmelidir. Ton çözümleyici tek bir saf işlevin (`analyzeText`) arkasındadır; yerine kurum içinde çalışan bir Türkçe model takılabilir.

## Kamu kurumlarına hazırlık

Bu sürüm kamuya satılabilir durumda **değildir**; aşağıdakiler eksiktir. Liste, Kasım 2026 tarihli araştırmaya dayanır (ayrıntı ve kaynaklar: [docs/ARASTIRMA.md](docs/ARASTIRMA.md)).

Bu sürümde hazır olanlar:

- Dışarıya model çağrısı yok; tüm çözümleme sunucuda yapılır. Yazı tipleri dahil hiçbir dış kaynağa çalışma anında istek gitmez (toplanan kaynaklar hariç).
- Kişi değil konu ve kurum odaklı tasarım: hesap dosyası ya da kişi profili yoktur.
- Denetim izi, CSV dışa aktarımında formül enjeksiyonu koruması, parametreli SQL, dış içeriğin yalnızca düz metin olarak gösterilmesi.
- İl, ilçe ve mahalle kırılımı için konu grupları ("Mahalle karnesi").
- Türkçe arayüz, klavye ile kullanım, görünür odak, grafiklerin tablo karşılığı, rengin tek başına bilgi taşımaması.
- Koşulu kurumsal kullanıma uymayan kaynakları tek ayarla kapatma (`YANKI_DEPLOYMENT=institution`).

İhaleye girmeden önce gerekenler:

- LDAP/Active Directory ile giriş, iki adımlı doğrulama, rol tabanlı yetki, hesap kilitleme.
- Saklama süresi ve altı ayı geçmeyen periyodik imha, imha kaydı, raporlarda kullanıcı adı maskeleme, kişisel veri tespiti.
- PostgreSQL, yedekleme ve geri yükleme tatbikatı, çok kiracılı izolasyon testleri.
- Lisanslı haber ve sosyal veri sağlayıcısı (Google Haberler bağlayıcısının yerine).
- Ölçülmüş Türkçe ton doğruluğu: etiketli veri kümesi ve kurum içinde çalışan, izinli lisanslı bir model.
- TS EN ISO/IEC 27001, Kamu Bilişim Yetki Belgesi, sızma testi ve kaynak kod analizi raporu, WCAG 2.2 erişilebilirlik beyanı.
- PDF, Word ve Excel rapor şablonları; günlük bülten; e-posta ve anlık bildirim.

## Yol haritası

1. Uygulama mağazası yorumları bağlayıcısı (anahtarsız erişilebilir; kamu uygulamaları için değerli).
2. Kimlik doğrulama ve roller; çalışma alanı üyelikleri.
3. Zamanlanmış e-posta bülteni ve PDF rapor.
4. Etiketli Türkçe değerlendirme kümesi; ton çözümleyicinin ölçülmesi ve model seçeneği.
5. YouTube bağlayıcısı (ücretsiz anahtar); X için maliyet kontrollü, isteğe bağlı bağlayıcı.
6. Saklama ve imha politikaları, kişisel veri maskeleme.
7. PostgreSQL deposu ve ayrı işçi süreci.
