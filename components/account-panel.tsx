"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { AccountRequestError, accountOwner, changeAccount, enterAccountKitchen, kitchenData, kitchenSnapshot, leaveAccountKitchen, parseKitchen, readAccount, resilientAccountStorage, saveAccountKitchen, type AccountEnvelope, type AccountState, type KitchenData } from "@/lib/account-client";
import "./account-panel.css";

type Props = { snapshot: string; ready: boolean; onRestore: (data: KitchenData) => void; onNotice?: (message: string) => void };
const errorMessage = (error: unknown) => error instanceof Error ? error.message : "Your account could not be reached. Please try again.";
const accountStorage = () => { try { return resilientAccountStorage(localStorage); } catch { return resilientAccountStorage(); } };

/** Authentication is optional. Guests keep their browser kitchen; account data is chosen explicitly. */
export function AccountPanel({ snapshot, ready, onRestore, onNotice }: Props) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [session, setSession] = useState<AccountEnvelope | null>(null);
  const [choice, setChoice] = useState<AccountEnvelope | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("Checking account");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);
  const [conflict, setConflict] = useState<AccountState | null>(null);
  const [discardLogout, setDiscardLogout] = useState(false);
  const [retry, setRetry] = useState(0);
  const [bootRetry, setBootRetry] = useState(0);
  const [expiryRetry, setExpiryRetry] = useState(0);
  const panelRef = useRef<HTMLDivElement>(null);
  const snapshotRef = useRef(snapshot), callbacks = useRef({ onRestore, onNotice });
  const revision = useRef(0), lastSaved = useRef(""), restoring = useRef(false), generation = useRef(0);
  const activeId = useRef<string | null>(null), saving = useRef<Promise<void> | null>(null);
  const paused = useRef(false);
  useEffect(() => { snapshotRef.current = snapshot; callbacks.current = { onRestore, onNotice }; }, [snapshot, onRestore, onNotice]);
  const closeAccount = useCallback(() => { setOpen(false); setPassword(""); setCurrentPassword(""); setNewPassword(""); }, []);

  const restoreGuest = useCallback((message: string) => {
    generation.current++;
    activeId.current = null;
    setEnabled(false); setChoice(null); setConflict(null); setDiscardLogout(false);
    let data: KitchenData = {};
    try { data = leaveAccountKitchen(accountStorage()); }
    catch { /* Restore a clean guest view even when browser persistence is unavailable. */ }
    callbacks.current.onRestore(data);
    setSession({ available: true, user: null, state: null });
    setStatus("Browser kitchen"); setNotice(message); setError("");
    callbacks.current.onNotice?.(message);
  }, []);

  const adoptState = useCallback((account: AccountEnvelope, state: AccountState | null = account.state) => {
    if (!account.user) return;
    enterAccountKitchen(accountStorage(), account.user.id, snapshotRef.current);
    generation.current++;
    activeId.current = account.user.id;
    revision.current = state?.version || 0;
    paused.current = false;
    lastSaved.current = kitchenSnapshot(state?.data || {});
    restoring.current = true;
    setSession({ ...account, state }); setChoice(null); setConflict(null); setError(""); setDiscardLogout(false);
    callbacks.current.onRestore(kitchenData(state?.data || {}));
    setEnabled(true); setRetry(value => value + 1); setStatus("Saved to account");
  }, []);

  // prepareGuestKitchen runs before the parent hydrates. Only a confirmed session may restore account content.
  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    readAccount().then(account => {
      if (cancelled) return;
      setSession(account); setError("");
      const prior = accountOwner(accountStorage());
      if (!account.user) {
        if (prior) restoreGuest("Your session ended. Your browser kitchen has been restored.");
        else setStatus("Browser kitchen");
      } else if (prior === account.user.id) adoptState(account);
      else { setChoice(account); setOpen(true); setStatus("Choose your kitchen"); }
    }).catch(cause => {
      if (cancelled) return;
      setSession({ available: !(cause instanceof AccountRequestError && cause.status === 503), user: null, state: null });
      setStatus("Browser kitchen"); setError(errorMessage(cause));
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // These callbacks use refs, so editing kitchen content must not repeat authentication.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, bootRetry]);

  const saveCurrent = useCallback(async (version = revision.current) => {
    const sent = kitchenSnapshot(snapshotRef.current);
    const epoch = generation.current;
    setStatus("Saving kitchen");
    try {
      const state = await saveAccountKitchen(version, sent, activeId.current || "");
      if (epoch !== generation.current) return;
      revision.current = state.version;
      paused.current = false;
      lastSaved.current = sent;
      setSession(account => account ? { ...account, state } : account);
      setConflict(null); setError(""); setDiscardLogout(false); setStatus("Saved to account");
    } catch (cause) {
      if (epoch !== generation.current) return;
      paused.current = true;
      if (cause instanceof AccountRequestError && cause.status === 401) { restoreGuest("Your session ended. Sign in again to open your account kitchen."); return; }
      if (cause instanceof AccountRequestError && cause.status === 409 && cause.state) setConflict(cause.state);
      setStatus("Changes not saved"); setError(errorMessage(cause));
      throw cause;
    }
  }, [restoreGuest]);

  /* eslint-disable react-hooks/set-state-in-effect -- Report validation and pending status while synchronizing changed kitchen content to SQL. */
  useEffect(() => {
    if (!enabled || !activeId.current) return;
    if (restoring.current) {
      // The parent has applied and validated the selected kitchen in this render.
      restoring.current = false;
      try { lastSaved.current = kitchenSnapshot(snapshot); } catch (cause) { setError(errorMessage(cause)); setStatus("Changes not saved"); }
      return;
    }
    if (conflict || saving.current || paused.current) return;
    let current: string;
    try { current = kitchenSnapshot(snapshot); } catch (cause) { setError(errorMessage(cause)); setStatus("Changes not saved"); return; }
    if (current === lastSaved.current) return;
    setStatus("Waiting to save");
    const timer = setTimeout(() => {
      const operation = saveCurrent().catch(() => {}).finally(() => { if (saving.current === operation) saving.current = null; setRetry(value => value + 1); });
      saving.current = operation;
    }, 1200);
    return () => clearTimeout(timer);
  }, [snapshot, enabled, retry, conflict, saveCurrent]);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (!ready || loading) return;
    let cancelled = false;
    let refreshing = false;
    const refresh = async () => {
      if (refreshing || document.visibilityState === "hidden") return;
      refreshing = true;
      try {
        const account = await readAccount();
        if (cancelled) return;
        if (!account.user) { if (activeId.current || accountOwner(accountStorage())) restoreGuest("You have been signed out. Your browser kitchen has been restored."); return; }
        if (account.user.id !== activeId.current) {
          if (activeId.current) restoreGuest("The signed-in account changed. Choose which kitchen to open.");
          setSession(account); setChoice(account); setOpen(true); return;
        }
        setSession(previous => previous ? { ...previous, session: account.session } : previous);
        if (account.state && account.state.version !== revision.current && !saving.current) {
          if (kitchenSnapshot(snapshotRef.current) === lastSaved.current) adoptState(account);
          else { setConflict(account.state); setStatus("Choose which version to keep"); }
        }
      } catch { /* The visible save state still explains an offline account; do not discard local work. */ }
      finally { refreshing = false; }
    };
    const storageChange = (event: StorageEvent) => { if (event.key === "fusion-table-account-owner-v1") void refresh(); };
    window.addEventListener("focus", refresh); window.addEventListener("storage", storageChange);
    return () => { cancelled = true; window.removeEventListener("focus", refresh); window.removeEventListener("storage", storageChange); };
  }, [ready, loading, adoptState, restoreGuest]);

  useEffect(() => {
    if (!enabled || !session?.user || !session.session) return;
    const deadline = Math.min(session.session.expiresAt, session.session.idleExpiresAt ?? session.session.expiresAt);
    const remaining = deadline - Date.now();
    let cancelled = false;
    const timer = setTimeout(() => {
      // Long cookies can outlast the maximum browser timeout. Re-evaluate daily without touching SQL.
      if (remaining > 86_400_000) { setExpiryRetry(value => value + 1); return; }
      void readAccount().then(account => {
        if (cancelled) return;
        if (!account.user) { restoreGuest("Your session expired. Your browser kitchen has been restored."); return; }
        if (account.user.id !== activeId.current) { restoreGuest("The signed-in account changed. Choose which kitchen to open."); setSession(account); setChoice(account); setOpen(true); return; }
        setSession(previous => previous ? { ...previous, session: account.session } : previous);
        setExpiryRetry(value => value + 1);
      }).catch(() => { if (!cancelled) restoreGuest("Your saved session could not be checked. Your browser kitchen has been restored; sign in again to open your saved kitchen."); });
    }, Math.min(86_400_000, Math.max(1000, remaining)));
    return () => { cancelled = true; clearTimeout(timer); };
  }, [enabled, session?.user, session?.session, expiryRetry, restoreGuest]);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    panel?.querySelector<HTMLElement>("button, input")?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) { closeAccount(); return; }
      if (event.key !== "Tab" || !panel) return;
      const controls = [...panel.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]),a[href]')];
      const first = controls[0], last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener("keydown", keydown);
    return () => { document.removeEventListener("keydown", keydown); previous?.focus(); };
  }, [open, busy, closeAccount]);

  async function authenticate(event: FormEvent) {
    event.preventDefault(); setError(""); setNotice("");
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { setError("Enter a valid email address."); return; }
    if (password.length < 15 || password.length > 128) { setError("Use a password with 15 to 128 characters."); return; }
    if (mode === "signup" && (!displayName.trim() || displayName.trim().length > 60)) { setError("Enter a name with 1 to 60 characters."); return; }
    setBusy(true);
    try {
      const account = await changeAccount(mode, { email: email.trim(), password, displayName: displayName.trim(), remember }) as AccountEnvelope;
      setPassword(""); setSession(account); setChoice(account); setStatus("Choose your kitchen");
    } catch (cause) { setError(errorMessage(cause)); }
    finally { setBusy(false); }
  }

  async function chooseBrowser(account: AccountEnvelope, version = account.state?.version || 0) {
    if (!account.user) return;
    setBusy(true); setError("");
    try {
      const current = parseKitchen(snapshotRef.current);
      const state = await saveAccountKitchen(version, current, account.user.id);
      adoptState(account, state);
      setNotice("This kitchen is now saved to your account. Future changes save automatically.");
    } catch (cause) {
      if (cause instanceof AccountRequestError && cause.status === 409 && cause.state) setChoice({ ...account, state: cause.state });
      setError(errorMessage(cause));
    } finally { setBusy(false); }
  }

  async function signOut(all: boolean, discard = false) {
    setBusy(true); setError("");
    try {
      if (saving.current) await saving.current;
      if (!discard && enabled && kitchenSnapshot(snapshotRef.current) !== lastSaved.current) {
        try { await saveCurrent(); } catch { setDiscardLogout(true); return; }
      }
      await changeAccount(all ? "logout-all" : "logout");
      if (activeId.current || accountOwner(accountStorage())) restoreGuest(all ? "You have signed out on every device. Your browser kitchen is restored." : "You have signed out. Your browser kitchen is restored.");
      else { setSession({ available: true, user: null, state: null }); setChoice(null); setStatus("Browser kitchen"); setNotice("You have signed out. Your browser kitchen is unchanged."); }
      setPassword(""); setCurrentPassword(""); setNewPassword(""); setEmail(""); setDisplayName(""); setRemember(false); setChangingPassword(false);
    } catch (cause) { setError(errorMessage(cause)); }
    finally { setBusy(false); }
  }

  async function updatePassword(event: FormEvent) {
    event.preventDefault(); setError(""); setNotice("");
    if (newPassword.length < 15 || newPassword.length > 128) { setError("Use a new password with 15 to 128 characters."); return; }
    setBusy(true);
    try {
      const account = await changeAccount("password", { currentPassword, newPassword }) as AccountEnvelope;
      setSession(account); setCurrentPassword(""); setNewPassword(""); setChangingPassword(false);
      setNotice("Your password changed and your other sessions were signed out.");
    } catch (cause) { setError(errorMessage(cause)); }
    finally { setBusy(false); }
  }

  const user = session?.user;
  const unavailable = session?.available === false;
  return <div className="account-box">
    <button type="button" className="account-trigger" onClick={() => setOpen(true)} aria-haspopup="dialog" aria-expanded={open} aria-label={user ? `Account: ${user.displayName}` : "My account"} title={user ? `Account: ${user.displayName}` : "My account"}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><circle cx="12" cy="8" r="3.5"/><path d="M5 21v-2a7 7 0 0 1 14 0v2"/></svg><span>{user ? user.displayName : "My account"}</span></button>
    {user && <span className="account-status" role="status">{status}</span>}
    {open && <div className="account-backdrop" onClick={event => { if (event.target === event.currentTarget && !busy) closeAccount(); }}>
      <div className="account-panel" ref={panelRef} role="dialog" aria-modal="true" aria-labelledby="account-title">
        <div className="account-panel-heading"><h2 id="account-title">{user ? "Your account kitchen" : "Your kitchen, saved"}</h2><button type="button" className="account-close" aria-label="Close account" disabled={busy} onClick={closeAccount}>×</button></div>
        {error && <p className="account-error" role="alert">{error}</p>}
        {notice && <p className="account-notice" role="status">{notice}</p>}
        {loading ? <p role="status">Checking your account…</p> : user ? <>
          <p>Signed in as <strong>{user.displayName}</strong><br/><span className="account-muted">{user.email}</span></p>
          {choice ? <section className="account-version-choice" aria-label="Choose your kitchen">
            <h3>Which kitchen would you like to use?</h3>
            <p>Your browser kitchen stays separate. Choose before any of its data is uploaded.</p>
            {choice.state ? <p className="account-muted">Your account was last saved {new Date(choice.state.updatedAt).toLocaleString()}.</p> : <p className="account-muted">This account has no saved kitchen yet.</p>}
            <div className="account-actions"><button type="button" className="account-primary" disabled={busy} onClick={() => { try { adoptState(choice); setNotice("Your account kitchen is open. Changes save automatically."); } catch (cause) { setError(errorMessage(cause)); } }}>{choice.state ? "Use saved account kitchen" : "Start an empty account kitchen"}</button><button type="button" disabled={busy} onClick={() => void chooseBrowser(choice)}>{choice.state ? "Replace account with this browser kitchen" : "Save this browser kitchen to my account"}</button></div>
          </section> : <>
            <p role="status">{status}. Your household settings, pantry, cookbook, shopping list and week plan save to your account.</p>
            {conflict && <section className="account-version-choice" aria-label="Resolve kitchen changes"><h3>Your kitchen changed on another device</h3><p>Choose which version to keep. Your current page stays open until you choose.</p><div className="account-actions"><button type="button" disabled={busy} onClick={() => { if (session) adoptState(session, conflict); }}>Use the other saved kitchen</button><button type="button" className="account-primary" disabled={busy} onClick={() => { setBusy(true); void saveCurrent(conflict.version).catch(() => {}).finally(() => setBusy(false)); }}>Keep this kitchen</button></div></section>}
            {!conflict && <div className="account-actions"><button type="button" disabled={busy} onClick={() => { paused.current = false; setRetry(value => value + 1); }}>Save changes now</button><button type="button" disabled={busy} onClick={() => setChangingPassword(value => !value)}>Change password</button></div>}
            {changingPassword && <form onSubmit={updatePassword} aria-label="Change account password"><label htmlFor="account-current-password">Current password</label><input id="account-current-password" type="password" value={currentPassword} autoComplete="current-password" required maxLength={128} onChange={event => setCurrentPassword(event.target.value)}/><label htmlFor="account-new-password">New password</label><input id="account-new-password" type="password" value={newPassword} autoComplete="new-password" minLength={15} maxLength={128} required onChange={event => setNewPassword(event.target.value)}/><p className="account-muted">Use at least 15 characters. Your other sessions will be signed out.</p><button className="account-primary" type="submit" disabled={busy}>Update password</button></form>}
          </>}
          <div className="account-actions"><button type="button" disabled={busy} onClick={() => void signOut(false)}>Sign out</button><button type="button" disabled={busy} onClick={() => void signOut(true)}>Sign out on all devices</button>{discardLogout && <button type="button" disabled={busy} onClick={() => void signOut(false, true)}>Sign out without saving latest changes</button>}</div>
          <p className="account-muted">Signing out restores the guest kitchen from this browser. Your account kitchen remains saved on the server.</p>
        </> : <>
          <p>Keep using this browser, or sign in to save your kitchen across devices. An account is optional.</p>
          {unavailable && <p className="account-notice">Accounts are temporarily unavailable. You can continue cooking with your browser kitchen.</p>}
          <div className="account-tabs"><button type="button" aria-pressed={mode === "login"} disabled={busy} onClick={() => { setMode("login"); setError(""); }}>Sign in</button><button type="button" aria-pressed={mode === "signup"} disabled={busy} onClick={() => { setMode("signup"); setError(""); }}>Create account</button></div>
          <form onSubmit={authenticate} aria-label={mode === "signup" ? "Create Fusion Table account" : "Sign in to Fusion Table"}>
            {mode === "signup" && <><label htmlFor="account-name">Your name</label><input id="account-name" value={displayName} autoComplete="nickname" maxLength={60} required onChange={event => setDisplayName(event.target.value)}/></>}
            <label htmlFor="account-email">Email address</label><input id="account-email" type="email" value={email} autoComplete="email" maxLength={254} required onChange={event => setEmail(event.target.value)}/>
            <label htmlFor="account-password">Password</label><input id="account-password" type="password" value={password} autoComplete={mode === "signup" ? "new-password" : "current-password"} minLength={15} maxLength={128} required onChange={event => setPassword(event.target.value)}/>
            {mode === "signup" && <p className="account-muted">Use 15 to 128 characters. Save your password somewhere safe: email verification and email password recovery are not available yet.</p>}
            <label className="account-check"><input type="checkbox" checked={remember} onChange={event => setRemember(event.target.checked)}/>Keep me signed in for up to 30 days on this device</label>
            <p className="account-muted">Leave this unchecked on a shared device. Otherwise the session ends when your browser session ends, or after 12 hours.</p>
            <button className="account-primary" type="submit" disabled={busy || unavailable}>{busy ? "Please wait…" : mode === "signup" ? "Create my account" : "Sign in to my account"}</button>
          </form>
          {(unavailable || error) && <div className="account-actions"><button type="button" disabled={busy} onClick={() => { setError(""); setLoading(true); setBootRetry(value => value + 1); }}>Retry account connection</button></div>}
        </>}
      </div>
    </div>}
  </div>;
}
