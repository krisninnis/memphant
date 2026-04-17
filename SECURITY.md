# Security Policy

## Supported versions

| Version | Supported |
|---------|-----------|
| 0.1.x   | ✓ Current |

Older pre-release versions receive no security patches. Please update to the latest release.

---

## Reporting a vulnerability

**Please do not file a public GitHub issue for security vulnerabilities.**

Email: **krisninnis@gmail.com**  
Subject line: `[SECURITY] Memephant — <brief description>`

Include:
- A description of the vulnerability and its potential impact
- Steps to reproduce or a proof-of-concept (where safe to share)
- Any suggested fix, if you have one

You can expect:
- An acknowledgement within **48 hours**
- A status update within **7 days**
- A CVE / advisory published after a fix is released (for significant findings)

We ask that you give us a reasonable window to patch before public disclosure.

---

## Security model

### Local-first by default

All project data is stored in plain JSON files in your OS application data folder:

- **Windows:** `%APPDATA%\memephant\projects\`
- **macOS:** `~/Library/Application Support/memephant/projects/`
- **Linux:** `~/.local/share/memephant/projects/`

No data leaves your machine unless you explicitly sign in and enable cloud backup.

### Cloud backup (opt-in)

When cloud backup is enabled:

- Data is transmitted over TLS to Supabase (hosted on AWS)
- Row-Level Security (RLS) policies on all tables ensure each user can only access their own data
- The service role key (used by Vercel serverless functions) is never exposed to the client
- Auth is handled by Supabase Auth (JWT-based)

### Secret redaction

Before **every** export, Memephant scans the output and strips credentials matching:

| Pattern | What it catches |
|---------|-----------------|
| `sk-[A-Za-z0-9]{20,}` | OpenAI API keys |
| `AKIA[0-9A-Z]{16}` | AWS access keys |
| `ghp_[A-Za-z0-9]{36}` | GitHub personal access tokens |
| `xoxb-[A-Za-z0-9-]+` | Slack bot tokens |
| `-----BEGIN [A-Z ]+ KEY-----` | PEM private keys |
| `eyJ[A-Za-z0-9+/=]{20,}` | JWT tokens |

These patterns are hardcoded in the Rust backend and the TypeScript export utilities. They are **not** user-configurable and cannot be disabled.

### No telemetry

Memephant collects no analytics, crash reports, or usage data. The clipboard watcher is opt-in only and is never active by default.

### Tauri security

- The app uses Tauri v2's capability system to restrict which Tauri commands are accessible from the frontend
- All Rust commands perform input validation before acting on file paths or user-supplied data
- The `scan_project_folder` command enforces path sanity checks to prevent directory traversal

---

## Running the RLS audit

To verify your Supabase instance has correct Row-Level Security policies:

```bash
# Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env
npx tsx scripts/audit-rls.ts
```

The script checks every table in the `public` schema and exits non-zero if any table has RLS disabled.

---

## Known limitations

- **Clipboard watcher** (opt-in): When enabled, the app monitors the clipboard for AI responses matching the Memephant schema. Only pastes matching the schema are processed; raw clipboard data is never logged.
- **Linked folder scanning**: Scans are limited to file names and metadata. File contents are read only for specific recognised files (README.md, package.json, Cargo.toml, etc.) and are sanitised before display.
- **Offline queue**: When cloud sync fails, unsent project data is stored in IndexedDB locally until the next successful sync. This data is scoped to the app origin and is not accessible to other applications.
