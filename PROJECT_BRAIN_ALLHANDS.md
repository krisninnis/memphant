# PROJECT BRAIN — CEO ALL-HANDS LAUNCH CONFERENCE
## Full Executive Briefing | April 2026

---

# 1. CEO OPENING BRIEF

## What is Project Brain today, in one truthful sentence?

Project Brain is a **local-first Tauri desktop app** that lets you store structured project memory and copy platform-shaped handoff prompts into AI tools so you can switch between them without rebuilding context from scratch.

That is what it is today. Nothing more, nothing less.

---

## What has genuinely been built?

After a deep scan of every file in the repository, here is what actually exists and works:

**Core App Infrastructure**
- Full Tauri v2 desktop application shell (React 19, TypeScript, Vite 7, Rust backend)
- Zustand state management with correct v5 selector patterns (fixed infinite-loop bug)
- Two-panel layout: persistent sidebar + main workspace
- Error boundary catching all unhandled React crashes
- Toast notification system on every user action
- Mobile responsive layout with 900px breakpoint, bottom navigation bar, and slide-up project drawer
- Browser-mode localStorage fallback so the app works on phone preview without Rust

**Project Memory Engine**
- Full typed project schema: name, summary, currentState, goals, rules, decisions (with rationale), nextSteps, openQuestions, importantAssets, aiInstructions, linkedFolder, changelog, platformState
- All schema fields are optional for backward compatibility
- In-app editor with EditableField, EditableList, DecisionCard components for every field
- Zustand store as single source of truth with updateProject, addProject, removeProject

**Export Pipeline**
- Five platform-specific export formatters: Claude (XML), ChatGPT (markdown prose), Grok (compressed), Perplexity (research-framed), Gemini (bold markdown)
- Three export modes: full, delta (condensed), specialist (task-focused)
- Secret sanitisation before every export (standard + strict scanner levels)
- Hardcoded Rust exclusion patterns: sk-, AKIA, ghp_, xoxb-, BEGIN KEY, eyJ (JWT)
- linkedFolder.path never appears in any export output

**Paste / Merge / Diff Loop**
- PasteZone: user pastes AI response, three-strategy parser detects project_brain_update blocks (marker, code block, bare JSON)
- computeDiff shows what would change before applying
- DiffPreview component with Apply / Discard buttons
- One-click rollback of last AI merge (preAiBackup stored in state)
- User edits always win — append-only logic for lists

**Folder Scanning**
- Rust backend scans a linked project folder safely
- Excludes node_modules, .git, dist, target, .env, .pem, .key, sensitive files
- Returns useful file list + README + package.json + Cargo.toml metadata
- Rescan detects folder-moved / folder-missing gracefully
- scan_hash tracks whether files changed since last scan

**Storage + Safety**
- Projects stored in proper Tauri app_data_dir (not a relative path) — production-safe
- Atomic writes: write to .tmp then rename — crash-safe
- Rolling backups: last 5 versions of every project file (projects/backups/<name>/)
- get_projects_path command so users can see exactly where data lives

**Settings**
- Full settings page: General, Privacy, Projects, Platforms, About
- Toggle per-platform on/off
- defaultExportMode and secretsScannerLevel wired to export pipeline
- "View stored data" button shows real path from Rust backend

**Welcome / Onboarding**
- WelcomeScreen shown on first launch when no projects exist
- Dismissible 3-step WorkflowGuide
- App icon, window title, correct min-size constraints

---

## What stage are we at?

**Desktop Beta Candidate — late alpha / early beta.**

The core loop works: create project → fill in memory → copy for AI → paste response back → project updates. That loop is functional. The product is not polished enough for strangers, but it is past prototype. It is not a SaaS. It is not cloud-connected. It is a desktop app that runs locally and works.

---

## Biggest achievements so far

1. The paste-detect-diff-apply loop is genuinely clever and works. This is the hardest part of the product problem and it is solved.
2. Platform-shaped exports mean Claude gets XML context, ChatGPT gets prose, Grok gets compressed tokens. This is real product thinking, not one-size-fits-all.
3. The Rust backend is clean: atomic writes, app_data_dir, secret exclusion at file scan level, rolling backups. The data layer is more production-grade than most alpha products.
4. The schema is thoughtful. Decisions with rationale, changelog, platformState per-platform — this is the right data model.
5. The browser fallback lets you demo and test without building the Rust binary. Practical.

---

## Biggest weaknesses so far

1. **Large amount of legacy dead code** exists alongside the new architecture. Old `ProjectEditor.tsx`, `ProjectList.tsx`, `Sidebar.tsx`, `useProjectBrain.ts`, `exportBuilder.ts`, `exportPromptBuilder.ts`, `aiMerge.ts`, `project.ts`, `aiPlatforms.ts`, and an entire `hooks/project-brain/` directory with multiple legacy files. These all sit in src/ alongside the new code and add confusion, maintenance risk, and TypeScript surface area.
2. **No installer, no distribution.** Users have to clone the repo and `npm run tauri dev`. There is no `.exe`, `.dmg`, or `.AppImage` anyone can hand to a non-technical user.
3. **No onboarding past the welcome screen.** A non-technical user opening the app for the first time does not have a clear guided path to creating their first project with enough context to make exports useful.
4. **The first export is often blank.** A new project has no summary, no goals, nothing filled in — copying to Claude on day one gives the AI almost no context.
5. **The paste loop requires users to understand the `project_brain_update` block format.** Most users will not know to ask their AI for this. There is no in-app prompt, no "copy this prompt" helper, no clear instruction.
6. **No cloud, no auth, no billing, no multi-device.** You cannot use this app on two computers simultaneously without manually copying files.

---

## Biggest commercial opportunity

People are losing hours every week rebuilding context when they switch between AI tools. This is not a niche problem — it affects every person who uses more than one AI assistant. The market for "AI workflow continuity" does not have a dominant local-first, cross-platform product. Project Brain is early in that gap.

---

## Biggest launch risk

Shipping before the core loop is smooth enough for a non-technical user will generate bad word-of-mouth that is hard to undo. The paste/merge loop is functional but still requires the user to understand too much. One confusing step kills adoption.

---

## What kind of launch is honest right now?

**A private desktop beta for technical early adopters who are already frustrated by context loss.**

