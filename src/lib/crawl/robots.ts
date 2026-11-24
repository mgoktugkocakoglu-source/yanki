/**
 * robots.txt ayrıştırıcısı (RFC 9309). Saf işlevler; ağa dokunmaz.
 *
 * Kurallar: bizim tanıtıcımıza özel bir grup varsa yalnızca o uygulanır,
 * yoksa `*` grubu. En uzun eşleşen kural kazanır; eşitlikte izin kazanır.
 * `*` joker, sondaki `$` satır sonu anlamındadır.
 */

export interface RobotsRules {
  /** Uygulanan gruptaki kurallar. */
  rules: Array<{ allow: boolean; pattern: string }>;
  /** Grubun istediği bekleme süresi (saniye); belirtilmediyse null. */
  crawlDelaySeconds: number | null;
  /** Dosyada bildirilen site haritaları. */
  sitemaps: string[];
}

export const ALLOW_ALL: RobotsRules = { rules: [], crawlDelaySeconds: null, sitemaps: [] };

interface Group {
  agents: string[];
  rules: RobotsRules["rules"];
  crawlDelaySeconds: number | null;
}

/** `agentToken`: tanıtıcımızın ürün adı, ör. "YankiBot". */
export function parseRobots(text: string, agentToken: string): RobotsRules {
  const groups: Group[] = [];
  const sitemaps: string[] = [];
  let current: Group | null = null;
  let lastWasAgent = false;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    const separator = line.indexOf(":");
    if (separator <= 0) continue;
    const key = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();

    if (key === "sitemap") {
      if (value) sitemaps.push(value);
      continue;
    }
    if (key === "user-agent") {
      // Art arda gelen user-agent satırları aynı grubu paylaşır.
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [], crawlDelaySeconds: null };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (!current) continue;
    if (key === "allow" || key === "disallow") {
      // Boş "Disallow:" her şeye izin demektir; kural üretmez.
      if (value) current.rules.push({ allow: key === "allow", pattern: value });
    } else if (key === "crawl-delay") {
      const seconds = Number(value);
      if (Number.isFinite(seconds) && seconds >= 0) current.crawlDelaySeconds = seconds;
    }
  }

  const token = agentToken.toLowerCase();
  const own = groups.filter((group) => group.agents.some((agent) => agent !== "*" && token.includes(agent)));
  const applied = own.length > 0 ? own : groups.filter((group) => group.agents.includes("*"));
  return {
    rules: applied.flatMap((group) => group.rules),
    crawlDelaySeconds: applied.reduce<number | null>((delay, group) => group.crawlDelaySeconds ?? delay, null),
    sitemaps,
  };
}

function patternToRegExp(pattern: string): RegExp {
  const anchored = pattern.endsWith("$");
  const body = (anchored ? pattern.slice(0, -1) : pattern)
    .split("*")
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${body}${anchored ? "$" : ""}`);
}

/** Bu adres (yol + sorgu) kurallara göre taranabilir mi? */
export function isPathAllowed(rules: RobotsRules, url: string): boolean {
  let path: string;
  try {
    const parsed = new URL(url);
    path = `${parsed.pathname}${parsed.search}`;
  } catch {
    return false;
  }
  let best: { allow: boolean; length: number } | null = null;
  for (const rule of rules.rules) {
    if (!patternToRegExp(rule.pattern).test(path)) continue;
    const length = rule.pattern.length;
    if (!best || length > best.length || (length === best.length && rule.allow)) best = { allow: rule.allow, length };
  }
  return best?.allow ?? true;
}
