/**
 * Supabase client singleton.
 * Returns null when env vars are not set — the rest of the app
 * checks `cloudAvailable` before attempting any network calls.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// In-process Promise queue — equivalent to processLock from @supabase/auth-js.
// Avoids importing a transitive package directly (no type declarations in the
// build environment). Never steals the lock; correct for a single-window app.
//
// Safety: if fn() never settles (e.g. a fetch that hangs indefinitely because
// the server accepts the TCP connection but never responds), the lock would be
// held forever, causing every subsequent auth op — including the upsert's
// internal _getAccessToken() → getSession() — to queue up and never run.
// The force-release timer breaks this: after LOCK_MAX_HOLD_MS the lock is
// released even if fn() is still in flight, so the queue drains.
// LOCK_MAX_HOLD_MS: maximum time fn() may hold the lock once it *starts running*.
// Queue wait time is excluded — the timer only starts after await current resolves.
//
// Why 5s: ensureSessionFresh has its own 6s race timer for refreshSession().
// With a 10s force-release, refreshSession() held the lock for ~10s, leaving
// the upsert's _getAccessToken() → getSession() waiting until just before the
// 15s HTTP timeout fired — only ~5s of actual HTTP time. At 5s force-release,
// the lock is freed ~1s before session_refresh_failed (6s) is logged, so the
// upsert's getSession() runs immediately after and the HTTP request gets
// nearly the full 15s window. refreshSession() continues in the background.
const LOCK_MAX_HOLD_MS = 5_000;
let _lockQueue: Promise<unknown> = Promise.resolve();
async function processLock<R>(
  _name: string,
  _acquireTimeout: number,
  fn: () => Promise<R>,
): Promise<R> {
  const current = _lockQueue;
  let release: () => void = () => {};
  _lockQueue = new Promise((r) => { release = r as () => void; });
  try {
    await current; // wait for the previous operation to finish
    // Force-release starts HERE — after queue wait, measuring fn() hold time only.
    const forceReleaseTimer = setTimeout(release, LOCK_MAX_HOLD_MS);
    try {
      return await fn();
    } finally {
      clearTimeout(forceReleaseTimer);
    }
  } finally {
    release();
  }
}

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
export const supabaseClientInstanceId = `supabase-client-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

export const cloudAvailable: boolean = Boolean(
  url && url.startsWith('https://') && key && key.length > 20,
);

function nextSupabaseRequestId(): string {
  return `supabase-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function safePath(input: string): string {
  try {
    return new URL(input).pathname
  } catch {
    return input
  }
}

const baseFetch = globalThis.fetch.bind(globalThis)

const instrumentedFetch: typeof fetch = async (input, init) => {
  const requestId = nextSupabaseRequestId()
  const request = input instanceof Request ? input : null
  const rawUrl = request?.url ?? String(input)
  const path = safePath(rawUrl)
  const method = init?.method ?? request?.method ?? 'GET'
  const signal = init?.signal ?? request?.signal ?? null
  const startedAt = Date.now()
  const isProjectsWrite =
    path === '/rest/v1/projects' &&
    ['POST', 'PATCH', 'PUT'].includes(method.toUpperCase())

  let inflightTimer = 0
  let abortListener: (() => void) | null = null

  if (isProjectsWrite) {
    inflightTimer = window.setTimeout(() => {
      console.warn('[SupabaseHTTP][projects_write] timeout', {
        requestId,
        method,
        path,
        durationMs: Date.now() - startedAt,
        signalAborted: signal?.aborted ?? false,
      })
    }, 10000)

    if (signal) {
      abortListener = () => {
        console.warn('[SupabaseHTTP][projects_write] aborted', {
          requestId,
          method,
          path,
          durationMs: Date.now() - startedAt,
          signalAborted: signal.aborted,
        })
      }
      signal.addEventListener('abort', abortListener, { once: true })
    }
  }

  try {
    const response = await baseFetch(input, init)

    const originalJson = response.json.bind(response)
    response.json = async () => {
      const parseStartedAt = Date.now()
      try {
        const result = await originalJson()
        return result
      } catch (err) {
        if (isProjectsWrite) {
          console.error('[SupabaseHTTP][projects_write] fetch_error', {
            requestId,
            method,
            path,
            parser: 'json',
            durationMs: Date.now() - parseStartedAt,
            error: err instanceof Error ? err.message : String(err),
          })
        }
        throw err
      }
    }

    const originalText = response.text.bind(response)
    response.text = async () => {
      const parseStartedAt = Date.now()
      try {
        const result = await originalText()
        return result
      } catch (err) {
        if (isProjectsWrite) {
          console.error('[SupabaseHTTP][projects_write] fetch_error', {
            requestId,
            method,
            path,
            parser: 'text',
            durationMs: Date.now() - parseStartedAt,
            error: err instanceof Error ? err.message : String(err),
          })
        }
        throw err
      }
    }

    return response
  } catch (err) {
    if (isProjectsWrite) {
      console.error('[SupabaseHTTP][projects_write] fetch_error', {
        requestId,
        method,
        path,
        durationMs: Date.now() - startedAt,
        signalAborted: signal?.aborted ?? false,
        error: err instanceof Error ? err.message : String(err),
      })
    }
    throw err
  } finally {
    if (inflightTimer) {
      window.clearTimeout(inflightTimer)
    }
    if (signal && abortListener) {
      signal.removeEventListener('abort', abortListener)
    }
  }
}

export const supabase: SupabaseClient | null = cloudAvailable

  ? createClient(url!, key!, {
      auth: {
        autoRefreshToken: false,
        persistSession: true,
        detectSessionInUrl: true,
        // Use a simple in-process Promise queue instead of the Navigator Locks API.
        // The Navigator lock has a 5s steal timeout: if ANY auth operation (e.g.
        // refreshSession during ensureSessionFresh) holds the lock for >5s, any
        // concurrent getSession() call (fired internally by every DB query via
        // _getAccessToken) forcefully steals the lock, causing the holder to throw
        // "Lock was released because another request stole it".
        // processLock never steals — it queues and waits. Safe for a single-window
        // Tauri desktop app where cross-tab protection is not needed.
        lock: processLock,
      },
      global: {
        fetch: instrumentedFetch,
      },
    })
  : null;
