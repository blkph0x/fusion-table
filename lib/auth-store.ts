import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import type { AccountSession, AccountState, AccountStore, PrivateAccountUser } from "./auth-types.ts";

type SqlExecutor = Pick<Pool, "execute"> | Pick<PoolConnection, "execute">;
interface UserRow extends RowDataPacket { id: string; email: string; display_name: string; password_hash: string; auth_version: number }
interface SessionRow extends UserRow { token_hash: string; user_id: string; session_auth_version: number; persistent: number; created_at: number; last_seen_at: number; expires_at: number }
interface StateRow extends RowDataPacket { version: number; data: string; updated_at: number }

function user(row: UserRow): PrivateAccountUser {
  return { id: String(row.id), email: row.email, displayName: row.display_name, passwordHash: row.password_hash, authVersion: Number(row.auth_version) };
}

function state(row: StateRow): AccountState {
  return { version: Number(row.version), data: JSON.parse(row.data) as Record<string, unknown>, updatedAt: Number(row.updated_at) };
}

export class SqlAccountStore implements AccountStore {
  private readonly pool: Pool;
  constructor(pool: Pool) { this.pool = pool; }

  async ping(): Promise<void> { await this.pool.execute("SELECT id FROM account_users LIMIT 0"); }

  async userByEmail(email: string): Promise<PrivateAccountUser | null> {
    const [rows] = await this.pool.execute<UserRow[]>("SELECT id,email,display_name,password_hash,auth_version FROM account_users WHERE email=? LIMIT 1", [email]);
    return rows[0] ? user(rows[0]) : null;
  }

