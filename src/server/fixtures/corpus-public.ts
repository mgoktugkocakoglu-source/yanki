import type { DemoProjectSpec, DemoWorkspaceSpec } from "./types";

/**
 * Demo çalışma alanı 2: kurgusal bir belediye ve su idaresi.
 * "Örnekşehir" diye bir yer yoktur; mahalle adları da kurgu içindir.
 */

const NEIGHBOURHOODS = ["Çınarlı", "Gülbahçe", "Yıldıztepe", "Kayabaşı", "Akpınar", "Esentepe"] as const;

const NEIGHBOURHOOD_TOPICS = NEIGHBOURHOODS.map((name) => ({ groupName: "Mahalle", name, query: name }));

const MUNICIPALITY: DemoProjectSpec = {
  name: "Örnekşehir Belediyesi",
  description: "Kurgusal belediye — hizmet şikâyetleri ve duyuruların yankısı",
  query: '"Örnekşehir Belediyesi" OR "Örnekşehir Büyükşehir Belediyesi" OR orneksehirbld',
  brandForms: ["Örnekşehir Belediyesi", "Örnekşehir Belediyesi", "Örnekşehir Belediyesi", "@orneksehirbld", "Örnekşehir Büyükşehir Belediyesi"],
  rivals: [],
  places: NEIGHBOURHOODS,
  dailyVolume: 28,
  topics: [
    { groupName: "Hizmet", name: "Ulaşım", query: "otobüs OR metro OR ulaşım OR durak OR sefer OR minibüs" },
    { groupName: "Hizmet", name: "Su kesintisi", query: '"su kesintisi" OR "sular kesik" OR "su yok" OR "su verilemiyor" OR susuz' },
    { groupName: "Hizmet", name: "Yol ve altyapı", query: "yol OR asfalt OR çukur OR kaldırım OR altyapı OR kazı" },
    { groupName: "Hizmet", name: "Çöp ve temizlik", query: "çöp OR temizlik OR konteyner" },
    { groupName: "Hizmet", name: "Park ve yeşil alan", query: 'park OR "yeşil alan" OR ağaç OR fidan' },
    { groupName: "Hizmet", name: "Sosyal yardım", query: '"sosyal yardım" OR burs OR aşevi OR "gıda kolisi"' },
    { groupName: "Hizmet", name: "Zabıta", query: "zabıta OR denetim OR işgal" },
    ...NEIGHBOURHOOD_TOPICS,
  ],
  corpus: [
    {
      weight: 24,
      mix: [0.62, 0.2, 0.18],
      negative: [
        "{yer} otobüsü yine gelmedi, durakta kırk dakikadır bekliyoruz. {marka} sefer sayısını artırmalı.",
        "{marka} {yer} hattındaki otobüsler tıklım tıklım, bu ulaşım rezaleti ne zaman bitecek?",
        "Sabah seferi iptal edilmiş, kimse duyurmadı. {marka} ulaşımda çok yetersiz.",
        "{yer} durağına sığınak yapılmadı, yağmurda bekliyoruz. {marka} ilgilenmiyor.",
        "{marka} metro seferlerini yine geciktirdi, işe geç kaldım. Bıktık artık.",
        "Harika, {yer} otobüsü yine gelmedi (!) Teşekkürler {marka}, çok güzel hizmet.",
      ],
      positive: [
        "{yer} hattına ek sefer konmuş, sabahları artık rahat gidiyoruz. Teşekkürler {marka}.",
        "{marka} yeni otobüsleri çok temiz ve rahat, emeği geçenlere teşekkür ederim.",
        "{marka} gece seferlerini başlatmış, çok faydalı bir hizmet olmuş.",
      ],
      neutral: [
        "{marka} {yer} hattı sefer saatleri değişti mi?",
        "{yer} durağından metroya aktarma ücretsiz mi, {marka} bilgi verir misiniz?",
      ],
    },
    {
      weight: 20,
      mix: [0.74, 0.14, 0.12],
      negative: [
        "{yer} caddesindeki çukur {n} haftadır kapatılmadı. {marka} bu yolu ne zaman yapacak?",
        "{marka} kazı yaptı, asfaltı yamamadan gitti. {yer} toz içinde.",
        "{yer} mahallesinde kaldırım yok, çocuklar yoldan yürüyor. {marka} tehlikeyi görmüyor mu?",
        "Yağmur yağınca {yer} göle dönüyor, altyapı yetersiz. {marka} yıllardır çözmedi.",
        "{marka} yol çalışması {n} aydır bitmedi, esnaf mağdur.",
      ],
      positive: [
        "{yer} caddesi sonunda asfaltlandı, {marka} ekiplerine teşekkürler.",
        "{marka} kaldırımları yenilemiş, {yer} çok güzel olmuş.",
      ],
      neutral: ["{marka} {yer} yol çalışması ne zaman bitecek?"],
    },
    {
      weight: 14,
      mix: [0.6, 0.28, 0.12],
      negative: [
        "{yer} sokaklarında çöpler {n} gündür alınmadı, koku dayanılmaz. {marka} nerede?",
        "Konteynerler taşmış, kediler köpekler dağıtıyor. {marka} temizlik ekibi gelmedi.",
        "{marka} çöp toplama saatlerini değiştirmiş, kimseye haber vermemiş. {yer} pislik içinde.",
      ],
      positive: [
        "{yer} sabah erkenden tertemiz yapılmış, {marka} temizlik işçilerine teşekkür ederim.",
        "{marka} yeni konteynerler koymuş, sokak çok daha temiz.",
      ],
      neutral: ["{marka} iri hacimli atıkları hangi gün topluyor?"],
    },
    {
      weight: 12,
      mix: [0.25, 0.6, 0.15],
      negative: [
        "{yer} parkındaki oyun grubu kırık, çocuklar için tehlikeli. {marka} ilgilenmiyor.",
        "{marka} ağaçları kesip otopark yapıyor, {yer} halkı tepkili.",
      ],
      positive: [
        "{yer} parkı yenilenmiş, çocuklar bayıldı. {marka} için teşekkürler.",
        "{marka} {yer} sahiline yüzlerce fidan dikmiş, harika bir çalışma.",
        "Yeni açılan {yer} parkı çok güzel olmuş, {marka} ekibini tebrik ederim.",
        "{marka} yeşil alanları çoğaltıyor, mutlu olduk.",
      ],
      neutral: ["{marka} {yer} parkı kaçta kapanıyor?"],
    },
    {
      weight: 9,
      mix: [0.2, 0.6, 0.2],
      negative: ["{marka} sosyal yardım başvurum {n} aydır sonuçlanmadı, kimse dönüş yapmıyor."],
      positive: [
        "{marka} öğrenci bursu başvuruları açılmış, gençlere destek için teşekkürler.",
        "{marka} aşevi her gün sıcak yemek dağıtıyor, çok faydalı bir hizmet.",
        "{marka} gıda kolisi yardımı zamanında ulaştı, minnettarız.",
      ],
      neutral: ["{marka} burs başvurusu için hangi belgeler gerekiyor?"],
    },
    {
      weight: 8,
      mix: [0.55, 0.25, 0.2],
      negative: [
        "{yer} kaldırımı işgal altında, yürünmüyor. {marka} zabıtası neden denetim yapmıyor?",
        "{marka} zabıtası seyyar satıcılara çok kaba davrandı, bu yakışmadı.",
      ],
      positive: ["{marka} zabıta ekipleri fahiş fiyat denetimi yapmış, tebrikler."],
      neutral: ["{marka} zabıta şikâyet hattı numarası kaç?"],
    },
    {
      weight: 6,
      mix: [0.8, 0.05, 0.15],
      negative: [
        "{yer} mahallesinde sular kesik, {marka} açıklama yapmadı.",
        "{yer} iki gündür susuz, {marka} neden tanker göndermiyor?",
      ],
      positive: ["{marka} su kesintisi boyunca {yer} mahallesine tanker gönderdi, teşekkürler."],
      neutral: ["{marka} {yer} su kesintisi ne zaman bitecek?"],
    },
  ],
  news: [
    { title: "Örnekşehir Belediyesi meclisi kasım ayı toplantısını yaptı", summary: "Toplantıda gelecek yılın yatırım programı görüşüldü." },
    { title: "Örnekşehir Belediyesi'nden Çınarlı'ya yeni kültür merkezi", summary: "Merkezin gelecek yıl hizmete girmesi planlanıyor." },
    { title: "Örnekşehir Belediyesi kış hazırlıklarını tamamladı", summary: "Tuzlama araçları ve ekipler kritik noktalarda hazır bekleyecek." },
    { title: "Örnekşehir Belediyesi Akpınar'da yol yenileme çalışması başlattı", summary: "Çalışma süresince bazı sokaklar trafiğe kapatılacak." },
    { title: "Örnekşehir Belediyesi burs başvurularını açtı", summary: "Başvurular ay sonuna kadar çevrimiçi yapılabilecek." },
    { title: "Örnekşehir Belediyesi Esentepe pazaryerini yeniliyor", summary: "Pazaryerinin üstü kapatılacak, otopark eklenecek." },
    { title: "Örnekşehir Belediyesi Gülbahçe'de fidan dikti", summary: "Etkinliğe öğrenciler ve mahalle sakinleri katıldı." },
  ],
  events: [
    {
      daysAgo: 6,
      boost: [4.2, 2.6, 1.2],
      newsShare: 0.3,
      headlines: [
        { title: "Örnekşehir'de ana isale hattı arızası: Yıldıztepe ve Çınarlı'da su kesintisi", summary: "Örnekşehir Belediyesi, arızanın giderilmesi için ekiplerin çalıştığını duyurdu." },
        { title: "Örnekşehir Belediyesi: su kesintisi yarın sabaha kadar giderilecek", summary: "Belediye, mahallelere tankerle su dağıtılacağını açıkladı." },
      ],
      posts: [
        "Yıldıztepe iki gündür susuz! {marka} su kesintisi için hâlâ açıklama yapmadı.",
        "Çınarlı'da su yok, tanker de gelmedi. {marka} bu rezalet ne zaman bitecek?",
        "{marka} su kesintisi bir gün sürecek demişti, Yıldıztepe hâlâ susuz. Mağduruz.",
        "Bebeğim var, sular kesik. {marka} Çınarlı'ya acil tanker göndermeli!",
        "{marka} su kesintisini önceden duyurmadı, Yıldıztepe halkı çok tepkili.",
        "Çınarlı'ya tanker geldi ama yetmedi. {marka} su kesintisi için daha hızlı olmalı.",
      ],
    },
    {
      daysAgo: 20,
      boost: [2.8, 1.5],
      newsShare: 0.35,
      headlines: [
        { title: "Örnekşehir Belediyesi öğrencilere ücretsiz ulaşım kararı aldı", summary: "Karar ay başından itibaren tüm otobüs ve metro hatlarında geçerli olacak." },
      ],
      posts: [
        "{marka} öğrencilere ücretsiz ulaşım kararı almış, harika bir haber. Teşekkürler.",
        "Ücretsiz ulaşım için {marka} yönetimini tebrik ederim, öğrenciler çok sevindi.",
        "{marka} ücretsiz otobüs kararı süper olmuş, darısı diğer şehirlere.",
        "{marka} ücretsiz ulaşım iyi ama sefer sayısı artmazsa otobüsler daha da dolacak.",
      ],
    },
    {
      daysAgo: 33,
      boost: [2.2, 1.3],
      newsShare: 0.4,
      headlines: [
        { title: "Sağanak sonrası Kayabaşı'nda su baskını: Örnekşehir Belediyesi ekipleri sahada", summary: "Bazı ev ve iş yerlerini su bastı; tahliye çalışmaları sürüyor." },
      ],
      posts: [
        "Kayabaşı'nı yine su bastı, altyapı yetersiz. {marka} her yıl aynı şeyi yaşatıyor.",
        "{marka} ekipleri gece boyu Kayabaşı'nda çalıştı, emekleri için teşekkürler.",
        "Kayabaşı'nda dükkânımı su bastı, zarar büyük. {marka} altyapıyı ne zaman çözecek?",
      ],
    },
  ],
};

