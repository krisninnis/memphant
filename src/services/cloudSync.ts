/**
 * Cloud sync service — Supabase backend.
 *
 * Strategy:
 *  - Push: after every local save, upsert the project to Supabase.
 *  - Pull: on login / app open, fetch all remote projects and merge.
 *  - Conflict resolution: last-write-wins by `updated_at` timestamp.
 *    The remote `updated_at` column is managed by Supabase (set on upsert).
 *    The local "last updated" is the timestamp of the most recent changelog entry.
 *
 * Table schema (already created in Supabase):
 *   projects (
 *     id uuid primary key default gen_random_uuid(),
 *     user_id uuid references auth.users not null,
 *     project_id text not null,
 *     name text not null,
 *     data jsonb not null,
 *     updated_at timestamptz default now(),
 *     unique(user_id, project_id)
 *   )
 */

import { supabase, cloudAvailable } from './supabaseClient';
import type { ProjectMemory } from '../types/memphant-types';
import type { SubscriptionTier, SubscriptionStatus } from '../store/projectStore';
import { enqueue, dequeue, getAll as getQueued } from './syncQueue';

// ─── Retry helper ─────────────────────────────────────────────────────────────

/**
 * Call `fn` up to `maxAttempts` times with exponential back-off.
 * Throws on final failure.
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  maxAttempts = 4,
  baseDelayMs = 500,
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt < maxAttempts - 1) {
        const delay = baseDelayMs * Math.pow(2, attempt) + Math.random() * 200;
        await new Promise((res) => setTimeout(res, delay));
      }
    }
  }
  throw lastErr;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CloudUser {
  id: string;
  email: string;
}

interface RemoteRow {
  project_id: string;
  name: string;
  data: ProjectMemory;
  updated_at: string;
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

export async function signIn(
  email: string,
  password: string,
): Promise<CloudUser> {
  if (!supabase) throw new Error('Cloud sync not configured.');

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) throw new Error(error.message);
  if (!data.user?.email) throw new Error('Sign-in succeeded but no user returned.');

  return { id: data.user.id, email: data.user.email };
}

export async function signUp(
  email: string,
  password: string,
): Promise<CloudUser> {
  if (!supabase) throw new Error('Cloud sync not configured.');

  const { data, error } = await supabase.auth.signUp({ email, password });

  if (error) throw new Error(error.message);

  // Supabase may require email confirmation — handle gracefully
  const user = data.user;
  if (!user) throw new Error('Sign-up succeeded but no user returned.');

  return { id: user.id, email: user.email ?? email };
}

export async function signOut(): Promise<void> {
  if (!supabase) return;
  await supabase.auth.signOut();
}

/** Restore session from Supabase's built-in persistence (called on app start). */
export async function restoreSession(): Promise<CloudUser | null> {
  if (!supabase || !cloudAvailable) return null;

  const { data } = await supabase.auth.getSession();
  const user = data.session?.user;
  if (!user?.email) return null;

  return { id: user.id, email: user.email };
}

// ─── Push ─────────────────────────────────────────────────────────────────────

