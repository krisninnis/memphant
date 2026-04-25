/**
 * Cloud sync service — Supabase backend.
 *
 * Strategy:
 *  - Push: after every local save, upsert the project to Supabase.
 *  - Pull: on login / app open, fetch all remote projects and merge.
 *  - Conflict resolution: last-write-wins by `updatedAt`.
 *
 * Auth strategy (important):
 *  - We prefer cached identity / known user IDs for sync paths whenever the
 *    app already has a confirmed signed-in user in state.
 *  - getSession() can trigger token refresh work internally and may hang.
 *    We wrap it in a short timeout.
 *  - getUser() makes a live network call to /auth/v1/user and CAN hang
 *    indefinitely if the auth server is slow. We only call it as a fallback
 *    with an explicit 5-second timeout.
 *  - For sync operations, RLS policies enforce row-level security regardless,
 *    so the cached session user is safe to use.
 */

import { supabase, supabaseClientInstanceId } from './supabaseClient'
import type { ProjectMemory } from '../types/memphant-types'
import type { SubscriptionTier, SubscriptionStatus } from '../store/projectStore'
import { enqueue, dequeue, getAll as getQueued } from './syncQueue'
import { getRuntimeEnv } from '../utils/runtimeEnv'
// ─── Types ────────────────────────────────────────────────────────────────────
function getSupabase() {
  if (!supabase) {
    throw new Error('Supabase client not initialised')
  }
  return supabase
}
type CloudSyncStage =
  | 'auth'
  | 'queue'
  | 'push'
  | 'pull'
  | 'subscription'
  | 'cycle'

type SyncReason = 'manual' | 'signin' | 'startup' | 'autosave' | 'unknown'
const SUPABASE_WRITE_TIMEOUT_MS = 15000
const SUBSCRIPTION_FETCH_TIMEOUT_MS = 6000
// signOut() makes a live network call. Cap it so logout can never hang the UI.
const LOGOUT_SIGNOUT_TIMEOUT_MS = 5000
const PROJECTS_TABLE = 'projects'
const PROJECTS_ON_CONFLICT = 'user_id,project_id'
const PROJECTS_EXPECTED_KEYS = ['user_id', 'project_id', 'name', 'data', 'updated_at'] as const

type ProjectRow = {
  user_id: string
  project_id: string
  name: string
  data: Record<string, unknown>
  updated_at: string
}

interface SyncLogMeta {
  reason?: SyncReason
  requestId?: string
  [key: string]: unknown
}

interface SupabaseErrorShape {
  code?: string
  message?: string
  details?: string
  hint?: string
  name?: string
}

interface AuthUserResult {
  user: { id: string; email?: string | null } | null
  requestId: string
}

// ─── In-flight dedup ──────────────────────────────────────────────────────────

// Prevents concurrent sync cycles from stepping on each other.
let syncCycleInFlight: Promise<{ merged: ProjectMemory[]; changed: boolean; conflicts: string[] }> | null = null
let authLookupInFlight: Promise<AuthUserResult> | null = null
let authLookupOwnerRequestId: string | null = null
let authLookupWaiterCount = 0
const subscriptionLookupInFlight = new Map<string, Promise<SubscriptionInfo>>()
let cloudConnectionGeneration = 0
let cloudDisconnectInProgress = false

// Supabase auth/session operations can fight over the internal auth-token lock
// if we allow them to overlap (getSession/getUser/refreshSession/signOut/etc).
// Serialize them through one shared queue.
let authOpQueue: Promise<void> = Promise.resolve()

type CloudSyncEnv = {
  VITE_APP_URL?: string
  VITE_API_URL?: string
  VITE_SUPABASE_URL?: string
  VITE_SUPABASE_ANON_KEY?: string
}

// ─── Auth callback URL ────────────────────────────────────────────────────────

const cloudSyncEnv = getRuntimeEnv() as CloudSyncEnv
const AUTH_CALLBACK_URL =
  cloudSyncEnv.VITE_APP_URL
    ? `${cloudSyncEnv.VITE_APP_URL}/auth/callback`
    : cloudSyncEnv.VITE_API_URL
      ? `${cloudSyncEnv.VITE_API_URL}/auth/callback`
      : 'https://memephant.com/auth/callback'

// ─── Utilities ────────────────────────────────────────────────────────────────

function nextRequestId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function normalizeError(err: unknown): SupabaseErrorShape {
  if (!err || typeof err !== 'object') {
    return { message: String(err) }
  }
  const candidate = err as SupabaseErrorShape
  return {
    name: candidate.name,
    code: candidate.code,
    message: candidate.message ?? String(err),
    details: candidate.details,
    hint: candidate.hint,
  }
}

function classifyError(
  err: unknown,
): 'auth_failure' | 'network_failure' | 'timeout' | 'rls_or_database_rejection' {
  const normalized = normalizeError(err)
  const message = (normalized.message ?? '').toLowerCase()
  const code = (normalized.code ?? '').toLowerCase()

  if (message.includes('timed out')) return 'timeout'
  if (
    message.includes('not signed in') ||
    message.includes('session') ||
    code.startsWith('auth')
  ) {
    return 'auth_failure'
  }
  if (normalized.code || normalized.details || normalized.hint) {
    return 'rls_or_database_rejection'
  }
  return 'network_failure'
}

function logSync(stage: CloudSyncStage, event: string, meta: SyncLogMeta = {}): void {
  console.warn(`[CloudSync][${stage}] ${event}`, meta)
}

function logSyncError(
  stage: CloudSyncStage,
  event: string,
  err: unknown,
  meta: SyncLogMeta = {},
): void {
  console.error(`[CloudSync][${stage}] ${event}`, {
    ...meta,
    kind: classifyError(err),
    error: normalizeError(err),
  })
}

