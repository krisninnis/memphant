# 🐘 Memephant

**Switch between AI tools without losing context**

Memephant is a local-first app that helps you carry project memory between ChatGPT, Claude, Grok, Gemini, Perplexity, and other AI tools without starting from scratch.

![Demo](docs/screenshots/demo.gif)

## How it works

- Create a project once with your goals, current state, decisions, and next steps.
- Copy a clean handoff formatted for the AI tool you want to use.
- Paste the AI response back into Memephant to detect updates.
- Review the diff before applying changes to your project memory.

## Features

- Local-first project memory
- One-click handoffs for multiple AI tools
- Safe diff review before updates are applied
- Folder scanning for real project context
- Secret redaction before exports
- Optional cloud backup across devices

[Download Memephant](https://memephant.com)

## Agent Handoff

Agent Handoff helps you switch AI tools without re-explaining the project. When you copy context, Memephant can add a short note that tells the next AI where the last session happened, what you were doing, and why you are switching.

Choose a mode before copying:
- **Continue**: pick up the previous work.
- **Debug**: focus on diagnosing a problem.
- **Review**: check decisions, risks, and next steps.

Codex and Claude Code are available as optional targets for code-heavy work. Turn them on in Settings -> Platforms.

Example:
```text
--- Handoff from Claude (2 hours ago) ---
Last task: Fix the export buttons
Switching to Codex because: I want the repo checked
Your role: review
--- End handoff ---
```

## Built with

- Tauri
- React
- Rust

## License

**Business Source License 1.1 (BUSL-1.1)** — source-available, free for personal use.

- ✅ Personal and non-commercial use: free
- 🚫 Commercial use: requires a separate license (email krisninnis@gmail.com)
- 📅 Change License: **MIT on 2030-04-24**

See [LICENSE](./LICENSE) for the full license text and [LICENSE-SUMMARY.md](./LICENSE-SUMMARY.md) for a plain-English explanation.

https://memephant.com
