/**
 * Opt-in crash/error reporting via Sentry.
 *
 * PRIVACY PRINCIPLES:
 *  - Default OFF. Never initialises unless the user explicitly enables it
 *    in Settings → Privacy → "Send crash reports".
 *  - Project content is NEVER sent (beforeSend strips any event data that
 *    could contain user-authored text).
 *  - User IDs are anonymised via a one-way hash — no email, no real ID.
 *  - All traces / session replays are disabled.
 *  - DSN is configured via env var; if missing, Sentry stays silent.
 *
 * TO SET UP:
 *  1. Create a project at sentry.io.
 *  2. Add VITE_SENTRY_DSN=https://xxx@xxx.ingest.sentry.io/xxx to .env
 *  3. Install the SDK: npm install @sentry/react
 *
 * Note: The Sentry SDK is a dynamic import to keep the main bundle lean
 * when crash reporting is disabled (the common case).
 */

// Lightweight type alias — avoids hard import at module level.
type SentryInstance = typeof import('@sentry/react');

let sentry: SentryInstance | null = null;
let initialised = false;

// Simple djb2-style hash to anonymise user IDs — NOT cryptographically secure,
// but sufficient to prevent direct re-identification in error reports.
function hashUserId(userId: string): string {
  let hash = 5381;
  for (let i = 0; i < userId.length; i++) {
    hash = (hash * 33) ^ userId.charCodeAt(i);
  }
  return `anon-${Math.abs(hash >>> 0).toString(16)}`;
}

/**
 * Initialise Sentry if the user has opted in.
 * Safe to call multiple times — only initialises once.
 */
export async function initialiseSentry(userId?: string): Promise<void> {
  if (initialised) return;

  const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
  if (!dsn) {
    // No DSN configured — Sentry stays dormant even if user opted in.
    return;
  }

  try {
    sentry = await import('@sentry/react');

    sentry.init({
      dsn,
      // Keep the sample rate low — we only need a signal, not every error.
      tracesSampleRate: 0,
      // No session replays — privacy-first.
      replaysSessionSampleRate: 0,
      replaysOnErrorSampleRate: 0,

      beforeSend(event) {
        // Strip breadcrumbs entirely — they can contain user-authored text.
        // We only need the stack trace and the error message.
        event.breadcrumbs = undefined;
        // Remove any extra / contexts that aren't part of the error itself
        event.extra = undefined;
        event.contexts = {
          // Keep the runtime context (OS, browser) but nothing user-authored
          runtime: event.contexts?.runtime,
          browser: event.contexts?.browser,
          os: event.contexts?.os,
          device: event.contexts?.device,
        };
        return event;
      },
    });

    if (userId) {
      sentry.setUser({ id: hashUserId(userId) });
    }

    initialised = true;
  } catch (err) {
    // Dynamic import failed (SDK not installed) — fail silently.
    console.warn('[Memphant] Sentry SDK not available:', err);
  }
}

/**
 * Tear down Sentry when the user opts out.
 * Clears the user identity and marks the service as uninitialised so it
 * can be re-initialised if the user opts back in.
 */
export async function teardownSentry(): Promise<void> {
  if (!initialised || !sentry) return;
  try {
    sentry.setUser(null);
    await sentry.close(2000);
  } catch {
    // ignore
  }
  sentry = null;
  initialised = false;
}

/**
 * Manually capture an error — use this for handled errors you still want
 * to track (e.g. sync failures, export errors).
 * No-ops if Sentry is not initialised.
 */
export function captureError(err: unknown, context?: Record<string, string>): void {
  if (!sentry || !initialised) return;
  sentry.withScope((scope) => {
    if (context) {
      // Only string values — never user-authored content
      Object.entries(context).forEach(([k, v]) => scope.setTag(k, v));
    }
    sentry!.captureException(err);
  });
}

/**
 * Update the anonymous user ID when the auth state changes.
 * No-ops if Sentry is not initialised.
 */
export function setSentryUser(userId: string | null): void {
  if (!sentry || !initialised) return;
  if (userId) {
    sentry.setUser({ id: hashUserId(userId) });
  } else {
    sentry.setUser(null);
  }
}
