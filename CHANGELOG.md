# Changelog

All notable changes to Project Brain are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
Versions follow [Semantic Versioning](https://semver.org/).

---

## [0.1.0] — 2026-04-08

### First public release 🎉

#### Core app
- Structured project memory editor (summary, goals, rules, decisions, next steps, open questions, important files)
- Five platform-specific export formatters — Claude, ChatGPT, Grok, Perplexity, Gemini
- Paste-detect-diff-apply loop — paste any AI response, get a structured diff, apply with one click
- Export quality indicator — shows how complete your export is before you copy
- Smart export mode (Pro) — auto-condenses large projects to fit inside AI context windows
- Save project as Markdown file

#### Projects
- Project templates — five pre-filled starters (SaaS, Freelance, Writing, Research, Job Search)
- Folder scanning — link a local folder to auto-discover files, tech stack, and README summary
- Sidebar search — real-time filtering across name, summary, goals, and decisions
- Delete confirmation dialog

#### Settings
- General settings (date format, toast duration)
- Privacy & Security (secrets scanner level, clipboard watcher opt-in)
- Projects (default export mode, auto-save)
- Platforms (enable/disable individual platforms)
- Cloud Backup (sign in, sync, upgrade)
- About (version info, update checker, bug report link)

#### Cloud & billing
- Optional cloud backup via Supabase — sync projects across devices
- Sign in / sign up / forgot password
- Stripe billing — Pro and Team plans
- Stripe Customer Portal — manage subscription, update payment method, cancel
- Free tier: up to 3 projects without an account
- Pro tier: Smart export, unlimited projects, priority support

#### Infrastructure
- Auto-updater — checks for new releases on startup, installs with one click
- Browser extension (Chrome) — quick context capture from any page
- Mobile companion (PWA) — works on any device via browser
- GitHub Actions CI — TypeScript and Rust checks on every push
- GitHub Actions release — builds all platforms automatically on version tag

#### Security
- Secrets scanner — strips API keys, tokens, and credentials before every export
- Hardcoded exclusion patterns: `sk-`, `AKIA`, `ghp_`, `xoxb-`, `-----BEGIN`, `eyJ`
- No telemetry, no analytics, no connection to any AI platform directly

---

*Older entries will appear here as new versions are released.*
