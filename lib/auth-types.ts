export interface AccountUser {
  id: string;
  email: string;
  displayName: string;
}

export interface PrivateAccountUser extends AccountUser {
  passwordHash: string;
  authVersion: number;
}

export interface AccountState {
  version: number;
  data: Record<string, unknown>;
  updatedAt: number;
}

export interface AccountSession {
  tokenHash: string;
  userId: string;
  authVersion: number;
  persistent: boolean;
  createdAt: number;
  lastSeenAt: number;
  expiresAt: number;
}

export interface AccountStore {
  ping(): Promise<void>;
  userByEmail(email: string): Promise<PrivateAccountUser | null>;
  createUser(user: PrivateAccountUser, now: number): Promise<boolean>;
  putSession(session: AccountSession): Promise<void>;
  sessionByHash(hash: string): Promise<{ session: AccountSession; user: PrivateAccountUser } | null>;
  touchSession(hash: string, now: number): Promise<void>;
  deleteSession(hash: string): Promise<void>;
  revokeSessions(userId: string): Promise<void>;
  changePassword(userId: string, oldHash: string, newHash: string): Promise<boolean>;
  takeRate(key: string, now: number, windowMs: number, maximum: number): Promise<boolean>;
  readState(userId: string): Promise<AccountState>;
  saveState(userId: string, version: number, data: Record<string, unknown>, now: number): Promise<{ saved: boolean; state: AccountState }>;
}

export interface AccountConfig {
  origin: string;
  path: string;
  secure: boolean;
  rateSecret: string;
  proxyHeader?: string;
}