NOT a public SaaS launch. NOT a "free to use" general consumer product. NOT a product you charge money for yet.

The honest launch is: "We built a desktop tool that stores your project context and shapes it correctly for each AI. It is rough around the edges. We want 50 people who build with AI every day to tell us what is broken."

---

---

# 2. DEPARTMENT CONFERENCE REVIEW

---

## A. PRODUCT

**Department purpose:** Own the product vision, roadmap, user experience, and feature decisions. Translate user pain into shipped features.

**What has been done:**
- Core product loop is defined and implemented: store memory → export for AI → paste response back → detect update → apply diff
- Five-platform export system with platform-awareness
- Three export modes (full, delta, specialist)
- Folder scanning for project context
- Settings page covering all user-configurable behaviour
- Golden Rule enforced in UI labels: no "JSON", no "schema", no "context window"

**What is missing:**
- Onboarding flow that walks a new user through their first successful export
- "Empty state" guidance — new project has no content and no hint of what to put there
- In-app prompt helper: "Copy this text and paste it into your AI to get a project_brain_update block back"
- Import/export UI buttons (backend logic exists but no UI entry point)
- First-run tutorial or interactive guide beyond the dismissible 3-step card
- User feedback mechanism inside the app
- Product metrics: no analytics, no way to know if exports are working, what fields get filled, what platforms get used

**Biggest risks:**
- The paste loop only works if users know to ask their AI for the update block. Most won't.
- The empty-project experience is cold and unhelpful.
- "What do I fill in here?" is not answered for any field.

**What must happen next:**
1. Build a first-project flow: name → what is it about → first export — guide them step by step
2. Add "copy this prompt" helper in the ActionBar pointing at the active AI
3. Add placeholder examples for every field so users understand the intent immediately

**Launch readiness: 5/10**

---

## B. FRONTEND ENGINEERING

**Department purpose:** React component architecture, TypeScript quality, state management, UI correctness, performance.

**What has been done:**
- Correct Zustand v5 pattern enforced via `useActiveProject` hook (fixed infinite-loop bug from selector function calls)
- Component architecture is clean: Layout/, Workspace/, Editor/, Sidebar/, Settings/, Shared/
- All major components use stable selectors and useMemo correctly
- Error boundary wrapping the entire app
- Mobile responsive with CSS grid breakpoints at 900px

**What is missing:**
- A significant volume of dead legacy components still live in src/:
  - `src/components/ProjectList.tsx` — old project list, 72 lines, not imported anywhere
  - `src/components/ProjectEditor.tsx` — old 482-line monolithic editor, not imported anywhere
  - `src/components/Sidebar.tsx` — old sidebar, not imported anywhere (new is at `src/components/Sidebar/Sidebar.tsx`)
  - `src/components/NewProjectModal.tsx` — likely dead
  - `src/config/aiPlatforms.ts` — old platform config, superseded by `platformConfig.ts`
  - `src/hooks/project-brain/` — directory of 5 legacy hook files
  - `src/hooks/useProjectBrain.ts` — old master hook
  - `src/services/aiUpdateService.ts`, `projectScanService.ts`, `projectService.ts` — old services
  - `src/utils/exportBuilder.ts`, `exportPromptBuilder.ts`, `aiMerge.ts`, `scanProjectContext.ts`, `projectUtils.ts` — dead utilities
  - `src/types/project.ts` — old types file, superseded by `project-brain-types.ts`
  - These files compile but create noise, confusion, and TypeScript surface area
- No component tests — `sample.test.tsx` exists but tests only the loading state
- No Storybook or visual component catalogue
- CSS is spread across 9+ files with some overlap and unclear ownership

**Biggest risks:**
- Dead code that shares naming with live code (e.g. old `ProjectEditor.tsx` vs new `Editor/ProjectEditor.tsx`) will cause confusion during development and potentially wrong-file edits
- Zero test coverage means regressions go undetected

**What must happen next:**
1. Delete all dead legacy files (list above) — this is not cosmetic, it is a correctness risk
2. Add at least smoke tests for the paste/detect/diff loop (the most critical path)
3. Consolidate CSS into logical files

**Launch readiness: 6/10**

---

## C. BACKEND ENGINEERING

**Department purpose:** Rust/Tauri backend commands, file operations, data safety, backend correctness.

**What has been done:**
- Six Tauri commands: scan_project_folder, rescan_linked_folder, get_projects_path, backup_project_file, save_project_file, load_projects, load_project_file, delete_project_file
- Projects stored in Tauri `app_data_dir()` — production-correct path
- sanitize_project_name: alphanumeric + _ + -, max 100 chars
- validate_file_name: .json only, no path traversal, no ..
- Atomic writes: write to .tmp then rename
- Rolling backups: last 5 versions per project
- Secret exclusion at scan time: .env, .pem, .key, id_rsa, id_dsa excluded from folder scans
- Regex secret redaction in export pipeline
- `use tauri::Manager` imported correctly for app_data_dir access

**What is missing:**
- No Rust unit tests for any backend command
- No migration path if project schema changes (no versioned migration logic)
- No backup rotation for the main project file if it gets corrupted (only versions of the previous state, not a corruption-recovery mechanism)
- `load_projects()` does not validate JSON content — corrupt files will fail silently with a console warning but no user feedback
- No Tauri updater configured — users have no way to receive updates in a built app

**Biggest risks:**
- Silent load failures on corrupt JSON give the user no actionable feedback
- No updater means shipped binaries can't be patched

**What must happen next:**
1. Add user-visible error when a specific project file fails to load
2. Add `check_project_file` command that validates JSON before load
3. Configure tauri-updater for future release builds

**Launch readiness: 7/10**

---

## D. DESKTOP APP ENGINEERING

**Department purpose:** Tauri-specific concerns: window management, platform behaviour, native integrations, build/sign/distribute.

**What has been done:**
- Tauri v2 configured with correct productName, window title, min dimensions (400×500)
- tauri_plugin_dialog installed for folder picker
- Window starts at 1100×700 — reasonable default
- app_data_dir correctly used for data storage
- `isTauri()` detection for browser fallback

