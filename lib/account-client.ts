import { publicPath } from "./public-path.ts";

export const KITCHEN_STORAGE_KEY = "fusion-table-v1";
export const GUEST_KITCHEN_STORAGE_KEY = "fusion-table-guest-v1";
export const ACCOUNT_OWNER_KEY = "fusion-table-account-owner-v1";
export const ACCOUNT_STATE_MAX_BYTES = 4_194_304;
const FIELDS = ["saved", "location", "radius", "pantry", "verdicts", "ratings", "buyList", "buyListLabel", "shoppingSource", "customShopping", "preferences", "avoidAllergens", "dislikeText", "cleanPrefs", "weekDays", "activeRecipe", "planSession"] as const;
export type KitchenData = Record<string, unknown>;
export type AccountUser = { id: string; email: string; displayName: string };
export type AccountState = { version: number; data: KitchenData; updatedAt: number };
export type AccountEnvelope = { available: boolean; user: AccountUser | null; state: AccountState | null; session?: { persistent: boolean; expiresAt: number; idleExpiresAt?: number } };
export type AccountAction = "signup" | "login" | "logout" | "logout-all" | "password";
type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;
const record = (value: unknown): value is KitchenData => !!value && typeof value === "object" && !Array.isArray(value);
let activeBrowserAccount: string | null = null;
const resilientStores = new WeakMap<StorageLike, StorageLike>();
const memoryValues = new Map<string, string>();
const memoryStorage: StorageLike = { getItem: key => memoryValues.get(key) ?? null, setItem: (key, value) => { memoryValues.set(key, value); }, removeItem: key => { memoryValues.delete(key); } };

/** SQL accounts still work when browser storage is blocked. Guest recovery then lasts for this tab. */
export function resilientAccountStorage(storage: StorageLike = memoryStorage): StorageLike {
  const existing = resilientStores.get(storage);
  if (existing) return existing;
  const fallback = new Map<string, string | null>();
  const wrapped: StorageLike = {
    getItem(key) { if (fallback.has(key)) return fallback.get(key) ?? null; try { return storage.getItem(key); } catch { return null; } },
    setItem(key, value) {
      // Do not leave a persistent account marker without its persistent guest recovery copy.
      if (key === ACCOUNT_OWNER_KEY && fallback.has(GUEST_KITCHEN_STORAGE_KEY)) { fallback.set(key, value); return; }
      try { storage.setItem(key, value); fallback.delete(key); } catch { fallback.set(key, value); }
    },
    removeItem(key) { try { storage.removeItem(key); fallback.delete(key); } catch { fallback.set(key, null); } },
  };
  resilientStores.set(storage, wrapped);
  return wrapped;
}

/** Only kitchen content is synced. Navigation and authentication never enter saved state. */
export function kitchenData(value: unknown): KitchenData {
  if (!record(value)) return {};
  return Object.fromEntries(FIELDS.filter(key => Object.hasOwn(value, key)).map(key => [key, value[key]]));
}

export function parseKitchen(raw: string | null): KitchenData {
  try { return kitchenData(raw ? JSON.parse(raw) : {}); } catch { return {}; }
}

export function kitchenSnapshot(value: unknown): string {
  const data = typeof value === "string" ? parseKitchen(value) : kitchenData(value);
  const raw = JSON.stringify(data);
  if (new TextEncoder().encode(raw).byteLength > ACCOUNT_STATE_MAX_BYTES) throw new Error("Your kitchen is too large to sync. Export a cookbook backup and remove some saved recipes before trying again.");
  return raw;
}

/** Restore guest content before the page hydrates; an expired cookie cannot expose the last account. */
export function prepareGuestKitchen(storage: StorageLike): void {
  activeBrowserAccount = null;
  if (!storage.getItem(ACCOUNT_OWNER_KEY)) return;
  const raw = storage.getItem(GUEST_KITCHEN_STORAGE_KEY);
  if (raw) storage.setItem(KITCHEN_STORAGE_KEY, JSON.stringify(parseKitchen(raw)));
  else storage.removeItem(KITCHEN_STORAGE_KEY);
}

/** Signed-in content is kept in memory and SQL, never copied over the guest kitchen. */
export function persistKitchenStorage(storage: StorageLike, raw: string): boolean {
  if (activeBrowserAccount) return false;
  storage.setItem(KITCHEN_STORAGE_KEY, raw);
  // Keep a guest recovery copy for another tab processing a sign-out at the same time.
  storage.setItem(GUEST_KITCHEN_STORAGE_KEY, JSON.stringify(parseKitchen(raw)));
  return true;
}