async function runExclusiveAuthOp<T>(
  stage: CloudSyncStage,
  event: string,
  fn: () => Promise<T>,
  meta: SyncLogMeta = {},
): Promise<T> {
  const previous = authOpQueue.catch(() => undefined)

  let release!: () => void
  authOpQueue = new Promise<void>((resolve) => {
    release = resolve
  })

  await previous

  logSync(stage, `${event}_exclusive_start`, meta)

  try {
    return await fn()
  } finally {
    release()
    logSync(stage, `${event}_exclusive_end`, meta)
  }
}

function estimateChars(value: unknown): number {
  try {
    return JSON.stringify(value)?.length ?? 0
  } catch {
    return -1
  }
}

function summarizeLargeDataShape(
  value: unknown,
  path = 'data',
  findings: string[] = [],
): string[] {
  if (findings.length >= 6) return findings

  if (typeof value === 'string') {
    if (value.length > 50_000) findings.push(`${path}:string(${value.length})`)
    return findings
  }

  if (Array.isArray(value)) {
    if (value.length > 250) findings.push(`${path}:array(${value.length})`)
    for (let i = 0; i < Math.min(value.length, 5); i++) {
      summarizeLargeDataShape(value[i], `${path}[${i}]`, findings)
      if (findings.length >= 6) break
    }
    return findings
  }

  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
    if (entries.length > 100) findings.push(`${path}:objectKeys(${entries.length})`)
    for (const [key, nested] of entries.slice(0, 8)) {
      summarizeLargeDataShape(nested, `${path}.${key}`, findings)
      if (findings.length >= 6) break
    }
  }

  return findings
}

function summarizeProjectRows(rows: ProjectRow[]): SyncLogMeta {
  const first = rows[0]
  const keys = first ? Object.keys(first).sort() : []
  const expectedKeys = [...PROJECTS_EXPECTED_KEYS].sort()
  const unexpectedKeys = keys.filter((key) => !expectedKeys.includes(key as typeof PROJECTS_EXPECTED_KEYS[number]))
  const missingKeys = expectedKeys.filter((key) => !keys.includes(key))
  const payloadChars = estimateChars(rows)
  const payloadBytes = payloadChars >= 0 ? new Blob([JSON.stringify(rows)]).size : -1
  const firstDataKeys =
    first?.data && typeof first.data === 'object'
      ? Object.keys(first.data).sort().slice(0, 20)
      : []

  return {
    table: PROJECTS_TABLE,
    onConflict: PROJECTS_ON_CONFLICT,
    recordCount: rows.length,
    payloadChars,
    payloadBytes,
    firstRecordKeys: keys,
    firstDataKeys,
    missingKeys,
    unexpectedKeys,
    firstProjectId: first?.project_id ?? null,
    largeDataFindings: first ? summarizeLargeDataShape(first.data) : [],
  }
}

/**
 * Run a Supabase write request with a hard deadline.
 *
 * Previous pattern: wraps a PromiseLike in Promise.race() — this only
 * cancels the JS promise; the underlying fetch() keeps running as a zombie.
 *
 * New pattern: accepts a factory (signal) => PromiseLike so an AbortController
 * is created here, its signal passed to the Supabase query builder via
 * .abortSignal(), and controller.abort() is called on timeout. This actually
 * cancels the HTTP request, preventing zombie requests piling up on retry.
 */
async function withSupabaseWriteTimeout<T>(
  requestFactory: (signal: AbortSignal) => PromiseLike<T>,
  eventBase: 'request' | 'batch',
  meta: SyncLogMeta = {},
  timeoutMs = SUPABASE_WRITE_TIMEOUT_MS,
): Promise<T> {
  const startedAt = Date.now()
  const controller = new AbortController()

  logSync('push', `${eventBase}_factory_created`, {
    ...meta,
    timeoutMs,
  })

  const timeoutId = window.setTimeout(() => {
    logSync('push', `${eventBase}_timeout`, {
      ...meta,
      timeoutMs,
      durationMs: Date.now() - startedAt,
    })
    controller.abort(new Error(`Cloud write timed out after ${Math.round(timeoutMs / 1000)} s`))
  }, timeoutMs)

  try {
    logSync('push', `${eventBase}_factory_invoked`, {
      ...meta,
      signalAlreadyAborted: controller.signal.aborted,
    })

    const requestLike = requestFactory(controller.signal)
    logSync('push', `${eventBase}_query_builder_created`, {
      ...meta,
      hasThen: Boolean(requestLike && typeof (requestLike as { then?: unknown }).then === 'function'),
    })

    logSync('push', `${eventBase}_query_execution_started`, {
      ...meta,
    })
    const requestPromise = Promise.resolve(requestLike)
    const result = await requestPromise
    window.clearTimeout(timeoutId)
    logSync('push', `${eventBase}_response_received`, {
      ...meta,
      durationMs: Date.now() - startedAt,
    })
    return result
  } catch (err) {
    window.clearTimeout(timeoutId)
    // Normalise AbortError (thrown by fetch when controller.abort() fires) into
    // our standard timeout error so classifyError() recognises it.
    const isAbort =
      (err instanceof DOMException && err.name === 'AbortError') ||
      (err instanceof Error && err.name === 'AbortError')
    if (isAbort) {
      const timeoutErr = new Error(`Cloud write timed out after ${Math.round(timeoutMs / 1000)} s`)
      logSyncError('push', `${eventBase}_promise_unresolved`, timeoutErr, {
        ...meta,
        durationMs: Date.now() - startedAt,
      })
      throw timeoutErr
    }
    throw err
  }
}

// ─── Supabase reachability check ─────────────────────────────────────────────