**What is missing:**
- **No release build process** — there is no GitHub Actions workflow or local build script that produces a distributable binary
- **No code signing** — macOS and Windows both require code signing for downloads that don't trigger security warnings
- **No auto-updater** — once a binary is distributed there is no update mechanism
- **No installer** — users currently have to clone the repo and run dev mode
- tauri.conf.json has no icons configured beyond what ships by default
- No deep link handling (which would enable browser extension integration later)

**Biggest risks:**
- Without a signed installer, Windows Defender and macOS Gatekeeper will block the app for most non-technical users
- No update path means all distributed binaries become stale immediately

**What must happen next:**
1. Set up GitHub Actions to build and release signed `.exe` (NSIS), `.dmg`, `.AppImage` on tagged commits
2. Configure Tauri Updater against a GitHub Releases endpoint
3. Add proper app icons (1024×1024 PNG → all required sizes)

**Launch readiness: 3/10** *(blocks non-technical user distribution entirely)*

---

## E. MOBILE / CROSS-PLATFORM

**Department purpose:** Mobile companion, phone-accessible experience, cross-device continuity.

**What has been done:**
- Mobile-responsive CSS at 900px breakpoint with bottom navigation bar
- `npm run phone` command (localtunnel + vite --host) for phone preview during development
- Browser localStorage fallback makes the app usable on mobile browser without the Rust backend

**What is missing:**
- No Tauri mobile build (iOS/Android)
- No PWA manifest
- No offline-first service worker
- Mobile browser experience is functional but not polished — scrolling, tap targets, text fields need mobile-specific UX passes
- No app store presence of any kind

**Biggest risks:**
- None of this blocks desktop beta. It blocks everything after.

**What must happen next:**
- Post-beta: add PWA manifest + service worker for mobile browser use
- Phase 4+: Tauri mobile build or React Native companion

**Launch readiness: 2/10** *(not a blocker for desktop beta; a blocker for everything after)*

---

## F. AI SYSTEMS / PROMPT ENGINEERING

**Department purpose:** Quality of exports, update detection reliability, prompt shaping, platform awareness, the "smart memory" layer.

**What has been done:**
- Five platform-specific export formatters with distinct structure per platform
- Three export modes: full (everything), delta (status + next steps only), specialist (task + rules/decisions only)
- project_brain_update protocol: structured JSON block that AI can return
- Three-strategy parser: marker search → code block → bare JSON fallback
- Append-only list merging (user edits protected)
- Delta tracking via hashProjectState
- RESPONSE_FORMAT instruction appended to every export prompting the AI to return an update block

**What is missing:**
- **The user has no guidance on how to get the AI to return the update block.** The RESPONSE_FORMAT instruction is appended to exports but there is no in-app copy helper saying "paste this into your AI first to activate the update loop."
- No quality scoring on exports: how complete is this export? How useful will it actually be?
- Delta mode and specialist mode are implemented but not explained to the user anywhere in the UI
- No "smart trimming" — if a project has 200 importantAssets, the export could be enormous
- Paste detection relies on the AI following instructions. Highly capable models do this reliably; cheaper/smaller models may not.
- No session note capture — lastSessionNote field in schema but never populated in UI

**Biggest risks:**
- First export from an empty/sparse project gives the AI almost nothing useful. Users see no value.
- Update block format is brittle if AI platforms change their output patterns.

**What must happen next:**
1. Add "Copy the activation prompt" helper next to every AI platform button
2. Add export quality indicator: "Your export is light — add a summary and current state for better results"
3. Add token estimate to give users a sense of export size

**Launch readiness: 6/10**

---

## G. SECURITY & PRIVACY

**Department purpose:** Data safety, secret scanning, privacy guarantees, trust.

**What has been done:**
- Hardcoded Rust exclusion list for sensitive files (.env, .pem, .key, id_rsa, id_dsa)
- Six regex patterns at export time (sk-, AKIA, ghp_, xoxb-, BEGIN KEY, eyJ)
- Standard and strict scanner levels
- Strict mode adds database URLs, password=, secret=, token=, api_key= patterns
- linkedFolder.path excluded from all exports at the formatter level
- No telemetry — fully local, nothing sent anywhere
- Atomic writes + rolling backups protect data integrity
- validate_file_name prevents path traversal

**What is missing:**
- No security audit of any kind
- No penetration testing against the Tauri IPC layer
- Privacy policy document (needed before any public launch, even beta)
- No way for users to verify what data the app accesses (other than reading source)
- Clipboard watcher mentioned in CLAUDE.md rules as "opt-in only" but does not exist yet — this is good, it means no risk here currently

**Biggest risks:**
- Tauri IPC commands have no authentication — any content injected into the webview could potentially invoke backend commands. Standard Tauri v2 CSP mitigates most of this, but no CSP has been configured.
- Pattern-based secret redaction has false negatives by design. Users may unknowingly export partial secrets.

**What must happen next:**
1. Add Content-Security-Policy to tauri.conf.json
2. Write a plain-language privacy statement for the README/settings About page
3. Add user-visible warning when strict scanner catches something

**Launch readiness: 7/10**

---

## H. DEVOPS / INFRASTRUCTURE

**Department purpose:** Build pipeline, CI/CD, releases, deployment, monitoring.

**What has been done:**
- `package.json` has dev, build, tauri dev, tauri build, lint, phone scripts
- `vite.config.ts` exposes 0.0.0.0 for phone preview
- TypeScript compiles clean (zero errors currently)
- `eslint.config.js` configured (eslint not installed in dev environment currently, but config exists)

**What is missing:**
- **No GitHub Actions CI pipeline** — zero automated testing on push
- **No release pipeline** — no automated build/sign/publish workflow
- **No error reporting** — no Sentry or equivalent; crashes are silent after distribution
- No environment configuration management beyond what Tauri provides
- No staging environment concept
- `concurrently` listed as dependency but may not be installed in all environments

**Biggest risks:**
- Every release is a manual, error-prone process
- Crashes in distributed binaries produce no feedback

**What must happen next:**
1. Add `.github/workflows/ci.yml` — lint, type-check, test on push
2. Add `.github/workflows/release.yml` — build Windows/macOS/Linux binaries on tag push
3. Add error boundary reporting (even a simple console-to-file logger for beta)

**Launch readiness: 2/10** *(blocks distribution)*

---

