# 🧠 Memphant

> Remember your projects so your AIs don't have to.

**Memphant** is a local-first desktop app that stores your project context and exports it — shaped correctly for each AI platform — so you can switch between ChatGPT, Claude, Grok, Perplexity, and Gemini without rebuilding context from scratch.

---

## The problem it solves

Every AI session starts blank. When you switch platforms, or start a new chat, you have to re-explain your entire project. Memphant is the fix: a structured workspace that holds your project memory and sends the right context into whichever AI you pick up next.

---

## How it works

1. **Store your project** — name, summary, goals, decisions, next steps, open questions
2. **Copy for your AI** — one click copies a platform-shaped handoff prompt to your clipboard
3. **Paste into your AI** — the AI gets up to speed instantly
4. **Paste the response back** — Memphant detects any project updates and shows you a diff
5. **Apply changes** — one click updates your project memory

The AI feels like it already knows the project. You never start over.

---

## Screenshots

> Screenshots coming soon — see [`docs/screenshots/README.md`](docs/screenshots/README.md) for what to capture.

---

## Features

- ✅ Five platform-specific export formatters (Claude, ChatGPT, Grok, Perplexity, Gemini)
- ✅ Smart paste-detect-diff-apply loop — paste any AI response and get a structured diff
- ✅ Smart export mode (Pro) — auto-condenses large projects to fit inside context windows
- ✅ Export quality indicator — shows how useful your export will be before you copy
- ✅ Save as Markdown — export any project snapshot to a local file
- ✅ Project templates — five starter templates (SaaS, Freelance, Writing, Research, Job Search)
- ✅ Sidebar search — real-time filtering across all your projects
- ✅ Folder scanning — link a project folder to auto-discover important files
- ✅ Secret redaction — API keys and tokens are stripped before every export
- ✅ Atomic writes + rolling backups — your data is always safe
- ✅ Cloud backup (optional) — sign in to sync across devices via Supabase
- ✅ Auto-updater — in-app updates, no manual downloading
- ✅ Browser extension — Chrome extension for quick context capture
- ✅ Mobile companion — works as a PWA on any device
- ✅ Fully local by default — no account required to use the core features

---

## Plans

| Feature | Free | Pro |
|---|---|---|
| Unlimited projects (signed in) | ✅ | ✅ |
| Up to 3 projects (no account) | ✅ | — |
| Cloud backup | ✅ | ✅ |
| All 5 export formats | ✅ | ✅ |
| Smart export (auto-condensed) | — | ✅ |
| Priority support | — | ✅ |

Upgrade inside the app: **Settings → Cloud Backup → Upgrade to Pro**.

---

## Stack

| Layer | Tech |
|---|---|
| Frontend | React 19 + TypeScript + Vite 7 |
| Backend | Rust (Tauri v2) |
| State | Zustand |
| Storage | Local JSON files in OS app data directory |
| Cloud sync | Supabase (optional, opt-in) |
| Billing | Stripe (via Vercel serverless functions) |
| Styling | Plain CSS, dark theme |

---

## Getting started

### Download

Grab the latest installer from the [Releases page](https://github.com/krisninnis/memphant/releases).

- **Windows:** `.msi` or `.exe`
- **macOS (Apple Silicon):** `aarch64.dmg`
- **macOS (Intel):** `x64.dmg`
- **Linux:** `.AppImage` or `.deb`

### Build from source

**Prerequisites:** [Node.js 20+](https://nodejs.org), [Rust](https://rustup.rs), [Tauri prerequisites](https://tauri.app/start/prerequisites/)

```bash
git clone https://github.com/krisninnis/memphant
cd memphant
npm install
npm run tauri dev
```

### Preview in browser (no Rust required)

```bash
npm run dev:web
```

Open `http://localhost:1420`.

### Preview on your phone

```bash
npm run phone
```

Starts a local tunnel and prints a public URL you can open on any device.

---

## Where your data lives

Memphant stores everything in your OS application data directory:

| Platform | Path |
|---|---|
| Windows | `%APPDATA%\com.kris.memphant-desktop\projects\` |
| macOS | `~/Library/Application Support/com.kris.memphant-desktop/projects/` |
| Linux | `~/.local/share/com.kris.memphant-desktop/projects/` |

You can find the exact path in **Settings → Privacy → View stored data**. Rolling backups (last 5 saves per project) are kept in a `backups/` subdirectory.

---

## Privacy

Your project data never leaves your machine unless you explicitly sign in to enable cloud backup. Cloud sync is fully opt-in. The app has no analytics, no crash reporting, and no connection to any AI platform directly. See [PRIVACY.md](./PRIVACY.md) for the full policy.

---

## The update loop protocol

When you copy a project export into an AI, it includes an instruction asking the AI to return a `memphant_update` block. When you paste that response back into Memphant, the app detects the block, computes a diff, and shows you what will change before applying anything.

Example update block (the AI returns this):

```json
memphant_update
{
  "summary": "Updated summary of the project",
  "currentState": "What is true right now",
  "goals": ["Any new goals to add"],
  "decisions": [{"decision": "A new decision", "rationale": "Why"}],
  "nextSteps": ["What to do next"]
}
```

---

## Contributing

Issues and pull requests are welcome. Please open an issue before making large changes.

---

## Licence

[MIT](./LICENSE) — free forever for core features.

---

*Built by [Kris Ninnis](https://github.com/krisninnis)*
