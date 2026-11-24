/**
 * Haber arşivinin başlangıç kaynak listesi: yayıncıların kendi yayımladığı
 * RSS/Atom akışları. Liste veritabanına bir kez tohumlanır; sonrası
 * `news_feeds` tablosundan yönetilir (sistem yöneticisi akış ekleyip kapatabilir).
 *
 * Buraya yalnızca canlı olarak doğrulanmış adres yazılır
 * (`npm run haber-tara -- --dogrula`). Son doğrulama: 24 Kasım 2026.
 */

export interface SeedFeed {
  outlet: string;
  domain: string;
  url: string;
  language?: string;
}

export const SEED_FEEDS: readonly SeedFeed[] = [
  // Ajanslar ve kamu yayıncısı
  { outlet: "Anadolu Ajansı", domain: "aa.com.tr", url: "https://www.aa.com.tr/tr/rss/default?cat=guncel" },
  { outlet: "Anadolu Ajansı", domain: "aa.com.tr", url: "https://www.aa.com.tr/tr/rss/default?cat=ekonomi" },
  { outlet: "Anadolu Ajansı", domain: "aa.com.tr", url: "https://www.aa.com.tr/tr/rss/default?cat=dunya" },
  { outlet: "Anadolu Ajansı", domain: "aa.com.tr", url: "https://www.aa.com.tr/tr/rss/default?cat=politika" },
  { outlet: "Anadolu Ajansı (İngilizce)", domain: "aa.com.tr", url: "https://www.aa.com.tr/en/rss/default?cat=live", language: "en" },
  { outlet: "TRT Haber", domain: "trthaber.com", url: "https://www.trthaber.com/sondakika.rss" },
  { outlet: "TRT Haber", domain: "trthaber.com", url: "https://www.trthaber.com/gundem_articles.rss" },
  { outlet: "TRT Haber", domain: "trthaber.com", url: "https://www.trthaber.com/ekonomi_articles.rss" },
  { outlet: "TRT Haber", domain: "trthaber.com", url: "https://www.trthaber.com/dunya_articles.rss" },
  { outlet: "TRT Haber", domain: "trthaber.com", url: "https://www.trthaber.com/turkiye_articles.rss" },

  // Ulusal gazeteler ve haber siteleri
  { outlet: "Hürriyet", domain: "hurriyet.com.tr", url: "https://www.hurriyet.com.tr/rss/anasayfa" },
  { outlet: "Hürriyet", domain: "hurriyet.com.tr", url: "https://www.hurriyet.com.tr/rss/gundem" },
  { outlet: "Hürriyet", domain: "hurriyet.com.tr", url: "https://www.hurriyet.com.tr/rss/ekonomi" },
  { outlet: "Hürriyet", domain: "hurriyet.com.tr", url: "https://www.hurriyet.com.tr/rss/dunya" },
  { outlet: "Sabah", domain: "sabah.com.tr", url: "https://www.sabah.com.tr/rss/sondakika.xml" },
  { outlet: "Sabah", domain: "sabah.com.tr", url: "https://www.sabah.com.tr/rss/gundem.xml" },
  { outlet: "Sabah", domain: "sabah.com.tr", url: "https://www.sabah.com.tr/rss/ekonomi.xml" },
  { outlet: "Sabah", domain: "sabah.com.tr", url: "https://www.sabah.com.tr/rss/dunya.xml" },
  { outlet: "Milliyet", domain: "milliyet.com.tr", url: "https://www.milliyet.com.tr/rss/rssnew/sondakikarss.xml" },
  { outlet: "Milliyet", domain: "milliyet.com.tr", url: "https://www.milliyet.com.tr/rss/rssnew/gundemrss.xml" },
  { outlet: "Milliyet", domain: "milliyet.com.tr", url: "https://www.milliyet.com.tr/rss/rssnew/ekonomirss.xml" },
  { outlet: "Milliyet", domain: "milliyet.com.tr", url: "https://www.milliyet.com.tr/rss/rssnew/dunyarss.xml" },
  { outlet: "Milliyet", domain: "milliyet.com.tr", url: "https://www.milliyet.com.tr/rss/rssnew/siyasetrss.xml" },
  { outlet: "Sözcü", domain: "sozcu.com.tr", url: "https://www.sozcu.com.tr/feeds-rss-category-sozcu" },
  { outlet: "Sözcü", domain: "sozcu.com.tr", url: "https://www.sozcu.com.tr/feeds-son-dakika" },
  { outlet: "Sözcü", domain: "sozcu.com.tr", url: "https://www.sozcu.com.tr/feeds-rss-category-gundem" },
  { outlet: "Sözcü", domain: "sozcu.com.tr", url: "https://www.sozcu.com.tr/feeds-rss-category-ekonomi" },
  { outlet: "Sözcü", domain: "sozcu.com.tr", url: "https://www.sozcu.com.tr/feeds-rss-category-dunya" },
  { outlet: "Cumhuriyet", domain: "cumhuriyet.com.tr", url: "https://www.cumhuriyet.com.tr/rss" },
  { outlet: "Cumhuriyet", domain: "cumhuriyet.com.tr", url: "https://www.cumhuriyet.com.tr/rss/son_dakika.xml" },
  { outlet: "Habertürk", domain: "haberturk.com", url: "https://www.haberturk.com/rss" },
  { outlet: "Habertürk", domain: "haberturk.com", url: "https://www.haberturk.com/rss/kategori/gundem.xml" },
  { outlet: "Habertürk", domain: "haberturk.com", url: "https://www.haberturk.com/rss/kategori/ekonomi.xml" },
  { outlet: "Habertürk", domain: "haberturk.com", url: "https://www.haberturk.com/rss/kategori/dunya.xml" },
  { outlet: "NTV", domain: "ntv.com.tr", url: "https://www.ntv.com.tr/son-dakika.rss" },
  { outlet: "NTV", domain: "ntv.com.tr", url: "https://www.ntv.com.tr/gundem.rss" },
  { outlet: "NTV", domain: "ntv.com.tr", url: "https://www.ntv.com.tr/turkiye.rss" },
  { outlet: "NTV", domain: "ntv.com.tr", url: "https://www.ntv.com.tr/dunya.rss" },
  { outlet: "NTV", domain: "ntv.com.tr", url: "https://www.ntv.com.tr/ekonomi.rss" },
  { outlet: "CNN Türk", domain: "cnnturk.com", url: "https://www.cnnturk.com/feed/rss/all/news" },
  { outlet: "CNN Türk", domain: "cnnturk.com", url: "https://www.cnnturk.com/feed/rss/turkiye/news" },
  { outlet: "CNN Türk", domain: "cnnturk.com", url: "https://www.cnnturk.com/feed/rss/dunya/news" },
  { outlet: "CNN Türk", domain: "cnnturk.com", url: "https://www.cnnturk.com/feed/rss/ekonomi/news" },
  { outlet: "A Haber", domain: "ahaber.com.tr", url: "https://www.ahaber.com.tr/rss/gundem.xml" },
  { outlet: "A Haber", domain: "ahaber.com.tr", url: "https://www.ahaber.com.tr/rss/anasayfa.xml" },
  { outlet: "Haber Global", domain: "haberglobal.com.tr", url: "https://www.haberglobal.com.tr/rss" },
  { outlet: "TGRT Haber", domain: "tgrthaber.com", url: "https://www.tgrthaber.com/rss/manset" },
  { outlet: "Halk TV", domain: "halktv.com.tr", url: "https://halktv.com.tr/service/rss.php" },
  { outlet: "Tele1", domain: "tele1.com.tr", url: "https://www.tele1.com.tr/rss" },
  { outlet: "Yeni Şafak", domain: "yenisafak.com", url: "https://www.yenisafak.com/rss?xml=gundem" },
  { outlet: "Yeni Şafak", domain: "yenisafak.com", url: "https://www.yenisafak.com/rss?xml=ekonomi" },
  { outlet: "Yeni Şafak", domain: "yenisafak.com", url: "https://www.yenisafak.com/rss?xml=dunya" },
  { outlet: "Star", domain: "star.com.tr", url: "https://www.star.com.tr/rss/rss.asp" },
  { outlet: "Akşam", domain: "aksam.com.tr", url: "https://www.aksam.com.tr/rss/rss.asp" },
  { outlet: "Takvim", domain: "takvim.com.tr", url: "https://www.takvim.com.tr/rss/anasayfa.xml" },
  { outlet: "Yeni Akit", domain: "yeniakit.com.tr", url: "https://www.yeniakit.com.tr/rss/haber/gundem" },
  { outlet: "Yeni Asır", domain: "yeniasir.com.tr", url: "https://www.yeniasir.com.tr/rss/anasayfa.xml" },
  { outlet: "Karar", domain: "karar.com", url: "https://www.karar.com/service/rss.php" },
  { outlet: "Yeniçağ", domain: "yenicaggazetesi.com.tr", url: "https://www.yenicaggazetesi.com.tr/service/rss.php" },
  { outlet: "Aydınlık", domain: "aydinlik.com.tr", url: "https://www.aydinlik.com.tr/feed" },
  { outlet: "BirGün", domain: "birgun.net", url: "https://www.birgun.net/rss/home" },
  { outlet: "Evrensel", domain: "evrensel.net", url: "https://www.evrensel.net/rss/haber.xml" },
  { outlet: "Gazete Duvar", domain: "gazeteduvar.com.tr", url: "https://www.gazeteduvar.com.tr/export/rss" },
  { outlet: "Diken", domain: "diken.com.tr", url: "https://www.diken.com.tr/feed/" },
  { outlet: "Bianet", domain: "bianet.org", url: "https://bianet.org/rss/bianet" },
  { outlet: "Medyascope", domain: "medyascope.tv", url: "https://medyascope.tv/feed/" },
  { outlet: "Artı Gerçek", domain: "artigercek.com", url: "https://artigercek.com/service/rss.php" },
  { outlet: "Kısa Dalga", domain: "kisadalga.net", url: "https://kisadalga.net/service/rss.php" },
  { outlet: "Serbestiyet", domain: "serbestiyet.com", url: "https://serbestiyet.com/feed/" },
  { outlet: "OdaTV", domain: "odatv.com", url: "https://www.odatv.com/rss.xml" },
  { outlet: "Gerçek Gündem", domain: "gercekgundem.com", url: "https://www.gercekgundem.com/rss" },
  { outlet: "Ensonhaber", domain: "ensonhaber.com", url: "https://www.ensonhaber.com/rss/ensonhaber.xml" },
  { outlet: "İnternet Haber", domain: "internethaber.com", url: "https://www.internethaber.com/rss" },
  { outlet: "Mynet Haber", domain: "mynet.com", url: "https://www.mynet.com/haber/rss/sondakika" },
  { outlet: "Haberler.com", domain: "haberler.com", url: "https://rss.haberler.com/rss.asp" },
  { outlet: "Sondakika.com", domain: "sondakika.com", url: "https://rss.sondakika.com/rss.asp" },
  { outlet: "GZT", domain: "gzt.com", url: "https://www.gzt.com/rss" },

  // Yabancı yayıncıların Türkçe servisleri
  { outlet: "BBC Türkçe", domain: "bbc.com/turkce", url: "https://feeds.bbci.co.uk/turkce/rss.xml" },
  { outlet: "DW Türkçe", domain: "dw.com/tr", url: "https://rss.dw.com/xml/rss-tur-all" },
  { outlet: "Euronews Türkçe", domain: "tr.euronews.com", url: "https://tr.euronews.com/rss" },
  { outlet: "Independent Türkçe", domain: "indyturk.com", url: "https://www.indyturk.com/rss.xml" },
  { outlet: "Sputnik Türkiye", domain: "anlatilaninotesi.com.tr", url: "https://anlatilaninotesi.com.tr/export/rss2/archive/index.xml" },

  // Ekonomi
  { outlet: "Bloomberg HT", domain: "bloomberght.com", url: "https://www.bloomberght.com/rss/tum-haberler.xml" },
  { outlet: "Dünya", domain: "dunya.com", url: "https://www.dunya.com/rss" },
  { outlet: "Ekonomim", domain: "ekonomim.com", url: "https://www.ekonomim.com/rss" },
  { outlet: "Ekonomist", domain: "ekonomist.com.tr", url: "https://www.ekonomist.com.tr/rss" },

  // Teknoloji
  { outlet: "Webtekno", domain: "webtekno.com", url: "https://www.webtekno.com/rss.xml" },
  { outlet: "ShiftDelete.Net", domain: "shiftdelete.net", url: "https://shiftdelete.net/feed" },
  { outlet: "DonanımHaber", domain: "donanimhaber.com", url: "https://www.donanimhaber.com/rss/tum/" },

  // Türkiye'den İngilizce yayınlar
  { outlet: "Daily Sabah", domain: "dailysabah.com", url: "https://www.dailysabah.com/rssFeed/home-page", language: "en" },
];
