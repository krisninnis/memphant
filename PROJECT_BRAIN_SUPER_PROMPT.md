# 🧠 PROJECT BRAIN — CEO SUPER PROMPT
## Full Department Briefing · SaaS Launch Readiness · Market Intelligence

> **Paste this entire document into Cowork to begin the next sprint.**
> Every section is a standing order. Execute all tasks unless explicitly told otherwise.
> The codebase is at: `C:\Users\thoma\project-brain`

---

## MEETING CALLED TO ORDER

**Present:** CEO (Kris), Frontend, Backend, Database, Security, SEO & Marketing
**Mission:** Take Project Brain from a working desktop beta (7.5/10) to a live SaaS product acquiring paying customers.
**Non-negotiable golden rule:** A non-technical user must understand what to do within 5 seconds.

---

## MARKET INTELLIGENCE BRIEFING (WHY THIS MATTERS NOW)

Before we build, here is what the market is screaming for. This is not opinion — it is sourced from Reddit (r/ChatGPT, r/ClaudeAI, r/artificial, r/LocalLLaMA 266K members), Hacker News, Indie Hackers, and Product Hunt.

### The Pain Is Real and Quantified
- Professionals lose **200+ hours per year** rebuilding context when switching between AI platforms
- Heavy multi-platform users waste **25–50 minutes per day** on context re-explanation
- Context Rot (AI degrading after 20–30 turns) forces new sessions — which destroys memory — which forces rebuilding — which is the vicious cycle Project Brain breaks
- Claude surged past ChatGPT in App Store rankings (March 2026) proving the switching wave is happening **right now**
- Only **12% of users** who wanted Notion + MCP integration actually got it working — because setup friction kills adoption

### What Competitors Are Missing
| Competitor | What They Do | What They Miss |
|---|---|---|
| ChatGPT Memory | Platform memory | Siloed — doesn't travel to Claude/Grok |
| Claude Projects | Project context | Can't import from ChatGPT, no export |
| Notion AI + MCP | Notes with AI | 88% failure rate on setup, still manual |
| Mem.ai | Personal recall | Not cross-platform, cloud-only |
| AI Context Flow | Multi-platform | Cloud-only, no privacy |
| Obsidian + AI | Local notes | No cross-platform export |
| MemGPT | Research-grade | Not a consumer product |

### The Gap Project Brain Fills (That Nobody Else Does)
1. **Local-first + cross-platform** — nobody does both
2. **Zero setup friction** — the only tool where non-technical users understand it in 5 seconds
3. **Structured context** (not raw transcripts) — smaller, cleaner, more effective per token
4. **Secrets sanitization** built in — the only privacy-first export tool
5. **Platform-native formats** — Claude gets XML, ChatGPT gets prose, Grok gets compressed — nobody else does this

### The Opportunity Window
The market is forming NOW. AI Context Flow, Memorr.ai, and Story Keeper all launched in the last 6 months. The window for being the category-defining tool is open for approximately 12–18 months before a well-funded competitor takes it. We need to ship.

---

## DEPARTMENT 1: FRONTEND

### Current State (from deep codebase scan)
- ✅ 10/10 core features implemented
- ✅ 5-platform export with platform-native formats
- ✅ Diff engine, paste zone, rollback, workflow guide
- ✅ Mobile bottom bar at 900px breakpoint
- ✅ Settings page with 5 tabs, mobile responsive
- ❌ No React Error Boundary (any crash = blank screen)
- ❌ No light/system theme (setting exists but ignored)
- ❌ No keyboard navigation hints
- ❌ No accessible focus indicators
- ❌ No lazy loading on settings tabs
- ❌ No memoization on list items (perf risk at scale)
- ❌ `runOnStartup` and `systemTray` settings exist but are stubs
- ❌ `defaultExportMode` setting exists but is never applied in export
- ❌ `secretsScannerLevel` setting exists but is never applied (always full scan)
- ❌ No onboarding flow after Welcome screen (user creates project, then what?)

### Frontend Tasks — Execute In This Order

**1. Add React Error Boundary (CRITICAL — do first)**
Wrap `<AppShell />` in `src/App.tsx` with a proper error boundary. When any component crashes, show a friendly recovery screen ("Something went wrong — your data is safe. Reload the app.") instead of a blank page.

**2. Wire the `defaultExportMode` setting**
In `src/components/Workspace/ExportButtons.tsx`, read `settings.projects.defaultExportMode` and pass it as the `mode` parameter to `formatForPlatform()`. The `exportFormatters.ts` already accepts this parameter — it just needs to be passed through.

