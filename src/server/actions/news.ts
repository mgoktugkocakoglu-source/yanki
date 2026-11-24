"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { QUERY_LANGUAGES } from "@/lib/query";
import { isSysadmin } from "../auth/access";
import { requireUser } from "../auth/session";
import type { AuthState } from "./auth";
import { hostnameOf } from "../collectors/http";
import { crawlNews, probeFeed } from "../news/crawler";
import { addFeed, getFeed, setFeedEnabled } from "../repositories/news";
import { recordAudit } from "../repositories/runs";

/**
 * Haber arşivi yönetimi. Yalnızca sistem yöneticisi kullanır; her işlev
 * yetkiyi kendisi denetler.
 */

const fail = (message: string): AuthState => ({ ok: false, message });
const DENIED = "Bu işlem için yetkiniz yok.";

const feedSchema = z.object({
  outlet: z.string().trim().min(2, "Yayın adı en az 2 karakter olmalı.").max(80, "Yayın adı en çok 80 karakter olabilir."),
  url: z.string().trim().url("Geçerli bir adres yazın.").max(500, "Adres çok uzun."),
  language: z.string().refine((code) => QUERY_LANGUAGES.some((language) => language.code === code), "Dil seçin."),
});

/** Akışı canlı olarak dener; robots.txt izin veriyor ve haber okunabiliyorsa arşive ekler. */
export async function addFeedAction(_previous: AuthState, formData: FormData): Promise<AuthState> {
  const viewer = await requireUser();
  if (!isSysadmin(viewer)) return fail(DENIED);
  const parsed = feedSchema.safeParse({ outlet: formData.get("outlet") ?? "", url: formData.get("url") ?? "", language: formData.get("language") ?? "" });
  if (!parsed.success) return fail(parsed.error.issues[0].message);

  const probe = await probeFeed(parsed.data.url);
  if (!probe.ok) return fail(probe.reason);
  if (probe.dated === 0) return fail("Akıştaki haberlerde yayın tarihi yok; tarihsiz içerik arşive alınmaz.");

  const domain = hostnameOf(parsed.data.url) ?? parsed.data.url;
  const now = Date.now();
  if (!addFeed({ outlet: parsed.data.outlet, domain, url: parsed.data.url, kind: probe.kind, language: parsed.data.language, origin: "manual" }, now)) {
    return fail("Bu adres zaten listede.");
  }
  recordAudit({ workspaceId: null, action: "haber-akışı.eklendi", objectType: "haber akışı", objectId: null, detail: `${parsed.data.outlet} · ${parsed.data.url}`, actor: viewer.email });
  refresh();
  return { ok: true, message: `Akış eklendi: ${probe.entries} haber okunabiliyor. İlk tarama birkaç dakika içinde yapılır.` };
}

export async function setFeedEnabledAction(formData: FormData): Promise<void> {
  const viewer = await requireUser();
  const feed = getFeed(String(formData.get("feedId") ?? ""));
  if (!isSysadmin(viewer) || !feed) return;
  const enabled = formData.get("enabled") === "1";
  setFeedEnabled(feed.id, enabled);
  recordAudit({ workspaceId: null, action: enabled ? "haber-akışı.açıldı" : "haber-akışı.kapatıldı", objectType: "haber akışı", objectId: feed.id, detail: `${feed.outlet} · ${feed.url}`, actor: viewer.email });
  refresh();
}

/** Sırası gelen akışları hemen tarar. */
export async function crawlNowAction(): Promise<void> {
  const viewer = await requireUser();
  if (!isSysadmin(viewer)) return;
  await crawlNews();
  refresh();
}