/**
 * Ping the Supabase REST metadata endpoint with a 5-second deadline.
 *
 * Purpose: detect a paused / unreachable Supabase project BEFORE we waste
 * 15 seconds waiting for an upsert that will never respond. A paused free-tier
 * project accepts TCP connections but never sends HTTP responses — this ping
 * surfaces that quickly.
 *
 * Returns 'ok' | 'paused' | 'unreachable'.
 */
async function checkSupabaseReachable(
  projectUrl: string,
  anonKey: string,
): Promise<'ok' | 'paused' | 'unreachable'> {
  const controller = new AbortController()
  const timeoutId = window.setTimeout(() => controller.abort(), 5000)

  try {
    const res = await fetch(`${projectUrl}/rest/v1/`, {
      method: 'HEAD',
      headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
      signal: controller.signal,
    })
    window.clearTimeout(timeoutId)
    // 2xx or 4xx = Supabase is up (4xx means it's alive, just no table to HEAD)
    return res.status < 500 ? 'ok' : 'unreachable'
  } catch (err) {
    window.clearTimeout(timeoutId)
    const isAbort = err instanceof DOMException && err.name === 'AbortError'
    logSync('push', 'health_check_result', {
      reachable: false,
      isAbort,
      error: err instanceof Error ? err.message : String(err),
    })
    return isAbort ? 'paused' : 'unreachable'
  }
}

let lastHealthCheckAt = 0
let lastHealthResult: 'ok' | 'paused' | 'unreachable' | null = null
const HEALTH_CHECK_CACHE_MS = 30_000 // don't re-ping within 30 s

async function ensureSupabaseReachable(): Promise<void> {
  const url = cloudSyncEnv.VITE_SUPABASE_URL
  const key = cloudSyncEnv.VITE_SUPABASE_ANON_KEY
  if (!url || !key) return // no config — let the actual request fail naturally

  const now = Date.now()
  if (lastHealthResult === 'ok' && now - lastHealthCheckAt < HEALTH_CHECK_CACHE_MS) {
    return // recent passing check — skip
  }

  logSync('push', 'health_check_start', { url })
  const result = await checkSupabaseReachable(url, key)
  lastHealthCheckAt = Date.now()
  lastHealthResult = result
  logSync('push', 'health_check_result', { result })

  if (result === 'paused') {
    throw new Error(
      'Supabase is not responding (project may be paused on free tier). ' +
      'Visit supabase.com/dashboard → your project → Resume to wake it up.',
    )
  }
  if (result === 'unreachable') {
    throw new Error('Cannot reach Supabase — check your internet connection.')
  }
}

// ─── Session pre-warm ─────────────────────────────────────────────────────────

/**
 * Ensure the Supabase JWT is fresh before making a write request.
 *
 * WHY THIS EXISTS:
 *   With autoRefreshToken:false in the client, no background refresh runs.
 *   But if we DON'T call this, the client sends the expired token to Supabase
 *   and gets a 401 (fast fail). If autoRefreshToken:true (old default), the
 *   client would instead try to refresh INSIDE the upsert call using a fetch
 *   with NO AbortSignal — causing the 15-second hang we've seen in logs.
 *
 *   By refreshing here (with an explicit 6s timeout), we ensure:
 *   1. Token is valid before the upsert fires.
 *   2. If refresh times out, we proceed anyway — the upsert will get a fast
 *      401 from Supabase rather than hanging silently.
 */
const SESSION_EXPIRY_BUFFER_SEC = 120 // refresh if expiring within 2 min

async function ensureSessionFresh(reason: SyncReason): Promise<void> {
  if (!supabase) return

  await runExclusiveAuthOp('auth', 'ensure_session_fresh', async () => {
    // Quick cached read — 500ms max. With autoRefreshToken:false this never hangs.
    try {
      const sb = getSupabase()

      const { data } = await Promise.race([
        sb.auth.getSession(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('session quick-check timed out')), 500),
        ),
      ])

      const exp = data?.session?.expires_at ?? 0
      const nowSec = Math.floor(Date.now() / 1000)
      const secsLeft = exp - nowSec
      if (exp === 0 || secsLeft < SESSION_EXPIRY_BUFFER_SEC) {
        logSync('push', 'session_stale', { reason, secsLeft })
      } else {
        logSync('push', 'session_fresh', { reason, secsLeft })
        return
      }
    } catch {
      logSync('push', 'session_check_timed_out', { reason })
    }

    logSync('push', 'session_refresh_start', { reason })
    try {
      const sb = getSupabase()

      const { data, error } = await Promise.race([
        sb.auth.refreshSession(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('session refresh timed out after 6 s')), 6000),
        ),
      ])

      if (error) {
        logSyncError('push', 'session_refresh_error', error, { reason })
      } else {
        const newExp = data.session?.expires_at ?? 0
        logSync('push', 'session_refresh_success', {
          reason,
          newSecsLeft: newExp - Math.floor(Date.now() / 1000),
        })
      }
    } catch (err) {
      // Timed out or network error. Proceed anyway — upsert will get a fast 401
      // (with autoRefreshToken:false) rather than hanging indefinitely.
      logSyncError('push', 'session_refresh_failed', err, { reason })
    }
  }, { reason })
}

// ─── Retry helper ─────────────────────────────────────────────────────────────

async function withRetry<T>(
  fn: () => Promise<T>,
  maxAttempts = 4,
  baseDelayMs = 500,
  shouldRetry?: (attempt: number, err: unknown) => boolean,
): Promise<T> {
  let lastErr: unknown
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastErr = err
      if (shouldRetry && !shouldRetry(attempt, err)) {
        throw err
      }
      if (attempt < maxAttempts - 1) {
        const delay = baseDelayMs * Math.pow(2, attempt) + Math.random() * 200
        await new Promise((res) => setTimeout(res, delay))
      }
    }
  }
  throw lastErr
}

