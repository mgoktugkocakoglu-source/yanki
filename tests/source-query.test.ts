import { describe, expect, it } from "vitest";
import { booleanQuery, termCombinations } from "@/server/collectors/query";

describe("kaynak sorgusu", () => {
  it("grupları VE, grup içini VEYA ile birleştirir; öbekleri tırnaklar", () => {
    expect(booleanQuery([["COP31"], ["iklim zirvesi", "climate"]])).toBe('COP31 ("iklim zirvesi" OR climate)');
    expect(booleanQuery([["İran", "Iran"], ["İsrail", "Israel"]], "|")).toBe("(İran|Iran) (İsrail|Israel)");
  });

  it("VEYA desteklemeyen kaynak için birleşimleri sınırla üretir", () => {
    const { combinations, total } = termCombinations([["a", "b"], ["c", "d", "e"]], 4);
    expect(total).toBe(6);
    expect(combinations).toEqual([
      ["a", "c"],
      ["a", "d"],
      ["a", "e"],
      ["b", "c"],
    ]);
  });
});
