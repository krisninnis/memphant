import { useState, useEffect, type FormEvent } from 'react';
import { useProjectStore } from '../../store/projectStore';
import { supabase, cloudAvailable } from '../../services/supabaseClient';
import {
  signIn,
  signUp,
  disconnectCloud,
  logoutCloudAccount,
  runCloudSyncCycle,
  fetchSubscription,
  pendingCount,
} from '../../services/cloudSync';
import type { ProjectMemory } from '../../types/memphant-types';

type AppEnv = {
  VITE_APP_URL?: string;
  VITE_API_URL?: string;
};

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

function withUiTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string,
  label: string,
  onLateSuccess?: (value: T) => void,
): Promise<T> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let timedOut = false;
    const timeoutId = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      timedOut = true;
      console.warn('[SettingsSync] ui_timeout_fired', { label, timeoutMs, uiOnly: true });
      reject(new Error(message));
    }, timeoutMs);

    promise.then(
      (value) => {
        if (settled) {
          if (timedOut) {
            console.warn('[SettingsSync] late_resolution_applying', { label, timeoutMs });
            onLateSuccess?.(value);
          }
          return;
        }
        settled = true;
        window.clearTimeout(timeoutId);
        resolve(value);
      },
      (error) => {
        if (settled) {
          if (timedOut) {
            console.warn('[SettingsSync] late_rejection_ignored', { label, timeoutMs, error });
          }
          return;
        }
        settled = true;
        window.clearTimeout(timeoutId);
        console.error('[SettingsSync] ui_timeout_rejected', { label, timeoutMs, error });
        reject(error);
      },
    );

    window.setTimeout(() => {
      if (!settled) {
        console.warn('[SettingsSync] underlying_request_still_in_flight', { label, timeoutMs });
      }
    }, timeoutMs + 50);
  });
}

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }

  if (typeof error === 'string' && error.trim()) {
    return error.trim();
  }

  return fallback;
}

function getAppEnv(): AppEnv {
  return import.meta.env as AppEnv;
}

function getAuthCallbackUrl(): string {
  const env = getAppEnv();
  if (env.VITE_APP_URL) {
    return `${env.VITE_APP_URL}/auth/callback`;
  }
  if (env.VITE_API_URL) {
    return `${env.VITE_API_URL}/auth/callback`;
  }
  return 'https://memephant.com/auth/callback';
}

function clearAuthUrlState(): void {
  if (typeof window === 'undefined') return;

  const cleanUrl = new URL(window.location.href);
  cleanUrl.pathname = '/';
  cleanUrl.search = '';
  cleanUrl.hash = '';
  window.history.replaceState({}, document.title, cleanUrl.toString());
}

// ─── Component ────────────────────────────────────────────────────────────────

// ─── Delete Account sub-component ────────────────────────────────────────────