// ─── Auth helper ──────────────────────────────────────────────────────────────

/**
 * Get the currently signed-in user for a sync operation.
 *
 * Uses getSession() first as the primary path.
 * Only falls back to getUser() (network call) if the session is absent or
 * expired, and wraps that call in a 5-second timeout so it cannot hang forever.
 *
 * Root cause of the "auth_check_start → nothing" hang:
 *   both getSession() and getUser() can stall if token refresh gets stuck.
 *   We keep timeouts around both and skip them entirely when a known user ID
 *   is already available from app state.
 */
async function getAuthUser(reason: SyncReason, source: CloudSyncStage): Promise<AuthUserResult> {
  const requestId = nextRequestId(source)

  if (!supabase) {
    logSync(source, 'auth_skipped_no_supabase', { reason, requestId })
    return { user: null, requestId }
  }

  if (authLookupInFlight) {
    authLookupWaiterCount += 1
    logSync(source, 'auth_check_join_inflight', {
      reason,
      requestId,
      ownerRequestId: authLookupOwnerRequestId,
      waiterCount: authLookupWaiterCount,
      clientInstanceId: supabaseClientInstanceId,
    })
    return authLookupInFlight
  }

  authLookupOwnerRequestId = requestId
  authLookupWaiterCount = 0

  authLookupInFlight = runExclusiveAuthOp(source, 'get_auth_user', async () => {
    logSync(source, 'auth_check_start', {
      reason,
      requestId,
      method: 'getSession_first',
      clientInstanceId: supabaseClientInstanceId,
      anotherAuthInFlight: false,
    })

    // ── Fast path: read cached session from localStorage (no network) ──────────
    // IMPORTANT: supabase.auth.getSession() can trigger a token refresh internally
    // if the token is expired, which makes a network request that can hang forever.
    // We race it against a 3-second timeout so this path is never a blocking hang.
    try {
      const t0 = Date.now()
      const sessionTimeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error('getSession timed out — token refresh may be hanging')),
          3000,
        ),
      )
      const sb = getSupabase()

const { data: sessionData, error: sessionError } = await Promise.race([
  sb.auth.getSession(),
  sessionTimeoutPromise,
])
      const sessionMs = Date.now() - t0

      if (sessionError) {
        logSyncError(source, 'auth_session_error', sessionError, { reason, requestId, sessionMs })
        // Don't throw yet — fall through to getUser() below
      } else if (sessionData.session?.user) {
        const sessionUser = sessionData.session.user

        // Check the session hasn't expired (exp is in seconds)
        const expiry = sessionData.session.expires_at ?? 0
        const nowSec = Math.floor(Date.now() / 1000)
        const isExpired = expiry > 0 && nowSec > expiry

        if (!isExpired) {
          logSync(source, 'auth_check_success', {
            reason,
            requestId,
            sessionMs,
            method: 'session_cache',
            userId: sessionUser.id,
            expiresIn: expiry - nowSec,
          })
          return { user: sessionUser, requestId }
        }

        logSync(source, 'auth_session_expired', {
          reason,
          requestId,
          sessionMs,
          expiredSecondsAgo: nowSec - expiry,
        })
      } else {
        logSync(source, 'auth_session_empty', { reason, requestId, sessionMs })
      }
    } catch (sessionErr) {
      logSyncError(source, 'auth_session_exception', sessionErr, { reason, requestId })
    }

    // ── Slow path: verify with server, with explicit 5-second timeout ──────────
    logSync(source, 'auth_getuser_start', { reason, requestId })

    try {
      const sb = getSupabase()
const getUserPromise = sb.auth.getUser()
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error('Auth getUser timed out after 5 s — token refresh may be stuck')),
          5000,
        ),
      )

      const t1 = Date.now()
      const { data, error } = await Promise.race([getUserPromise, timeoutPromise])
      const getUserMs = Date.now() - t1

      if (error) {
        logSyncError(source, 'auth_getuser_failed', error, { reason, requestId, getUserMs })
        throw new Error(error.message)
      }

      logSync(source, 'auth_check_success', {
        reason,
        requestId,
        getUserMs,
        method: 'getUser_network',
        hasUser: Boolean(data.user),
        userId: data.user?.id ?? null,
      })

      return { user: data.user, requestId }
    } catch (err) {
      logSyncError(source, 'auth_check_exception', err, { reason, requestId })
      throw err
    }
  }, { reason, requestId }).finally(() => {
    logSync(source, 'auth_check_settled', {
      reason,
      requestId,
      waiterCount: authLookupWaiterCount,
      clientInstanceId: supabaseClientInstanceId,
    })
    authLookupInFlight = null
    authLookupOwnerRequestId = null
    authLookupWaiterCount = 0
  })

  return authLookupInFlight
}

// ─── Public types ─────────────────────────────────────────────────────────────

export interface CloudUser {
  id: string
  email: string
}

interface RemoteRow {
  project_id: string
  name: string
  data: ProjectMemory
  updated_at: string
}

export interface CloudPushResult {
  status: 'disabled' | 'skipped' | 'saved_local' | 'pending' | 'error'
  message?: string
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

export async function signIn(email: string, password: string): Promise<CloudUser> {
  if (!supabase) throw new Error('Cloud sync not configured.')
  cloudDisconnectInProgress = false

  const { data, error } = await runExclusiveAuthOp('auth', 'signin', async () => {
  const sb = getSupabase()
  return sb.auth.signInWithPassword({ email, password })
})

  if (error) throw new Error(error.message)
  if (!data.user?.email) throw new Error('Sign-in succeeded but no user returned.')

  return { id: data.user.id, email: data.user.email }
}

export async function signUp(email: string, password: string): Promise<CloudUser> {
  if (!supabase) throw new Error('Cloud sync not configured.')
  cloudDisconnectInProgress = false

  const { data, error } = await runExclusiveAuthOp('auth', 'signup', async () => {
  const sb = getSupabase()
  return sb.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: AUTH_CALLBACK_URL },
  })
})

  if (error) throw new Error(error.message)
  if (!data.user) throw new Error('Sign-up succeeded but no user returned.')

  return { id: data.user.id, email: data.user.email ?? email }
}

