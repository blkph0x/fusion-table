import { constants } from "node:fs";
import { lstat, mkdir, open, realpath, rename, unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";

const MAX_BYTES = 256 * 1024;
const MAX_AGE_MS = 7 * 24 * 60 * 60_000;
const ORIGIN = "https://www.coles.com.au";
const COOKIE_DOMAINS = new Set(["coles.com.au", ".coles.com.au", "www.coles.com.au", ".www.coles.com.au"]);
const COOKIE_NAME = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;
const PRIVATE_KEYS = /(?:password|credential|authorization|authentication|access[_-]?token|refresh[_-]?token|id[_-]?token|jwt|customer|account|email|profile|logged[_-]?in)/i;
const writes = new Map();
const onPosix = process.platform !== "win32";
const ownUid = typeof process.getuid === "function" ? process.getuid() : undefined;
const plainObject = value => value !== null && typeof value === "object" && !Array.isArray(value);
const text = (value, max) => typeof value === "string" && value.length <= max && !/[\u0000-\u001f\u007f]/.test(value);

function filenameFor(file) {
  if (typeof file !== "string" || !path.isAbsolute(file) || file.includes("\0") || path.basename(file) === path.parse(file).root) return undefined;
  return path.resolve(file);
}

function privateFile(stat) {
  return stat.isFile() && !stat.isSymbolicLink() && stat.nlink === 1
    && (!onPosix || stat.uid === ownUid && (stat.mode & 0o7777) === 0o600);
}

async function safeParent(file, create = false) {
  const parent = path.dirname(file);
  if (create) await mkdir(parent, { recursive: true, mode: 0o700 });
  const stat = await lstat(parent);
  if (!stat.isDirectory() || stat.isSymbolicLink()) return false;
  if (onPosix && (stat.mode & 0o022 || stat.uid !== ownUid && stat.uid !== 0)) return false;
  // Configured private directories cannot redirect through a symlink/junction.
  const actual = await realpath(parent);
  return onPosix ? actual === parent : actual.toLowerCase() === parent.toLowerCase();
}

function minimizeState(state, now) {
  if (!plainObject(state) || !Array.isArray(state.cookies) || !Array.isArray(state.origins)
    || state.cookies.length > 512 || state.origins.length > 32) return undefined;
  const cookies = [], origins = [];
  for (const cookie of state.cookies) {
    if (!plainObject(cookie) || !COOKIE_DOMAINS.has(cookie.domain) || !text(cookie.name, 256) || !COOKIE_NAME.test(cookie.name) || PRIVATE_KEYS.test(cookie.name)
      || !text(cookie.value, 8192) || !text(cookie.path, 2048) || !cookie.path.startsWith("/")
      || typeof cookie.httpOnly !== "boolean" || typeof cookie.secure !== "boolean"
      || !["Strict", "Lax", "None"].includes(cookie.sameSite) || cookie.sameSite === "None" && !cookie.secure
      || !Number.isFinite(cookie.expires) || cookie.expires > 253402300799
      || cookie.expires !== -1 && (cookie.expires < 0 || cookie.expires <= now / 1000)
      || cookie.partitionKey !== undefined && cookie.partitionKey !== ORIGIN) continue;
    cookies.push({ name: cookie.name, value: cookie.value, domain: cookie.domain, path: cookie.path, expires: cookie.expires,
      httpOnly: cookie.httpOnly, secure: cookie.secure, sameSite: cookie.sameSite,
      ...(cookie.partitionKey === ORIGIN ? { partitionKey: ORIGIN } : {}) });
  }
  for (const origin of state.origins) {
    if (!plainObject(origin) || origin.origin !== ORIGIN || !Array.isArray(origin.localStorage) || origin.localStorage.length > 512) continue;
    const localStorage = origin.localStorage.filter(entry => plainObject(entry) && text(entry.name, 256) && entry.name
      && !PRIVATE_KEYS.test(entry.name) && text(entry.value, 32768)).map(entry => ({ name: entry.name, value: entry.value }));
    if (localStorage.length) origins.push({ origin: ORIGIN, localStorage });
  }
  return cookies.length || origins.length ? { cookies, origins } : undefined;
}

/** Only the service's own dedicated anonymous Coles browser context may supply this state. */
export async function readColesBrowserState(file) {
  let handle;
  try {
    const filename = filenameFor(file);
    if (!filename || !await safeParent(filename)) return undefined;
    const before = await lstat(filename);
    if (!privateFile(before) || before.size > MAX_BYTES) return undefined;
    handle = await open(filename, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
    const stat = await handle.stat();
    if (!privateFile(stat) || stat.dev !== before.dev || stat.ino !== before.ino || stat.size > MAX_BYTES) return undefined;
    const bytes = Buffer.alloc(MAX_BYTES + 1);
    let length = 0;
    while (length < bytes.length) {
      const part = await handle.read(bytes, length, bytes.length - length, length);
      if (!part.bytesRead) break;
      length += part.bytesRead;
    }
    if (length > MAX_BYTES) return undefined;
    const envelope = JSON.parse(bytes.subarray(0, length).toString("utf8"));
    if (!plainObject(envelope) || envelope.version !== 1 || !text(envelope.savedAt, 40)) return undefined;
    const age = Date.now() - Date.parse(envelope.savedAt);
    if (!Number.isFinite(age) || age < -5 * 60_000 || age > MAX_AGE_MS) return undefined;
    return minimizeState(envelope.state, Date.now());
  } catch { return undefined; }
  finally { await handle?.close().catch(() => undefined); }
}

async function persist(filename, state) {
  let handle, temporary;
  try {
    const minimized = minimizeState(state, Date.now());
    if (!minimized) return false;
    const bytes = JSON.stringify({ version: 1, savedAt: new Date().toISOString(), state: minimized });
    if (Buffer.byteLength(bytes) > MAX_BYTES || !await safeParent(filename, true)) return false;
    try { if (!privateFile(await lstat(filename))) return false; }
    catch (error) { if (error?.code !== "ENOENT") return false; }
    temporary = `${filename}.${randomUUID()}.tmp`;
    handle = await open(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW || 0), 0o600);
    if (onPosix) await handle.chmod(0o600);
    await handle.writeFile(bytes, "utf8"); await handle.sync(); await handle.close(); handle = undefined;
    // Refuse a destination replaced by a symlink/unsafe file during the write.
    try { if (!privateFile(await lstat(filename))) return false; }
    catch (error) { if (error?.code !== "ENOENT") return false; }
    await rename(temporary, filename); temporary = undefined;
    return true;
  } catch { return false; }
  finally {
    await handle?.close().catch(() => undefined);
    if (temporary) await unlink(temporary).catch(() => undefined);
  }
}

/** Best effort: false leaves pricing available without persisted state; never log its contents. */
export async function saveColesBrowserState(file, state) {
  const filename = filenameFor(file);
  if (!filename) return false;
  const task = (writes.get(filename) || Promise.resolve()).catch(() => undefined).then(() => persist(filename, state));
  writes.set(filename, task);
  try { return await task; }
  finally { if (writes.get(filename) === task) writes.delete(filename); }
}
