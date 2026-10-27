import type { AccountConfig } from "./auth-types.ts";

export const MAX_ACCOUNT_STATE_BYTES = 4 * 1024 * 1024;
export const SESSION_AGE_MS = 12 * 60 * 60 * 1000;
export const REMEMBER_AGE_MS = 30 * 24 * 60 * 60 * 1000;
export const REMEMBER_IDLE_MS = 7 * 24 * 60 * 60 * 1000;

export class AccountError extends Error {
  readonly status: number;
  constructor(message: string, status = 400) { super(message); this.status = status; }
}

export function accountConfig(env: Record<string, string | undefined> = process.env): AccountConfig | null {
  const origin = env.FUSION_AUTH_ORIGIN || "";
  const secret = env.FUSION_AUTH_RATE_SECRET || "";
  if (!origin || secret.length < 32) return null;
  let url: URL;
  try { url = new URL(origin); } catch { return null; }
  if (url.origin !== origin || url.username || url.password || (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)))) return null;
  const base = (env.NEXT_PUBLIC_BASE_PATH || "").replace(/\/$/, "");
  if (base && !/^\/[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*$/.test(base)) return null;
  return { origin, path: `${base || ""}/`, secure: url.protocol === "https:", rateSecret: secret, ...(env.FUSION_AUTH_PROXY_HEADER ? { proxyHeader: env.FUSION_AUTH_PROXY_HEADER.toLowerCase() } : {}) };
}

export function assertAccountMutation(request: Request, config: AccountConfig): void {
  // Deliberately use a configured public origin, never client-supplied forwarded
  // Host headers. A JSON custom header also prevents simple cross-site forms.
  if (request.headers.get("origin") !== config.origin || request.headers.get("x-fusion-request") !== "account") throw new AccountError("Open Fusion Table in this browser and try again.", 403);
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") throw new AccountError("This request did not come from Fusion Table.", 403);
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get("content-type") || "")) throw new AccountError("Send account changes as JSON.", 415);
}

export function accountCookieName(config: AccountConfig): string { return config.secure ? "__Secure-fusion_session" : "fusion_session"; }

export function readSessionToken(request: Request, config: AccountConfig): string | null {
  const name = accountCookieName(config);
  const found = (request.headers.get("cookie") || "").split(";").map((part) => part.trim()).filter((part) => part.startsWith(`${name}=`));
  if (found.length !== 1) return null;
  const token = found[0].slice(name.length + 1);
  return /^[A-Za-z0-9_-]{43}$/.test(token) ? token : null;
}

export function sessionCookie(config: AccountConfig, token: string, persistent: boolean, clear = false): string {
  return `${accountCookieName(config)}=${clear ? "" : token}; Path=${config.path}; HttpOnly; SameSite=Lax${config.secure ? "; Secure" : ""}${clear ? "; Max-Age=0" : persistent ? `; Max-Age=${REMEMBER_AGE_MS / 1000}` : ""}`;
}

export function normalizedEmail(value: unknown): string {
  if (typeof value !== "string") throw new AccountError("Enter your email address.");
  const email = value.trim().toLowerCase();
  if (email.length > 254 || !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/.test(email)) throw new AccountError("Enter a valid email address.");
  return email;
}

export function checkedPassword(value: unknown, creating: boolean): string {
  if (typeof value !== "string" || [...value].length > 128 || Buffer.byteLength(value, "utf8") > 512 || value.includes("\0") || (creating ? [...value].length < 15 : value.length < 1)) throw new AccountError(creating ? "Use a password with 15 to 128 characters." : "Enter your password.");
  return value;
}

export function checkedDisplayName(value: unknown): string {
  if (typeof value !== "string" || !value.trim() || [...value.trim()].length > 60 || /[\u0000-\u001f\u007f]/.test(value)) throw new AccountError("Choose a name with 1 to 60 characters.");
  return value.trim();
}

export function checkedState(data: unknown): Record<string, unknown> {
  if (!data || typeof data !== "object" || Array.isArray(data) || Object.getPrototypeOf(data) !== Object.prototype) throw new AccountError("Your saved kitchen must be an object.");
  const raw = JSON.stringify(data);
  if (Buffer.byteLength(raw, "utf8") > MAX_ACCOUNT_STATE_BYTES) throw new AccountError("Your saved kitchen exceeds 4 MB. Export a backup and reduce its size before syncing.", 413);
  let nodes = 0;
  function visit(value: unknown, depth: number): void {
    if (++nodes > 150_000 || depth > 40) throw new AccountError("Your saved kitchen is too complex to sync.", 413);
    if (typeof value === "number" && !Number.isFinite(value)) throw new AccountError("Your saved kitchen contains an invalid number.");
    if (Array.isArray(value)) for (const item of value) visit(item, depth + 1);
    else if (value && typeof value === "object") for (const [key, item] of Object.entries(value)) {
      if (["__proto__", "prototype", "constructor"].includes(key)) throw new AccountError("Your saved kitchen contains an unsupported field.");
      visit(item, depth + 1);
    }
  }
  visit(data, 0);
  return JSON.parse(raw) as Record<string, unknown>;
}

export async function readAccountJson(request: Request, maxBytes = 2048): Promise<Record<string, unknown>> {
  const length = request.headers.get("content-length");
  if (length && (!/^\d+$/.test(length) || Number(length) > maxBytes)) throw new AccountError("That account request is too large.", 413);
  const reader = request.body?.getReader();
  if (!reader) throw new AccountError("Send the account details as JSON.");
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      size += result.value.byteLength;
      if (size > maxBytes) { await reader.cancel(); throw new AccountError("That account request is too large.", 413); }
      if (chunks.length >= 16_384) { await reader.cancel(); throw new AccountError("That account request has too many parts.", 413); }
      chunks.push(result.value);
    }
  } finally { reader.releaseLock(); }
  let parsed: unknown;
  try { parsed = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { throw new AccountError("Send valid JSON account details."); }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new AccountError("Send the account details as an object.");
  return parsed as Record<string, unknown>;
}