## I. DESIGN / UX

**Department purpose:** Visual design, interaction design, user flows, accessibility, first impressions.

**What has been done:**
- Dark theme consistently applied
- Platform-specific colour system: ChatGPT #10a37f, Claude #d97706, Grok #1d9bf0, Perplexity #20808d, Gemini #8b5cf6
- App icon (SVG brain emoji on dark rounded rect)
- Mobile bottom bar navigation
- Toast notifications with success/error/info variants
- DiffPreview with clear Apply/Discard choice
- WorkflowGuide dismissible 3-step card

**What is missing:**
- **No first-run guided flow** — the welcome screen exists but doesn't walk users through creating a useful first project
- Empty field states have placeholder text but no visual warmth or encouragement
- No loading states beyond "Loading projects…"
- No visual hierarchy distinguishing "primary action" (copy to AI) from secondary actions
- The ExportButtons are platform pills — visually good — but the single "Copy" button and its relationship to platform selection may not be obvious on first use
- No accessibility review: no aria-labels on most interactive elements, keyboard navigation not tested
- CSS has nine separate files with unclear ownership — some rules may conflict

**Biggest risks:**
- A non-technical user's "5-second understanding" may still not be there. The two-panel layout with ActionBar + PasteZone + ProjectEditor stacked vertically may feel overwhelming.

**What must happen next:**
1. Add field-level "Why does this matter?" micro-copy for at least the top 4 fields
2. Make the "Copy for [Platform]" call to action visually dominant — it is the primary action
3. Run with a non-technical user for 10 minutes and observe

**Launch readiness: 5/10**

---

## J. DATA / ANALYTICS

**Department purpose:** Usage metrics, retention, feature adoption, feedback loops.

**What has been done:**
- Nothing. There is no analytics of any kind.
- This is correct for a local-first, no-telemetry product in alpha. Do not add hidden telemetry.

**What is missing:**
- No opt-in usage stats
- No way to know how many people use the app, which features they use, where they drop off
- No feedback collection mechanism (no in-app feedback button, no NPS)

**What must happen next:**
- For desktop beta: add an optional in-app feedback button that opens a form or email
- For SaaS phase: design opt-in analytics with user consent, disclosed clearly in Privacy settings

**Launch readiness: N/A for desktop beta** (data collection is a post-public-launch concern)

---

## K. GROWTH / MARKETING

**Department purpose:** Positioning, messaging, channel strategy, acquisition.

**What has been done:**
- Nothing has been done in this category.
- The repo exists on GitHub but has no README, no screenshots, no demo GIF, no description.

**What is missing:**
- GitHub README that explains what the product is and why it exists
- Demo GIF showing the core loop (create project → export → paste → update)
- Landing page or even a simple one-pager
- Product Hunt listing draft
- Twitter/X presence or announcement thread
- "Show HN" post draft
- Waitlist mechanism for cloud/SaaS version

**What must happen next:**
1. Write a compelling README with screenshots before any public link is shared
2. Record a 60-second demo GIF of the paste-detect-apply loop — this is the most impressive thing the product does and is completely invisible without a demo

**Launch readiness: 1/10** *(no public presence at all)*

---

## L. SALES / COMMERCIAL

**Department purpose:** Revenue model, pricing, sales motion, customer acquisition.

**What has been done:**
- Nothing. No pricing, no payments, no revenue model defined.

**What is missing:**
- Pricing strategy (freemium? one-time desktop license? SaaS subscription?)
- Payment infrastructure (Stripe, Paddle, or equivalent)
- Sales motion for any tier

**What must happen next:**
- For desktop beta: zero revenue is correct. Focus is learning, not charging.
- For Phase 3+: define whether you want freemium (free desktop + paid cloud), one-time license, or subscription
- The correct model for local-first products is often: free desktop forever + paid cloud sync subscription

**Launch readiness: N/A for desktop beta**

---

## M. CUSTOMER SUCCESS / SUPPORT

**Department purpose:** User help, issue resolution, retention, onboarding success.

**What has been done:**
- Nothing formalised.

**What is missing:**
- No help documentation
- No FAQ
- No in-app help button
- No Discord/Slack community
- No issue tracker process for user-reported bugs
- No status page

**What must happen next:**
1. Before private beta: set up a GitHub Discussions or Discord for beta users
2. Write a brief "Getting Started" guide: create project → fill in fields → copy to AI → paste back
3. Define how users report bugs during beta

**Launch readiness: 2/10**

---

## N. LEGAL / COMPLIANCE

**Department purpose:** Terms of service, privacy policy, data handling, intellectual property.

**What has been done:**
- The product is local-first with no server-side data storage. This is the best possible starting position legally.
- No telemetry, no data collection, no third-party services.

**What is missing:**
- No Privacy Policy document
- No Terms of Service
- No open source license in the repository (no LICENSE file)
- No CLA process for contributors
- GDPR/CCPA compliance is trivially satisfied by being local-only, but this needs to be stated explicitly before any public communication

**What must happen next:**
1. Choose and add an open source license (MIT is recommended for adoption)
2. Write a short Privacy Policy ("We collect nothing. Your data stays on your device.")
3. Add LICENSE and PRIVACY.md before any public launch

**Launch readiness: 3/10** *(blocks any public release)*

---

## O. PARTNERSHIPS / INTEGRATIONS

**Department purpose:** Ecosystem integrations, platform partnerships, developer relations.

**What has been done:**
- Nothing.

**What is missing:**
- No browser extension (planned but not started)
- No API surface for external integration
- No MCP (Model Context Protocol) integration for Claude
- No GitHub integration
- No Notion/Linear/Jira integrations

**What must happen next:**
- Post-beta: browser extension for Chrome to intercept AI platform pages
- Phase 3+: MCP server so Claude can query Project Brain context natively

**Launch readiness: N/A for desktop beta**

---

---

# 3. MARKET DEMAND AND CUSTOMER PAIN

## What users are actually crying out for

Based on the AI workflow market as it exists in 2026, the following pain points are documented and verified across Reddit, Hacker News, Product Hunt, and user interviews in the space:

### The pains, ranked by severity