const WATER_UTILITY: DemoProjectSpec = {
  name: "ÖRSU Genel Müdürlüğü",
  description: "Kurgusal su ve kanalizasyon idaresi",
  query: 'ÖRSU OR "Örnekşehir Su"',
  brandForms: ["ÖRSU", "ÖRSU", "ÖRSU", "@orsu_destek"],
  rivals: [],
  places: NEIGHBOURHOODS,
  dailyVolume: 11,
  topics: [
    { groupName: "Hizmet", name: "Su kesintisi", query: '"su kesintisi" OR "sular kesik" OR "su yok" OR susuz' },
    { groupName: "Hizmet", name: "Fatura", query: "fatura OR borç OR tahakkuk OR zam" },
    { groupName: "Hizmet", name: "Arıza ve bakım", query: "arıza OR patlak OR bakım OR onarım" },
    { groupName: "Hizmet", name: "Su kalitesi", query: '"su kalitesi" OR bulanık OR koku OR klor' },
    ...NEIGHBOURHOOD_TOPICS,
  ],
  corpus: [
    {
      weight: 20,
      mix: [0.8, 0.08, 0.12],
      negative: [
        "{yer} mahallesinde sular kesik, {marka} haber bile vermedi.",
        "{marka} su kesintisi {n} saat sürecek demişti, bütün gün susuz kaldık.",
        "Haftada ikinci su kesintisi! {marka} {yer} için ne yapıyor?",
      ],
      positive: ["{marka} kesintiyi söylediği saatte bitirdi, teşekkürler."],
      neutral: ["{marka} {yer} su kesintisi kaçta bitecek?"],
    },
    {
      weight: 18,
      mix: [0.75, 0.08, 0.17],
      negative: [
        "{marka} faturası bu ay iki katı geldi, sayaç hatalı okunmuş. İtiraz ettim, dönüş yok.",
        "Suya yine zam gelmiş, {marka} faturaları çok pahalı.",
        "{marka} borç yok dediği halde kesme ihbarı gönderdi. Rezalet.",
      ],
      positive: ["{marka} fatura itirazımı bir günde çözdü, memnun kaldım."],
      neutral: ["{marka} faturası internetten nasıl ödeniyor?", "{marka} fatura son ödeme tarihi uzatıldı mı?"],
    },
    {
      weight: 14,
      mix: [0.6, 0.28, 0.12],
      negative: [
        "{yer} sokağında boru patlak, su {n} saattir boşa akıyor. {marka} ekibi gelmedi.",
        "{marka} arıza hattına ulaşamıyorum, patlak borudan ev su içinde.",
      ],
      positive: [
        "{marka} ekipleri patlak boruyu bir saatte onardı, teşekkür ederim.",
        "{yer} mahallesindeki arıza hızlı giderildi, {marka} ekibine teşekkürler.",
      ],
      neutral: ["{marka} planlı bakım çalışması hangi mahalleleri etkileyecek?"],
    },
    {
      weight: 8,
      mix: [0.78, 0.07, 0.15],
      negative: [
        "{yer} mahallesinde musluktan bulanık su akıyor, {marka} açıklama yapmalı.",
        "Suda klor kokusu çok fazla, içilmiyor. {marka} su kalitesini kontrol ediyor mu?",
      ],
      positive: ["{marka} su kalitesi raporunu yayımlamış, şeffaflık için teşekkürler."],
      neutral: ["{marka} su analiz sonuçlarını nereden görebilirim?"],
    },
  ],
  news: [
    { title: "ÖRSU kasım ayı planlı bakım takvimini açıkladı", summary: "Çalışmalar süresince bazı mahallelerde kısa süreli kesinti olacak." },
    { title: "ÖRSU baraj doluluk oranlarını paylaştı", summary: "İdare, tasarruf çağrısını yineledi." },
    { title: "ÖRSU yeni arıtma tesisinin temelini attı", summary: "Tesisin iki yıl içinde tamamlanması hedefleniyor." },
  ],
  events: [
    {
      daysAgo: 6,
      boost: [5, 2.8, 1.2],
      newsShare: 0.3,
      headlines: [
        { title: "ÖRSU: ana isale hattındaki arıza nedeniyle iki mahallede su kesintisi", summary: "İdare, onarımın sürdüğünü ve tankerle su dağıtıldığını bildirdi." },
      ],
      posts: [
        "Yıldıztepe iki gündür susuz, {marka} arıza hattı açmıyor. Rezalet.",
        "{marka} ana hattaki arızayı hâlâ onaramadı, Çınarlı'da su yok.",
        "Su kesintisi için {marka} önce 6 saat dedi, şimdi yarın diyor. Mağduruz.",
        "{marka} tanker göndermiş ama Çınarlı'da sıra çok uzun, yetersiz.",
      ],
    },
  ],
};

export const PUBLIC_WORKSPACE: DemoWorkspaceSpec = {
  name: "Demo · Kamu (belediye)",
  projects: [MUNICIPALITY, WATER_UTILITY],
};
