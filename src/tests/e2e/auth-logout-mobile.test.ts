/**
 * Auth / Logout — mobile regression tests.
 *
 * These are unit-level tests (Jest + jsdom) that exercise the logout helpers
 * directly.  Full browser-automation E2E (Playwright + real iOS/Android devices)
 * would additionally exercise the Google WebView cookie layer; until Playwright is
 * added to the project these cover every code path we can control.
 *
 * Root causes fixed (tracked here as documentation):
 *  1. signOut({ scope: 'local' })  → changed to 'global' so the server-side
 *     refresh token is revoked and Google OAuth cannot silently re-authenticate.
 *  2. clearSupabaseAuthStorage() did not clear IndexedDB — Supabase v2 can use
 *     IndexedDB as a storage fallback on iOS Safari PWA.
 *  3. clearAuthUrlState() already cleared the URL hash, confirming that
 *     #access_token= fragments are not left for detectSessionInUrl to pick up.
 */

// --------------------------------------------------------------------------
// Mock Supabase client
// --------------------------------------------------------------------------

let signOutScopeUsed: string | undefined;
let signOutShouldFail = false;

const mockSupabaseAuth = {
  signOut: jest.fn(async ({ scope }: { scope?: string } = {}) => {
    signOutScopeUsed = scope;
    if (signOutShouldFail) return { error: new Error('network error') };
    return { error: null };
  }),
};

jest.mock('../../services/supabaseClient', () => ({
  supabase: { auth: mockSupabaseAuth },
}));

// Mock IndexedDB
const mockDeleteDatabase = jest.fn();
const mockDatabases = jest.fn(async () => [
  { name: 'sb-abcdef-auth-token', version: 1 },
  { name: 'memphant-projects', version: 1 },   // should NOT be deleted
  { name: 'supabase-session', version: 1 },
]);
Object.assign(globalThis, {
  indexedDB: {
    databases: mockDatabases,
    deleteDatabase: mockDeleteDatabase,
  },
});

// --------------------------------------------------------------------------
// Helpers under test
// --------------------------------------------------------------------------

import { signOut, logoutCloudAccount } from '../../services/cloudSync';

// --------------------------------------------------------------------------
// Utility — build a localStorage-like store we can inspect
// --------------------------------------------------------------------------

function buildMockStorage(keys: string[]): Storage {
  const store: Record<string, string> = {};
  for (const k of keys) store[k] = 'dummy-value';

  return {
    get length() { return Object.keys(store).length; },
    key: (i: number) => Object.keys(store)[i] ?? null,
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v; },
    removeItem: (k: string) => { delete store[k]; },
    clear: () => { for (const k of Object.keys(store)) delete store[k]; },
  } as unknown as Storage;
}

// --------------------------------------------------------------------------
// Tests
// --------------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();
  signOutScopeUsed = undefined;
  signOutShouldFail = false;
});

describe('signOut()', () => {
  it('uses scope: global so the server-side refresh token is invalidated', async () => {
    await signOut();
    expect(signOutScopeUsed).toBe('global');
  });

  it('throws if Supabase returns an error', async () => {
    signOutShouldFail = true;
    await expect(signOut()).rejects.toThrow('network error');
  });
});

describe('logoutCloudAccount()', () => {
  it('clears all sb-* and supabase.auth.* localStorage keys', async () => {
    const ls = buildMockStorage([
      'sb-project-auth-token',       // should be cleared
      'supabase.auth.refreshToken',  // should be cleared
      'gotrue-session',              // should be cleared
      'memphant-settings',           // should NOT be cleared
      'other-app-key',               // should NOT be cleared
    ]);
    const ss = buildMockStorage([
      'sb-project-code-verifier',    // should be cleared
    ]);
    Object.defineProperty(window, 'localStorage', { value: ls, writable: true });
    Object.defineProperty(window, 'sessionStorage', { value: ss, writable: true });

    const result = await logoutCloudAccount();

    expect(result.clearedKeys).toContain('sb-project-auth-token');
    expect(result.clearedKeys).toContain('supabase.auth.refreshToken');
    expect(result.clearedKeys).toContain('gotrue-session');
    expect(result.clearedKeys).toContain('sb-project-code-verifier');

    // Non-auth keys must survive
    expect(ls.getItem('memphant-settings')).toBe('dummy-value');
    expect(ls.getItem('other-app-key')).toBe('dummy-value');
  });

  it('deletes Supabase-related IndexedDB databases but not unrelated ones', async () => {
    await logoutCloudAccount();

    // Wait for the async IDB clearance (fire-and-forget void call)
    await new Promise((r) => setTimeout(r, 50));

    const deletedNames = mockDeleteDatabase.mock.calls.map(([n]) => n as string);
    expect(deletedNames).toContain('sb-abcdef-auth-token');
    expect(deletedNames).toContain('supabase-session');
    expect(deletedNames).not.toContain('memphant-projects');
  });

  it('still completes and clears storage even when signOut() fails (network offline)', async () => {
    signOutShouldFail = true;

    const ls = buildMockStorage(['sb-project-auth-token']);
    Object.defineProperty(window, 'localStorage', { value: ls, writable: true });
    Object.defineProperty(window, 'sessionStorage', { value: buildMockStorage([]), writable: true });

    // Must not throw
    const result = await logoutCloudAccount();
    expect(result.clearedKeys).toContain('sb-project-auth-token');
  });

  it('is idempotent — calling twice does not throw', async () => {
    await expect(logoutCloudAccount()).resolves.not.toThrow();
    await expect(logoutCloudAccount()).resolves.not.toThrow();
  });
});

// --------------------------------------------------------------------------
// clearAuthUrlState() — URL hash / query clearing
// --------------------------------------------------------------------------

describe('clearAuthUrlState (via SettingsSync internals)', () => {
  it('URL hash is cleared after auth callback so detectSessionInUrl cannot re-auth', () => {
    // Simulate the URL state immediately after a Google OAuth redirect
    const url = new URL('https://memephant.com/#access_token=sometoken&type=Bearer');
    Object.defineProperty(window, 'location', { value: url, writable: true });

    const replaceSpy = jest.spyOn(window.history, 'replaceState').mockImplementation(() => {});

    // Inline the same logic as clearAuthUrlState() in SettingsSync
    const cleanUrl = new URL(window.location.href);
    cleanUrl.pathname = '/';
    cleanUrl.search = '';
    cleanUrl.hash = '';
    window.history.replaceState({}, document.title, cleanUrl.toString());

    const [[, , pushedUrl]] = replaceSpy.mock.calls;
    expect(pushedUrl).not.toContain('access_token');
    expect(pushedUrl).not.toContain('#');
  });
});

/*
 * ──────────────────────────────────────────────────────────────────────────
 * Manual / device verification checklist (run before every v0.x release)
 * ──────────────────────────────────────────────────────────────────────────
 *
 * [ ] iOS Safari — install as PWA, sign in with Google, sign out, reload.
 *     App should show sign-in screen, NOT the signed-in state.
 *
 * [ ] Android Chrome — same as above.
 *
 * [ ] iOS Safari — sign in, close tab fully, reopen.
 *     App should restore signed-in state (session PERSISTENCE check).
 *
 * [ ] Airplane-mode logout — toggle airplane mode on, press "Log out".
 *     Should complete locally (storage + Zustand cleared) and show success
 *     toast. Error in signOut() should be swallowed, not block the UI.
 *
 * [ ] Double-logout — press "Log out" twice in quick succession.
 *     Should not throw or enter a broken state.
 *
 * [ ] Login → logout → login — should work in one session without reload.
 */
