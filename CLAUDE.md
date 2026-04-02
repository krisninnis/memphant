# Project Brain

## What is this?
A Tauri v2 desktop app that lets users carry project context between AI platforms (ChatGPT, Claude, Grok, Perplexity) without losing continuity. No cloud. Data stays on the user's machine.

- **GitHub:** github.com/krisninnis/project-brain
- **Local repo:** C:\Users\KRIS\project-brain-desktop

## Stack
- Frontend: React 19 + TypeScript + Vite 7
- Backend: Rust (Tauri v2)
- State: Zustand
- Storage: Local JSON files in app data directory
- Styling: CSS (dark theme)

## Golden Rule (NON-NEGOTIABLE)
> "A non-technical user should understand what to do within 5 seconds."

Simplicity over power. Always. Every single decision filters through this rule.

## Architecture
- `src/types/project-brain-types.ts` — all TypeScript types (new canonical types)
- `src/types/project.ts` — legacy types (still used by existing hooks/services)
- `src/store/projectStore.ts` — Zustand store (single source of truth)
- `src/hooks/useTauriSync.ts` — bridges Tauri commands ↔ Zustand store
- `src/components/Layout/AppShell.tsx` — two-panel grid layout
- `src/components/Sidebar/` — project list (Sidebar, ProjectCard)
- `src/components/Workspace/` — action bar, paste zone, export buttons, task field
- `src/components/Editor/` — project field editor (ProjectEditor, EditableField)
- `src-tauri/src/` — Rust backend commands (scan, save, load, delete)

## Jargon replacements — always use these
| Old (never use) | New (always use) |
|---|---|
| Upload JSON | Open a Saved Project |
| Memory Blocks | Key Information |
| Export | Copy for ChatGPT / Copy for Claude / Copy for Grok |
| Context | What this project is about |
| Instructions | How the AI should help |
| Editor | Project Details |

## Key Rules
- No JSON visible to users ever
- linkedFolder.path NEVER appears in any export
- User edits always win over scan data on rescan
- Toast notification on every user action
- Auto-save on field changes (debounced 500ms)
- Secrets are sanitised before any export (hardcoded Rust exclusion list + regex)
- All new schema fields must be optional (backward compatibility)

## Platform export formats
- **Claude** = XML structured tags
- **ChatGPT** = conversational prose
- **Grok** = compressed / minimal
- **Perplexity** = research-framed
- Every export ends with structured update format instructions so the AI can write back

## Current Build Priorities
1. ✅ Types + Zustand store
2. ✅ Two-panel layout + action bar
3. 🔲 Specialist task handoff
4. 🔲 Paste zone + structured update parser
5. 🔲 Platform-specific export formatting

## Security rules (non-negotiable, never override)
- Hardcoded Rust exclusion list for .env / keys / tokens — never user-configurable
- Regex patterns to scan: `sk-`, `AKIA`, `ghp_`, `xoxb-`, `-----BEGIN`, `eyJ` + base64
- Sanitise each scanned file individually AND final export
- First export per project shows a preview
- No telemetry without explicit user consent
- Clipboard watcher is opt-in only, schema-matched only

## Working rules
- **DO NOT rebuild from scratch** — extend existing code only
- All schema additions must be optional fields
- Do one step at a time, confirm before moving to next
- Keep responses direct and brief — no lengthy explanations
- When in doubt, ask before changing anything structural
