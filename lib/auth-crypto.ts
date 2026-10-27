import { createHash, createHmac, randomBytes, scrypt, timingSafeEqual } from "node:crypto";

// OWASP's scrypt N=2^15, r=8, p=3 profile. Async work is bounded independently
// of the database limit so a burst cannot allocate unbounded hashing memory.
const SCRYPT_N = 32_768;
const SCRYPT_R = 8;
const SCRYPT_P = 3;
let hashing = 0;
const MAX_HASHING = 2;

export class HashBusyError extends Error {}

function derive(password: string, salt: Buffer): Promise<Buffer> {
  if (hashing >= MAX_HASHING) return Promise.reject(new HashBusyError("Sign-in is busy. Try again shortly."));
  hashing++;
  return new Promise((resolve, reject) => {
    scrypt(password, salt, 32, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P, maxmem: 64 * 1024 * 1024 }, (error, key) => {
      hashing--;
      if (error) reject(error); else resolve(key);
    });
  });
}

export async function passwordHash(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(password, salt);
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString("hex")}$${key.toString("hex")}`;
}

const DUMMY_HASH = `scrypt$32768$8$3$${"0".repeat(32)}$${"0".repeat(64)}`;

export async function verifyPassword(password: string, stored = DUMMY_HASH): Promise<boolean> {
  const parts = stored.split("$");
  // Never let a corrupted database hash choose its own work factor.
  if (parts.length !== 6 || parts[0] !== "scrypt" || parts[1] !== "32768" || parts[2] !== "8" || parts[3] !== "3" || !/^[a-f0-9]{32}$/.test(parts[4]) || !/^[a-f0-9]{64}$/.test(parts[5])) return false;
  const actual = await derive(password, Buffer.from(parts[4], "hex"));
  return timingSafeEqual(actual, Buffer.from(parts[5], "hex"));
}

export function newSessionToken(): string { return randomBytes(32).toString("base64url"); }
export function sessionHash(token: string): string { return createHash("sha256").update(token).digest("hex"); }
export function rateHash(secret: string, kind: string, value: string): string { return createHmac("sha256", secret).update(`${kind}\0${value}`).digest("hex"); }
