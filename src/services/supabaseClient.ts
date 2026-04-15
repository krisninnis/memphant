/**
 * Supabase client singleton.
 * Returns null when env vars are not set — the rest of the app
 * checks `cloudAvailable` before attempting any network calls.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
export const supabaseClientInstanceId = `supabase-client-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

export const cloudAvailable: boolean = Boolean(
  url && url.startsWith('https://') && key && key.length > 20,
);

function nextSupabaseRequestId(): string {
  return `supabase-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function safeUrl(input: string): string {
  try {
    const parsed = new URL(input)
    return `${parsed.origin}${parsed.pathname}`
  } catch {
    return input
  }
}

function safePath(input: string): string {
  try {
    return new URL(input).pathname
  } catch {
    return input
  }
}

function inferBodyKind(body: BodyInit | null | undefined): string {
  if (!body) return 'none'
  if (typeof body === 'string') return 'string'
  if (body instanceof URLSearchParams) return 'url_search_params'
  if (body instanceof FormData) return 'form_data'
  if (body instanceof Blob) return 'blob'
  if (body instanceof ArrayBuffer) return 'array_buffer'
  return typeof body
}

const baseFetch = globalThis.fetch.bind(globalThis)

const instrumentedFetch: typeof fetch = async (input, init) => {
  const requestId = nextSupabaseRequestId()
  const request = input instanceof Request ? input : null
  const rawUrl = request?.url ?? String(input)
  const path = safePath(rawUrl)
  const method = init?.method ?? request?.method ?? 'GET'
  const signal = init?.signal ?? request?.signal ?? null
  const headers = new Headers(init?.headers ?? request?.headers ?? undefined)
  const startedAt = Date.now()
  const bodyKind = inferBodyKind(init?.body ?? request?.body)
  const contentType = headers.get('content-type')
  const isProjectsWrite =
    path === '/rest/v1/projects' &&
    ['POST', 'PATCH', 'PUT'].includes(method.toUpperCase())

  let inflightTimer = 0
  let abortListener: (() => void) | null = null

  if (isProjectsWrite) {
    console.log('[SupabaseHTTP][projects_write] fetch_start', {
      requestId,
      clientInstanceId: supabaseClientInstanceId,
      method,
      path,
      signalAlreadyAborted: signal?.aborted ?? false,
      bodyKind,
      contentType,
    })

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
    if (isProjectsWrite) {
      console.log('[SupabaseHTTP][projects_write] response_headers', {
        requestId,
        method,
        path,
        durationMs: Date.now() - startedAt,
        status: response.status,
        ok: response.ok,
      })
    }

    const originalJson = response.json.bind(response)
    response.json = async () => {
      const parseStartedAt = Date.now()
      if (isProjectsWrite) {
        console.log('[SupabaseHTTP][projects_write] response_body_parse_start', {
          requestId,
          method,
          path,
          parser: 'json',
        })
      }
      try {
        const result = await originalJson()
        if (isProjectsWrite) {
          console.log('[SupabaseHTTP][projects_write] response_body_parse_success', {
            requestId,
            method,
            path,
            parser: 'json',
            durationMs: Date.now() - parseStartedAt,
          })
        }
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
      if (isProjectsWrite) {
        console.log('[SupabaseHTTP][projects_write] response_body_parse_start', {
          requestId,
          method,
          path,
          parser: 'text',
        })
      }
      try {
        const result = await originalText()
        if (isProjectsWrite) {
          console.log('[SupabaseHTTP][projects_write] response_body_parse_success', {
            requestId,
            method,
            path,
            parser: 'text',
            durationMs: Date.now() - parseStartedAt,
            length: result.length,
          })
        }
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
      },
      global: {
        fetch: instrumentedFetch,
      },
    })
  : null;

console.log('[SupabaseHTTP] client_init', {
  clientInstanceId: supabaseClientInstanceId,
  cloudAvailable,
  url: url ? safeUrl(url) : null,
})
