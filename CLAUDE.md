# Project Brain

## What is this?
A Tauri v2 desktop app that lets users carry project context between AI platforms (ChatGPT, Claude, Grok, Perplexity, Gemini) without losing continuity. Local-first, privacy-first, open source.

- **GitHub:** github.com/krisninnis/project-brain
- **Local repo:** C:\Users\thoma\project-brain

## Stack
- Frontend: React 19 + TypeScript + Vite 7
- Backend: Rust (Tauri v2)
- State: Zustand
- Storage: Local JSON files in app data directory
- Styling: Plain CSS (dark theme, no frameworks)

## Golden Rule (NON-NEGOTIABLE)
> "A non-technical user should understand what to do within 5 seconds."

Simplicity over power. Always. Every single decision filters through this rule.

## Architecture
- `src/types/project-brain-types.ts` — all TypeScript types (Platform, ProjectMemory, AppSettings, etc.)
- `src/store/projectStore.ts` — Zustand store (single source of truth)
- `src/components/Layout/AppShell.tsx` — two-panel grid layout, routing between views
- `src/components/Layout/WelcomeScreen.tsx` — shown when no projects exist
- `src/components/Sidebar/` — project list + project cards + create form
- `src/components/Workspace/` — action bar, export buttons, paste zone, diff preview
- `src/components/Editor/` — project fields editor with EditableList + DecisionCard
- `src/components/Settings/` — full settings page (General, Privacy, Projects, Platforms, About)
- `src/components/Shared/` — Toggle, ConfirmDialog, PlatformIcon
- `src/utils/exportFormatters.ts` — platform-specific export generation (5 platforms)
- `src/utils/diffEngine.ts` — update detection, diff computation, merge
- `src/utils/platformConfig.ts` — platform names, colors, icons
- `src/services/tauriActions.ts` — all Tauri bridge functions (not hooks)
- `src/hooks/useTauriSync.ts` — load-on-mount + debounced auto-save
- `src-tauri/src/lib.rs` — Rust backend commands

## Tauri Commands (Rust backend)
| Command | Purpose |
|---|---|
| `scan_project_folder(folder_path)` | Scans a folder, returns files + metadata |
| `rescan_linked_folder(folder_path)` | Rescan with existence check |
| `save_project_file(project_name, project_data)` | Save JSON to projects/ |
| `load_projects()` | List all .json files |
| `load_project_file(file_name)` | Read a project JSON |
| `delete_project_file(file_name)` | Delete a project file |

## Key Rules
- Golden Rule: "A non-technical user should understand what to do within 5 seconds."
- Never use developer language in UI: no prompt, JSON, schema, context window, parse, token, metadata
- `linkedFolder.path` NEVER appears in any export
- User edits always win over scan data on rescan
- Toast notification on every user action
- Auto-save on field changes (debounced 500ms)
- Secrets sanitised before every export (hardcoded patterns + regex)
- All new schema fields must be optional (backward compatibility)
- DO NOT rewrite existing working code — extend it

## UI Label Mappings
| Internal field | UI label |
|---|---|
| currentState | What this project is about |
| decisions | Key Decisions |
| importantAssets | Important Files & Assets |
| aiInstructions | How the AI should help |
| nextSteps | Next Steps |
| openQuestions | Open Questions |

## Platform Colours
- ChatGPT: #10a37f
- Claude: #d97706
- Grok: #1d9bf0
- Perplexity: #20808d
- Gemini: #8b5cf6

## Secret Patterns (always sanitised before export)
- `sk-[A-Za-z0-9]{20,}` (OpenAI keys)
- `AKIA[0-9A-Z]{16}` (AWS keys)
- `ghp_[A-Za-z0-9]{36}` (GitHub tokens)
- `xoxb-[A-Za-z0-9-]+` (Slack tokens)
- `-----BEGIN [A-Z ]+ KEY-----`
- `eyJ[A-Za-z0-9+/=]{20,}` (JWT tokens)