**3. Wire the `secretsScannerLevel` setting**
In `src/utils/exportFormatters.ts`, the `sanitize()` function currently always applies all patterns. Read the setting from the Zustand store and if level is `standard`, only apply the most dangerous patterns (OpenAI keys, AWS keys, JWT tokens). If `strict`, apply all patterns. Thread the setting through `formatForPlatform()`.

**4. Add accessible focus indicators**
In `src/styles/app-shell.css`, add visible focus styles to all interactive elements:
```css
button:focus-visible, input:focus-visible, select:focus-visible, textarea:focus-visible {
  outline: 2px solid #d97706;
  outline-offset: 2px;
}
```

**5. Add post-creation onboarding hint**
After a user creates their first project (`createProject()` in `tauriActions.ts`), show a short inline hint in the workspace telling them: "Now fill in what this project is about, then click a platform button to copy it to your AI." This should auto-dismiss after 10 seconds or on first export. Add a `firstProjectHint` boolean to the Zustand store.

**6. Add keyboard shortcut hints**
Add a small `?` icon to the action bar that, when clicked, shows a modal with keyboard shortcuts:
- `Ctrl+N` — New project
- `Ctrl+E` — Copy for active platform
- `Ctrl+Z` — Undo last AI update
- `Escape` — Dismiss dialogs

**7. Memoize list components**
Wrap `ProjectCard` in `React.memo()` and `EditableList` items in `React.memo()` to prevent unnecessary re-renders when the project list updates.

**8. Add import/export UI**
The backend already handles `importProjectFromFile()`. Add a visible "Import project" button to the sidebar (below the "Create" button) that opens a file picker. Add an "Export project" button to the action bar that downloads the current project as a `.json` file. This is purely a UI addition — the logic exists.

**9. Add project count to sidebar header**
Show `{n} projects` in the sidebar header. Update the mobile bottom bar to show `🗂️ Projects (n)` where n is the count.

**10. Implement light theme (CSS only)**
The `theme` setting in General already has `dark | light | system`. Add CSS custom properties for all colors to `app-shell.css` and implement a light theme. Apply the class `theme-dark` or `theme-light` to `document.body` based on the setting. Read `window.matchMedia('(prefers-color-scheme: dark)')` for system mode.

---

## DEPARTMENT 2: BACKEND (Rust/Tauri)

### Current State
- ✅ 6 Tauri commands, all wired and working
- ✅ File safety: path sanitization, `.json` extension validation, no traversal
- ✅ Project metadata extraction (README, package.json, Cargo.toml)
- ✅ Sensitive file exclusion hardcoded
- ❌ Folder scanning is **synchronous** — will freeze UI on large repos
- ❌ No application data directory — projects saved relative to binary (fragile)
- ❌ No Tauri autostart plugin — "run on startup" is a stub
- ❌ No Tauri system tray plugin — "system tray" is a stub
- ❌ No backup mechanism
- ❌ No export-as-file Tauri command (needed for project export to disk)

### Backend Tasks — Execute In This Order

**1. Move projects to app data directory (CRITICAL)**
Currently projects are saved to `PathBuf::from("projects")` which is relative to the working directory of the binary — this breaks in production builds. Use Tauri's `app_data_dir()` instead:
```rust
use tauri::Manager;
// In each command, access via app handle:
fn get_projects_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let mut path = app.path().app_data_dir()
        .map_err(|e| e.to_string())?;
    path.push("projects");
    if !path.exists() {
        fs::create_dir_all(&path).map_err(|e| e.to_string())?;
    }
    Ok(path)
}
```
Update all commands (`save_project_file`, `load_projects`, `load_project_file`, `delete_project_file`) to accept `app: tauri::AppHandle` as first parameter and use `get_projects_dir(&app)`.

**2. Make folder scanning async**
The `scan_project_folder` command currently blocks the thread. Spawn a `tokio::task::spawn_blocking` or use `std::thread::spawn` and return progress via Tauri events. The frontend should show a spinner with a cancel option.

**3. Add `get_projects_path` command**
Add a command that returns the path where projects are stored — so the "View stored data" button in Settings Privacy can actually open the folder in the OS file explorer.
```rust
#[tauri::command]
fn get_projects_path(app: tauri::AppHandle) -> Result<String, String> {
    Ok(get_projects_dir(&app)?.display().to_string())
}
```
Then in `SettingsPrivacy.tsx`, call `invoke('get_projects_path')` and use `openPath()` from `@tauri-apps/plugin-opener` to reveal it.