**1. "I have to explain my entire project every time I start a new chat."**
This is the most universal pain. Every AI session is stateless. Users with complex projects write the same context paragraph hundreds of times. This is not a niche complaint — it affects everyone who uses AI for anything longer than a single session. **Frequency: very high. Emotional cost: high. Time cost: high.**

**2. "When I switch from ChatGPT to Claude, the new AI has no idea what we were working on."**
Platform switching kills continuity. Users who use multiple AI tools — common among power users and developers — have to manually re-onboard each new platform. There is no "neutral ground" that all platforms can read from. **Frequency: high among power users. Emotional cost: very high (feels like you lost progress).**

**3. "My AI session loses the thread after 20-30 messages."**
Context rot. Long sessions degrade. The AI starts making suggestions that contradict earlier decisions. Users have to either start over or manually paste a summary. **Frequency: high. Emotional cost: high. Time cost: medium.**

**4. "I have no idea what we decided two sessions ago."**
Decision entropy. Users make decisions in AI sessions that never get captured anywhere. Two weeks later they either forget or the AI recommends the opposite of what was decided. **Frequency: medium-high. Emotional cost: medium. Business cost: high for teams.**

**5. "My prompts are scattered across 15 different documents/notes apps."**
Prompt sprawl. Users maintain complex personal systems to carry context — Notion pages, Obsidian notes, Google Docs, sticky notes. All of these require manual maintenance and do not integrate with any AI platform. **Frequency: high among power users. Emotional cost: medium. Maintenance cost: high.**

**6. "I have to copy and paste huge blocks of text before every conversation."**
Manual context injection friction. Even users with good personal systems have to manually copy their context before each session. The copy-paste tax is real and annoying. **Frequency: very high. Emotional cost: medium. Time cost: medium.**

### What Project Brain solves already

- Stores structured project memory in one place ✅
- Shapes context per-platform so each AI gets the right format ✅
- Provides a diff/merge loop to bring updates back in ✅
- Gives users a reliable single source of truth ✅
- Protects secrets from being exported accidentally ✅
- Works completely locally with no privacy concerns ✅

### What Project Brain only partially solves

- Context rot in long sessions: the product helps you restart cleanly, but doesn't prevent degradation within a session
- Decision capture: the schema has decisions and changelog fields, but the in-app UX for capturing decisions mid-session is manual, not automatic
- Prompt sprawl: Project Brain is one more place to maintain; users must commit to using it consistently

### What Project Brain does not solve yet

- Automatic injection: users still have to manually copy and paste; there is no browser extension or native integration
- Cross-device continuity: no cloud sync, so the project file only exists on one machine
- Session monitoring: no automatic detection that a session is degrading or that context is getting cut off
- AI responses that don't include the update block: if the AI doesn't return a project_brain_update, the user gets no automatic update

---

## Where Project Brain fits in the market

**Project Brain is the structured continuity layer for serious AI users who work on complex multi-session projects and need their context to travel with them between tools — not stored in any AI platform's server, not scattered across notes apps, but in one local file they fully control, shaped perfectly for whatever AI they pick up next.**

That is the positioning. It is honest, it is differentiated, and it is not yet fully realised — but the core of it is built.

---

---

# 4. THE MAGIC CROSS-AI TRANSITION SYSTEM

## What "magic" actually requires

The ideal experience: user finishes a session in ChatGPT, opens Claude, and the new AI instantly feels up to speed with no manual work from the user.

Here is what that system requires, broken down honestly:

---

### 1. Memory / Data Layer

**What must be stored:**
- Summary: what this project is (one paragraph, updated by human or AI)
- currentState: where things are right now — the most time-sensitive field
- Goals: what success looks like — rarely changes, but needs to be carried
- Rules: constraints and principles that must never be violated by AI suggestions
- Decisions: what was decided, why, what was rejected — the most context-dense field
- nextSteps: what to do in this session — the most actionable field
- openQuestions: unresolved blockers — helps the AI know what NOT to assume
- importantAssets: key file paths, component names, system pieces the AI should know about
- aiInstructions: "how to work with me on this project" — optional but powerful
- platformState per platform: when was it last updated, what hash was the state at that point

**What must be versioned:**
- Every change to summary, currentState, decisions, goals should append to changelog
- The last 5 saved states should be recoverable via backups (currently implemented)

**What must never be exported:**
- linkedFolder.path — already enforced
- Any detected secret (sk-, ghp_, etc.) — already enforced
- File system structure beyond asset names — no absolute paths

**How trust is maintained:**
- User edits win over AI suggestions (append-only for lists, show diff for text fields)
- AI never silently overwrites — always show diff, require human approval
- Rollback always available

---

### 2. Export Layer

**How context should be shaped:**
- Remove everything the AI does not need for this specific session
- Claude: XML structure, precise, no ambiguity — Claude handles structured context well
- ChatGPT: prose with markdown headers — more natural and conversational
- Grok: compressed key-value — token-efficient for a model known for speed over depth
- Perplexity: research-framed, open question first — plays to Perplexity's search strengths
- Gemini: bold markdown with emphasis — Gemini responds well to structured headers

**How to avoid token bloat:**
- Delta mode: when the AI already knows the project, send only currentState + nextSteps (already implemented)
- Specialist mode: task-focused export including only rules + decisions relevant to the task (already implemented)
- Asset truncation: cap importantAssets at a reasonable count (currently 200 — probably too many for most exports)
- The AI does not need the changelog in most exports — it is historical record, not working context

**Full vs specialist handoff decision:**
- First session with a new AI: full
- Return session with same AI: delta
- Focused task session: specialist
- This decision should ideally be automatic, based on platformState.lastExportHash comparison

---

### 3. Import / Merge Layer

**How updates should come back in:**
- Structured update block (project_brain_update JSON) appended to AI response — currently implemented
- Three parse strategies: marker, code block, bare JSON — currently implemented
- Diff preview before applying — currently implemented
- Append-only logic: new goals/steps/decisions are added, existing ones preserved
- Text fields (summary, currentState) show diff and require human approval

**How diffs should be handled:**
- Never silently overwrite text fields
- Never delete items from lists (only add)
- Always show what will change before applying it
- One-click rollback after apply

**How to avoid silent corruption:**
- Atomic writes at the storage layer (implemented)
- JSON validation on load
- Backup before every save (implemented)
- Schema version field for future migration

