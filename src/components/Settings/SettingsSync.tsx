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

  const [mode, setMode] = useState<'signin' | 'signup' | 'reset' | 'resetSent'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [resetEmail, setResetEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');
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
                className="btn btn-primary"
                onClick={() => handleUpgrade('pro')}
                disabled={busy}
              >
                Upgrade to Pro — $8/mo
              </button>

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
        user = await signUp(email.trim(), password);
        showToast('Account created — check your email to confirm, then sign in.');
        setMode('signin');
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
      setFormError(msg);
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

        {formError && <p className="sync-form-error">{formError}</p>}

        <button className="btn btn-primary sync-submit" type="submit" disabled={busy}>
          {busy
            ? mode === 'signin' ? 'Signing in…' : 'Creating account…'
            : mode === 'signin' ? 'Sign in' : 'Create account'}
        </button>
      </form>

      <p className="settings-description sync-hint">
        Your data is stored locally first. Cloud backup is optional and encrypted in transit.
      </p>
    </section>
  );
}
