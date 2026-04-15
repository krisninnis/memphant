/**
 * stripe.ts — front-end Stripe integration.
 *
 * Calls the /api/create-checkout serverless function and opens the
 * returned Stripe-hosted checkout URL in the system browser.
 * Works inside Tauri (via tauri-plugin-opener) and in the browser (window.open).
 *
 * Usage:
 *   import { startCheckout } from './stripe';
 *   await startCheckout('pro');   // or 'team'
 */

// ── Price ID map — matches env vars set in Vercel ────────────────────────────
// These are safe to expose on the client; they're just price IDs, not secrets.
// The allowlist check is enforced server-side in /api/create-checkout.js.

const PRICE_IDS: Record<string, string | undefined> = {
  pro:  import.meta.env.VITE_STRIPE_PRO_PRICE_ID,
  team: import.meta.env.VITE_STRIPE_TEAM_PRICE_ID,
};

// The Vercel deployment that hosts the serverless functions
const API_BASE = import.meta.env.VITE_API_URL || 'https://memphant.com';

async function getAuthHeaders(): Promise<Record<string, string>> {
  const { supabase } = await import('./supabaseClient');
  const { useProjectStore } = await import('../store/projectStore');
  const { showToast } = useProjectStore.getState();

  if (!supabase) {
    throw new Error('Cloud auth is not configured.');
  }

  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;

  if (!token) {
    showToast('Sign in first to manage billing.', 'info');
    throw new Error('Not signed in.');
  }

  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
}

// ── Tauri check ───────────────────────────────────────────────────────────────

function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

/** Open a URL — in Tauri uses the system browser; in plain browser uses window.open. */
async function openUrl(url: string): Promise<void> {
  if (isTauri()) {
    // tauri-plugin-opener — dynamic import so Vite doesn't break in browser mode
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const opener = await import(/* @vite-ignore */ '@tauri-apps/plugin-opener' as any);
    await opener.openUrl(url);
  } else {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}

// ── Main export ───────────────────────────────────────────────────────────────

export interface CheckoutOptions {
  /** 'pro' or 'team' */
  plan: string;
  /** Supabase user ID */
  userId: string;
  /** User's email — pre-fills Stripe Checkout form */
  email: string;
}

/**
 * Open a Stripe Checkout session for the given plan.
 * Throws if the serverless call fails or no price ID is configured.
 */
export async function startCheckout({ plan, userId, email }: CheckoutOptions): Promise<void> {
  const priceId = PRICE_IDS[plan];

  if (!priceId) {
    throw new Error(
      `No price ID configured for plan "${plan}". ` +
      'Add VITE_STRIPE_PRO_PRICE_ID / VITE_STRIPE_TEAM_PRICE_ID to your .env.',
    );
  }

  const response = await fetch(`${API_BASE}/api/create-checkout`, {
    method: 'POST',
    headers: await getAuthHeaders(),
    body: JSON.stringify({ priceId, userId, email }),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || `Checkout request failed (${response.status})`);
  }

  const { url } = await response.json();

  if (!url) {
    throw new Error('No checkout URL returned from server.');
  }

  await openUrl(url);
}

// ── Customer Portal ───────────────────────────────────────────────────────────

/**
 * Open the Stripe Customer Portal for the current user.
 * Portal lets them update their payment method, cancel, or download invoices.
 */
export async function openCustomerPortal(): Promise<boolean> {
  const { useProjectStore } = await import('../store/projectStore');
  const { cloudUser, showToast } = useProjectStore.getState();

  if (!cloudUser) {
    showToast('Sign in first to manage your subscription.', 'info');
    return false;
  }

  try {
    showToast('Opening subscription management…');
    const response = await fetch(`${API_BASE}/api/create-portal`, {
      method: 'POST',
      headers: await getAuthHeaders(),
      body: JSON.stringify({ userId: cloudUser.id }),
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      // Prefer the human-readable details message if present (set by 404 path in create-portal)
      const message = body.details || body.error || `Portal request failed (${response.status})`;
      throw new Error(message);
    }

    const { url } = await response.json();
    if (!url) throw new Error('No portal URL returned.');

    await openUrl(url);
    return true;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Could not open subscription management.';
    showToast(msg, 'error');
    console.error('[stripe] openCustomerPortal error:', err);
    return false;
  }
}

/**
 * Convenience wrapper — reads user from the store so callers don't have to.
 * Returns false if the user is not signed in.
 */
export async function startCheckoutForCurrentUser(plan: string): Promise<boolean> {
  // Lazy import to avoid circular deps
  const { useProjectStore } = await import('../store/projectStore');
  const { cloudUser, showToast } = useProjectStore.getState();

  if (!cloudUser) {
    showToast('Sign in first to upgrade your plan.', 'info');
    return false;
  }

  try {
    showToast('Opening checkout…');
    await startCheckout({
      plan,
      userId: cloudUser.id,
      email:  cloudUser.email ?? '',
    });
    return true;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Could not open checkout.';
    showToast(msg, 'error');
    console.error('[stripe] startCheckout error:', err);
    return false;
  }
}
