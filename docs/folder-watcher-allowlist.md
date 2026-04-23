# Folder watcher — allowlist spec

**Status:** authoritative. The Rust folder watcher MUST NOT observe
any path or file not covered by this document.

**Principle:** allowlist, not blocklist. Anything not explicitly
permitted here is invisible to the watcher. Fails closed.

---

## Watched paths (relative to the linked project root)

- src/**
- src-tauri/src/**
- api/**
- scripts/**
- chrome-extension/** (but NOT chrome-extension/dist/**)
- public/** (but NOT public/build/**)
- docs/**
- landing/**
- Repo root (top level only, not recursive): for files matching
  the allowed extensions below

## Watched file extensions

Source code and docs only:

- .ts .tsx .js .jsx .mjs .cjs
- .rs .toml
- .py
- .go
- .html .css .scss
- .md .mdx
- .sql
- .json (see exclusions below)
- .yml .yaml

## Explicitly NOT watched (even if they match above)

- Any file whose name starts with .env
- Any file whose name contains secret, secrets, credentials,
  token, apikey, api_key, .pem, .key, .p12, .pfx
- node_modules/** (anywhere in the tree)
- target/** (Rust build output)
- dist/** build/** out/** .next/** .nuxt/** coverage/**
- *.lock package-lock.json pnpm-lock.yaml yarn.lock Cargo.lock
- *.log *.tmp *.bak *.swp
- .git/**
- .vscode/** .idea/**
- supabase-rls-fix.sql and any file under a path segment called
  internal/
- Any file larger than 500 KB

## Git integration

The watcher may call `git log --oneline -n 20` on the linked
folder to enrich the change summary with commit messages. It
MUST NOT call network git operations (fetch, pull, push), read
files inside .git/, or access git config or credentials.

## Extension policy

Adding to this allowlist is a deliberate change that requires
updating this document first, in its own commit. The Rust
watcher loads the list at startup and refuses to run if the
document is missing or malformed.

## Review

Reviewed on project start and any time a new file type becomes
load-bearing. Default stance: say no to new entries. The cost
of missing a file is low (user can mention it manually). The
cost of watching the wrong file is a leaked secret.