export function accountOwner(storage: StorageLike): string | null {
  return storage.getItem(ACCOUNT_OWNER_KEY);
}

export function enterAccountKitchen(storage: StorageLike, userId: string, guestSnapshot: string): void {
  // Never replace the guest backup with a previous account's private state.
  if (!activeBrowserAccount) storage.setItem(GUEST_KITCHEN_STORAGE_KEY, kitchenSnapshot(guestSnapshot));
  activeBrowserAccount = userId;
  storage.setItem(ACCOUNT_OWNER_KEY, userId);
}

export function leaveAccountKitchen(storage: StorageLike): KitchenData {
  activeBrowserAccount = null;
  const data = parseKitchen(storage.getItem(GUEST_KITCHEN_STORAGE_KEY));
  storage.setItem(KITCHEN_STORAGE_KEY, JSON.stringify(data));
  storage.removeItem(ACCOUNT_OWNER_KEY);
  return data;
}

export function accountState(value: unknown): value is AccountState {
  return record(value) && Number.isInteger(value.version) && (value.version as number) >= 1 && record(value.data) && typeof value.updatedAt === "number" && Number.isFinite(value.updatedAt);
}

export function accountEnvelope(value: unknown): value is AccountEnvelope {
  return record(value) && typeof value.available === "boolean" && (value.user === null || (record(value.user) && typeof value.user.id === "string" && typeof value.user.email === "string" && typeof value.user.displayName === "string")) && (value.state === null || accountState(value.state)) && (value.session === undefined || (record(value.session) && typeof value.session.persistent === "boolean" && typeof value.session.expiresAt === "number" && Number.isFinite(value.session.expiresAt) && (value.session.idleExpiresAt === undefined || (typeof value.session.idleExpiresAt === "number" && Number.isFinite(value.session.idleExpiresAt)))));
}

export class AccountRequestError extends Error {
  status: number;
  state: AccountState | null;
  constructor(message: string, status: number, state: AccountState | null = null) { super(message); this.name = "AccountRequestError"; this.status = status; this.state = state; }
}

const safeMessage = (value: unknown) => record(value) && typeof value.error === "string" && value.error.length <= 500 && !/[<>\u0000-\u001f]/.test(value.error) ? value.error : null;

async function accountRequest(path: string, method: string, body?: unknown, request: typeof fetch = fetch): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await request(publicPath(path), {
      method, credentials: "same-origin", cache: "no-store", signal: controller.signal,
      headers: { Accept: "application/json", "X-Fusion-Request": "account", ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    let data: unknown;
    try { data = await response.json(); } catch { throw new AccountRequestError("The account service returned an unreadable response. Please try again.", response.status); }
    if (!response.ok) throw new AccountRequestError(safeMessage(data) || (response.status === 401 ? "Your session has ended. Sign in again to save account changes." : "The account service is unavailable. Your browser kitchen is still available."), response.status, record(data) && accountState(data.state) ? data.state : null);
    return data;
  } catch (error) {
    if (error instanceof AccountRequestError) throw error;
    throw new AccountRequestError(controller.signal.aborted ? "The account service took too long. Please try again." : "We could not reach your account. Check your connection and try again.", 0);
  } finally { clearTimeout(timeout); }
}

export async function readAccount(request: typeof fetch = fetch): Promise<AccountEnvelope> {
  const data = await accountRequest("/api/account", "GET", undefined, request);
  if (!accountEnvelope(data)) throw new AccountRequestError("The account service returned an incomplete response.", 502);
  return data;
}

export async function changeAccount(action: AccountAction, fields: Record<string, unknown> = {}, request: typeof fetch = fetch): Promise<AccountEnvelope | { ok: true }> {
  const data = await accountRequest("/api/account", "POST", { ...fields, action }, request);
  if (action === "logout" || action === "logout-all") {
    if (!record(data) || data.ok !== true) throw new AccountRequestError("Sign-out could not be confirmed. Please try again.", 502);
    return { ok: true };
  }
  if (!accountEnvelope(data) || !data.user) throw new AccountRequestError("Sign-in could not be confirmed. Please try again.", 502);
  return data;
}

export async function saveAccountKitchen(version: number, value: unknown, userId: string, request: typeof fetch = fetch): Promise<AccountState> {
  const data = JSON.parse(kitchenSnapshot(value));
  const result = await accountRequest("/api/account/state", "PUT", { version, data, userId }, request);
  if (!record(result) || !accountState(result.state)) throw new AccountRequestError("Your save could not be confirmed. Please try again.", 502);
  return result.state;
}