**4. Add `export_project_file` command**
Add a command that lets the user save a project JSON to a user-chosen location (using the dialog plugin's `save()` function). This enables the "Export project" UI button.

**5. Add Tauri autostart plugin (make "Run on startup" work)**
Add `tauri-plugin-autolaunch` to `Cargo.toml`:
```toml
tauri-plugin-autolaunch = "2"
```
Register it in `lib.rs` and add a `set_autostart(enabled: bool)` command. Wire this to the "Run on startup" setting toggle.

**6. Add Tauri tray plugin (make "System tray" work)**
Add `tauri-plugin-tray` and implement a minimal system tray: show/hide window, quit. Wire to the "System tray" setting.

**7. Add project backup on save**
Before overwriting a `.json` file, copy it to `projects/.backups/projectname_YYYYMMDD.json`. Keep the last 5 backups per project. This gives users automatic rollback without a full version history system.

---

## DEPARTMENT 3: DATABASE & STORAGE

### Current State
- ✅ JSON file storage, fully working for desktop
- ✅ Browser fallback via localStorage
- ✅ Schema versioning (v0.2.0 → v1)
- ✅ Format normalization on load
- ❌ No SQLite — not needed for desktop, required for cloud
- ❌ No encryption at rest
- ❌ No transaction safety (concurrent edits can lose data)
- ❌ No cloud sync (Supabase installed but unused)
- ❌ No conflict resolution strategy

### Database Tasks — Execute In This Order

**Phase 1: Desktop Hardening (do now)**

**1. Add write safety**
In `tauriActions.ts` `saveToDisk()`, write to a temp file first (`projectname.json.tmp`), then atomically rename it to `projectname.json`. This prevents corruption if the app crashes mid-write.

**2. Implement the snapshot system**
The `AppSettings.projects.snapshotCount` setting exists (default 10) but is unused. When saving a project, also write a timestamped snapshot to `projects/.snapshots/projectname_ISO8601.json`. Trim to the last `snapshotCount` snapshots. Add a "Restore snapshot" UI (simple dropdown in action bar showing "Restored: 2 hours ago / Yesterday / 3 days ago").

**Phase 2: Cloud SaaS Layer (next sprint after desktop validated)**

**3. Design the Supabase schema**
Create the following tables (SQL ready to run in Supabase dashboard):
```sql
-- Users (handled by Supabase Auth, just the extension)
CREATE TABLE user_profiles (
  id UUID REFERENCES auth.users PRIMARY KEY,
  display_name TEXT,
  plan TEXT DEFAULT 'free', -- 'free' | 'pro' | 'team'
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Projects
CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES user_profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  data JSONB NOT NULL, -- full ProjectMemory JSON
  schema_version TEXT DEFAULT '0.2.0',
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_projects_user ON projects(user_id);

-- Sync log (for conflict resolution)
CREATE TABLE sync_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  device_id TEXT,
  synced_at TIMESTAMPTZ DEFAULT NOW(),
  change_summary TEXT
);

-- Subscription (mirrored from Stripe webhooks)
CREATE TABLE subscriptions (
  user_id UUID REFERENCES user_profiles(id) PRIMARY KEY,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  status TEXT, -- 'active' | 'trialing' | 'canceled'
  plan TEXT,
  current_period_end TIMESTAMPTZ
);
```

**4. Implement cloud sync in `tauriActions.ts`**
Add `syncToCloud(project: ProjectMemory)` and `syncAllFromCloud()` functions. These should:
- Check if user is authenticated (Supabase session)
- Use `upsert` on the projects table keyed by `id`
- Set `last_synced_at` on success
- Store a local `lastCloudSyncAt` timestamp per project in platformState
- Show sync status in the UI (green dot = synced, orange = pending, red = error)

**5. Implement last-write-wins conflict resolution**
For v1 cloud sync, use the simplest safe strategy: compare `updated_at` timestamps. If local is newer, push. If cloud is newer, pull. Show a toast: "Your project was updated on another device — local version kept." Add a "Merge" option later.

---

## DEPARTMENT 4: SECURITY

### Current State
- ✅ Secrets sanitization on all exports (regex patterns)
- ✅ Path traversal prevention in Rust
- ✅ No telemetry, no network calls (desktop)
- ✅ Sensitive file exclusion in folder scanner
- ❌ No encryption at rest on disk
- ❌ Secrets scanner level setting not wired
- ❌ No rate limiting (cloud)
- ❌ No CORS configuration (cloud)
- ❌ No audit log
- ❌ Clipboard exposure (export goes to clipboard, readable by other apps)

### Security Tasks — Execute In This Order

**1. Wire secretsScannerLevel (IMMEDIATE — settings UI already exists)**
In `exportFormatters.ts`, modify `sanitize()` to accept a level parameter:
- `standard`: Only redact patterns that are unambiguously API keys (sk-, AKIA, ghp_, xoxb-, eyJ)
- `strict`: Also redact anything matching generic `password =`, `secret =`, `token =` patterns
Read the level from the Zustand store inside `formatForPlatform()`.

**2. Add clipboard warning for sensitive projects**
After copying to clipboard, if the project has more than 3 importantAssets or the word "password", "secret", or "key" appears in any field, show a toast: "Heads up — make sure you're pasting into a trusted AI window."

**3. Implement basic encryption at rest (optional, power user setting)**
Add a "Encrypt local files" toggle to Settings Privacy (default off). When enabled, use AES-256-GCM via the `aes-gcm` Rust crate. Store the key derived from a user-set passphrase using Argon2. On load, prompt for passphrase if files are encrypted.

**4. For cloud version — implement Row Level Security in Supabase**
When implementing the Supabase schema (from Database dept), ensure every table has RLS:
```sql
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can only access their own projects"
  ON projects FOR ALL
  USING (user_id = auth.uid());
```
Never allow server-side queries without `auth.uid()` check.

**5. Add Content Security Policy to Tauri**
In `tauri.conf.json`, add a strict CSP:
```json
"security": {
  "csp": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self' https://*.supabase.co"
}
```

**6. Add audit log for destructive actions**
When a user deletes a project or clears all data, write an entry to a local `audit.log` file in the app data directory: `[ISO timestamp] [action] [project name]`. This is a 5-minute implementation with significant trust value.

---

## DEPARTMENT 5: SEO & MARKETING

### Market Position (From Research)
Project Brain occupies the only uncontested position in the market:
> **"The only local-first, privacy-preserving way to carry your project memory across every AI platform."**

This is not a claim — it is factually true. No competitor does both local-first AND cross-platform simultaneously.

### Target Customer Segments (In Priority Order)
1. **Developer/indie hacker using 2+ AI tools daily** — Claude for writing, ChatGPT for code, Grok for research. Loses 25–50 min/day to context rebuilding. Lives on Reddit, Hacker News, Twitter/X.
2. **Knowledge worker managing complex projects** — Consultant, PM, writer. Uses AI extensively but not on one platform. Pain: "I explained this whole project to ChatGPT last week and now I have to explain it to Claude again."
3. **Privacy-conscious professional** — Lawyer, doctor, finance. Will not use cloud AI memory tools. Local-first is not a nice-to-have, it is a requirement.
4. **Teams with AI workflows** — Post-v1. Multiple people sharing project context. Needs cloud sync.

### Positioning Statement
> Project Brain is the memory layer between you and your AI tools. Stop re-explaining your projects. Copy your context once, paste it anywhere. Your data never leaves your computer.

### SEO Tasks — Execute In This Order

**1. Write the landing page**
Create `landing/index.html` (or a Vercel/Netlify-hosted page). It must contain:
- **H1:** "Never re-explain your project to an AI again"
- **Subheading:** "Project Brain keeps your project memory in one place and exports it perfectly for ChatGPT, Claude, Grok, Perplexity, or Gemini — in seconds."
- **Three feature blocks:** (1) Copy for any AI instantly, (2) Paste the reply back — it auto-updates, (3) Your data stays on your computer
- **Social proof placeholder** (will fill with real testimonials)
- **Download button** (GitHub releases)
- **Email capture** ("Get early access to cloud sync") — use a free Beehiiv/Mailchimp form
- **Target keywords:** "AI context switching", "cross-platform AI memory", "ChatGPT to Claude", "project memory AI", "local AI memory tool"

**2. Create the Product Hunt launch kit**
Prepare:
- Tagline (240 chars): "Stop re-explaining your project every time you open a new AI. Project Brain keeps your context in one place and exports it perfectly for ChatGPT, Claude, Grok, Perplexity, or Gemini."
- 3 screenshots: (1) Project editor, (2) Export buttons with sync age, (3) Paste zone showing diff detection
- First comment (written by maker): Explain the pain point + why you built it + invite first users to try it
- Schedule for a Tuesday or Wednesday, 12:01 AM PST

**3. Write the Reddit launch post**
Target subreddits: r/ChatGPT (4M+), r/ClaudeAI (500K+), r/artificial (1.5M+), r/SideProject, r/indiehackers
Title: "I built a free tool that carries your project context between ChatGPT, Claude, Grok, and Perplexity — your data stays local"
Body: Lead with the pain point ("I was spending 30 minutes a day re-explaining the same project to different AIs..."), show a GIF of the workflow, explain local-first privacy, link to GitHub/download.

**4. Create a 60-second demo GIF**
Show the complete workflow in one GIF:
1. Open Project Brain, select a project (2s)
2. Click "Copy for Claude" (1s)
3. Paste into Claude, Claude responds (3s — can be sped up)
4. Paste Claude's response into Project Brain (2s)
5. See the diff preview, click Apply (2s)
6. Show the project updated (1s)
This GIF is your most important marketing asset. Put it on the landing page, Product Hunt, Reddit, and the README.

**5. Set up the GitHub repo for discoverability**
- Add topics: `ai-tools`, `context-management`, `cross-platform`, `local-first`, `privacy`, `chatgpt`, `claude-ai`, `tauri`, `react`, `typescript`
- Write a proper README with: what it does (1 sentence), the demo GIF, install instructions, platform list, and "why local-first?" section
- Add a CHANGELOG.md with v0.1.0 entry
- Pin the repo on GitHub profile

**6. Pricing strategy (implement at cloud launch)**
Based on market research:
- **Free tier:** 3 projects, all 5 platforms, desktop only, no cloud sync
- **Pro ($9/month):** Unlimited projects, cloud sync, snapshot history, priority support
- **Team ($29/month per seat):** Everything in Pro + shared projects, team context templates
- **Rationale:** $9 is the sweet spot for indie devs (comparable to a single AI subscription). Team tier is where real revenue comes from.

**7. Email onboarding sequence**
When users sign up for cloud sync (Supabase Auth), send:
- **Day 0:** Welcome + quick start GIF + "Your first project brief" template
- **Day 3:** "Did you know?" — 3 power user tips (keyboard shortcuts, folder scanning, rollback)
- **Day 7:** "How's it going?" — soft ask for feedback + Product Hunt review request
- **Day 14:** Announce Pro features if on free tier

---

## DEPARTMENT 6: DEVOPS & DEPLOYMENT

### Current State
- ✅ Tauri v2 builds for Windows, Mac, Linux
- ✅ Vite build pipeline
- ✅ TypeScript strict mode
- ✅ ESLint configured
- ❌ No CI/CD pipeline
- ❌ No automated releases
- ❌ No error monitoring (Sentry etc.)
- ❌ No update mechanism in app
- ❌ No Docker for cloud layer
- ❌ No environment configuration

### DevOps Tasks — Execute In This Order

**1. Set up GitHub Actions for CI**
Create `.github/workflows/ci.yml`:
- On every PR: run `npx tsc --noEmit`, `npm run lint`, `cargo check`, `cargo clippy`
- On every push to `main`: also run `npm test`
- Block PRs that fail any check

**2. Set up GitHub Actions for releases**
Create `.github/workflows/release.yml`:
- Trigger on `v*` tags (e.g. `v0.1.0`)
- Build for Windows (NSIS + MSI), Mac (DMG), Linux (AppImage + DEB)
- Upload artifacts to GitHub Release
- This is the standard Tauri action: `tauri-apps/tauri-action@v0`

**3. Add Tauri updater**
Add `tauri-plugin-updater` to `Cargo.toml`. Configure update endpoint (GitHub releases JSON). Show an "Update available" banner in the app header when a new version is detected. This is how users know to upgrade without reinstalling manually.

**4. Add basic error monitoring**
Install `@sentry/react` and `@sentry/tauri`. Wrap in `Sentry.init()` with the user's consent (add "Send anonymous crash reports" toggle to Settings General, default off). Only capture errors — no personal data, no project content.

**5. Set up Vercel/Netlify for the landing page**
Create `landing/` directory with the landing page HTML/CSS. Deploy to Vercel. Point a custom domain at it (`projectbrain.app` or similar). Configure Vercel Analytics for basic pageview tracking.

---

## EXECUTION PRIORITY ORDER

This is the CEO directive. Execute in this exact order:

### Phase 1: Beta Ready (This Sprint)
1. ✅ Error Boundary in React (Frontend #1)
2. ✅ Move projects to app data directory (Backend #1) — CRITICAL for production
3. ✅ Wire `defaultExportMode` (Frontend #2)
4. ✅ Wire `secretsScannerLevel` (Frontend #3 + Security #1)
5. ✅ Add `get_projects_path` command + wire "View stored data" button (Backend #3 + Security)
6. ✅ Add project backup on save (Backend #7)
7. ✅ Write safety (temp file rename) in saveToDisk (Database #1)
8. ✅ Add import/export UI (Frontend #8)
9. ✅ Post-creation onboarding hint (Frontend #5)
10. ✅ GitHub README + repo topics + demo GIF (Marketing #5 + #4)
11. ✅ GitHub Actions CI (DevOps #1)
12. ✅ GitHub Actions releases (DevOps #2) — get the binary downloadable

### Phase 2: Public Beta Launch
13. Landing page live (Marketing #1)
14. Product Hunt launch kit ready (Marketing #2)
15. Reddit post draft ready (Marketing #3)
16. Email capture on landing page
17. Tauri updater live (DevOps #3)
18. Light theme (Frontend #10)
19. Keyboard shortcuts (Frontend #6)

### Phase 3: Cloud SaaS
20. Supabase schema created (Database #3)
21. Supabase Auth wired (email + Google)
22. Cloud sync implemented (Database #4)
23. Stripe billing integrated (Pro at $9/month)
24. Row-level security on all tables (Security #4)
25. Team tier infrastructure

---

## WHAT SUCCESS LOOKS LIKE

**Month 1 (Desktop Beta):**
- 500 downloads from GitHub + Product Hunt
- 50 active daily users
- NPS > 40 from early users
- Zero critical bugs reported

**Month 2 (Cloud Beta):**
- 200 cloud accounts created
- 20 Pro conversions ($180 MRR)
- Email list: 500 subscribers
- Product Hunt #1 in "Productivity Tools" for launch day

**Month 3 (Growth):**
- 2,000 downloads
- 100 Pro subscribers ($900 MRR)
- First team accounts
- Press coverage from 1–2 AI newsletters

**Month 6 (Scale):**
- 10,000 downloads
- 500 Pro + Team subscribers (~$5,000 MRR)
- Browser extension beta
- Partnership conversations with 1–2 AI platforms

---

## TECHNICAL DEBT REGISTER (Do Not Let These Slip)

| Issue | Severity | Owner | Target |
|---|---|---|---|
| No React Error Boundary | HIGH | Frontend | Phase 1 |
| Projects saved relative to binary | HIGH | Backend | Phase 1 |
| Folder scanning is synchronous | MEDIUM | Backend | Phase 2 |
| No unit tests (diffEngine, exportFormatters) | MEDIUM | Frontend | Phase 1 |
| `defaultExportMode` setting unused | MEDIUM | Frontend | Phase 1 |
| `secretsScannerLevel` setting unused | MEDIUM | Security | Phase 1 |
| Supabase client installed but unused | LOW | Backend | Phase 3 |
| No light/system theme | LOW | Frontend | Phase 2 |
| List items not memoized | LOW | Frontend | Phase 2 |
| No visible keyboard focus indicators | LOW | Frontend | Phase 2 |
| No audit log for destructive actions | LOW | Security | Phase 2 |
| Rust error types are plain Strings | LOW | Backend | Phase 3 |

---

## FINAL CEO NOTE

The market research confirms this: **people are in pain, the competitors are half-solutions, and the window is open.** The difference between Project Brain and everything else is the golden rule — "a non-technical user understands in 5 seconds." That is not a tagline. That is the product philosophy that makes us win.

The desktop beta is a 7.5/10 product that will become a 9/10 product after Phase 1. That 9/10 desktop product is the foundation every phase of the SaaS is built on.

**Do not rush to cloud. Nail the desktop first. The desktop builds trust. Trust converts to subscriptions.**

Meeting adjourned. Begin Phase 1 immediately.

---

*Generated from: deep codebase scan (449 lines Rust, 4,800+ lines TypeScript, 3,082 lines CSS) + forum research (Reddit, Hacker News, Indie Hackers, Product Hunt) + competitor analysis (AI Context Flow, Mem.ai, MemGPT, Memorr.ai, Story Keeper, Notion AI, Obsidian AI, Claude Projects, ChatGPT Memory)*
