# Yankı — çalışma kuralları

@AGENTS.md

Yankı, Türkçe öncelikli bir medya izleme ve sosyal dinleme platformudur. Genel bilgi ve mimari için `README.md`, araştırma dayanakları için `docs/ARASTIRMA.md`.

## Komutlar

- `npm run dev` — geliştirme sunucusu
- `npm test` — testler (her test dosyası bellekte kendi gömülü PostgreSQL'ini açar; `data/` klasörüne dokunmaz)
- `npm run lint`, `npm run typecheck` ve `npm run format:check` — her değişiklikten sonra üçü de temiz olmalı
- `npm run kaynak-dene -- "ifade"` — bağlayıcıları canlı kaynaklara karşı dener
- `npm run haber-tara` — haber tarayıcısını canlı akışlarda dener (geçici veritabanı; `-- --kaydet` asıl arşive yazar)

## Değişmez kurallar

- **Dil.** Arayüz metinleri, kod yorumları ve test adları Türkçedir. Tanımlayıcılar (değişken, işlev, dosya adı) İngilizcedir; adres çubuğundaki yollar ve parametreler Türkçedir (`/proje/[id]/bahsetmeler?q=…&d=30g`).
- **Üretilmiş veri gösterilmez.** Panelde ve tanıtım sayfasında görünen her içerik bağlı kaynaklardan toplanmış gerçek içeriktir; kurgusal/örnek veri yoktur. Erişimi olmayan kaynak "planlanan" olarak listelenir (`server/collectors/registry.ts`). `src/server/fixtures/` altındaki üretilmiş veri yalnızca otomatik testlerde yüklenir (`YANKI_SEED_FIXTURE=1`, bkz. `vitest.config.mts`); çalışan kurulumda açılmaz. Tanıtım vitrini yalnızca sahibi olmayan ortak gündem konularını kullanır.
- **Sayı uydurulmaz.** Kaynak bir ölçümü vermiyorsa alan `null` kalır ve arayüz bunu söyler (erişim, etkileşim, önceki dönem karşılaştırması).
- **Eşleşme kuralları tek yerdedir.** Metin eşleşmesiyle ilgili her değişiklik `lib/query/matcher.ts` ve `lib/text/turkish.ts` içinde yapılır. Veritabanı yalnızca kaba aday seçer (`lib/query/probe.ts`); kesin kararı her zaman `matchQuery` verir, kural SQL'de yeniden yazılmaz. `tests/pipeline.test.ts` içindeki "SQL derleyici ile bellek içi eşleştirici aynı sonucu verir" testi bunu korur.
- **Tüm okumalar `buildWhere` süzgecinden geçer.** Yeni bir analitik sorgu yazarken kendi `WHERE` cümlenizi kurmayın.
- **Kullanıcı girdisi SQL metnine girmez.** Yalnızca parametre; boyut ve kova ifadeleri sabit listelerden seçilir.
- **Veritabanı PostgreSQL'dir ve her çağrı eşzamansızdır.** SQL yalnızca `server/repositories/` içinde yazılır, `?` yer tutucularıyla. Depo işlevleri `Promise` döndürür; `await` unutulursa lint durdurur (`no-floating-promises`, `no-misused-promises`). Birlikte değişmesi gereken yazmalar `transaction(async () => …)` içinde yapılır; işlem içinde `Promise.all` ile paralel sorgu atılmaz. Şema değişikliği `server/db/schema.ts` sonuna yeni bir göç olarak eklenir; uygulanmış göç değiştirilmez.
- **Tarayıcı görgü kurallarına uyar.** Haber arşivi yalnızca yayıncının kendi yayımladığı akışları okur; her alan adının robots.txt dosyasına ve bekleme süresine uyulur (`src/server/news/crawler.ts`, `src/lib/crawl/robots.ts`). Makale sayfası taranmaz, tam metin saklanmaz. Başlangıç listesine yalnızca `npm run haber-tara` ile canlı doğrulanmış adres eklenir.
- **Dış içerik düz metindir.** Kaynaklardan gelen metin hiçbir zaman HTML olarak basılmaz.
- **Her metriğin tanımı vardır.** Yeni bir bileşik sayı eklerken formülünü `domain/metrics.ts` içine yazın ve arayüzde `MetricInfo` ile gösterin.

## Next.js notları (16.4, Cache Components açık)

- Sayfalar veriye dokunmadan önce `server/context.ts` içindeki `loadProjectContext`, `loadWorkspaceContext` ya da `requestStart` işlevlerinden birini çağırır; bu çağrı ilk kurulumu güvenceye alır ve okumaları istek anına erteler.
- Her sayfa bölümünün kendi `loading.tsx` dosyası vardır; kardeş sayfalar arası geçişin anında olması buna bağlıdır.
- Grafikler sunucu bileşenidir ve tarayıcıda betik çalıştırmaz; ipuçları CSS ile açılır. Etkileşim gerekiyorsa küçük bir istemci bileşeni ekleyin, grafiğin tamamını istemciye taşımayın.

## Tasarım

- Renkler `app/globals.css` içindeki belirteçlerden gelir; bileşenlerde sabit renk kodu yazılmaz.
- Ton için iki zıt kutup + nötr kullanılır ve renk hiçbir zaman tek başına bilgi taşımaz (işaret + yazı). Kategorik dizi (projeler) ve ton çifti renk körlüğü benzetiminden geçirilmiştir; değiştirirseniz yeniden doğrulayın.
- Safran yalnızca eşleşen kelimenin vurgusunda ve marka işaretinde kullanılır.