## Build Status
1. ✅ Types + Zustand store (with AppSettings, gemini platform)
2. ✅ Two-panel layout + action bar + sidebar
3. ✅ Project editor with EditableList + DecisionCard
4. ✅ Export formatters (platform-specific, 5 platforms)
5. ✅ Paste zone + diff engine (detect/preview/apply)
6. ✅ Settings page (General/Privacy/Projects/Platforms/About)
7. ✅ Welcome screen (first launch)
8. ✅ Delete confirmation dialog
9. ✅ Sync status on export buttons
10. ✅ Workflow guide (3-step, dismissible)
11. ✅ Browser extension (Chrome)
12. ✅ Auth + cloud sync (Supabase)
13. ✅ Mobile companion (PWA — manifest, service worker, mobile CSS, icons)
14. ✅ Free tier gate (3-project limit for unsigned users, redirect to cloud backup)
15. ✅ Project templates (5 pre-filled templates in WelcomeScreen + Sidebar)
16. ✅ Markdown export (Save as file via Rust write_text_file)
17. ✅ Smart export mode (auto-condensed, Pro-gated)
18. ✅ Auto-updater (tauri-plugin-updater, checks GitHub releases)
19. ✅ Sidebar search (real-time, filters across name/state/goals/decisions)
20. ✅ Stripe billing (Vercel serverless functions, webhook → Supabase, Customer Portal)
21. ✅ GitHub Actions CI (type-check + Rust check on every push)
22. ✅ GitHub Actions release (builds all platforms, creates GitHub release + latest.json)
23. ✅ Marketing landing page (public/index.html served by Vercel at root)
24. ✅ Cloud sync reliability (exponential backoff retry, IndexedDB offline queue, pending badge)
25. ✅ Supabase RLS audit script (scripts/audit-rls.ts, npm run audit:rls) + SECURITY.md
26. ✅ GDPR compliance (Download all data in Privacy settings, Delete account in Cloud Backup, /api/delete-account endpoint)
27. ✅ ⌘K command palette (cmdk, AppShell-mounted, project search + quick actions)
28. ✅ Demo assets (docs/screenshots/ folder, docs/demo-script.md)

## Stripe Architecture
- `api/create-checkout.ts` — POST /api/create-checkout → returns Stripe Checkout URL
- `api/webhook.js` — POST /api/webhook → receives Stripe events, updates Supabase subscriptions table
- `api/create-portal.ts` — POST /api/create-portal → returns Stripe Customer Portal URL
- `src/services/stripe.ts` — frontend: calls API, opens URLs in system browser via tauri-plugin-opener
- `public/success.html` / `public/cancel.html` — post-payment landing pages (served by Vercel)
- `vercel.json` — routes /success, /cancel → static pages; /api/* → serverless functions
- Supabase `subscriptions` table: user_id, stripe_customer_id, stripe_sub_id, tier, status, updated_at
- Tiers: free (default) | pro | team — stored in Zustand as `subscriptionTier`
- Pro gate: Smart export mode disabled for free users (SettingsProjects + ExportButtons)
- Upgrade card shown in Settings → Cloud Backup for free signed-in users
- Manage subscription button shown for Pro/Team users (opens Customer Portal)

## GitHub Secrets needed for releases
- `TAURI_SIGNING_PRIVATE_KEY` — contents of the .key file (base64 string)
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` — password set during key generation
- (Optional, for macOS notarisation) APPLE_CERTIFICATE, APPLE_CERTIFICATE_PASSWORD, APPLE_SIGNING_IDENTITY, APPLE_ID, APPLE_PASSWORD, APPLE_TEAM_ID

## Vercel Env Vars
- `STRIPE_SECRET_KEY` — from Stripe Dashboard → Developers → API keys
- `STRIPE_PRO_PRICE_ID` — e.g. price_1TJuZBEFbT0A5uRXLErKulCo
- `STRIPE_TEAM_PRICE_ID` — e.g. price_1TJuaDEFbT0A5uRXz2Y2usPu
- `STRIPE_WEBHOOK_SECRET` — from Stripe webhook endpoint details
- `SUPABASE_URL` — same as VITE_SUPABASE_URL
- `SUPABASE_SERVICE_ROLE_KEY` — from Supabase Dashboard → Settings → API (service_role key)
- `APP_URL` — e.g. https://project-brain.vercel.app (no trailing slash)

## Security rules (non-negotiable, never override)
- Hardcoded Rust exclusion list for .env / keys / tokens — never user-configurable
- Regex patterns to scan: `sk-`, `AKIA`, `ghp_`, `xoxb-`, `-----BEGIN`, `eyJ`
- Sanitise each scanned file individually AND final export
- No telemetry without explicit user consent
- Clipboard watcher is opt-in only, schema-matched only
