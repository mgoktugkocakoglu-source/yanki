import { composeQuery, decomposeQuery, describeQuery, plainFromSearch, queryToTopicTerms, topicTermsToQuery } from "@/lib/query";
import { describe, expect, it } from "vitest";
import { buildCollectionPlan, groupProbes, probeConditions, EMPTY_FIELDS, matchQuery, parseQuery, tryParseQuery, type MatchableFields } from "@/lib/query";
import { tokenize } from "@/lib/text/normalize";

function matches(query: string, text: string, fields: Partial<MatchableFields> = {}): boolean {
  return matchQuery(parseQuery(query), tokenize(text), { ...EMPTY_FIELDS, ...fields }).matched;
}

describe("ayrıştırıcı", () => {
  it("yan yana yazılan kelimeleri VE ile bağlar", () => {
    expect(parseQuery("kargo gecikme")).toMatchObject({ kind: "and", children: [{ kind: "text" }, { kind: "text" }] });
  });

  it("VEYA, VE'den daha gevşek bağlar", () => {
    const ast = parseQuery("a b OR c");
    expect(ast).toMatchObject({ kind: "or", children: [{ kind: "and" }, { kind: "text", tokens: ["c"] }] });
  });

  it("Türkçe ve İngilizce işleçleri eşdeğer sayar", () => {
    expect(parseQuery("kargo VE (gecikme VEYA iade) DEĞİL çekiliş")).toEqual(parseQuery("kargo AND (gecikme OR iade) NOT çekiliş"));
  });

  it("küçük harfle yazılan 've' bir işleç değil, aranan kelimedir", () => {
    expect(parseQuery("ve")).toMatchObject({ kind: "text", tokens: ["ve"] });
  });

  it("öbek, joker ve birebir eşleşme kiplerini ayırır", () => {
    expect(parseQuery('"mobil uygulama"')).toMatchObject({ tokens: ["mobil", "uygulama"], mode: "inflect" });
    expect(parseQuery("kargo*")).toMatchObject({ tokens: ["kargo"], mode: "prefix" });
    expect(parseQuery("=kar")).toMatchObject({ tokens: ["kar"], mode: "exact" });
  });

  it("alan filtrelerini Türkçe ve İngilizce adlarla kabul eder", () => {
    expect(parseQuery("ton:olumsuz")).toEqual(parseQuery("sentiment:negative"));
    expect(parseQuery("KAYNAK:Haber")).toMatchObject({ kind: "field", field: "source", value: "news" });
    expect(parseQuery("erişim:>10.000")).toMatchObject({ field: "reach", op: ">", value: 10000 });
    expect(parseQuery('konu:"Teslimat Gecikmesi"')).toMatchObject({ field: "topic", value: "teslimat gecikmesi" });
  });

  it.each([
    ["", "Sorgu boş."],
    ['"kargo', "Tırnak kapatılmamış."],
    ["(kargo", "Parantez kapatılmamış."],
    ["kargo)", "Fazladan kapanış parantezi."],
    ["kargo OR", "Sorgu yarım kaldı; bir kelime ya da ifade bekleniyor."],
    ["OR kargo", "İşleçten önce bir kelime ya da ifade olmalı."],
    ["ton:kızgın", '"ton" alanı için geçerli değerler: olumlu, olumsuz, notr.'],
    ["renk:mavi", 'Bilinmeyen alan: "renk". İçinde ":" geçen bir ifadeyi aramak için tırnak kullanın.'],
    ["kargo NEAR/5 ton:olumsuz", "YAKIN yalnızca kelimeler, öbekler ya da bunların VEYA grupları arasında kullanılabilir."],
  ])("geçersiz sorguda anlaşılır hata verir: %s", (query, message) => {
    const outcome = tryParseQuery(query);
    expect(outcome).toMatchObject({ ok: false, message });
  });

  it("hatanın konumunu bildirir", () => {
    expect(tryParseQuery('kargo "yarım')).toMatchObject({ ok: false, position: 6 });
  });
});