export async function signOut(): Promise<void> {
  if (!supabase) return

  const { error } = await runExclusiveAuthOp('auth', 'signout', async () => {
  const sb = getSupabase()
  return sb.auth.signOut({ scope: 'global' })
})

  if (error) throw new Error(error.message)
}

function clearSupabaseAuthStorage(): { clearedKeys: string[] } {
  const clearedKeys = new Set<string>()
  const shouldClearKey = (key: string): boolean =>
    key.startsWith('sb-') ||
    key.startsWith('supabase.auth.') ||
    key.includes('.auth.token') ||
    key.includes('.auth.refreshToken') ||
    key.includes('.auth.expiresAt') ||
    key.includes('gotrue')

  const clearFromStorage = (storage: Storage | undefined) => {
    if (!storage) return
    const keysToRemove: string[] = []
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i)
      if (key && shouldClearKey(key)) {
        keysToRemove.push(key)
      }
    }
    for (const key of keysToRemove) {
      storage.removeItem(key)
      clearedKeys.add(key)
    }
  }

  if (typeof window !== 'undefined') {
    clearFromStorage(window.localStorage)
    clearFromStorage(window.sessionStorage)
    // Also purge IndexedDB auth databases.
    // Supabase v2 can fall back to IndexedDB on mobile WebViews where
    // localStorage quota is restricted (common on iOS Safari PWA).
    void clearSupabaseIndexedDB()
  }

  return { clearedKeys: Array.from(clearedKeys).sort() }
}

async function clearSupabaseIndexedDB(): Promise<void> {
  if (typeof indexedDB === 'undefined') return
  try {
    // indexedDB.databases() lists all open databases — not available in every env.
    if (typeof indexedDB.databases === 'function') {
      const dbs = await indexedDB.databases()
      for (const db of dbs) {
        if (db.name && (db.name.startsWith('sb-') || /supabase|gotrue/i.test(db.name))) {
          indexedDB.deleteDatabase(db.name)
        }
      }
    }
  } catch {
    // Silent fail — IndexedDB.databases() not supported everywhere; localStorage already cleared above.
  }
}

export async function disconnectCloud(): Promise<{ clearedKeys: string[] }> {
  cloudDisconnectInProgress = true
  cloudConnectionGeneration += 1
  logSync('auth', 'disconnect_start', {
    clientInstanceId: supabaseClientInstanceId,
    connectionGeneration: cloudConnectionGeneration,
  })

  try {
    logSync('auth', 'disconnect_complete', {
      clientInstanceId: supabaseClientInstanceId,
      clearedKeys: [],
      connectionGeneration: cloudConnectionGeneration,
    })

    return { clearedKeys: [] }
  } finally {
    cloudDisconnectInProgress = false
  }
}

export async function logoutCloudAccount(): Promise<{ clearedKeys: string[] }> {
  cloudDisconnectInProgress = true
  cloudConnectionGeneration += 1
  logSync('auth', 'logout_start', {
    clientInstanceId: supabaseClientInstanceId,
    connectionGeneration: cloudConnectionGeneration,
  })

  try {
    let signOutError: unknown = null
    try {
      logSync('auth', 'logout_signout_start', {
        clientInstanceId: supabaseClientInstanceId,
        connectionGeneration: cloudConnectionGeneration,
        timeoutMs: LOGOUT_SIGNOUT_TIMEOUT_MS,
      })

      await Promise.race([
        signOut(),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error(`Logout signOut timed out after ${Math.round(LOGOUT_SIGNOUT_TIMEOUT_MS / 1000)} s`)),
            LOGOUT_SIGNOUT_TIMEOUT_MS,
          ),
        ),
      ])

      logSync('auth', 'logout_signout_success', {
        clientInstanceId: supabaseClientInstanceId,
        connectionGeneration: cloudConnectionGeneration,
      })
    } catch (err) {
      signOutError = err
      logSyncError('auth', 'logout_signout_error', err, {
        clientInstanceId: supabaseClientInstanceId,
        connectionGeneration: cloudConnectionGeneration,
      })
    }

    const result = clearSupabaseAuthStorage()

    logSync('auth', 'logout_complete', {
      clientInstanceId: supabaseClientInstanceId,
      clearedKeys: result.clearedKeys,
      hadSignOutError: Boolean(signOutError),
      connectionGeneration: cloudConnectionGeneration,
    })

    return result
  } finally {
    cloudDisconnectInProgress = false
  }
}

// ─── Timestamp helper ─────────────────────────────────────────────────────────

function localUpdatedAt(project: ProjectMemory): string {
  if (project.updatedAt) return project.updatedAt
  if (!project.changelog?.length) return '1970-01-01T00:00:00.000Z'
  const sorted = project.changelog.map((entry) => entry.timestamp).sort()
  return sorted[sorted.length - 1] ?? '1970-01-01T00:00:00.000Z'
}

// ─── Push single project ──────────────────────────────────────────────────────

