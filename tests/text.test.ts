import { describe, expect, it } from "vitest";
import { foldWord, tokenize, tokenizeWithSpans, toSearchText, turkishLower } from "@/lib/text/normalize";
import { isInflectionOf } from "@/lib/text/turkish";

describe("Türkçe küçük harf ve katlama", () => {
  it("İ/I ayrımını Türkçe kurallarıyla yapar", () => {
    expect(turkishLower("İSTANBUL IŞIK")).toBe("istanbul ışık");
  });

  it("Türkçe harfleri ASCII karşılığına indirir", () => {
    expect(foldWord("Şikâyetçi")).toBe("sikayetci");
    expect(foldWord("IĞDIR")).toBe("igdir");
    expect(foldWord("ÖrnekBank")).toBe("ornekbank");
  });

  it("aksanlı ve aksansız yazımı aynı kelimeye indirir", () => {
    expect(foldWord("şikayet")).toBe(foldWord("sikayet"));
    expect(foldWord("İade")).toBe(foldWord("iade"));
  });
});

describe("kelimelere ayırma", () => {
  it("kesme işaretinden sonraki eki atar", () => {
    expect(tokenize("THY'nin yeni rotası")).toEqual(["thy", "yeni", "rotasi"]);
    expect(tokenize("ÖrnekBank’tan açıklama")).toEqual(["ornekbank", "aciklama"]);
  });

  it("hashtag, mention ve noktalama işaretlerini temizler", () => {
    expect(tokenize("#kargo @ornekbank, e-devlet!")).toEqual(["kargo", "ornekbank", "e", "devlet"]);
  });

  it("arama metnini tek boşlukla birleştirir ve boş parçaları atlar", () => {
    expect(toSearchText("Kargo  Gecikti", null, "3 gündür")).toBe("kargo gecikti 3 gundur");
  });

  it("özgün metindeki konumları korur", () => {
    const text = "THY'nin bileti";
    const spans = tokenizeWithSpans(text);
    expect(spans.map((span) => span.token)).toEqual(["thy", "bileti"]);
    expect(text.slice(spans[0].start, spans[0].end)).toBe("THY'nin");
    expect(text.slice(spans[1].start, spans[1].end)).toBe("bileti");
  });
});

describe("çekim eki farkındalığı", () => {
  const inflects = (token: string, stem: string) => isInflectionOf(foldWord(token), foldWord(stem));

  it.each([
    ["kargom", "kargo"],
    ["kargoyu", "kargo"],
    ["kargodan", "kargo"],
    ["kargosunu", "kargo"],
    ["kargolarımız", "kargo"],
    ["kargomun", "kargo"],
    ["bankanın", "banka"],
    ["bankalarda", "banka"],
    ["kredisi", "kredi"],
    ["belediyenin", "belediye"],
    ["belediyeye", "belediye"],
    ["belediyedeki", "belediye"],
    ["uygulamayla", "uygulama"],
    ["suyu", "su"],
  ])("%s, %s kökünün çekimidir", (token, stem) => {
    expect(inflects(token, stem)).toBe(true);
  });

  it.each([
    ["kitabı", "kitap"],
    ["kanadına", "kanat"],
    ["rengi", "renk"],
    ["köpeği", "köpek"],
  ])("ünsüz yumuşamasını tanır: %s ← %s", (token, stem) => {
    expect(inflects(token, stem)).toBe(true);
  });

  it.each([
    ["karar", "kar"],
    ["karşı", "kar"],
    ["karne", "kar"],
    ["kart", "kar"],
    ["kardeş", "kar"],
    ["mobilya", "mobil"],
    ["evet", "ev"],
    ["evlen", "ev"],
    ["seslendi", "ses"],
    ["sudan", "süt"],
    ["hatay", "hata"],
    ["cezaevi", "ceza"],
    ["bankacılık", "banka"],
  ])("%s, %s kökünün çekimi değildir", (token, stem) => {
    expect(inflects(token, stem)).toBe(false);
  });
});
