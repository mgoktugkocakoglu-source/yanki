import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

/**
 * Parola özeti: scrypt (Node'un yerleşik uygulaması), parola başına rastgele
 * tuz. Saklanan biçim: `scrypt$N$r$p$tuz$özet` (tuz ve özet base64url).
 */

const N = 16384;
const R = 8;
const P = 1;
const KEY_LENGTH = 32;
const SALT_LENGTH = 16;

export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 200;

export function hashPassword(password: string): string {
  const salt = randomBytes(SALT_LENGTH);
  const hash = scryptSync(password, salt, KEY_LENGTH, { N, r: R, p: P });
  return ["scrypt", N, R, P, salt.toString("base64url"), hash.toString("base64url")].join("$");
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, n, r, p, salt, hash] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const cost = { N: Number(n), r: Number(r), p: Number(p) };
  if (![cost.N, cost.r, cost.p].every((value) => Number.isInteger(value) && value > 0)) return false;

  const expected = Buffer.from(hash, "base64url");
  try {
    const actual = scryptSync(password, Buffer.from(salt, "base64url"), expected.length, cost);
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}
