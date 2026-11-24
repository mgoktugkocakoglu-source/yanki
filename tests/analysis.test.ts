import { describe, expect, it } from "vitest";
import { analyzeText } from "@/lib/analysis/analyze";

function analyze(content: string, languageHint: string | null = null) {
  return analyzeText({ title: "", content, languageHint });
}

describe("dil tespiti", () => {
  it.each([
    ["Kargom üç gündür gelmedi, artık çok sıkıldım", "tr"],
    ["The delivery was late and the support is not helping at all", "en"],
    ["ok", "und"],
  ])("%s → %s", (text, language) => {
    expect(analyze(text).language).toBe(language);
  });

  it("kaynağın bildirdiği dili tahmine tercih eder", () => {
    expect(analyze("ok", "tr").language).toBe("tr");
  });
});

describe("ton", () => {
  it.each([
    ["Kurye çok nazikti, teşekkürler", "positive"],
    ["Hızlı teslimat, tavsiye ederim", "positive"],
    ["Rezalet bir hizmet, mağdur oldum", "negative"],
    ["Kargom üç gündür gelmedi", "negative"],
    ["Uygulama açılmıyor, giriş yapamıyorum", "negative"],
    ["Müşteri hizmetlerine ulaşamıyorum", "negative"],
    ["Şirket yeni şubesini Ankara'da açtı", "neutral"],
    ["Toplantı saat üçte başlayacak", "neutral"],
  ])("%s → %s", (text, sentiment) => {
    expect(analyze(text).sentiment).toBe(sentiment);
  });

  it("kelime içi olumsuzluğu çözer", () => {
    expect(analyze("Bu ürünü hiç beğenmedim").sentiment).toBe("negative");
    expect(analyze("Bu ürünü çok beğendim").sentiment).toBe("positive");
    expect(analyze("Sipariş gecikmedi, zamanında geldi").sentiment).toBe("positive");
  });

  it("-siz ekini ters ton olarak okur", () => {
    expect(analyze("Tam bir memnuniyetsizlik").sentiment).toBe("negative");
    expect(analyze("Kalitesiz ve başarısız bir uygulama").sentiment).toBe("negative");
    expect(analyze("Sorunsuz bir alışverişti").sentiment).toBe("positive");
  });

  it("sonradan gelen çeviricileri uygular", () => {
    expect(analyze("Hizmet iyi değil").sentiment).toBe("negative");
    expect(analyze("Kimseye tavsiye etmiyorum").sentiment).toBe("negative");
    expect(analyze("Bu ürüne kötü diyemem").sentiment).not.toBe("negative");
    expect(analyze("Herhangi bir sorun yok").sentiment).not.toBe("negative");
  });

  it("rastlantısal ön ek benzerliklerine kanmaz", () => {
    expect(analyze("Hatay'da yeni park açıldı").sentiment).toBe("neutral");
    expect(analyze("Takım maçı kazandı").sentiment).not.toBe("negative");
  });

  it("İngilizce olumsuzluğu ton kelimesinden önce arar", () => {
    expect(analyze("The app is not good and it keeps failing for me", "en").sentiment).toBe("negative");
    expect(analyze("Really great service and the team is very helpful", "en").sentiment).toBe("positive");
  });
});

describe("ironi", () => {
  it("övgü ile hizmet aksaklığı birlikteyse ironi şüphesi işaretler", () => {
    const result = analyze("Harikasınız gerçekten, yine uygulamaya giremiyorum");
    expect(result.isSarcastic).toBe(true);
    expect(result.sentiment).toBe("negative");
  });

  it("açık ironi işaretini tanır", () => {
    const result = analyze("Harika hizmet (!) üç saattir bekliyorum");
    expect(result.isSarcastic).toBe(true);
    expect(result.sentiment).toBe("negative");
  });

  it("gerçek övgüyü ironi saymaz", () => {
    expect(analyze("Harika bir deneyimdi, teşekkürler").isSarcastic).toBe(false);
  });
});

describe("duygu", () => {
  it.each([
    ["Bu ne rezalet, yeter artık!", "anger"],
    ["Çok mutlu oldum, bayıldım", "joy"],
    ["Maalesef çok üzüldük", "sadness"],
    ["Verilerim için endişe ediyorum, güvensiz", "fear"],
    ["Toplantı yarın yapılacak", "none"],
  ])("%s → %s", (text, emotion) => {
    expect(analyze(text).emotion).toBe(emotion);
  });
});

describe("niyet", () => {
  it.each([
    ["Aboneliğimi iptal ettim, bir daha asla", "churn"],
    ["Rakibe geçsem mi, bundan sıkıldım", "churn"],
    ["Kargo firması tavsiye eder misiniz?", "purchase"],
    ["Bu modeli almayı düşünüyorum, kullanan var mı?", "purchase"],
    ["Şifremi nasıl düzeltebilirim, yardım eder misiniz", "support"],
    ["Siparişim 5 gündür gelmedi, mağdurum", "complaint"],
    ["Kurye çok nazikti, teşekkürler", "praise"],
    ["Şirket yeni şubesini açtı", "general"],
  ])("%s → %s", (text, intent) => {
    expect(analyze(text).intent).toBe(intent);
  });
});
