# Auth + Sync Guardrails

## Local-first rule
Local project data must remain safe even if cloud auth, sync, or network calls fail.

## Logout rule
Logout must always complete locally.
If remote signOut fails, hangs, or times out:
- local auth/session must still be cleared
- UI must leave loading state
- local projects must remain intact

## Disconnect rule
Disconnect Cloud is not the same as Logout.
Disconnect:
- stops cloud sync
- keeps the user local-first
- does not delete local projects

## Sync failure rule
If sync fails:
- local save still succeeds
- user sees clear status
- no silent data loss
- retries may happen later

## UI rule
Auth/sync UI must never get stuck forever in:
- Logging out...
- Disconnecting...
- Syncing...

Every long-running action must have:
- a timeout or failure path
- a visible completion path
- state reset in finally blocks where appropriate

## Change safety rule
Before merging any auth/sync changes, verify:
1. Login works
2. Logout works
3. Disconnect works
4. Reconnect works
5. Hard refresh preserves correct session state
6. Offline logout still completes locally

## No hidden behaviour rule
User-facing labels must match actual behaviour:
- Logout = end account session
- Disconnect Cloud = stop cloud backup but keep local work safe