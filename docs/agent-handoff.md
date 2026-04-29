# Agent Handoff

Agent Handoff helps you switch between AI tools without re-explaining your project every time. When you copy context, Memephant can add a short handoff note for the next AI, including what you were doing, where the last session happened, and why you are switching.

It is designed for real work that moves between ChatGPT, Claude, Codex, Claude Code, and other tools.

## Modes

**Continue** picks up the previous work. It asks the next AI to keep going and end with a `memphant_update` block.

**Debug** focuses on a specific problem. It asks for the likely cause, files inspected, smallest safe fix, how to verify it, and a `memphant_update` block.

**Review** checks the project state critically. It asks what looks solid, what looks risky, what context may be missing, recommended next steps, and a `memphant_update` block.

## Codex and Claude Code

Codex and Claude Code are optional export targets for code-heavy work.

To enable them:
1. Open Settings.
2. Go to Platforms.
3. Turn on Codex or Claude Code.

They will then appear with the other export buttons.

## Add Context

Use **Add context** when switching tools and you want to explain the handoff.

**What were you working on?** tells the next AI the last task or thread of work.

**Why are you switching tools?** tells the next AI what role it should play, such as checking the code, debugging, or reviewing the plan.

## Example

```text
--- Handoff from Claude (2 hours ago) ---
Last task: Fix the export buttons
Switching to Codex because: I want the repo checked
Your role: review
--- End handoff ---
```

## FAQ

### Why is there no handoff note on the first copy?

There is no previous AI session yet. Memephant only adds the handoff note after it has something useful to carry forward.

### Why are no files listed in the handoff?

Files are listed only when Memephant can see changes from a linked project folder. If no folder is linked, or no files changed since the last session, the handoff can still work without a file list.
