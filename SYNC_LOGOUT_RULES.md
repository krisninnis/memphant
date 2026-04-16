# Sync and Logout Rules

## Cloud connection states
Memphant can be in one of these states:
- Local only
- Signed in and synced
- Signed in but sync pending
- Signed in but sync error
- Logged out

## What "Logout" means
Logout means:
- the user is signed out of the cloud account
- cloud auth/session is cleared
- cloud sync stops immediately
- local projects remain on the device
- subscription/account state is reset in the UI
- the app returns to local-only mode

Logout must NOT:
- delete local projects
- silently delete cloud data
- leave ghost signed-in state behind
- leave background sync running

## What "Disconnect Cloud" means
Disconnect Cloud means:
- stop using cloud sync for this session/device
- keep local projects
- treat app as local-only until user reconnects/signs in again

Disconnect Cloud must NOT:
- delete local projects
- pretend the user is logged out if auth/session still exists
- leave sync queue active

## Local data truth
Local project data is the source of truth for the user experience.
The app must always preserve local projects unless the user explicitly deletes them.

## Cloud sync rule
Cloud sync exists to back up and merge project data across devices.
It must never make the user feel unsure whether their local project is safe.

## Conflict rule
Current simple rule:
- if remote is clearly newer, remote can update local
- if local is clearly newer, local should win on next push
- if unclear or risky, show a conflict state instead of silently overwriting

## Failure rule
If sync fails:
- local save still succeeds
- sync is marked pending or error
- user sees clear status
- retry can happen later
- no local project data is lost

## Minimum safe user expectation
A user should always be able to say:
- my local project is still here
- I know whether cloud sync worked
- logging out did not delete my work
- failed sync did not silently corrupt my project