export async function pushProject(
  project: ProjectMemory,
  knownUserId?: string,
): Promise<CloudPushResult> {
  if (!supabase) return { status: 'disabled' }
  const connectionGenerationAtStart = cloudConnectionGeneration

  let userId: string
  let requestId: string

  if (knownUserId) {
    userId = knownUserId
    requestId = nextRequestId('push')
    logSync('push', 'auth_skipped_known_user', {
      reason: 'autosave',
      requestId,
      userId,
      projectId: project.id,
    })
  } else {
    try {
      const { user, requestId: authRequestId } = await getAuthUser('autosave', 'push')
      if (!user) return { status: 'error', message: 'Cloud session is missing.' }
      userId = user.id
      requestId = authRequestId
    } catch (err) {
      logSyncError('push', 'auth_failed_before_request', err, {
        reason: 'autosave',
        projectId: project.id,
      })
      await enqueue(project)
      return {
        status: 'pending',
        message: err instanceof Error ? err.message : 'Cloud auth timed out. Will retry later.',
      }
    }
  }

  try {
    const row: ProjectRow = {
      user_id: userId,
      project_id: project.id,
      name: project.name,
      data: project as unknown as Record<string, unknown>,
      updated_at: localUpdatedAt(project),
    }

    // Ensure JWT is fresh so the Supabase client won't attempt an internal
    // auto-refresh (which ignores our AbortSignal and can hang indefinitely).
    await ensureSessionFresh('autosave')

    // Fast reachability check — surfaces a paused Supabase project in 5 s
    // rather than after each 15-second upsert timeout.
    await ensureSupabaseReachable()

    await withRetry(async () => {
      const startedAt = Date.now()
      logSync('push', 'request_start', {
        reason: 'autosave',
        requestId,
        projectId: project.id,
      })

      logSync('push', 'request_before_upsert', {
        reason: 'autosave',
        requestId,
        projectId: project.id,
        ...summarizeProjectRows([row]),
      })

      const { error } = await withSupabaseWriteTimeout<{ error: SupabaseErrorShape | null }>(
        (signal) => supabase!
          .from(PROJECTS_TABLE)
          .upsert(row, { onConflict: PROJECTS_ON_CONFLICT })
          .abortSignal(signal),
        'request',
        {
          reason: 'autosave',
          requestId,
          projectId: project.id,
        },
      )

      if (error) {
        logSyncError('push', 'request_failed', error, {
          requestId,
          projectId: project.id,
          durationMs: Date.now() - startedAt,
        })
        throw new Error(error.message)
      }

      logSync('push', 'request_success', {
        requestId,
        projectId: project.id,
        durationMs: Date.now() - startedAt,
      })
    }, 4, 500, (attempt) => {
      const disconnected = cloudDisconnectInProgress || cloudConnectionGeneration !== connectionGenerationAtStart
      if (disconnected) {
        logSync('push', 'request_retry_aborted_disconnect', {
          requestId,
          projectId: project.id,
          attempt: attempt + 1,
        })
        return false
      }
      return true
    })

    await dequeue(project.id)
    return { status: 'saved_local' }
  } catch (err) {
    const disconnected = cloudDisconnectInProgress || cloudConnectionGeneration !== connectionGenerationAtStart
    if (disconnected) {
      logSync('push', 'request_aborted_disconnect', {
        reason: 'autosave',
        requestId,
        projectId: project.id,
      })
      return { status: 'saved_local', message: 'Cloud disconnected during autosave.' }
    }

    if (!cloudDisconnectInProgress) {
      logSyncError('push', 'request_exception', err, {
        reason: 'autosave',
        requestId,
        projectId: project.id,
      })
      await enqueue(project)
    }
    return {
      status: 'pending',
      message: err instanceof Error ? err.message : 'Cloud sync failed. Will retry later.',
    }
  }
}

// ─── Subscription ─────────────────────────────────────────────────────────────

export interface SubscriptionInfo {
  tier: SubscriptionTier
  status: SubscriptionStatus
}

export async function fetchSubscription(userId: string): Promise<SubscriptionInfo> {
  const defaultInfo: SubscriptionInfo = { tier: 'free', status: 'none' }

  if (!supabase) return defaultInfo

  if (subscriptionLookupInFlight.has(userId)) {
    return subscriptionLookupInFlight.get(userId)!
  }

  const requestId = nextRequestId('subscription')
  logSync('subscription', 'fetch_start', { userId, requestId })

  const promise = (async (): Promise<SubscriptionInfo> => {
    const sb = getSupabase()
    const startedAt = Date.now()
    const controller = new AbortController()
    const timeoutId = window.setTimeout(() => {
      controller.abort()
    }, SUBSCRIPTION_FETCH_TIMEOUT_MS)

    try {
      const { data, error } = await sb
  .from('subscriptions')
  .select('tier, status')
  .eq('user_id', userId)
  .abortSignal(controller.signal)
  .maybeSingle()

      if (error) {
        logSyncError('subscription', 'fetch_failed', error, {
          userId,
          requestId,
          durationMs: Date.now() - startedAt,
        })
        return defaultInfo
      }

      if (!data) {
        logSync('subscription', 'fetch_default_free', {
          userId,
          requestId,
          durationMs: Date.now() - startedAt,
        })
        return defaultInfo
      }

      const tier = (['pro', 'team'].includes(data.tier) ? data.tier : 'free') as SubscriptionTier
      const status = (
        ['active', 'trialing', 'past_due', 'canceled'].includes(data.status)
          ? data.status
          : 'none'
      ) as SubscriptionStatus

      logSync('subscription', 'fetch_success', {
        userId,
        requestId,
        tier,
        status,
        durationMs: Date.now() - startedAt,
      })
      return { tier, status }
    } catch (err) {
      const isAbort =
        (err instanceof DOMException && err.name === 'AbortError') ||
        (err instanceof Error && err.name === 'AbortError')

      if (isAbort) {
        logSync('subscription', 'fetch_timeout', {
          userId,
          requestId,
          timeoutMs: SUBSCRIPTION_FETCH_TIMEOUT_MS,
          durationMs: Date.now() - startedAt,
        })
        return defaultInfo
      }

      logSyncError('subscription', 'fetch_exception', err, {
        userId,
        requestId,
        durationMs: Date.now() - startedAt,
      })
      return defaultInfo
    } finally {
      window.clearTimeout(timeoutId)
      subscriptionLookupInFlight.delete(userId)
    }
  })()

  subscriptionLookupInFlight.set(userId, promise)
  return promise
}

