import { describe, expect, it } from "vitest";
import { redditConnector, redditQuery, toRawItem } from "@/server/collectors/reddit";
import { isConnectorUsable, listConnectors, PLANNED_SOURCES } from "@/server/collectors/registry";

/** Bağlayıcı kaydı ve Reddit eşlemesi; testler dış hizmete istek göndermez. */

describe("bağlayıcı kaydı", () => {
  it("her bağlayıcının kimliği benzersizdir ve planlanan listede yinelenmez", () => {
    const connectors = listConnectors();
    const ids = connectors.map((connector) => connector.descriptor.id);
    expect(new Set(ids).size).toBe(ids.length);
    const names = new Set(connectors.map((connector) => connector.descriptor.name));
    expect(PLANNED_SOURCES.filter((source) => names.has(source.name))).toEqual([]);
  });

  it("anahtar isteyen bağlayıcı anahtar yokken kullanılamaz", () => {
    expect(redditConnector.descriptor.requiredSetting).toBe("REDDIT_CLIENT_ID");
    expect(redditConnector.isConfigured()).toBe(false);
    expect(isConnectorUsable(redditConnector)).toBe(false);
  });

  it("günlük tavanı olan bağlayıcılar tavanı kendileri bildirir", () => {
    const limited = listConnectors().filter((connector) => connector.descriptor.dailyLimit !== undefined);
    expect(limited.map((connector) => connector.descriptor.id).sort()).toEqual(["reddit", "x"]);
    expect(limited.every((connector) => (connector.descriptor.dailyLimit ?? 0) > 0)).toBe(true);
  });
});

describe("Reddit", () => {
  it("grupları AND, grup içini OR ile birleştirir", () => {
    expect(
      redditQuery([
        ["İran", "Iran"],
        ["İsrail", "Israel"],
      ]),
    ).toBe("(İran OR Iran) AND (İsrail OR Israel)");
    expect(redditQuery([["COP31"]])).toBe("COP31");
  });

  it("gönderiyi ham içeriğe çevirir; silinmiş yazarı ve eksik alanı güvenle ele alır", () => {
    const item = toRawItem({
      id: "abc",
      title: "Başlık",
      selftext: "Metin",
      author: "[deleted]",
      permalink: "/r/turkey/comments/abc/baslik/",
      created_utc: 1_795_000_000,
      score: 42,
      num_comments: 7,
    });
    expect(item).toMatchObject({
      connectorId: "reddit",
      sourceType: "forum",
      sourceName: "Reddit",
      externalId: "abc",
      url: "https://www.reddit.com/r/turkey/comments/abc/baslik/",
      authorHandle: null,
      publishedAt: 1_795_000_000_000,
      likes: 42,
      comments: 7,
      shares: null,
      views: null,
    });
    expect(toRawItem({ id: "x", title: "Zamanı yok" })).toBeNull();
  });
});
