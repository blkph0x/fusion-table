import { randomUUID } from "node:crypto";
import { newSessionToken, passwordHash, rateHash, sessionHash, verifyPassword } from "./auth-crypto.ts";
import { AccountError, checkedDisplayName, checkedPassword, checkedState, normalizedEmail, readSessionToken, REMEMBER_AGE_MS, REMEMBER_IDLE_MS, SESSION_AGE_MS, sessionCookie } from "./auth-security.ts";
import type { AccountConfig, AccountSession, AccountState, AccountStore, PrivateAccountUser } from "./auth-types.ts";

interface Identity { user: PrivateAccountUser; session: AccountSession }
const publicState = (value: AccountState): AccountState | null => value.version > 0 ? value : null;

export class AccountService {
  private readonly store: AccountStore;
  private readonly config: AccountConfig;
  private readonly now: () => number;
  constructor(store: AccountStore, config: AccountConfig, now = () => Date.now()) { this.store = store; this.config = config; this.now = now; }

  async identity(request: Request): Promise<Identity | null> {
    const token = readSessionToken(request, this.config);
    if (!token) return null;
    const value = await this.store.sessionByHash(sessionHash(token));
    if (!value) return null;
    const now = this.now();
    if (value.session.authVersion !== value.user.authVersion || value.session.expiresAt <= now || (value.session.persistent && value.session.lastSeenAt + REMEMBER_IDLE_MS <= now)) {
      await this.store.deleteSession(value.session.tokenHash);
      return null;
    }
    if (value.session.lastSeenAt + 5 * 60_000 < now) {
      await this.store.touchSession(value.session.tokenHash, now);
      value.session.lastSeenAt = now;
    }
    return value;
  }

  private async requireIdentity(request: Request): Promise<Identity> {
    const identity = await this.identity(request);
    if (!identity) throw new AccountError("Your session has ended. Sign in again; your browser kitchen is still available.", 401);
    return identity;
  }

  private async limit(request: Request, kind: string, email?: string): Promise<void> {
    const now = this.now();
    const keys: [string, string, number, number][] = [["global", kind, 15 * 60_000, kind === "signup" ? 40 : 300]];
    if (email) keys.push(["email", email, 15 * 60_000, 12]);
    if (this.config.proxyHeader) {
      const address = request.headers.get(this.config.proxyHeader);
      // Only trust the explicitly configured proxy-overwritten header. Never
      // parse arbitrary X-Forwarded-For or an attacker-provided first hop.
      if (address && /^[a-fA-F0-9:.]{2,64}$/.test(address)) keys.push(["client", address, 15 * 60_000, 40]);
    }
    for (const [scope, value, windowMs, maximum] of keys) {
      if (!await this.store.takeRate(rateHash(this.config.rateSecret, scope, value), now, windowMs, maximum)) throw new AccountError("Too many account attempts. Wait 15 minutes before trying again.", 429);
    }
  }

  private async signedIn(value: Identity) {
    return { available: true, user: { id: value.user.id, email: value.user.email, displayName: value.user.displayName }, state: publicState(await this.store.readState(value.user.id)), session: { persistent: value.session.persistent, expiresAt: value.session.expiresAt, idleExpiresAt: value.session.persistent ? Math.min(value.session.expiresAt, value.session.lastSeenAt + REMEMBER_IDLE_MS) : value.session.expiresAt } };
  }

  async current(request: Request) {
    await this.store.ping();
    const value = await this.identity(request);
    return value ? this.signedIn(value) : { available: true, user: null, state: null };
  }

  private async issue(value: PrivateAccountUser, persistent: boolean): Promise<{ identity: Identity; cookie: string }> {
    const token = newSessionToken();
    const now = this.now();
    const session: AccountSession = { tokenHash: sessionHash(token), userId: value.id, authVersion: value.authVersion, persistent, createdAt: now, lastSeenAt: now, expiresAt: now + (persistent ? REMEMBER_AGE_MS : SESSION_AGE_MS) };
    await this.store.putSession(session);
    return { identity: { user: value, session }, cookie: sessionCookie(this.config, token, persistent) };
  }