// ─── Pull & merge ─────────────────────────────────────────────────────────────

async function pullAndMerge(
  localProjects: ProjectMemory[],
  userId: string,
  reason: SyncReason,
): Promise<{ merged: ProjectMemory[]; changed: boolean; conflicts: string[] }> {
  const requestId = nextRequestId('pull')

  if (!supabase) {
    logSync('pull', 'skipped_no_supabase', { reason, requestId })
    return { merged: localProjects, changed: false, conflicts: [] }
  }

  logSync('pull', 'fetch_start', { reason, requestId, userId })

  const { data, error } = await supabase
    .from(PROJECTS_TABLE)
    .select('project_id, name, data, updated_at')
    .eq('user_id', userId)
    .limit(500)

  if (error) {
    logSyncError('pull', 'fetch_failed', error, { reason, requestId, userId })
    throw new Error(error.message)
  }

  const remoteRows = (data ?? []) as RemoteRow[]
  logSync('pull', 'fetch_success', { reason, requestId, remoteCount: remoteRows.length })

  const localMap = new Map(localProjects.map((p) => [p.id, p]))
  let changed = false
  // Track projects where remote was newer and overwrote local — surfaced as a
  // toast notification so users know their local copy was updated from the cloud.
  const conflicts: string[] = []

  for (const row of remoteRows) {
    const remoteProject = row.data as ProjectMemory
    if (!remoteProject?.id) continue

    const local = localMap.get(remoteProject.id)
    if (!local) {
      // Remote-only — add to local
      localMap.set(remoteProject.id, remoteProject)
      changed = true
      logSync('pull', 'added_remote_project', {
        reason,
        requestId,
        projectId: remoteProject.id,
      })
    } else {
      // Both exist — last-write-wins by updatedAt.
      // Policy: remote wins when its timestamp is strictly newer.
      // Tie (equal timestamps): local wins (local-first bias).
      const localTs = localUpdatedAt(local)
      const remoteTs = row.updated_at ?? localUpdatedAt(remoteProject)
      if (remoteTs > localTs) {
        localMap.set(remoteProject.id, remoteProject)
        changed = true
        conflicts.push(remoteProject.name || remoteProject.id)
        logSync('pull', 'updated_from_remote', {
          reason,
          requestId,
          projectId: remoteProject.id,
          projectName: remoteProject.name,
          localTs,
          remoteTs,
        })
      }
    }
  }

  const merged = Array.from(localMap.values())
  logSync('pull', 'merge_complete', { reason, requestId, changed, mergedCount: merged.length, conflictCount: conflicts.length })
  return { merged, changed, conflicts }
}

// ─── Drain offline queue ──────────────────────────────────────────────────────

async function drainQueue(
  userId: string,
  reason: SyncReason,
): Promise<void> {
  const queued = await getQueued()
  if (queued.length === 0) return

  logSync('queue', 'drain_start', { reason, userId, queuedCount: queued.length })

  for (const project of queued) {
    try {
      const row: ProjectRow = {
        user_id: userId,
        project_id: project.id,
        name: project.name,
        data: project as unknown as Record<string, unknown>,
        updated_at: localUpdatedAt(project),
      }

      const { error } = await withSupabaseWriteTimeout<{ error: SupabaseErrorShape | null }>(
        (signal) => supabase!
          .from(PROJECTS_TABLE)
          .upsert(row, { onConflict: PROJECTS_ON_CONFLICT })
          .abortSignal(signal),
        'batch',
        { reason, projectId: project.id, drain: true },
      )

      if (error) {
        logSyncError('queue', 'drain_project_failed', error, { reason, projectId: project.id })
        continue
      }

      await dequeue(project.id)
      logSync('queue', 'drain_project_success', { reason, projectId: project.id })
    } catch (err) {
      logSyncError('queue', 'drain_project_exception', err, { reason, projectId: project.id })
    }
  }

  logSync('queue', 'drain_complete', { reason, userId })
}

// ─── Push all local projects ──────────────────────────────────────────────────

async function pushAll(
  localProjects: ProjectMemory[],
  userId: string,
  reason: SyncReason,
): Promise<void> {
  if (!supabase || localProjects.length === 0) return

  const requestId = nextRequestId('push')
  logSync('push', 'push_all_start', { reason, requestId, userId, count: localProjects.length })

  const rows: ProjectRow[] = localProjects.map((p) => ({
    user_id: userId,
    project_id: p.id,
    name: p.name,
    data: p as unknown as Record<string, unknown>,
    updated_at: localUpdatedAt(p),
  }))

  const BATCH_SIZE = 50
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE)

    const { error } = await withSupabaseWriteTimeout<{ error: SupabaseErrorShape | null }>(
      (signal) => supabase!
        .from(PROJECTS_TABLE)
        .upsert(batch, { onConflict: PROJECTS_ON_CONFLICT })
        .abortSignal(signal),
      'batch',
      { reason, requestId, batchStart: i, batchSize: batch.length },
      20000,
    )

    if (error) {
      logSyncError('push', 'push_all_batch_failed', error, {
        reason,
        requestId,
        batchStart: i,
      })
      throw new Error(error.message)
    }

    logSync('push', 'push_all_batch_success', {
      reason,
      requestId,
      batchStart: i,
      batchSize: batch.length,
    })
  }

  logSync('push', 'push_all_complete', { reason, requestId, count: localProjects.length })
}