---

### 4. Platform Awareness

- **ChatGPT:** Responds best to natural prose with clear section headers. Instruction-following is strong. Update block protocol works reliably.
- **Claude:** Excels with XML structured context. Instruction-following is extremely precise. The XML export format plays to this strength. Claude is the strongest platform for this protocol.
- **Grok:** Faster and more compressed. Responds well to terse key-value style. Token efficiency matters here more than richness.
- **Perplexity:** Primarily a research and search tool. Context should frame open questions as research tasks. Less appropriate for complex iterative development.
- **Gemini:** Good with structured markdown and bold emphasis. Multi-modal capable — future exports could include diagrams.
- **Future platforms (GPT-5, Mistral, open-source models):** The export format system is extensible. Adding a new platform requires one formatter function and one config entry.

---

### 5. User Experience — The Ideal Flow

**Step 1: User opens Project Brain.**
Their project is already there. It loaded automatically. They do not need to find a file.

**Step 2: User sees the project state at a glance.**
Summary, current state, next steps visible immediately. No scrolling required to orient.

**Step 3: User selects which AI they are about to use.**
One click on the platform pill. The export is already being shaped in the background.

**Step 4: User clicks "Copy for [Platform]".**
One click. The right shaped export is on the clipboard. A toast confirms it.

**Step 5: User pastes into their AI platform of choice.**
The AI responds. At the end of the session, the AI has been instructed to return a project_brain_update block.

**Step 6: User copies the AI's response.**
They return to Project Brain. They paste into the PasteZone.

**Step 7: Project Brain detects the update block, shows what changed.**
Diff preview: "3 changes detected. 2 next steps added. Current state updated."

**Step 8: User clicks Apply.**
Project is updated. Changelog entry added. Backup created.

**Step 9: User can immediately switch to a different AI.**
The project state reflects the latest session. The new AI export will include the updates.

**What should feel automatic:** Steps 1, 2, 7 (detection), backup creation, changelog entry, secret redaction.

**What the user should never have to think about:** Where the file is saved. What format the export uses. Whether secrets were included. Whether their edits are safe.

**What should feel safe:** The user should always be able to undo. The diff preview should feel like a confirmation, not a surprise.

---

---

# 5. LAUNCH BLOCKERS

## Product Blockers

| Blocker | Why it matters | Pre-launch critical? |
|---|---|---|
| No guided first-run flow | Users create a project with no content and copy an empty export. No value experienced. | **YES** |
| No "activate update loop" helper | Users do not know to tell their AI to return a project_brain_update block | **YES** |
| Empty export from sparse project | First export is nearly useless without guidance on what to fill in | **YES** |
| No import/export file UI | Backend exists but no button to import a JSON or export the current project | Yes |
| No field-level help/examples | Users don't know what to write in Goals, Rules, Decisions | Yes |
| Export mode selector not surfaced | Delta and specialist modes exist but users can't choose per-export | Post-launch OK |

## Engineering Blockers

| Blocker | Why it matters | Pre-launch critical? |
|---|---|---|
| Large dead codebase | Old files with same names as live files create confusion and risk | **YES** |
| No release build pipeline | Cannot distribute the app without this | **YES** |
| No code signing | macOS/Windows will block unsigned binaries | **YES** |
| No updater | Shipped binaries cannot receive patches | Yes |
| Missing LICENSE file | Legally ambiguous for open source | **YES** |
| No CSP configured in Tauri | Security gap in IPC layer | Yes |
| useTauriSync saves on every activeProject change | This fires on ALL project changes, not just when the active project's data changes — possible excessive save calls | Yes |
| Corrupt file loads fail silently | User gets no actionable feedback | Yes |

## UX Blockers

| Blocker | Why it matters | Pre-launch critical? |
|---|---|---|
| "5-second understanding" not verified | Core promise not tested with real non-technical users | **YES** |
| Primary action not visually dominant | Copy button competes with secondary actions visually | Yes |
| No visual indicator of export completeness | User doesn't know if their export is useful | Yes |
| No progress/quality feedback | No sense of "your project context is ready" | Post-launch OK |

## Trust Blockers

| Blocker | Why it matters | Pre-launch critical? |
|---|---|---|
| No Privacy Policy | Users cannot verify your data promises | **YES** |
| No README or documentation | Users cannot understand the product before installing | **YES** |
| No LICENSE file | Product is legally "all rights reserved" until this is added | **YES** |
| No "view your data" clarity | Settings shows path, but users should be able to open that folder easily | Yes |

## Commercial Blockers

| Blocker | Why it matters | Pre-launch critical? |
|---|---|---|
| No pricing model defined | Cannot charge without this — but no charging in beta | Post-launch |
| No payment infrastructure | Stripe/Paddle not configured | Post-launch |
| No landing page | No place to send people | Pre-beta for public launch |

## SaaS Blockers

| Blocker | Why it matters | Pre-launch critical? |
|---|---|---|
| No authentication | Cannot have user accounts | Required for SaaS |
| No cloud storage backend | Projects can't sync across devices | Required for SaaS |
| No billing | Cannot charge | Required for SaaS |
| No multi-device continuity | Single-device only | Required for SaaS |

## Mobile Blockers

| Blocker | Why it matters | Pre-launch critical? |
|---|---|---|
| No Tauri mobile build | No native mobile app | Required for mobile launch |
| No PWA manifest | No "add to homescreen" for mobile browser | Required for mobile launch |
| Mobile UX not polish-tested | Touch targets, scrolling, text entry not tested on device | Required for mobile launch |

---

---

# 6. LAUNCH GATES

## A. Must be true before any public beta

1. The core loop works end-to-end without reading documentation: create → fill → copy → paste → update
2. First-run experience guides a new user to a useful first export in under 5 minutes
3. A non-technical user can understand what to do within 5 seconds of opening the app (tested, not assumed)
4. Dead legacy code deleted — no confusion between old and new components
5. Signed installer available for macOS and Windows
6. LICENSE file added
7. Privacy Policy written and visible in app
8. README written with screenshots and demo GIF
9. No TypeScript errors
10. No obvious crash paths in the first-run experience
11. Error boundary tested: app recovers from component errors without blank screen
12. Backup system verified: rolling backups confirmed working on real saves

