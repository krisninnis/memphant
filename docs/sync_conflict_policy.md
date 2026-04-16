# Sync Conflict Resolution Policy

Version: 1.0  
Status: Implemented  
Last updated: 2026-04-16

---

## Overview

Memephant is a **local-first** application. Your data lives on your device. Cloud backup (Supabase) is a secondary copy — a safety net and multi-device sync layer. This policy defines exactly what happens when local and cloud data disagree.

---

## What Counts as a Conflict?

A conflict occurs when the **same project** exists both locally (on-device JSON file) and remotely (Supabase row) with **different content and different timestamps**. This happens when:

- You edited the project on one device while offline
- You edited on one device, then synced from a second device before the first device had synced
- A previous sync failed partway through, leaving the cloud partially updated

---

## Resolution Strategy: Last-Write-Wins with Local Bias

Memephant uses **last-write-wins (LWW)** conflict resolution, with a **local bias** for tie-breaking:

| Scenario | Winner | Rationale |
|---|---|---|
| `remote.updatedAt` **strictly newer** than `local.updatedAt` | **Remote wins** | The cloud copy is more recent — likely a second device with newer work. |
| `local.updatedAt` **strictly newer** than `remote.updatedAt` | **Local wins** | Your current device has newer work — cloud is stale. |
| Timestamps are **equal** | **Local wins** | Tie → preserve local (local-first bias). |
| Project only exists locally | **Local kept** | Not yet synced to cloud; will push on next cycle. |
| Project only exists remotely | **Remote added** | Sync a project from another device. |

This policy is chosen because Memephant is predominantly a single-user, sequential-use tool. True simultaneous multi-device editing is rare. LWW gives a deterministic, understandable outcome without requiring user intervention in the common case.

---

## Edge Cases

### Timestamps are identical but content differs
Local wins (tie-breaker). The remote copy is not imported. This can happen if two devices import the same project from a backup simultaneously. If the remote copy matters, use **Manual Sync** in Settings → Cloud Backup to force a full reconciliation.

### Network fails mid-sync
The partially-completed sync is safe because:
- Supabase writes are upserts — a partial batch write does not corrupt existing rows
- Failed local projects are queued in IndexedDB (`syncQueue.ts`) and retried automatically on next app launch or manual sync
- The pull phase is read-only — it never deletes local data

### A project is deleted on one device, exists on another
Currently, delete operations are replicated immediately when online and best-effort when offline (via `deleteCloudProject`). A project deleted while offline is not currently re-added on the next pull — the local delete takes precedence (local-first bias).

### Clock skew between devices
If two devices have significantly different clocks, the "newer" timestamp may be misleading. To reduce clock-skew risk, `updatedAt` timestamps are set using `new Date().toISOString()` at the point of local write (not on the cloud). A ±5 second skew is generally inconsequential for this use case.

---

## User Notification

When the remote version of a project overwrites a local version (remote was newer), the app shows a toast notification:

> *"Cloud updated N project(s) from a newer cloud version."*

This is informational — no action required. The update is a normal multi-device sync, not a data loss event.

If you believe your local version was correct and should not have been overwritten, use the **checkpoint system**: every copy-for-AI operation saves a checkpoint snapshot (`project.checkpoints[]`). You can inspect previous checkpoint states in the project editor.

---

## Conflict Backup (Future)

The existing Rust backend already has a `backup_project_file` command that saves up to 5 rolling backup copies of a project in `{appData}/projects/backups/{project}/`. In a future release, Memephant will automatically call this command *before* overwriting a local project with a newer remote version, giving you a recoverable copy. This is noted here as a planned improvement, not yet wired to the sync flow.

---

## Implementation Notes

| Location | What it does |
|---|---|
| `src/services/cloudSync.ts` → `pullAndMerge()` | Compares `updatedAt`, applies LWW, returns `{ merged, changed, conflicts }` |
| `src/hooks/useTauriSync.ts` | Receives `conflicts[]`, shows toast if any overwrites occurred |
| `src/components/Settings/SettingsSync.tsx` | Same in manual sync and sign-in flows |
| `src/services/syncQueue.ts` | IndexedDB queue for offline-failed push operations |
| `src-tauri/src/lib.rs` → `backup_project_file()` | Rolling backups (not yet called on sync conflict) |

---

## Testing Conflict Scenarios

To manually test conflict resolution:

1. **Offline edit test**: Turn off Wi-Fi, edit project A, turn Wi-Fi back on, sync. Verify your local edit survived.
2. **Remote-newer test**: Edit project A in the Supabase dashboard directly (set `updated_at` to a future timestamp), then sync. Verify the dashboard version is pulled in and a toast appears.
3. **Tie-breaker test**: Set local and remote `updated_at` to the same ISO string via direct database edit. Verify local copy survives after sync.