  private async transaction<T>(run: (connection: PoolConnection) => Promise<T>): Promise<T> {
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const result = await run(connection);
      await connection.commit();
      return result;
    } catch (error) { await connection.rollback(); throw error; }
    finally { connection.release(); }
  }

  async createUser(value: PrivateAccountUser, now: number): Promise<boolean> {
    try {
      await this.transaction(async (connection) => {
        await connection.execute("INSERT INTO account_users (id,email,display_name,password_hash,auth_version,created_at) VALUES (?,?,?,?,?,?)", [value.id, value.email, value.displayName, value.passwordHash, value.authVersion, now]);
        await connection.execute("INSERT INTO account_states (user_id,version,data,updated_at) VALUES (?,0,'{}',?)", [value.id, now]);
      });
      return true;
    } catch (error) {
      if ((error as { code?: string }).code === "ER_DUP_ENTRY") return false;
      throw error;
    }
  }

  async putSession(value: AccountSession): Promise<void> {
    await this.transaction(async (connection) => {
      // Serialize issuance per user; at most ten current sessions survive even
      // if several correct sign-ins arrive together.
      await connection.execute("SELECT id FROM account_users WHERE id=? FOR UPDATE", [value.userId]);
      await connection.execute("DELETE FROM account_sessions WHERE user_id=? AND expires_at<=?", [value.userId, value.createdAt]);
      await connection.execute("INSERT INTO account_sessions (token_hash,user_id,auth_version,persistent,created_at,last_seen_at,expires_at) VALUES (?,?,?,?,?,?,?)", [value.tokenHash, value.userId, value.authVersion, value.persistent ? 1 : 0, value.createdAt, value.lastSeenAt, value.expiresAt]);
      const [rows] = await connection.execute<(RowDataPacket & { token_hash: string })[]>("SELECT token_hash FROM account_sessions WHERE user_id=? AND token_hash<>? ORDER BY created_at DESC,token_hash DESC LIMIT 9", [value.userId, value.tokenHash]);
      const keep = [value.tokenHash, ...rows.map((row) => row.token_hash)];
      await connection.execute(`DELETE FROM account_sessions WHERE user_id=? AND token_hash NOT IN (${keep.map(() => "?").join(",")})`, [value.userId, ...keep]);
    });
  }

  async sessionByHash(hash: string): Promise<{ session: AccountSession; user: PrivateAccountUser } | null> {
    const [rows] = await this.pool.execute<SessionRow[]>("SELECT u.id,u.email,u.display_name,u.password_hash,u.auth_version,s.token_hash,s.user_id,s.auth_version AS session_auth_version,s.persistent,s.created_at,s.last_seen_at,s.expires_at FROM account_sessions s INNER JOIN account_users u ON u.id=s.user_id WHERE s.token_hash=? LIMIT 1", [hash]);
    const row = rows[0];
    if (!row) return null;
    return { user: user(row), session: { tokenHash: row.token_hash, userId: String(row.user_id), authVersion: Number(row.session_auth_version), persistent: Boolean(row.persistent), createdAt: Number(row.created_at), lastSeenAt: Number(row.last_seen_at), expiresAt: Number(row.expires_at) } };
  }

  async touchSession(hash: string, now: number): Promise<void> {
    await this.pool.execute("UPDATE account_sessions SET last_seen_at=GREATEST(last_seen_at,?) WHERE token_hash=?", [now, hash]);
  }

  async deleteSession(hash: string): Promise<void> { await this.pool.execute("DELETE FROM account_sessions WHERE token_hash=?", [hash]); }

  async revokeSessions(userId: string): Promise<void> {
    await this.transaction(async (connection) => {
      await connection.execute("UPDATE account_users SET auth_version=auth_version+1 WHERE id=?", [userId]);
      await connection.execute("DELETE FROM account_sessions WHERE user_id=?", [userId]);
    });
  }

  async changePassword(userId: string, oldHash: string, newHash: string): Promise<boolean> {
    return this.transaction(async (connection) => {
      const [result] = await connection.execute<ResultSetHeader>("UPDATE account_users SET password_hash=?,auth_version=auth_version+1 WHERE id=? AND password_hash=?", [newHash, userId, oldHash]);
      if (!result.affectedRows) return false;
      await connection.execute("DELETE FROM account_sessions WHERE user_id=?", [userId]);
      return true;
    });
  }

  async takeRate(key: string, now: number, windowMs: number, maximum: number): Promise<boolean> {
    const bucket = Math.floor(now / windowMs) * windowMs;
    return this.transaction(async (connection) => {
      await connection.execute("INSERT INTO account_rate_limits (rate_key,window_start,hits,expires_at) VALUES (?,?,1,?) ON DUPLICATE KEY UPDATE hits=IF(window_start=?,LEAST(hits+1,1000000),1),window_start=?,expires_at=?", [key, bucket, bucket + windowMs * 2, bucket, bucket, bucket + windowMs * 2]);
      const [rows] = await connection.execute<(RowDataPacket & { hits: number })[]>("SELECT hits FROM account_rate_limits WHERE rate_key=? FOR UPDATE", [key]);
      // Bound expired bookkeeping in ordinary traffic; no administrator cron or
      // runtime DDL privileges are required.
      await connection.execute("DELETE FROM account_rate_limits WHERE expires_at<? LIMIT 32", [now]);
      await connection.execute("DELETE FROM account_sessions WHERE expires_at<? LIMIT 16", [now]);
      return Number(rows[0].hits) <= maximum;
    });
  }

  private async stateWith(executor: SqlExecutor, userId: string): Promise<AccountState> {
    const [rows] = await executor.execute<StateRow[]>("SELECT version,data,updated_at FROM account_states WHERE user_id=?", [userId]);
    if (!rows[0]) throw new Error("Account state is missing.");
    return state(rows[0]);
  }

  async readState(userId: string): Promise<AccountState> { return this.stateWith(this.pool, userId); }

  async saveState(userId: string, version: number, data: Record<string, unknown>, now: number): Promise<{ saved: boolean; state: AccountState }> {
    return this.transaction(async (connection) => {
      const [result] = await connection.execute<ResultSetHeader>("UPDATE account_states SET version=version+1,data=?,updated_at=? WHERE user_id=? AND version=?", [JSON.stringify(data), now, userId, version]);
      return { saved: result.affectedRows === 1, state: await this.stateWith(connection, userId) };
    });
  }
}

let storePromise: Promise<SqlAccountStore> | null = null;

export function sqlAccountStore(env: Record<string, string | undefined> = process.env): Promise<SqlAccountStore> | null {
  const { FUSION_AUTH_DB_HOST: host, FUSION_AUTH_DB_NAME: database, FUSION_AUTH_DB_USER: user, FUSION_AUTH_DB_PASSWORD: password } = env;
  const port = Number(env.FUSION_AUTH_DB_PORT || 3306);
  if (!host || !database || !user || !password || !Number.isInteger(port) || port < 1 || port > 65535) return null;
  // This deployment's SQL is local. Refuse an accidentally public unencrypted
  // database endpoint; a remote SQL deployment needs a deliberate TLS adapter.
  if (!["127.0.0.1", "localhost", "::1"].includes(host)) return null;
  if (!storePromise) storePromise = import("mysql2/promise").then(({ createPool }) => new SqlAccountStore(createPool({ host, port, database, user, password, charset: "utf8mb4", waitForConnections: true, connectionLimit: 4, maxIdle: 2, idleTimeout: 30_000, queueLimit: 16, connectTimeout: 3000, enableKeepAlive: true, multipleStatements: false, supportBigNumbers: true, bigNumberStrings: false, decimalNumbers: false })));
  return storePromise;
}