  async action(request: Request, body: Record<string, unknown>): Promise<{ body: unknown; cookie?: string }> {
    if (body.action === "logout") {
      const token = readSessionToken(request, this.config);
      if (token) await this.store.deleteSession(sessionHash(token));
      return { body: { ok: true }, cookie: sessionCookie(this.config, "", false, true) };
    }
    if (body.action === "logout-all") {
      const value = await this.requireIdentity(request);
      await this.store.revokeSessions(value.user.id);
      return { body: { ok: true }, cookie: sessionCookie(this.config, "", false, true) };
    }
    if (body.action === "password") {
      const value = await this.requireIdentity(request);
      await this.limit(request, "password", value.user.email);
      const current = checkedPassword(body.currentPassword, false);
      const replacement = checkedPassword(body.newPassword, true);
      if (!await verifyPassword(current, value.user.passwordHash)) throw new AccountError("The current password did not match.", 401);
      const hash = await passwordHash(replacement);
      if (!await this.store.changePassword(value.user.id, value.user.passwordHash, hash)) throw new AccountError("This account changed in another session. Sign in again.", 409);
      const issued = await this.issue({ ...value.user, passwordHash: hash, authVersion: value.user.authVersion + 1 }, value.session.persistent);
      return { body: await this.signedIn(issued.identity), cookie: issued.cookie };
    }
    if (body.action !== "signup" && body.action !== "login") throw new AccountError("Choose sign up, sign in or sign out.");
    const email = normalizedEmail(body.email);
    const password = checkedPassword(body.password, body.action === "signup");
    if (body.remember !== undefined && typeof body.remember !== "boolean") throw new AccountError("Choose whether to stay signed in.");
    const name = body.action === "signup" ? checkedDisplayName(body.displayName) : "";
    await this.limit(request, body.action, email);
    let value = await this.store.userByEmail(email);
    if (body.action === "signup") {
      // Perform the same expensive hash even for an already-used address; never
      // expose a SQL duplicate/key message or return a pre-existing session.
      const hash = await passwordHash(password);
      if (value) throw new AccountError("This account could not be created. Try signing in or use another email address.", 409);
      value = { id: randomUUID(), email, displayName: name, passwordHash: hash, authVersion: 0 };
      if (!await this.store.createUser(value, this.now())) throw new AccountError("This account could not be created. Try signing in or use another email address.", 409);
    } else if (!await verifyPassword(password, value?.passwordHash) || !value) throw new AccountError("The email or password did not match.", 401);
    const old = readSessionToken(request, this.config);
    // A successful authentication always rotates a previous session token.
    if (old) await this.store.deleteSession(sessionHash(old));
    const issued = await this.issue(value, body.remember === true);
    return { body: await this.signedIn(issued.identity), cookie: issued.cookie };
  }

  async readState(request: Request): Promise<{ state: AccountState | null }> {
    const value = await this.requireIdentity(request);
    return { state: publicState(await this.store.readState(value.user.id)) };
  }

  async writeState(request: Request, body: Record<string, unknown>): Promise<{ saved: boolean; state: AccountState | null }> {
    const value = await this.requireIdentity(request);
    // Cookies are shared across tabs. Bind writes to the account the sending
    // tab actually displayed, even when another tab has just changed accounts.
    if (body.userId !== value.user.id) throw new AccountError("The signed-in account changed in another tab. Reload before syncing your kitchen.", 409);
    if (!Number.isSafeInteger(body.version) || Number(body.version) < 0 || Number(body.version) >= 4_000_000_000) throw new AccountError("Send the current saved-kitchen version.");
    const data = checkedState(body.data);
    if (!await this.store.takeRate(rateHash(this.config.rateSecret, "state", value.user.id), this.now(), 60_000, 120)) throw new AccountError("Your kitchen is changing quickly. Wait a minute before syncing again.", 429);
    const saved = await this.store.saveState(value.user.id, Number(body.version), data, this.now());
    return { saved: saved.saved, state: publicState(saved.state) };
  }
}