// ─── Full sync cycle ──────────────────────────────────────────────────────────

async function _runCycle(
  localProjects: ProjectMemory[],
  reason: SyncReason,
  userId: string,
): Promise<{ merged: ProjectMemory[]; changed: boolean; conflicts: string[] }> {
  const cycleId = nextRequestId('cycle')
  logSync('cycle', 'cycle_start', { reason, cycleId, userId, localCount: localProjects.length })

  // Safety guard: on login/startup reasons, local projects should always be empty.
  // If they are not, something upstream broke account isolation — log loudly so
  // the regression is visible in sync logs, and drop them to protect the account.
  if ((reason === 'signin' || reason === 'startup') && localProjects.length > 0) {
    console.warn(
      `[cloudSync] SAFETY: local projects received on ${reason} cycle — dropping ${localProjects.length} to prevent cross-account leak`,
      { cycleId, userId, projectIds: localProjects.map((p) => p.id) },
    )
    logSync('cycle', 'unsafe_local_projects_dropped', { reason, cycleId, userId, count: localProjects.length })
    // Shadow-reassign: proceed as if localProjects = []
    localProjects = []
  }

  try {
    // 1. Ensure JWT is fresh before any writes (prevents internal auto-refresh hang)
    logSync('cycle', 'before_ensure_session_fresh', { reason, cycleId, userId })
    await ensureSessionFresh(reason)
    logSync('cycle', 'after_ensure_session_fresh', { reason, cycleId, userId })

    // 2. Fast reachability check — surfaces paused free-tier projects quickly
    logSync('cycle', 'before_ensure_supabase_reachable', { reason, cycleId, userId })
    await ensureSupabaseReachable()
    logSync('cycle', 'after_ensure_supabase_reachable', { reason, cycleId, userId })

    // 3. Drain any offline-queued projects first
    logSync('cycle', 'before_drain_queue', { reason, cycleId, userId })
    await drainQueue(userId, reason)
    logSync('cycle', 'after_drain_queue', { reason, cycleId, userId })

    // 4. Push all local projects to cloud (upsert)
    logSync('cycle', 'before_push_all', { reason, cycleId, userId, localCount: localProjects.length })
    await pushAll(localProjects, userId, reason)
    logSync('cycle', 'after_push_all', { reason, cycleId, userId, localCount: localProjects.length })

    // 5. Pull remote and merge
    logSync('cycle', 'before_pull_and_merge', { reason, cycleId, userId, localCount: localProjects.length })
    const result = await pullAndMerge(localProjects, userId, reason)
    logSync('cycle', 'after_pull_and_merge', {
      reason,
      cycleId,
      userId,
      changed: result.changed,
      mergedCount: result.merged.length,
      conflictCount: result.conflicts.length,
    })

    logSync('cycle', 'cycle_complete', {
      reason,
      cycleId,
      userId,
      changed: result.changed,
      mergedCount: result.merged.length,
      conflictCount: result.conflicts.length,
    })

    return result
  } catch (err) {
    logSyncError('cycle', 'cycle_failed', err, { reason, cycleId, userId })
    throw err
  }
}

export async function runCloudSyncCycle(
  localProjects: ProjectMemory[],
  reason: SyncReason,
  knownUserId?: string,
): Promise<{ merged: ProjectMemory[]; changed: boolean; conflicts: string[] }> {
  if (!supabase) {
    return { merged: localProjects, changed: false, conflicts: [] }
  }

  // Deduplicate concurrent calls — all callers share one in-flight cycle
  if (syncCycleInFlight) {
    logSync('cycle', 'cycle_join_inflight', { reason })
    return syncCycleInFlight
  }

  const cyclePromise = (async (): Promise<{ merged: ProjectMemory[]; changed: boolean; conflicts: string[] }> => {
    let userId: string

    if (knownUserId) {
      userId = knownUserId
      logSync('cycle', 'auth_skipped_known_user', { reason, userId })
    } else {
      const { user } = await getAuthUser(reason, 'cycle')
      if (!user) {
        logSync('cycle', 'auth_no_user', { reason })
        return { merged: localProjects, changed: false, conflicts: [] }
      }
      userId = user.id
    }

    return _runCycle(localProjects, reason, userId)
  })().finally(() => {
    syncCycleInFlight = null
  })

  syncCycleInFlight = cyclePromise
  return cyclePromise
}

// ─── Delete project from cloud ────────────────────────────────────────────────

export async function deleteCloudProject(projectId: string, knownUserId?: string): Promise<void> {
  if (!supabase) return

  const requestId = nextRequestId('push')

  let userId: string
  if (knownUserId) {
    userId = knownUserId
    logSync('push', 'delete_auth_skipped_known_user', { requestId, projectId, userId })
  } else {
    try {
      const { user } = await getAuthUser('autosave', 'push')
      if (!user) {
        logSync('push', 'delete_skipped_no_user', { requestId, projectId })
        return
      }
      userId = user.id
    } catch (err) {
      logSyncError('push', 'delete_auth_failed', err, { requestId, projectId })
      return
    }
  }

  logSync('push', 'delete_start', { requestId, projectId, userId })

  try {
    const { error } = await supabase
      .from(PROJECTS_TABLE)
      .delete()
      .eq('user_id', userId)
      .eq('project_id', projectId)

    if (error) {
      logSyncError('push', 'delete_failed', error, { requestId, projectId, userId })
    } else {
      logSync('push', 'delete_success', { requestId, projectId, userId })
    }
  } catch (err) {
    logSyncError('push', 'delete_exception', err, { requestId, projectId, userId })
  }
}

// ─── Re-export pendingCount from syncQueue ────────────────────────────────────

export { pendingCount } from './syncQueue'
