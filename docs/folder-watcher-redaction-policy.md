# Folder watcher — redaction policy

**Status:** authoritative. Every memory-file write performed by the
folder watcher MUST pass through the redaction pipeline described
here before any bytes touch disk. This extends Memephant's existing
export redaction rules to cover watcher output.

**Principle:** redact at the point of write, not just at the point
of export. A secret that reaches a memory file is already a leak.

---

## When redaction runs

1. When the watcher writes or overwrites a project memory block.
2. When a summary is generated from scanned file contents.
3. Before any diff or changelog entry is appended to memory.
4. On every export (existing behaviour — unchanged).

Redaction does NOT run on the source files themselves. The watcher
reads source files but never writes to them.

---

## Redaction patterns (applied in order)

These match Memephant's existing Rust export sanitiser. The same
regex list governs both export and memory-file writes.

| Pattern | What it catches |
|---|---|
| `sk-[A-Za-z0-9]{20,}` | OpenAI / Anthropic secret keys |
| `AKIA[0-9A-Z]{16}` | AWS access key IDs |
| `ghp_[A-Za-z0-9]{36}` | GitHub personal access tokens |
| `xoxb-[0-9]+-[A-Za-z0-9]+` | Slack bot tokens |
| `-----BEGIN [A-Z ]+-----` | PEM private keys |
| `eyJ[A-Za-z0-9+/]+\.[A-Za-z0-9+/]+` | JWTs (header.payload) |
| Any line containing `password\s*=` | Inline password assignments |
| Any line containing `secret\s*=` | Inline secret assignments |

Matching text is replaced with `[REDACTED]`. The replacement is
literal — no length hints, no partial reveals.

---

## File-level skip rules

If a file passes the allowlist check but its content triggers more
than **three** redaction hits, the watcher skips the file entirely
and logs: `skipped <filename>: redaction threshold exceeded`.

The summary for that file reads:
> "File present but content withheld — redaction threshold exceeded."

This is preferable to a partially redacted summary that might still
leak context clues.

---

## Memory file integrity

After writing, the watcher re-reads the memory block and runs the
pattern list a second time. If any match is found on the re-read,
the write is aborted, the partial file is deleted, and an error is
logged. This is a hard stop — not a warning.

---

## What is never written to memory

Even if redaction passes, the following are never written:

- Absolute file paths from the user's machine (use repo-relative
  paths only)
- The contents of `linkedFolder.path`
- Full file contents — only summaries and change descriptions
- Line numbers paired with redacted content (removes positional hints)

---

## Logging

Redaction events are written to a local-only redaction log at
`<app data dir>/redaction.log`. Format per line:


Actions: `redacted`, `file_skipped`, `write_aborted`.

The log is never exported, never synced, and never included in any
handoff prompt. It exists for local audit only.

---

## Review

Reviewed alongside the allowlist spec. Any change to the pattern
list requires updating this document first, in its own commit.
When in doubt, redact.