describe("eşleştirici", () => {
  it("çekimli biçimleri yakalar, benzer kelimeleri yakalamaz", () => {
    expect(matches("kargo", "Kargom üç gündür gelmedi")).toBe(true);
    expect(matches("kargo", "KARGOYU teslim almadım")).toBe(true);
    expect(matches("kar", "Karar bugün açıklandı")).toBe(false);
  });

  it("Türkçe karakterli ve karaktersiz yazımı eşler", () => {
    expect(matches("şikayet", "sikayetim var")).toBe(true);
    expect(matches("ÖrnekBank", "ornekbanktan mesaj geldi")).toBe(true);
    expect(matches("ÖrnekBank", "ÖRNEKBANK'ın açıklaması")).toBe(true);
  });

  it("öbekte sıra ve bitişiklik arar, son kelimede eke izin verir", () => {
    expect(matches('"türk hava yolları"', "Türk Hava Yollarının yeni seferi")).toBe(true);
    expect(matches('"türk hava yolları"', "Hava yolları ve Türk yolcular")).toBe(false);
    expect(matches('"mobil uygulama"', "mobilya uygulama")).toBe(false);
  });

  it("birebir kip çekimi kabul etmez", () => {
    expect(matches("=kar", "Kar yağışı başladı")).toBe(true);
    expect(matches("=kar", "Karın ağrısı")).toBe(false);
    expect(matches("kar", "Karın ağrısı")).toBe(true);
  });

  it("yakınlık işlecini iki yönde de uygular", () => {
    expect(matches("kargo NEAR/3 gecikme", "kargo bu hafta yine gecikmeli geldi")).toBe(false);
    expect(matches("kargo YAKIN/3 gecik*", "kargo bu hafta yine gecikmeli geldi")).toBe(true);
    expect(matches("kargo NEAR/2 (hasar OR kırık)", "Kırık bir ürün, kargo rezaleti")).toBe(true);
    expect(matches("kargo NEAR/1 hasar", "kargo çok geç geldi ve hasar vardı")).toBe(false);
  });

  it("DEĞİL ve alan filtrelerini birleştirir", () => {
    const query = '("ÖrnekBank" OR @ornekbank) AND (kredi OR kart) NOT ("iş ilanı" OR çekiliş)';
    expect(matches(query, "ÖrnekBank kredi faizlerini açıkladı")).toBe(true);
    expect(matches(query, "ÖrnekBank kart çekilişi başladı")).toBe(false);
    expect(matches(query, "ÖrnekBank şubesi açıldı")).toBe(false);
  });

  it("alan filtrelerini değerlendirir", () => {
    expect(matches("kargo ton:olumsuz", "kargo", { sentiment: "negative" })).toBe(true);
    expect(matches("kargo ton:olumsuz", "kargo", { sentiment: "positive" })).toBe(false);
    expect(matches("erişim:>=1000", "x", { reach: 1000 })).toBe(true);
    expect(matches("erişim:>=1000", "x", { reach: null })).toBe(false);
    expect(matches("site:ornek.com.tr", "x", { site: "www.ornek.com.tr" })).toBe(true);
    expect(matches('konu:"su kesintisi"', "x", { topics: ["Su Kesintisi"] })).toBe(true);
  });

  it("vurgulama için eşleşen kelime aralıklarını döndürür", () => {
    const result = matchQuery(parseQuery('"mobil uygulama" OR kredi'), tokenize("Yeni mobil uygulamada kredi başvurusu"));
    expect(result.hits).toEqual([
      [1, 3],
      [3, 4],
    ]);
  });
});

describe("toplama planı", () => {
  it("VE içinde en küçük çapa kümesini seçer", () => {
    const plan = buildCollectionPlan(parseQuery('("ÖrnekBank" OR "Örnek Bank") AND (kredi OR kart OR faiz) NOT çekiliş'));
    expect(plan?.keywords).toEqual(["ÖrnekBank", "Örnek Bank"]);
  });

  it("VEYA dallarının hepsini toplar ve yinelenenleri atar", () => {
    expect(buildCollectionPlan(parseQuery("kargo OR Kargo OR teslimat"))?.keywords).toEqual(["kargo", "teslimat"]);
  });

  it("dil filtresini plana taşır", () => {
    expect(buildCollectionPlan(parseQuery("belediye dil:tr"))).toEqual({ keywords: ["belediye"], groups: [["belediye"]], language: "tr" });
  });

  it("VE dallarını ayrı zorunlu gruplar olarak çıkarır", () => {
    const plan = buildCollectionPlan(parseQuery("(İran OR Iran) (İsrail OR Israel) NOT çekiliş dil:tr"));
    expect(plan?.groups).toEqual([
      ["İran", "Iran"],
      ["İsrail", "Israel"],
    ]);
  });

  it("grupları küçükten büyüğe sıralar, yıldızı atar ve en çok üç grup gönderir", () => {
    const plan = buildCollectionPlan(parseQuery("(a1 OR a2 OR a3) seçim* b1 c1 d1"));
    expect(plan?.groups).toEqual([["seçim"], ["b1"], ["c1"]]);
  });

  it("YAKIN işlecinin iki yanını da zorunlu sayar", () => {
    expect(buildCollectionPlan(parseQuery("seçim NEAR/5 (sonuç OR sandık)"))?.groups).toEqual([["seçim"], ["sonuç", "sandık"]]);
  });

  it("daraltamayan dalı olan VEYA grup üretmez; tek grup çapalardır", () => {
    expect(buildCollectionPlan(parseQuery("belediye (su OR ton:olumsuz)"))?.groups).toEqual([["belediye"]]);
    expect(buildCollectionPlan(parseQuery("kargo OR teslimat"))?.groups).toEqual([["kargo", "teslimat"]]);
  });

  it("aranabilir kelime yoksa plan üretmez", () => {
    expect(buildCollectionPlan(parseQuery("ton:olumsuz NOT çekiliş"))).toBeNull();
    expect(buildCollectionPlan(parseQuery("kargo OR ton:olumsuz"))).toBeNull();
  });
});

