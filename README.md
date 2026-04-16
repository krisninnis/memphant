# 🧠 Memephant

> Move your project between AI tools without ever rebuilding context.  
> Memephant is a local-first cross-AI project handoff app for serious multi-session work.

**Memephant** is a local-first desktop app that stores your project context and exports it — shaped correctly for each AI platform — so you can switch between ChatGPT, Claude, Grok, Perplexity, and Gemini without rebuilding context from scratch.

You stop restarting AI conversations — and start continuing real work.

---

## Why this exists

Every AI session starts blank.

When you switch platforms, or start a new chat, you have to re-explain your entire project — goals, decisions, structure, current state.

Memephant fixes this by giving you a structured project memory that travels with you across AI tools.

---

## Core loop

1. **Store project context**
2. **Copy AI-specific prompt**
3. **Paste into AI**
4. **Get structured response**
5. **Paste back into Memephant**
6. **Review diff and apply safely**

You never rebuild context.  
The AI always starts where you left off.  

This is the loop that replaces “start from scratch” forever.

---

## How it works

1. **Store your project** — name, summary, goals, decisions, next steps, open questions  
2. **Copy for your AI** — one click copies a platform-shaped handoff prompt  
3. **Paste into your AI** — the AI gets up to speed instantly  
4. **Paste the response back** — Memephant detects updates and shows a diff  
5. **Apply changes** — one click updates your project memory  

---

## Not for

Memephant is **not** for:
- Casual one-off AI chats  
- General note-taking  
- Simple prompt storage  

It is built for:
- Developers  
- Founders  
- AI-heavy workflows  
- Ongoing multi-session project work  

---

## Screenshots

> Screenshots coming soon — see [`docs/screenshots/README.md`](docs/screenshots/README.md) for what to capture.

---

## Features

- ✅ Five platform-specific export formatters (Claude, ChatGPT, Grok, Perplexity, Gemini)  
- ✅ Smart paste → detect → diff → apply loop  
- ✅ Smart export mode (Pro) — condenses large projects  
- ✅ Export quality indicator  
- ✅ Save as Markdown  
- ✅ Project templates (SaaS, Freelance, Writing, Research, Job Search)  
- ✅ Sidebar search  
- ✅ Folder scanning (auto-detect important files)  
- ✅ Secret redaction before export  
- ✅ Atomic writes + rolling backups  
- ✅ Optional cloud sync (Supabase)  
- ✅ Auto-updater  
- ✅ Browser extension  
- ✅ Mobile companion (PWA)  
- ✅ Fully local by default  

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

Upgrade inside the app: **Settings → Cloud Backup → Upgrade to Pro**

---

## Stack

| Layer | Tech |
|---|---|
| Frontend | React 19 + TypeScript + Vite 7 |
| Backend | Rust (Tauri v2) |
| State | Zustand |
| Storage | Local JSON files |
| Cloud sync | Supabase (optional) |
| Billing | Stripe (Vercel serverless) |
| Styling | Plain CSS |

---

## Getting started

### Download

Grab the latest installer from the [Releases page](https://github.com/krisninnis/memephant/releases).

- **Windows:** `.msi` or `.exe`  
- **macOS (Apple Silicon):** `aarch64.dmg`  
- **macOS (Intel):** `x64.dmg`  
- **Linux:** `.AppImage` or `.deb`  

---

### Build from source

**Prerequisites:** Node.js 20+, Rust, Tauri prerequisites

```bash
git clone https://github.com/krisninnis/memephant
cd memephant
npm install
npm run tauri dev