/** Push a single project to Supabase. Queues for offline retry on failure. */
export async function pushProject(project: ProjectMemory): Promise<void> {
  if (!supabase) return;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  try {
    await withRetry(async () => {
      const { error } = await supabase!.from('projects').upsert(
        {
          user_id: user.id,
          project_id: project.id,
          name: project.name,
          data: project as unknown as Record<string, unknown>,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,project_id' },
      );
      if (error) throw new Error(error.message);
    });

    // Succeeded — remove from offline queue in case it was queued previously
    await dequeue(project.id);
  } catch (err) {
    console.warn('[CloudSync] Push failed after retries — queueing offline:', err);
    await enqueue(project);
  }
}

/** Remove a project from Supabase when deleted locally. */
export async function deleteCloudProject(projectId: string): Promise<void> {
  if (!supabase) return;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  await supabase
    .from('projects')
    .delete()
    .eq('user_id', user.id)
    .eq('project_id', projectId);
}

// ─── Pull + merge ─────────────────────────────────────────────────────────────

/** Return the ISO timestamp of the most recent changelog entry, or epoch. */
function localUpdatedAt(project: ProjectMemory): string {
  if (!project.changelog?.length) return '1970-01-01T00:00:00.000Z';
  const sorted = project.changelog.map((e) => e.timestamp).sort();
  return sorted[sorted.length - 1] ?? '1970-01-01T00:00:00.000Z';
}

/**
 * Pull all remote projects and merge with local list.
 * - Remote project not in local → add it.
 * - Both exist → keep whichever has the newer timestamp.
 * Returns the merged array (does not mutate the input).
 */
export async function pullAndMerge(
  localProjects: ProjectMemory[],
): Promise<{ merged: ProjectMemory[]; changed: boolean }> {
  if (!supabase) return { merged: localProjects, changed: false };

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { merged: localProjects, changed: false };

  let data: RemoteRow[] | null = null;
  let error: { message: string } | null = null;

  try {
    await withRetry(async () => {
      const res = await supabase!
        .from('projects')
        .select('project_id, name, data, updated_at')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false });
      if (res.error) throw new Error(res.error.message);
      data = res.data as RemoteRow[];
    });
  } catch (err) {
    error = { message: String(err) };
  }

  if (error || !data) {
    console.warn('[CloudSync] Pull failed:', error?.message);
    return { merged: localProjects, changed: false };
  }

  const remote = data as RemoteRow[];
  const localMap = new Map(localProjects.map((p) => [p.id, p]));
  let changed = false;

  for (const row of remote) {
    const local = localMap.get(row.project_id);

    if (!local) {
      // New project from another device — add it
      localMap.set(row.project_id, row.data);
      changed = true;
    } else {
      // Compare timestamps — remote wins if it's strictly newer
      const localTs = localUpdatedAt(local);
      const remoteTs = row.updated_at;

      if (remoteTs > localTs) {
        localMap.set(row.project_id, row.data);
        changed = true;
      }
    }
  }

  return { merged: Array.from(localMap.values()), changed };
}

// ─── Subscription ─────────────────────────────────────────────────────────────

export interface SubscriptionInfo {
  tier: SubscriptionTier;
  status: SubscriptionStatus;
}

/**
 * Fetch the current subscription tier and status for a user.
 * Returns { tier: 'free', status: 'none' } when no row exists yet.
 */
export async function fetchSubscription(userId: string): Promise<SubscriptionInfo> {
  if (!supabase) return { tier: 'free', status: 'none' };

  const { data, error } = await supabase
    .from('subscriptions')
    .select('tier, status')
    .eq('user_id', userId)
    .single();

  if (error || !data) {
    // No row is fine — user is on free tier
    return { tier: 'free', status: 'none' };
  }

  return {
    tier:   (data.tier   as SubscriptionTier)   || 'free',
    status: (data.status as SubscriptionStatus) || 'none',
  };
}

// ─── Offline queue ────────────────────────────────────────────────────────────

export { pendingCount } from './syncQueue';

/**
 * Push any projects that failed while offline.
 * Call after a successful connection is confirmed.
 */
export async function drainQueue(): Promise<number> {
  const queued = await getQueued();
  if (queued.length === 0) return 0;

  let flushed = 0;
  for (const project of queued) {
    try {
      await pushProject(project);
      flushed++;
    } catch {
      // leave in queue for next attempt
    }
  }
  return flushed;
}

// ─── Push all ─────────────────────────────────────────────────────────────────

/**
 * Push all local projects to Supabase in one batch.
 * Used after login to ensure the cloud is up to date.
 */
export async function pushAll(projects: ProjectMemory[]): Promise<void> {
  if (!supabase || projects.length === 0) return;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const rows = projects.map((p) => ({
    user_id: user.id,
    project_id: p.id,
    name: p.name,
    data: p as unknown as Record<string, unknown>,
    updated_at: localUpdatedAt(p),
  }));

  const { error } = await supabase
    .from('projects')
    .upsert(rows, { onConflict: 'user_id,project_id' });

  if (error) {
    console.warn('[CloudSync] Batch push failed:', error.message);
  }
}