interface CloudUserRef {
  id: string;
  email: string;
}

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
      const {
        data: { session },
      } = await (await import('../../services/supabaseClient')).supabase!.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error('Not signed in.');

      const API_BASE = getAppEnv().VITE_API_URL ?? '';
      const res = await fetch(`${API_BASE}/api/delete-account`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? 'Deletion failed.');
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
        <button type="button" className="btn sync-delete-btn" onClick={() => setOpen(true)}>
          Delete my account
        </button>
      </div>
    );
  }

  return (
    <div className="sync-delete-zone sync-delete-zone--open">
      <p className="sync-delete-label">Delete account</p>
      <p className="sync-delete-desc">
        This permanently deletes <strong>{cloudUser.email}</strong>, all your cloud projects, and
        cancels any active subscription. Your local projects on this device are not affected.
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
      {error && (
        <p className="sync-form-error" style={{ marginTop: 6 }}>
          {error}
        </p>
      )}
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
          onClick={() => {
            setOpen(false);
            setConfirmText('');
            setError('');
          }}
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
  const cloudDisconnecting = useProjectStore((s) => s.cloudDisconnecting);
  const syncStatus = useProjectStore((s) => s.syncStatus);
  const lastSyncedAt = useProjectStore((s) => s.lastSyncedAt);
  const projects = useProjectStore((s) => s.projects);
  const setProjects = useProjectStore((s) => s.setProjects);
  const setCloudUser = useProjectStore((s) => s.setCloudUser);
  const setCloudDisconnecting = useProjectStore((s) => s.setCloudDisconnecting);
  const setSyncStatus = useProjectStore((s) => s.setSyncStatus);
  const setLastSyncedAt = useProjectStore((s) => s.setLastSyncedAt);
  const resetCloudState = useProjectStore((s) => s.resetCloudState);
  const showToast = useProjectStore((s) => s.showToast);
  const settings = useProjectStore((s) => s.settings);
  const updateSettings = useProjectStore((s) => s.updateSettings);
  const setSubscriptionTier = useProjectStore((s) => s.setSubscriptionTier);
  const setSubscriptionStatus = useProjectStore((s) => s.setSubscriptionStatus);

  const [mode, setMode] = useState<
    'signin' | 'signup' | 'reset' | 'resetSent' | 'emailSent' | 'oauthPending'
  >('signin');
  const [oauthProvider, setOauthProvider] = useState<'google' | 'apple' | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [resetEmail, setResetEmail] = useState('');
  const [sentToEmail, setSentToEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [formError, setFormError] = useState('');
  const [emailNotConfirmed, setEmailNotConfirmed] = useState(false);
  const [pendingChanges, setPendingChanges] = useState(0);
  const [syncErrorDetails, setSyncErrorDetails] = useState('');
  // Shows a "waking up cloud…" hint after 8 s of syncing (cold Supabase start)
  const [syncSlow, setSyncSlow] = useState(false);

  const cloudSyncEnabled = settings.privacy.cloudSyncEnabled;

  async function finishCloudSignIn(user: { id: string; email: string }) {
    updateSettings({
      privacy: {
        ...settings.privacy,
        cloudSyncEnabled: true,
      },
    });

    try {
      const sub = await withUiTimeout(
        fetchSubscription(user.id),
        8000,
        'Plan lookup timed out.',
        'settings.subscription_fetch',
      );
      setSubscriptionTier(sub.tier);
      setSubscriptionStatus(sub.status);
    } catch (err) {
      console.error('[SettingsSync] subscription fetch error:', err);
      setSubscriptionTier('free');
      setSubscriptionStatus('none');
    }

    setSyncStatus('syncing');
    setProjects([]);

    try {
      // ACCOUNT ISOLATION: Never push local projects into the cloud on sign-in.
      // The device may have projects from a different account on disk.
      // Always pull-only on login — push happens only on explicit user saves.
      console.warn('[SettingsSync] LOCAL PROJECTS IGNORED ON LOGIN — pulling cloud state only');

      const applySignInResult = (merged: ProjectMemory[], conflicts: string[]) => {
        const st = useProjectStore.getState();
        // Always replace the visible project list with this account's cloud view,
        // regardless of whether anything "changed" — local projects must not persist.
        console.warn(`[SettingsSync] CLOUD PROJECTS LOADED: ${merged.length} projects`);
        st.setProjects(merged);
        st.setActiveProject(merged.length > 0 ? merged[0].id : null);
        st.setLastSyncedAt(new Date().toISOString());
        st.setSyncStatus('synced');
        setSyncErrorDetails('');
        if (conflicts.length > 0) {
          st.showToast(
            `Signed in. Cloud updated ${conflicts.length} project${conflicts.length === 1 ? '' : 's'} from a newer cloud version.`,
            'info',
          );
        } else {
          st.showToast('Signed in. Cloud backup is now synced.');
        }
      };

      const { merged, conflicts } = await withUiTimeout(
        runCloudSyncCycle([], 'signin', user.id),
        45000,
        'Cloud sync is taking longer than expected - the server may be waking up. Try syncing again.',
        'settings.signin_sync_cycle',
        ({ merged: lateM, conflicts: lateC }) => {
          console.warn('[SettingsSync] LATE CLOUD RESULT ARRIVED — applying to store');
          applySignInResult(lateM, lateC);
        },
      );

      applySignInResult(merged, conflicts);
    } catch (err) {
      const message = errorMessage(err, 'Cloud sync failed.');
      setSyncStatus('error');
      setSyncErrorDetails(message);
      showToast(`Signed in, but cloud sync failed: ${message}`, 'error');
      console.error('[SettingsSync] finishCloudSignIn error:', err);
    }
  }

  // Poll offline queue count so the badge stays current
  useEffect(() => {
    let active = true;
    const poll = async () => {
      const n = await pendingCount();
      if (active) setPendingChanges(n);
    };
    void poll();
    const id = setInterval(poll, 5000);
    return () => {
      active = false;
      clearInterval(id);
    };
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
    setSyncSlow(false);

    // After 8 s of waiting, show a friendly hint that the cloud server is
    // waking up (Supabase free-tier pauses after inactivity).
    const slowTimer = window.setTimeout(() => setSyncSlow(true), 8000);

    try {
      const { merged, changed } = await withUiTimeout(
        runCloudSyncCycle(projects, 'manual', cloudUser?.id),
        45000,
        'Cloud sync is taking longer than expected - the server may be waking up. Try again in a moment.',
        'settings.manual_sync_cycle',
      );

      if (changed) {
        setProjects(merged);
      }

      window.clearTimeout(slowTimer);
      setSyncSlow(false);
      setLastSyncedAt(new Date().toISOString());
      setSyncStatus('synced');

      // Refresh pending count after successful sync
      const remaining = await pendingCount();
      setPendingChanges(remaining);

      if (remaining > 0) {
        setSyncStatus('pending');
        setSyncErrorDetails('');
        showToast('Saved locally. Some cloud changes are still pending.', 'info');
        return;
      }

      setSyncErrorDetails('');
      showToast('Synced with cloud.');
    } catch (err) {
      window.clearTimeout(slowTimer);
      setSyncSlow(false);
      const message = errorMessage(err, 'Cloud sync failed.');
      setSyncErrorDetails(message);
      setSyncStatus('error');
      // Surface the real error message rather than the generic "check connection"
      showToast(`Sync failed: ${message}`, 'error');
      console.error('[SettingsSync] syncNow error — full detail:', err);
    }
  }

  async function handleDisconnectCloud() {
    if (cloudDisconnecting) return;

    setCloudDisconnecting(true);

    try {
      await disconnectCloud();
      updateSettings({
        privacy: {
          ...settings.privacy,
          cloudSyncEnabled: false,
        },
      });
      setSyncStatus('saved_local');
      setSyncErrorDetails('');
      showToast('Cloud disconnected. Local projects stay on this device.');
    } catch (err) {
      const message = errorMessage(err, 'Could not disconnect cloud backup.');
      console.error('[SettingsSync] disconnect_cloud_error:', err);
      showToast(message, 'error');
      setCloudDisconnecting(false);
    } finally {
      setCloudDisconnecting(false);
    }
  }

  async function handleReconnectCloud() {
    if (!cloudUser || syncStatus === 'syncing' || cloudDisconnecting) return;

    updateSettings({
      privacy: {
        ...settings.privacy,
        cloudSyncEnabled: true,
      },
    });

    await handleSyncNow();
  }

  async function handleLogout() {
    if (loggingOut) return;

    setLoggingOut(true);

    try {
      await logoutCloudAccount();

      // Clear visible project state immediately so no previous-account data
      // remains on screen after logout.
      setProjects([]);

      resetCloudState();
      setMode('signin');
      setOauthProvider(null);
      setSyncErrorDetails('');

      if (!isTauri) {
        clearAuthUrlState();
        window.location.replace('/');
        return;
      }

      showToast('Logged out.');
    } catch (err) {
      const message = errorMessage(err, 'Could not log out.');
      console.error('[SettingsSync] logout_error:', err);
      showToast(message, 'error');
    } finally {
      setLoggingOut(false);
      setCloudDisconnecting(false);
    }
  }

  if (cloudUser) {
    const renderedStatusLabel =
      !cloudSyncEnabled
        ? 'Disconnected - local only'
        : syncStatus === 'syncing'
          ? 'Syncing...'
          : syncStatus === 'pending'
            ? 'Saved locally - sync pending'
            : syncStatus === 'saved_local'
              ? 'Saved locally'
              : syncStatus === 'error'
                ? 'Saved locally - sync failed'
                : 'Synced';

    const renderedTierLabel = 'Free during early access';

    const statusBadgeLabel =
      !cloudSyncEnabled
        ? 'Local-only mode'
        : syncStatus === 'synced'
          ? 'Synced with cloud'
          : syncStatus === 'syncing'
            ? 'Syncing...'
            : syncStatus === 'pending'
              ? 'Sync pending'
              : syncStatus === 'error'
                ? 'Sync issue'
                : 'Saved locally';

    const statusBadgeClassName =
      !cloudSyncEnabled
        ? 'sync-status-badge'
        : syncStatus === 'synced'
          ? 'sync-status-badge sync-status-badge--success'
          : syncStatus === 'pending'
            ? 'sync-status-badge sync-status-badge--warning'
            : syncStatus === 'error'
              ? 'sync-status-badge sync-status-badge--error'
              : 'sync-status-badge';

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
            <span className="sync-value">{renderedTierLabel}</span>
          </div>
          <div className="sync-status-row">
            <span className="sync-label">Status</span>
            <span className="sync-value">{renderedStatusLabel}</span>
          </div>
          <div className="sync-status-row">
            <span className="sync-label">Mode</span>
            <span className="sync-value">
              {cloudSyncEnabled ? 'Cloud backup connected' : 'Local-only mode'}
            </span>
          </div>
          <div className="sync-status-row">
            <span className="sync-label">Last synced</span>
            <span className="sync-value">{formatSyncTime(lastSyncedAt)}</span>
          </div>
          {cloudSyncEnabled && pendingChanges > 0 && (
            <div className="sync-status-row sync-pending-row">
              <span className="sync-label">Pending</span>
              <span className="sync-value sync-pending-badge">
                {pendingChanges} change{pendingChanges !== 1 ? 's' : ''} waiting to upload
              </span>
            </div>
          )}
        </div>

        {syncStatus === 'syncing' && syncSlow && (
          <p className="sync-slow-notice" style={{ marginTop: 12, color: '#f59e0b', fontSize: 13 }}>
            ⏳ Waking up cloud server — this can take up to 45 seconds after a period of inactivity…
          </p>
        )}

        {syncStatus === 'error' && syncErrorDetails && (
          <p className="sync-form-error" style={{ marginTop: 12 }}>
            Last sync error: {syncErrorDetails}
          </p>
        )}

        <div className="sync-status-meta">
          <span className={statusBadgeClassName} aria-live="polite">
            {statusBadgeLabel}
          </span>
        </div>

        <div className="sync-actions">
          {cloudSyncEnabled ? (
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleDisconnectCloud}
              disabled={cloudDisconnecting || loggingOut}
            >
              {cloudDisconnecting ? 'Disconnecting...' : 'Disconnect Cloud'}
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void handleReconnectCloud()}
              disabled={syncStatus === 'syncing' || cloudDisconnecting || loggingOut}
            >
              Connect Cloud
            </button>
          )}

          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => void handleLogout()}
            disabled={cloudDisconnecting || loggingOut}
          >
            {loggingOut ? 'Logging out...' : 'Log out'}
          </button>
        </div>

        <p className="settings-description sync-hint" style={{ marginTop: 12 }}>
          {cloudSyncEnabled
            ? 'Cloud backup is connected. Your projects stay local first, and backups are kept up to date in the cloud.'
            : 'Cloud backup is off. Memephant is running in local-only mode, and nothing new is uploaded until you reconnect.'}
        </p>

        <p className="settings-description sync-hint">
          {cloudSyncEnabled
            ? 'Disconnect Cloud keeps you signed in. Log out ends your account session.'
            : 'Connect Cloud turns backup back on. Log out ends your account session.'}
        </p>

        {cloudSyncEnabled && syncStatus !== 'synced' && syncStatus !== 'syncing' && (
          <p className="settings-description sync-hint">
            <button
              type="button"
              className="sync-refresh-link"
              onClick={() => void handleSyncNow()}
              disabled={cloudDisconnecting || loggingOut}
            >
              Sync now
            </button>{' '}
            to upload recent local changes.
          </p>
        )}

        <div className="sync-upgrade-card">
          <p className="sync-upgrade-title">Free during early access</p>
          <p className="sync-upgrade-desc">
            Cloud backup and the full app are currently free while we prepare the first paid plans.
          </p>
          <p className="settings-description sync-hint" style={{ marginTop: 0 }}>
            Pro features and billing controls are coming soon.
          </p>
        </div>

        <p className="settings-description sync-hint">
          Local projects are never removed by disconnecting cloud backup.
        </p>

        {/* ── Delete account ─────────────────────────────────────── */}
        <DeleteAccountSection
          cloudUser={cloudUser}
          onDeleted={() => {
            setProjects([]);
            resetCloudState();
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
        user = await withUiTimeout(
          signIn(email.trim(), password),
          20000,
          'Sign-in is taking longer than expected. Please wait a moment and try again.',
          'settings.signin_submit',
        );
      } else {
        await withUiTimeout(
          signUp(email.trim(), password),
          20000,
          'Account creation is taking longer than expected. Please wait a moment and try again.',
          'settings.signup_submit',
        );
        setSentToEmail(email.trim());
        setMode('emailSent');
        return;
      }

      setCloudUser(user);
      void finishCloudSignIn(user);

      return;
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

    const AUTH_CALLBACK_URL = getAuthCallbackUrl();

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
          redirectTo: getAuthCallbackUrl(),
          skipBrowserRedirect: true,
        },
      });

      if (error) throw new Error(error.message);
      if (!data.url) throw new Error('No OAuth URL returned.');

      updateSettings({
        privacy: {
          ...settings.privacy,
          cloudSyncEnabled: true,
        },
      });

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
      await finishCloudSignIn(cloudUserObj);
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
            ? mode === 'signin'
              ? 'Signing in…'
              : 'Creating account…'
            : mode === 'signin'
              ? 'Sign in'
              : 'Create account'}
        </button>
      </form>

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
                <path d="M47.5 24.5c0-1.6-.1-3.2-.4-4.7H24v8.9h13.2c-.6 3-2.3 5.5-4.9 7.2v6h7.9c4.6-4.3 7.3-10.6 7.3-17.4z" fill="#4285F4" />
                <path d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.9-6c-2.1 1.4-4.8 2.3-8 2.3-6.1 0-11.3-4.1-13.1-9.7H2.8v6.2C6.8 42.7 14.8 48 24 48z" fill="#34A853" />
                <path d="M10.9 28.8c-.5-1.4-.7-2.9-.7-4.4s.2-3 .7-4.4v-6.2H2.8C1 17.5 0 20.6 0 24s1 6.5 2.8 9.2l8.1-4.4z" fill="#FBBC05" />
                <path d="M24 9.5c3.4 0 6.5 1.2 8.9 3.5l6.7-6.7C35.9 2.5 30.4 0 24 0 14.8 0 6.8 5.3 2.8 13.2l8.1 4.4C12.7 13.6 17.9 9.5 24 9.5z" fill="#EA4335" />
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
                <path d="M788.1 340.9c-5.8 4.5-108.2 62.2-108.2 190.5 0 148.4 130.3 200.9 134.2 202.2-.6 3.2-20.7 71.9-68.7 141.9-42.8 61.6-87.5 123.1-155.5 123.1s-85.5-39.5-164-39.5c-76 0-103.7 40.8-165.9 40.8s-105-43.4-150.3-104.9C93.5 800.7 50 710.6 50 621.7c0-197.3 152.2-302.3 302.8-302.3 89.2 0 163.5 40.7 220.4 40.7 54.4 0 140.4-42.8 211.3-42.8zm-262-161.1c31.1-36.9 53.1-88.1 53.1-139.3 0-7.1-.6-14.3-1.9-20.1-50.6 1.9-110.8 33.7-147.1 75.8-28.5 32.4-55.1 83.6-55.1 135.5 0 7.8 1.3 15.6 1.9 18.1 3.2.6 8.4 1.3 13.6 1.3 45.4 0 102.5-30.4 135.5-71.3z" />
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