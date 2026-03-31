# Project Brain — Claude Context File

## What this project is
A local-first desktop app that lets users store, manage, and transfer project memory/context between AI platforms (ChatGPT, Claude, Grok, Gemini, Perplexity). Users can pick up a project on any AI platform without re-explaining context. No cloud. Data stays on the user's machine.

- **GitHub:** github.com/krisninnis/project-brain
- **Local repo:** C:\Users\KRIS\project-brain-desktop

## Stack
- Frontend: React 19, Vite 7, TypeScript
- Backend: Rust (Tauri v2)
- Storage: Local JSON files in /projects folder
- TypeScript ~71%, CSS ~24%, Rust ~4%

## Golden Rule (NON-NEGOTIABLE)
> "A non-technical user should understand what to do within 5 seconds."

Simplicity over power. Always. Every single decision filters through this rule.

## Jargon replacements — always use these
| Old (never use) | New (always use) |
|---|---|
| Upload JSON | Open a Saved Project |
| Memory Blocks | Key Information |
| Export | Copy for ChatGPT / Copy for Claude / Copy for Grok |
| Context | What this project is about |
| Instructions | How the AI should help |
| Editor | Project Details |

## Current working features
- Save / load / delete projects
- Folder scan with tech stack detection
- 8 platform export prompts
- Structured AI update merge + validate
- Export sanitiser for secrets

## UX redesign in progress
- Single scrollable page (replacing 3 tabs)
- Toast notifications on every user action
- Auto-save
- Welcome screen for first-time users
- Active project always visibly highlighted
- Two primary actions always visible: **"Paste from AI"** and **"Copy for AI"**
- Show 4 main platforms, rest behind "More"

## ProjectMemory schema
```json
{
  "summary": "",
  "goals": [],
  "rules": [],
  "decisions": [],
  "currentState": "",
  "nextSteps": [],
  "openQuestions": [],
  "importantAssets": [],
  "changelog": [],
  "aiInstructions": {},
  "platformState": {},
  "lastPlatformUsed": "",
  "platformHistory": [],
  "schema_version": ""
}
```
All new fields must be **optional** for backward compatibility with existing saved projects.

## Platform export formats
- **Claude** = XML structured tags
- **ChatGPT** = conversational prose
- **Grok** = compressed / minimal
- **Perplexity** = research-framed
- Every export ends with structured update format instructions so the AI can write back

## Next build priorities (do in this order)
1. **Scan → auto-populate** — Rust parses README/package.json/file tree to auto-fill summary, goals, currentState, importantAssets
2. **Platform cursors** — platformState map (platform → lastExportedAt + stateHash), generate "Since your last session" diff header on export
3. **Auto-merge on paste** — detect valid JSON, auto-apply, toast confirmation, scroll to changes

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
