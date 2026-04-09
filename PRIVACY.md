# Privacy Policy — Project Brain

**Last updated: April 2026**

## The short version

Project Brain stores everything on your device. Nothing is sent to any server. No accounts, no tracking, no analytics.

---

## What data does Project Brain store?

Project Brain stores your project files — the text you type into the app (project names, summaries, goals, decisions, notes, and so on) — as JSON files on **your computer only**.

These files are stored in your operating system's standard application data directory:

- **Windows:** `%APPDATA%\com.project-brain.app\projects\`
- **macOS:** `~/Library/Application Support/com.project-brain.app/projects/`
- **Linux:** `~/.local/share/com.project-brain.app/projects/`

You can see the exact path by going to **Settings → Privacy → View stored data**.

---

## Does Project Brain send any data over the internet?

**No.** Project Brain has no server connection of any kind. It does not:

- Send your project data to any external service
- Collect usage statistics or analytics
- Send crash reports
- Connect to any third-party API
- Use any telemetry or tracking

The app runs entirely offline and locally.

---

## Does Project Brain scan my files?

If you choose to link a project folder (optional), Project Brain scans the files in that folder to help you build project context. This scan:

- Runs entirely on your device
- Never sends file contents to any server
- Automatically excludes sensitive files (`.env`, `.pem`, `.key`, SSH keys)
- Automatically redacts common secret patterns (API keys, tokens, credentials) before any export

---

## Does Project Brain export my data to AI platforms?

When you click "Copy for [Platform]", Project Brain copies formatted text to your clipboard. You then paste this into an AI chat tool yourself. Project Brain does not:

- Connect directly to ChatGPT, Claude, Grok, Perplexity, Gemini, or any other AI service
- Send any data automatically to any platform
- Store or log what you paste into AI tools

All AI interaction is manual — you are always in control of what you share.

---

## Does Project Brain collect personal information?

No. Project Brain does not ask for your name, email address, or any personal information. There are no user accounts. There is no registration process.

---

## Cloud sync

Cloud sync is not currently implemented. When it is introduced in a future version, it will be **opt-in only** with clear disclosure of what is synced and where it is stored. The local-first behaviour described above will always remain available.

---

## Open source

Project Brain is open source under the MIT licence. You can inspect exactly what the app does at any time:

**https://github.com/krisninnis/project-brain**

---

## Contact

If you have questions about privacy, open a GitHub issue or discussion at the repository above.
