import { HashBusyError } from "./auth-crypto.ts";
import { AccountError, accountConfig } from "./auth-security.ts";
import { AccountService } from "./auth-service.ts";
import { sqlAccountStore } from "./auth-store.ts";

export const accountHeaders = { "Cache-Control": "private, no-store", "Vary": "Cookie, Origin", "X-Content-Type-Options": "nosniff" };

export async function accountContext() {
  const config = accountConfig();
  const store = sqlAccountStore();
  if (!config || !store) throw new AccountError("Accounts are temporarily unavailable. You can keep using your browser kitchen.", 503);
  return { config, service: new AccountService(await store, config) };
}

export function accountFailure(error: unknown): Response {
  if (error instanceof AccountError) return Response.json({ error: error.message, ...(error.status === 503 ? { available: false } : {}) }, { status: error.status, headers: { ...accountHeaders, ...(error.status === 429 ? { "Retry-After": "900" } : {}) } });
  if (error instanceof HashBusyError) return Response.json({ error: error.message }, { status: 429, headers: { ...accountHeaders, "Retry-After": "3" } });
  // SQL connection details, credentials, statements and password hashes must
  // never appear in a response or application log.
  return Response.json({ available: false, error: "Accounts are temporarily unavailable. Your browser kitchen is still available." }, { status: 503, headers: accountHeaders });
}
