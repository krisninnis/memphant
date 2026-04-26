# Folder watcher — current status

Last updated: 24 April 2026

## Done (on main)

- Phase 0: guardrail docs written and committed
- Phase 1: Rust watcher core — allowlist, notify, event normalization, dedupe, WatcherManager
- Phase 2: summariser — markdown output, git enrichment, watcher bridge, Tauri command
- Phase 3: export injection — Claude and ChatGPT exports include recent activity block
- Phase 4: React hook + UI block — live in ProjectEditor, working end to end

## What works right now

Open a project with a linked folder, make file changes, wait 30 seconds.
The recent activity block appears at the bottom of the editor and is
injected into every Claude and ChatGPT export automatically.

## Still to do

### Phase 5 — Project Memory view + settings toggle
- Per-project on/off toggle for the watcher
- "What Memephant is watching" inspection view
- Clear memory button
- Must exist before public launch (trust/privacy story)

### Phase 6 — Dogfood, harden, ship
- 1-2 weeks self-use on the real repo
- Secret leakage test (drop fake .env, confirm never appears in export)
- Watcher lifecycle test (quit app, switch projects — confirm watcher stops)
- Token budget test on a large repo
- Settings toggle defaulted OFF for existing users, ON for new users

## Known issues / deferred
- Duplicate useRecentActivity hook call (ProjectEditor + ExportButtons both poll)
- Chrome extension ESLint config needs browser/webextensions env
- Git history scrub needs Python installed

