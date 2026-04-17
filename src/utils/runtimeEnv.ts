type RuntimeEnv = {
  VITE_APP_URL?: string;
  VITE_API_URL?: string;
  VITE_SUPABASE_URL?: string;
  VITE_SUPABASE_ANON_KEY?: string;
  VITE_SENTRY_DSN?: string;
};

declare global {
  interface Window {
    __MEMPHANT_ENV__?: Record<string, string | undefined>;
  }
}

export function getRuntimeEnv(): RuntimeEnv {
  const viteEnv = (import.meta.env ?? {}) as Record<string, string | undefined>;
  const windowEnv =
    typeof window !== 'undefined' && window.__MEMPHANT_ENV__
      ? window.__MEMPHANT_ENV__
      : {};

  return {
    VITE_APP_URL: viteEnv.VITE_APP_URL ?? windowEnv.VITE_APP_URL,
    VITE_API_URL: viteEnv.VITE_API_URL ?? windowEnv.VITE_API_URL,
    VITE_SUPABASE_URL: viteEnv.VITE_SUPABASE_URL ?? windowEnv.VITE_SUPABASE_URL,
    VITE_SUPABASE_ANON_KEY:
      viteEnv.VITE_SUPABASE_ANON_KEY ?? windowEnv.VITE_SUPABASE_ANON_KEY,
    VITE_SENTRY_DSN: viteEnv.VITE_SENTRY_DSN ?? windowEnv.VITE_SENTRY_DSN,
  };
}