describe("veritabanı ön süzgeci", () => {
  it("kullanıcı girdisini yalnızca parametre olarak taşır ve LIKE işaretlerini etkisizleştirir", () => {
    const probes = groupProbes([["a%b_c"], ["x'; DROP TABLE mentions; --"]]);
    const { conditions, params } = probeConditions("m.search_text", probes);
    expect(conditions.join(" ")).not.toContain("DROP");
    expect(conditions.every((condition) => /^\(m\.search_text LIKE \? ESCAPE '\\'( OR m\.search_text LIKE \? ESCAPE '\\')*\)$/.test(condition))).toBe(true);
    expect(params).toHaveLength(2);
    expect(params.some((param) => param.includes("%") && !param.slice(1, -1).includes("%"))).toBe(true);
  });

  it("yumuşayabilen son harfi atar; kelimesi olmayan grup süzgeç üretmez", () => {
    expect(groupProbes([["kitap", "seçim"], ["!!!"]])).toEqual([["%kita%", "%secim%"]]);
  });
});

describe("düz anlatım: sorgu dili kullanıcıya gösterilmez", () => {
  const screenshotQuery = '(e-Devlet OR edevlet OR "e-devlet kapısı") NOT çekiliş dil:tr';

  it("kayıtlı sorguyu kelime listelerine çevirir", () => {
    expect(decomposeQuery(screenshotQuery)).toEqual({ anyOf: ["e-Devlet", "edevlet", "e-devlet kapısı"], allOf: [], noneOf: ["çekiliş"], language: "tr" });
  });

  it("kelime listelerinden kurulan sorgu aynı listelere geri döner", () => {
    const plain = { anyOf: ["e-Devlet", "edevlet"], allOf: ["kimlik doğrulama"], noneOf: ["çekiliş", "iş ilanı"], language: "tr" };
    expect(decomposeQuery(composeQuery(plain))).toEqual(plain);
  });

  it("işleç gibi görünen kelimeler düz kelime olarak aranır", () => {
    const query = composeQuery(plainFromSearch("ve veya değil", "", null));
    expect(describeQuery(query)?.required).toEqual([["ve"], ["veya"], ["değil"]]);
  });

  it("arama kutusunda virgül farklı yazımları, boşluk birlikte aranan kelimeleri ayırır", () => {
    expect(plainFromSearch("e-Devlet, edevlet", "çekiliş", "tr")).toEqual({ anyOf: ["e-Devlet", "edevlet"], allOf: [], noneOf: ["çekiliş"], language: "tr" });
    expect(plainFromSearch("Brezilya seçimleri", "", null).allOf).toEqual(["Brezilya", "seçimleri"]);
    expect(plainFromSearch('"Brezilya seçimleri"', "", null).allOf).toEqual(["Brezilya seçimleri"]);
  });

  it("anlatımda işleç ve alan adı geçmez", () => {
    const description = describeQuery(screenshotQuery);
    expect(description).toEqual({ required: [["e-Devlet", "edevlet", "e-devlet kapısı"]], excluded: ["çekiliş"], filters: ["Dil: Türkçe"], simple: true });
  });

  it("kelime listesine inmeyen tanım form alanlarına çevrilmez ama anlatılabilir", () => {
    expect(decomposeQuery("seçim YAKIN/5 sonuç")).toBeNull();
    expect(describeQuery("seçim YAKIN/5 sonuç")?.required.flat().length).toBeGreaterThan(0);
  });

  it("konu kelimeleri sorguya çevrilir ve geri okunur", () => {
    expect(queryToTopicTerms(topicTermsToQuery("gecik*, gelmedi, su kesintisi"))).toBe("gecik*, gelmedi, su kesintisi");
    expect(queryToTopicTerms("fiyat OR zam OR pahalı")).toBe("fiyat, zam, pahalı");
  });
});
