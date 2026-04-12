import { useState, useEffect, type FormEvent } from 'react';
import { useProjectStore } from '../../store/projectStore';
import { supabase, cloudAvailable } from '../../services/supabaseClient';
import {
  signIn,
  signUp,
  signOut,
  pullAndMerge,
  pushAll,
  fetchSubscription,
  drainQueue,
  pendingCount,
} from '../../services/cloudSync';
import { startCheckoutForCurrentUser, openCustomerPortal } from '../../services/stripe';

// ─── helpers ──────────────────────────────────────────────────────────────────

function formatSyncTime(iso: string | null): string {
  if (!iso) return 'Never';

  const d = new Date(iso);
  return (
    d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) +
    ', ' +
    d.toLocaleDateString([], { month: 'short', day: 'numeric' })
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

// ─── Delete Account sub-component ────────────────────────────────────────────

interface CloudUserRef { id: string; email: string; }

function DeleteAccountSection({
  cloudUser,
  onDeleted,
}: {
  cloudUser: CloudUserRef;
  onDeleted: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function handleDelete() {
    if (confirmText !== 'DELETE') return;
    setBusy(true);
    setError('');

    try {
      const { data: { session } } = await (await import('../../services/supabaseClient')).supabase!.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error('Not signed in.');

      const API_BASE = (import.meta as any).env?.VITE_API_URL ?? '';
      const res = await fetch(`${API_BASE}/api/delete-account`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as any).error ?? 'Deletion failed.');
      }

      onDeleted();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <div className="sync-delete-zone">
        <p className="sync-delete-label">Danger zone</p>
        <button
          type="button"
          className="btn sync-delete-btn"
          onClick={() => setOpen(true)}
        >
          Delete my account
        </button>
      </div>
    );
  }

  return (
    <div className="sync-delete-zone sync-delete-zone--open">
      <p className="sync-delete-label">Delete account</p>
      <p className="sync-delete-desc">
        This permanently deletes <strong>{cloudUser.email}</strong>, all your cloud projects, and cancels any active subscription. Your local projects on this device are not affected.
      </p>
      <p className="sync-delete-desc" style={{ marginTop: 10 }}>
        Type <strong>DELETE</strong> to confirm:
      </p>
      <input
        className="sync-delete-input"
        type="text"
        value={confirmText}
        onChange={(e) => setConfirmText(e.target.value)}
        placeholder="DELETE"
        autoComplete="off"
        spellCheck={false}
      />
      {error && <p className="sync-form-error" style={{ marginTop: 6 }}>{error}</p>}
      <div className="sync-delete-actions">
        <button
          type="button"
          className="btn sync-delete-confirm-btn"
          onClick={() => void handleDelete()}
          disabled={confirmText !== 'DELETE' || busy}
        >
          {busy ? 'Deleting…' : 'Delete my account'}
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => { setOpen(false); setConfirmText(''); setError(''); }}
          disabled={busy}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function SettingsSync() {
  const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

  const cloudUser = useProjectStore((s) => s.cloudUser);
  const syncStatus = useProjectStore((s) => s.syncStatus);
  const lastSyncedAt = useProjectStore((s) => s.lastSyncedAt);
  const projects = useProjectStore((s) => s.projects);
  const setProjects = useProjectStore((s) => s.setProjects);
  const setCloudUser = useProjectStore((s) => s.setCloudUser);
  const setSyncStatus = useProjectStore((s) => s.setSyncStatus);
  const setLastSyncedAt = useProjectStore((s) => s.setLastSyncedAt);
  const showToast = useProjectStore((s) => s.showToast);
  const subscriptionTier = useProjectStore((s) => s.subscriptionTier);
  const subscriptionStatus = useProjectStore((s) => s.subscriptionStatus);
  const setSubscriptionTier = useProjectStore((s) => s.setSubscriptionTier);
  const setSubscriptionStatus = useProjectStore((s) => s.setSubscriptionStatus);

  const [mode, setMode] = useState<'signin' | 'signup' | 'reset' | 'resetSent' | 'emailSent' | 'oauthPending'>('signin');
  const [oauthProvider, setOauthProvider] = useState<'google' | 'apple' | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [resetEmail, setResetEmail] = useState('');
  const [sentToEmail, setSentToEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');
  const [emailNotConfirmed, setEmailNotConfirmed] = useState(false);
  const [pendingChanges, setPendingChanges] = useState(0);

  // Poll offline queue count so the badge stays current
  useEffect(() => {
    let active = true;
    const poll = async () => {
      const n = await pendingCount();
      if (active) setPendingChanges(n);
    };
    void poll();
    const id = setInterval(poll, 5000);
    return () => { active = false; clearInterval(id); };
  }, []);

  // ── Not configured ──────────────────────────────────────────────────────────

  if (!cloudAvailable) {
    return (
      <section className="settings-section">
        <h2 className="settings-section-title">☁️ Cloud Backup</h2>
        <p className="settings-description">
          Cloud backup lets you access your projects on any device and keeps a remote copy safe.
        </p>
        <div className="sync-notice">
          <p>
            Cloud backup isn&apos;t set up yet. To enable it, add your Supabase credentials to a{' '}
            <code>.env</code> file in the project root:
          </p>
          <pre className="sync-code-block">{`VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key`}</pre>
          <p>Then restart the app.</p>
        </div>
      </section>
    );
  }

  // ── Logged in ───────────────────────────────────────────────────────────────

  async function handleSyncNow() {
    if (syncStatus === 'syncing') return;

    setSyncStatus('syncing');

    try {
      // Drain any queued offline pushes first
      await drainQueue();

      await pushAll(projects);
      const { merged, changed } = await pullAndMerge(projects);

      if (changed) {
        setProjects(merged);
      }

      setLastSyncedAt(new Date().toISOString());
      setSyncStatus('idle');

      // Refresh pending count after successful sync
      const remaining = await pendingCount();
      setPendingChanges(remaining);

      showToast('Synced with cloud.');
    } catch (err) {
      setSyncStatus('error');
      showToast('Sync failed — check your connection.', 'error');
      console.error('[SettingsSync] syncNow error:', err);
    }
  }

  async function handleSignOut() {
    setBusy(true);

    try {
      await signOut();
      setCloudUser(null);
      setSyncStatus('idle');
      setSubscriptionTier('free');
      setSubscriptionStatus('none');
      useProjectStore.getState().setIsAdmin(false);
      showToast('Signed out of cloud backup.');
    } catch (err) {
      showToast('Sign-out failed.', 'error');
      console.error('[SettingsSync] signOut error:', err);
    } finally {
      setBusy(false);
    }
  }

  if (cloudUser) {
    const statusLabel =
      syncStatus === 'syncing'
        ? '⏳ Syncing…'
        : syncStatus === 'error'
          ? '⚠️ Sync error'
          : '✅ Synced';

    const tierLabel =
      subscriptionTier === 'pro'
        ? '⭐ Pro'
        : subscriptionTier === 'team'
          ? '👥 Team'
          : '🆓 Free';

    const isPastDue = subscriptionStatus === 'past_due';

    async function handleUpgrade(plan: 'pro' | 'team') {
      setBusy(true);
      try {
        await startCheckoutForCurrentUser(plan);
      } finally {
        setBusy(false);
      }
    }

    async function handleRefreshPlan() {
      setBusy(true);
      try {
        if (!cloudUser) return;
const sub = await fetchSubscription(cloudUser.id);
        setSubscriptionTier(sub.tier);
        setSubscriptionStatus(sub.status);
        showToast('Plan refreshed.');
      } catch {
        showToast('Could not refresh plan.', 'error');
      } finally {
        setBusy(false);
      }
    }

    return (
      <section className="settings-section">
        <h2 className="settings-section-title">☁️ Cloud Backup</h2>

        <div className="sync-status-card">
          <div className="sync-status-row">
            <span className="sync-label">Account</span>
            <span className="sync-value">{cloudUser.email}</span>
          </div>
          <div className="sync-status-row">
            <span className="sync-label">Plan</span>
            <span className="sync-value">{tierLabel}</span>
          </div>
          <div className="sync-status-row">
            <span className="sync-label">Status</span>
            <span className="sync-value">{statusLabel}</span>
          </div>
          <div className="sync-status-row">
            <span className="sync-label">Last synced</span>
            <span className="sync-value">{formatSyncTime(lastSyncedAt)}</span>
          </div>
          {pendingChanges > 0 && (
            <div className="sync-status-row sync-pending-row">
              <span className="sync-label">Pending</span>
              <span className="sync-value sync-pending-badge">
                {pendingChanges} change{pendingChanges !== 1 ? 's' : ''} waiting to upload
              </span>
            </div>
          )}
        </div>

        {isPastDue && (
          <div className="sync-notice sync-notice--warning">
            ⚠️ Your last payment failed. Please update your billing details to keep your plan active.
          </div>
        )}

        <div className="sync-actions">
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleSyncNow}
            disabled={syncStatus === 'syncing'}
          >
            {syncStatus === 'syncing' ? 'Syncing…' : 'Sync now'}
          </button>

          <button type="button" className="btn btn-ghost" onClick={handleSignOut} disabled={busy}>
            Sign out
          </button>
        </div>

        {subscriptionTier === 'free' && (
          <div className="sync-upgrade-card">
            <p className="sync-upgrade-title">Upgrade to Pro</p>
            <p className="sync-upgrade-desc">
              Unlimited projects, priority support, and early access to new features.
            </p>
            <div className="sync-upgrade-actions">
            

              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => handleUpgrade('team')}
                disabled={busy}
              >
                Team plan — $20/mo
              </button>
            </div>
          </div>
        )}

        {subscriptionTier !== 'free' && (
          <>
            <div className="sync-actions" style={{ marginTop: 16 }}>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => { setBusy(true); openCustomerPortal().finally(() => setBusy(false)); }}
                disabled={busy}
              >
                Manage subscription
              </button>
            </div>
            <p className="settings-description sync-hint">
              <button
                type="button"
                className="sync-refresh-link"
                onClick={handleRefreshPlan}
                disabled={busy}
              >
                Refresh plan
              </button>{' '}
              if you recently upgraded or changed plans.
            </p>
          </>
        )}

        <p className="settings-description sync-hint">
          Your projects are automatically backed up every time you make a change.
        </p>

        {/* ── Delete account ─────────────────────────────────────── */}
        <DeleteAccountSection
          cloudUser={cloudUser}
          onDeleted={() => {
            setCloudUser(null);
            setSyncStatus('idle');
            setSubscriptionTier('free');
            setSubscriptionStatus('none');
            showToast('Your account has been deleted.');
          }}
        />
      </section>
    );
  }

  // ── Sign in / Sign up form ──────────────────────────────────────────────────

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();

    if (!email.trim() || !password.trim()) {
      setFormError('Please enter your email and password.');
      return;
    }

    setFormError('');
    setBusy(true);

    try {
      let user;

      if (mode === 'signin') {
        user = await signIn(email.trim(), password);
      } else {
        await signUp(email.trim(), password);
        setSentToEmail(email.trim());
        setMode('emailSent');
        return;
      }

      setCloudUser(user);

      const sub = await fetchSubscription(user.id);
      setSubscriptionTier(sub.tier);
      setSubscriptionStatus(sub.status);

      setSyncStatus('syncing');
      try {
        await pushAll(projects);
        const { merged, changed } = await pullAndMerge(projects);

        if (changed) {
          setProjects(merged);
        }

        setLastSyncedAt(new Date().toISOString());
        setSyncStatus('idle');
      } catch {
        setSyncStatus('error');
      }

      showToast('Signed in — your projects are backed up.');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Something went wrong.';
      // Supabase returns "Email not confirmed" when the user hasn't clicked the link
      const isNotConfirmed =
        msg.toLowerCase().includes('email not confirmed') ||
        msg.toLowerCase().includes('not confirmed');
      if (isNotConfirmed) {
        setEmailNotConfirmed(true);
        setFormError("Your email address hasn't been confirmed yet. Check your inbox for the confirmation link.");
      } else {
        setEmailNotConfirmed(false);
        setFormError(msg);
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleResendConfirmation(targetEmail: string) {
  if (!supabase || !targetEmail) return;

  const AUTH_CALLBACK_URL =
    (import.meta as any).env?.VITE_APP_URL
      ? `${(import.meta as any).env.VITE_APP_URL}/auth/callback`
      : (import.meta as any).env?.VITE_API_URL
        ? `${(import.meta as any).env.VITE_API_URL}/auth/callback`
        : 'https://memephant.com/auth/callback';

  setBusy(true);
  try {
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email: targetEmail,
      options: {
        emailRedirectTo: AUTH_CALLBACK_URL,
      },
    });

    if (error) throw new Error(error.message);

    showToast(`Confirmation email resent to ${targetEmail}`);
    setEmailNotConfirmed(false);
  } catch (err) {
    showToast(err instanceof Error ? err.message : 'Could not resend email.', 'error');
  } finally {
    setBusy(false);
  }
}

  // ── Forgot password ─────────────────────────────────────────────────────────

  async function handleResetPassword(e: FormEvent) {
    e.preventDefault();

    if (!resetEmail.trim()) {
      setFormError('Please enter your email address.');
      return;
    }

    setFormError('');
    setBusy(true);

    try {
      if (!supabase) throw new Error('Cloud not configured.');

      const { error } = await supabase.auth.resetPasswordForEmail(resetEmail.trim());
      if (error) throw new Error(error.message);

      setMode('resetSent');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Something went wrong.';
      setFormError(msg);
    } finally {
      setBusy(false);
    }
  }

  // ── Reset sent confirmation ─────────────────────────────────────────────────

  if (mode === 'resetSent') {
    return (
      <section className="settings-section">
        <h2 className="settings-section-title">☁️ Cloud Backup</h2>

        <div className="sync-notice sync-notice--success">
          <p>
            ✅ <strong>Check your inbox.</strong>
          </p>
          <p>
            We sent a password reset link to <strong>{resetEmail}</strong>. Click the link in the
            email to set a new password, then come back and sign in.
          </p>
        </div>

        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => {
            setMode('signin');
            setResetEmail('');
            setFormError('');
          }}
        >
          ← Back to sign in
        </button>
      </section>
    );
  }

  // ── OAuth pending (desktop: browser opened, waiting for user to return) ─────

  if (mode === 'oauthPending') {
    const providerName = oauthProvider === 'apple' ? 'Apple' : 'Google';
    return (
      <section className="settings-section">
        <h2 className="settings-section-title">☁️ Cloud Backup</h2>

        <div className="sync-oauth-pending">
          <div className="sync-oauth-pending__icon">🌐</div>
          <h3 className="sync-oauth-pending__title">Sign in opened in your browser</h3>
          <ol className="sync-oauth-pending__steps">
            <li>Complete {providerName} sign-in in the browser window that just opened.</li>
            <li>Once you&apos;re signed in, come back to this window.</li>
            <li>Click the button below to finish connecting your account.</li>
          </ol>
        </div>

        {formError && <p className="sync-form-error" style={{ marginBottom: 12 }}>{formError}</p>}

        <div className="sync-actions">
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void handleOAuthRefresh()}
            disabled={busy}
          >
            {busy ? 'Connecting…' : "I've signed in — connect my account →"}
          </button>
        </div>

        <button
          type="button"
          className="btn btn-ghost sync-back-link"
          onClick={() => {
            setMode('signin');
            setFormError('');
            setOauthProvider(null);
          }}
        >
          ← Back to sign in
        </button>
      </section>
    );
  }

  // ── Email sent (post sign-up confirmation) ──────────────────────────────────

  if (mode === 'emailSent') {
    return (
      <section className="settings-section">
        <h2 className="settings-section-title">☁️ Cloud Backup</h2>

        <div className="sync-notice sync-notice--success">
          <p>
            📬 <strong>Check your inbox.</strong>
          </p>
          <p>
            We sent a confirmation link to <strong>{sentToEmail}</strong>. Click it to activate
            your account, then come back here and sign in.
          </p>
        </div>

        <div className="sync-actions" style={{ marginTop: 16 }}>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => void handleResendConfirmation(sentToEmail)}
            disabled={busy}
          >
            {busy ? 'Sending…' : 'Resend confirmation email'}
          </button>
        </div>

        <button
          type="button"
          className="btn btn-ghost sync-back-link"
          onClick={() => {
            setMode('signin');
            setFormError('');
          }}
        >
          ← Back to sign in
        </button>
      </section>
    );
  }

  // ── Forgot password form ────────────────────────────────────────────────────

  if (mode === 'reset') {
    return (
      <section className="settings-section">
        <h2 className="settings-section-title">☁️ Cloud Backup</h2>
        <p className="settings-description">
          Enter the email you used to create your account and we&apos;ll send a reset link.
        </p>

        <form className="sync-form" onSubmit={handleResetPassword} noValidate>
          <label className="sync-form-label">
            Email
            <input
              className="sync-form-input"
              type="email"
              autoComplete="email"
              value={resetEmail}
              onChange={(e) => setResetEmail(e.target.value)}
              placeholder="you@example.com"
              autoFocus
              disabled={busy}
            />
          </label>

          {formError && <p className="sync-form-error">{formError}</p>}

          <button className="btn btn-primary sync-submit" type="submit" disabled={busy}>
            {busy ? 'Sending…' : 'Send reset link'}
          </button>
        </form>

        <button
          type="button"
          className="btn btn-ghost sync-back-link"
          onClick={() => {
            setMode('signin');
            setFormError('');
          }}
        >
          ← Back to sign in
        </button>
      </section>
    );
  }

  // ── OAuth ────────────────────────────────────────────────────────────────────

  async function handleOAuth(provider: 'google' | 'apple') {
    if (!supabase) return;
    setBusy(true);
    setFormError('');

    try {
      if (isTauri && provider === 'google') {
        throw new Error('Coming soon.');
      }

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: `${(import.meta as any).env?.VITE_APP_URL ?? 'https://memephant.com'}/auth/callback`,
          skipBrowserRedirect: true,
        },
      });

      if (error) throw new Error(error.message);
      if (!data.url) throw new Error('No OAuth URL returned.');

      // Open in system browser (Tauri) or same tab (web/PWA)
      if (isTauri) {
        const { openUrl } = await import(/* @vite-ignore */ '@tauri-apps/plugin-opener');
        await openUrl(data.url);
        setFormError('');
        setOauthProvider(provider);
        setMode('oauthPending');
      } else {
        window.location.href = data.url;
      }
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'OAuth sign-in failed.');
    } finally {
      setBusy(false);
    }
  }

  async function handleOAuthRefresh() {
    if (!supabase) return;
    setBusy(true);
    try {
      const { data } = await supabase.auth.getSession();
      const user = data.session?.user;
      if (!user?.email) {
        setFormError('No session found yet — complete sign-in in your browser first.');
        return;
      }
      const cloudUserObj = { id: user.id, email: user.email };
      setCloudUser(cloudUserObj);
      const sub = await fetchSubscription(user.id);
      setSubscriptionTier(sub.tier);
      setSubscriptionStatus(sub.status);
      showToast(`Signed in as ${user.email}`);
    } catch {
      setFormError('Could not detect session. Try again.');
    } finally {
      setBusy(false);
    }
  }

  // ── Sign in / Sign up form ──────────────────────────────────────────────────

  return (
    <section className="settings-section">
      <h2 className="settings-section-title">☁️ Cloud Backup</h2>
      <p className="settings-description">
        Sign in to back up your projects and access them on any device.
      </p>

      <div className="sync-tabs">
        <button
          type="button"
          className={`sync-tab ${mode === 'signin' ? 'active' : ''}`}
          onClick={() => {
            setMode('signin');
            setFormError('');
            setEmailNotConfirmed(false);
          }}
        >
          Sign in
        </button>

        <button
          type="button"
          className={`sync-tab ${mode === 'signup' ? 'active' : ''}`}
          onClick={() => {
            setMode('signup');
            setFormError('');
            setEmailNotConfirmed(false);
          }}
        >
          Create account
        </button>
      </div>

      <form className="sync-form" onSubmit={handleSubmit} noValidate>
        <label className="sync-form-label">
          Email
          <input
            className="sync-form-input"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            disabled={busy}
          />
        </label>

        <label className="sync-form-label">
          Password
          <input
            className="sync-form-input"
            type="password"
            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={mode === 'signup' ? 'Min. 6 characters' : '••••••••'}
            disabled={busy}
          />
        </label>

        {mode === 'signin' && (
          <button
            type="button"
            className="sync-forgot-link"
            onClick={() => {
              setMode('reset');
              setResetEmail(email);
              setFormError('');
            }}
          >
            Forgot password?
          </button>
        )}

        {formError && (
          <div>
            <p className="sync-form-error">{formError}</p>
            {emailNotConfirmed && (
              <button
                type="button"
                className="sync-resend-btn"
                onClick={() => void handleResendConfirmation(email.trim())}
                disabled={busy}
              >
                {busy ? 'Sending…' : '📬 Resend confirmation email'}
              </button>
            )}
          </div>
        )}

        <button className="btn btn-primary sync-submit" type="submit" disabled={busy}>
          {busy
            ? mode === 'signin' ? 'Signing in…' : 'Creating account…'
            : mode === 'signin' ? 'Sign in' : 'Create account'}
        </button>
      </form>

      {/* ── OAuth divider ─────────────────────────────────────────── */}
      <div className="sync-oauth-divider">
        <span>or continue with</span>
      </div>

      {isTauri && (
        <p className="settings-description sync-hint" style={{ marginTop: 10 }}>
          <strong>Coming soon.</strong>
        </p>
      )}

      {!isTauri && (
        <>
      <div className="sync-oauth-btns">
        <button
          type="button"
          className="sync-oauth-btn sync-oauth-btn--google"
          onClick={() => void handleOAuth('google')}
          disabled={busy}
        >
          <svg width="18" height="18" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M47.5 24.5c0-1.6-.1-3.2-.4-4.7H24v8.9h13.2c-.6 3-2.3 5.5-4.9 7.2v6h7.9c4.6-4.3 7.3-10.6 7.3-17.4z" fill="#4285F4"/>
            <path d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.9-6c-2.1 1.4-4.8 2.3-8 2.3-6.1 0-11.3-4.1-13.1-9.7H2.8v6.2C6.8 42.7 14.8 48 24 48z" fill="#34A853"/>
            <path d="M10.9 28.8c-.5-1.4-.7-2.9-.7-4.4s.2-3 .7-4.4v-6.2H2.8C1 17.5 0 20.6 0 24s1 6.5 2.8 9.2l8.1-4.4z" fill="#FBBC05"/>
            <path d="M24 9.5c3.4 0 6.5 1.2 8.9 3.5l6.7-6.7C35.9 2.5 30.4 0 24 0 14.8 0 6.8 5.3 2.8 13.2l8.1 4.4C12.7 13.6 17.9 9.5 24 9.5z" fill="#EA4335"/>
          </svg>
          Sign in with Google
        </button>

        <button
          type="button"
          className="sync-oauth-btn sync-oauth-btn--apple"
          onClick={() => void handleOAuth('apple')}
          disabled={busy}
        >
          <svg width="16" height="18" viewBox="0 0 814 1000" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
            <path d="M788.1 340.9c-5.8 4.5-108.2 62.2-108.2 190.5 0 148.4 130.3 200.9 134.2 202.2-.6 3.2-20.7 71.9-68.7 141.9-42.8 61.6-87.5 123.1-155.5 123.1s-85.5-39.5-164-39.5c-76 0-103.7 40.8-165.9 40.8s-105-43.4-150.3-104.9C93.5 800.7 50 710.6 50 621.7c0-197.3 152.2-302.3 302.8-302.3 89.2 0 163.5 40.7 220.4 40.7 54.4 0 140.4-42.8 211.3-42.8zm-262-161.1c31.1-36.9 53.1-88.1 53.1-139.3 0-7.1-.6-14.3-1.9-20.1-50.6 1.9-110.8 33.7-147.1 75.8-28.5 32.4-55.1 83.6-55.1 135.5 0 7.8 1.3 15.6 1.9 18.1 3.2.6 8.4 1.3 13.6 1.3 45.4 0 102.5-30.4 135.5-71.3z"/>
          </svg>
          Sign in with Apple
        </button>
      </div>

      <button
        type="button"
        className="sync-oauth-refresh"
        onClick={() => void handleOAuthRefresh()}
        disabled={busy}
      >
        Already completed browser sign-in? Click to connect →
      </button>

        </>
      )}

      <p className="settings-description sync-hint">
        Your data is stored locally first. Cloud backup is optional and encrypted in transit.
      </p>
    </section>
  );
}