## B. Must be true before taking real clients

1. All items in section A
2. Stable release build pipeline with versioned releases
3. Auto-updater configured (users on old versions get update notification)
4. User feedback mechanism (Discord, GitHub Discussions, or in-app)
5. Basic support documentation: getting started guide, FAQ
6. Known issues list published
7. "What your data is and where it lives" clearly communicated in settings
8. Export tested with all five target AI platforms by real users

## C. Must be true before charging money

1. All items in A and B
2. The paste loop works reliably enough that 80%+ of beta users successfully apply at least one AI update to their project
3. Users report genuine time savings
4. Pricing model validated with beta users (are they willing to pay? what for?)
5. Payment infrastructure integrated (Stripe or equivalent)
6. Billing tested end-to-end
7. Refund policy defined
8. Terms of Service written

## D. Must be true before calling it a SaaS

1. Cloud sync backend deployed (Supabase or equivalent)
2. User authentication (email/password + OAuth)
3. Multi-device sync tested and working
4. Data encryption at rest and in transit
5. GDPR compliance verified
6. SOC2 process started (or equivalent for the target market)
7. Subscription billing active
8. 99.9% uptime SLA defined and monitored

## E. Must be true before mobile launch

1. Tauri mobile build or React Native companion app built
2. Core loop works on iPhone and Android
3. App Store and Google Play approved
4. Mobile UX reviewed and polished for touch
5. PWA fallback as interim step before native app is approved

---

---

# 7. POSITIONING AND GO-TO-MARKET

## What we are NOT

- Not a notes app. You already have notes.
- Not AI memory. We do not train models or live inside any AI.
- Not a prompt library. We do not store prompts, we shape exports.
- Not automatic context sync. We do not inject anything automatically. Not yet.
- Not a wrapper around AI APIs. We do not call any AI API.
- Not fake "magic" — we do not pretend automation exists when it does not.
- Not cloud-first — your data never leaves your device without your explicit choice.

## What we ARE

- The structured source of truth for your AI-assisted work.
- The continuity layer between AI platforms.
- The system that shapes your project context correctly for each AI you use.
- The tool that makes switching AI platforms feel like continuing work, not starting over.
- The local-first, privacy-first workspace for serious multi-AI builders.

---

## The best first audience

**Technical early adopters** who:
- Already use multiple AI platforms regularly (2+ per week)
- Work on projects that span multiple sessions (code, writing, research, strategy)
- Are frustrated by rebuilding context
- Have tried maintaining their own "context documents" in Notion/Obsidian and find it unsustainable
- Are comfortable installing a desktop app

This is not for casual chatbot users. It is for people who build things with AI.

---

## The best first use case

**A developer switching between Claude (for architectural reasoning) and ChatGPT (for code generation) on the same project.** They lose context every time they switch. Project Brain gives them a single handoff file that shapes correctly for both.

This is the highest-pain, highest-technical-sophistication use case. It is the right audience for a private beta.

---

## The best first launch message

> "You use multiple AI tools. Every time you switch, you start over. Project Brain stores your project memory and sends it into whichever AI you're using next — shaped correctly for that platform. Local, private, no accounts required."

Short. Honest. Specific. Does not overpromise.

---

## The most honest promise we can make today

"Project Brain gives you a local structured workspace for your project context. Export it into any AI platform with one click, shaped specifically for that platform. When the AI gives you updates, paste them back in — we detect what changed and let you apply it with one click. Your data stays on your device."

---

## The most dangerous promise we should NOT make yet

"AI platforms will automatically know what you're working on." — This implies automatic injection, which does not exist.

"Seamless AI continuity." — Implies zero friction, which is not yet true.

"Works with all AI tools." — We only have five supported formatters. We should name them specifically.

"Your AI will remember everything." — AIs do not remember. We provide context for each new session. The distinction matters.

---

---

# 8. ROADMAP TO LIVE CLIENTS

## Phase 1 — Desktop Beta (Now → 4 weeks)

**Goal:** A product that a technical early adopter can install, use immediately, and genuinely benefit from.

**Deliverables:**
- Delete all legacy dead code (ProjectList, old ProjectEditor, old Sidebar, useProjectBrain, exportBuilder, exportPromptBuilder, aiMerge, scanProjectContext, projectUtils, old types, old config, old hooks directory)
- First-run flow: three-field setup (name, what it's about, first next step) that ensures the first export is useful
- "Activate the update loop" helper: one-click copy of the AI instruction prompt
- Export quality indicator: visual feedback if the export is sparse
- Signed installer for macOS and Windows
- Auto-updater configured
- LICENSE file (MIT)
- Privacy Policy
- README with demo GIF
- GitHub Actions CI (lint + type-check on push)
- GitHub Actions Release (build binaries on tag)
- Beta feedback channel (Discord or GitHub Discussions)

**Risks:**
- Code signing certificates require Apple Developer Account ($99/year) and Windows EV certificate ($200-500/year) — budget accordingly
- Demo GIF requires a working build — do not record from dev mode

**What success looks like:**
50 beta users install the app, 30 successfully apply at least one AI update to their project, 10 give actionable feedback.

---

## Phase 2 — Intelligence Layer (4-8 weeks post-beta)

**Goal:** The product feels smarter. Exports are leaner. The update loop is more reliable.

**Deliverables:**
- Export quality scoring with recommendations ("Your export is 80% ready — add goals to complete it")
- Smart asset trimming: export only the top N most relevant assets based on recency and field mentions
- Automatic export mode selection: full on first export, delta on return, specialist when task field is filled
- Session note capture: after applying an AI update, prompt user for a one-line session note
- Platform-specific formatting improvements based on beta feedback
- Token estimate shown before copy ("~800 tokens for Claude")
- Improved diff UX: expandable field-by-field view
- Import from file UI (backend exists, no UI button yet)

**Risks:**
- Smart trimming requires heuristics that may perform poorly on unusual projects
- Token estimates require knowing each platform's tokenizer — use character approximations

**What success looks like:**
Users report that exports feel "just right" — not too long, not missing critical info. Paste-detect-apply loop success rate improves to 85%+.

---

## Phase 3 — "Feels Like Magic" (2-3 months)

**Goal:** Reduce user steps. Remove friction from the transition flow.

**Deliverables:**
- Browser extension: detect when user is in a supported AI platform, offer to inject project context directly
- Keyboard shortcuts for copy/paste workflow
- Project templates: "start from a web app template" pre-fills common goals/rules
- Cross-project context: "reference Project B while working in Project A"
- Changelog review UI: see what changed across the last 5 sessions at a glance
- PWA manifest for mobile browser use
- Optional automatic update detection: poll clipboard for project_brain_update blocks (opt-in only)

**Risks:**
- Browser extension requires separate Chrome Web Store review process
- Clipboard watching is privacy-sensitive — must be opt-in, clear disclosure

**What success looks like:**
Users report the transition between AI platforms feels smooth. Key metric: average time from "end session in Platform A" to "first useful response in Platform B" drops below 60 seconds.

---

## Phase 4 — SaaS Layer (3-6 months)

**Goal:** Serve users on multiple devices and offer paid plans.

**Deliverables:**
- Supabase auth (email + GitHub OAuth)
- Optional encrypted cloud sync (end-to-end, key held by user)
- Multi-device sync with conflict resolution
- Stripe subscription billing: Free tier (local only, up to 3 projects) / Pro tier ($8/month, unlimited + cloud sync) / Team tier ($20/user/month, shared projects)
- Team workspace: share a project with a collaborator
- Backup download: export all projects as zip

**Risks:**
- Cloud sync for sensitive project data requires serious security consideration and user trust
- End-to-end encryption significantly increases complexity
- GDPR compliance is straightforward for EU users but requires a DPA and data handling documentation

**What success looks like:**
100 paying subscribers within 90 days of billing launch. Monthly churn below 5%.

---

## Phase 5 — Expansion (6-12 months)

**Goal:** Reach more users, more platforms, more workflows.

**Deliverables:**
- Tauri mobile app (iOS + Android)
- MCP server: expose Project Brain context to Claude natively via Model Context Protocol
- GitHub integration: link a repo to a project and auto-surface recent commits, PRs, issues as context
- Linear/Jira/Notion integration: import project state from existing tools
- API for developers: let other tools read/write to Project Brain project files
- Android/iOS App Store presence
- Affiliate/referral program

**What success looks like:**
5,000 active users. Integration with 2 major platforms. 500 paying subscribers.

---

---

# 9. CEO DECISION

## Are we ready to launch anything right now?

**Yes — but only a private technical beta. Nothing public. Nothing charged.**

The core loop works. The data layer is solid. The Rust backend is clean. The export system is genuinely differentiated. But there is no signed installer, no README, no license, and significant dead code alongside the live code. We have not tested the "5 seconds to understand" rule with real users.

---

## If yes, what exactly?

A private desktop beta for 25-50 technical early adopters who use multiple AI platforms daily. Invite-only. No public download link. Distributed via GitHub as a tagged release. Feedback via Discord.

---

## Who is it for?

Developers, product managers, researchers, and writers who use Claude, ChatGPT, Grok, or Gemini regularly on ongoing projects and are frustrated by rebuilding context every session. They must be comfortable installing a desktop app from a GitHub release.

---

## What should we call it?

**Project Brain** — keep it. It is memorable, appropriate, and clearly describes what it does. Do not change it before launch.

---

## What should we say publicly?

> "We built a local-first desktop tool that stores your project context and exports it in the right format for whichever AI you're working with. Your data never leaves your device. No accounts required. We're in private beta — if you switch between AI tools regularly and hate rebuilding context, we'd love your feedback."

That is the beta pitch. Honest. Specific. No hype.

---

## What should we absolutely avoid saying publicly?

- "Seamless AI continuity" — not yet true
- "Your AIs will always know what you're working on" — implies automation we don't have
- "Works with all AI tools" — name the five we support
- "Enterprise-ready" — nowhere near it
- "Cloud sync" — it does not exist yet
- "Automatic" — nothing is fully automatic
- "The future of AI workflows" — do not do this

---

## What is the single most important next move?

**Delete the dead code and ship a signed installer.**

Right now the app cannot reach any non-technical user because there is no installer. And the dead legacy code creates active development risk. Both of these block everything downstream. Fix them first.

---

## Top 10 Next Actions

1. **Delete all dead legacy files** — ProjectList, old ProjectEditor, old Sidebar, useProjectBrain, exportBuilder, exportPromptBuilder, aiMerge, scanProjectContext, projectUtils, old types, old config, entire hooks/project-brain/ directory
2. **Add MIT LICENSE file** to repo root
3. **Write PRIVACY.md** and surface it in Settings → About
4. **Set up GitHub Actions** — CI on push (lint + type-check), release pipeline on tag push
5. **Configure code signing** — Apple Developer Account + Windows certificate
6. **Build and verify signed installer** — .exe (NSIS), .dmg, .AppImage
7. **Build first-run flow** — name → what it's about → first next step → first export in under 5 minutes
8. **Add "Activate update loop" helper** — one-click copy of the instruction prompt for getting AI to return project_brain_update blocks
9. **Write README** with screenshots and a demo GIF of the paste-detect-apply loop
10. **Open a Discord** and invite 25 technical beta users personally

---

## CEO DECISION

**Date: April 2026**

Project Brain has a real product at its core. The paste-detect-diff-apply loop is functional and genuinely clever. The export system is differentiated. The Rust backend is solid. The data model is right.

We are not ready for a public launch. We are ready for a private beta with the right 25 people.

The path to a public launch is not blocked by product strategy or architecture — it is blocked by operational execution: an installer that works, a license that covers us, a README that explains us, and first-run UX that delivers value in the first five minutes.

None of those are hard problems. They are all execution problems.

The decision is: **close out the operational blockers in the next two weeks, then open private beta**. Do not announce publicly, do not charge, do not call it "seamless" or "automatic." Call it what it is: a local tool for people who are serious about carrying their project context between AI platforms.

If 30 of the first 50 beta users apply at least one AI update to a project and tell us it saved them time, we have validated the core value proposition. At that point we are ready to write the public launch post.

Until then: execute, not announce.

---

*Prepared by: CEO & Executive Leadership Team, Project Brain*
*Document type: Internal all-hands briefing — not for public distribution*
*Based on direct audit of repository source code, April 2026*
