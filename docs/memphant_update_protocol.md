# memphant_update Protocol

Version: **1.0.0**  
Status: Stable  
Maintained by: [krisninnis/memphant](https://github.com/krisninnis/memphant)

---

## Overview

The `memphant_update` protocol is a lightweight JSON convention that lets AI assistants return structured project memory updates inline within their responses. Memephant detects these blocks automatically when you paste an AI response, previews the changes, and lets you accept or discard them.

The protocol is intentionally minimal. It carries only the fields that Memephant manages — no tool calls, no custom API, no internet connection required.

---

## Block Format

Place the block at the end of the AI's response. The marker `memphant_update` (case-insensitive) must appear on its own line immediately before the JSON object.

```
memphant_update
{
  "schemaVersion": "1.0.0",
  "summary": "one-sentence summary of the project after your work",
  "currentState": "what is true right now",
  "goals": ["goal to add"],
  "decisions": [
    { "decision": "we chose X", "rationale": "because Y" }
  ],
  "nextSteps": ["next thing to do"],
  "openQuestions": ["still unsure about Z"],
  "importantAssets": ["path/to/file.ts"]
}
```

All fields except `schemaVersion` are optional. Include only what changed.

---

## Fields

| Field | Type | Required | Description |
|---|---|---|---|
| `schemaVersion` | string | **Yes (≥ 1.0.0)** | Protocol version (semver). Missing = legacy pre-1.0.0 block, still accepted. |
| `summary` | string | No | One-sentence project summary, replaces the existing summary. |
| `currentState` | string | No | What is true about the project right now, replaces existing. |
| `goals` | string[] | No | Goals to **add** (existing goals are kept). |
| `decisions` | `{decision, rationale?}[]` | No | Decisions to **add** (existing decisions are kept). |
| `nextSteps` | string[] | No | Next steps to **add**. |
| `openQuestions` | string[] | No | Open questions to **add**. |
| `importantAssets` | string[] | No | Important files/assets to **add**. |

**Array fields are additive** — they append to the existing list, they do not replace it. Scalar fields (`summary`, `currentState`) replace the existing value.

---

## schemaVersion

The version follows [Semantic Versioning](https://semver.org/):

| Segment | Meaning |
|---|---|
| MAJOR | Breaking change — old parsers will reject blocks with a newer major. |
| MINOR | New optional fields added. Old parsers ignore unknown fields. |
| PATCH | Documentation or minor spec clarification only. No code change needed. |

**Parser behaviour:**

- `schemaVersion` **missing** → accepted (backward-compatible with pre-1.0.0 blocks)
- `schemaVersion` `"1.x.x"` → accepted
- `schemaVersion` `"2.x.x"` or higher → **rejected** with a console warning; user sees no update preview

This ensures that if a future breaking change ships, users on older app versions get a clear message to update instead of silently mangling their data.

---

## Detection Strategy

Memephant tries to detect an update block using seven strategies in order of confidence:

| Priority | Method | Confidence |
|---|---|---|
| 1 | `memphant_update` marker + balanced JSON | 1.00 |
| 2 | `<memphant_update>…</memphant_update>` XML wrapper | 0.95 |
| 3 | Fenced ` ```json ``` ` code block | 0.90 |
| 4 | Any fenced code block | 0.70 |
| 5 | Last JSON object in text | 0.75 |
| 6 | Brute-force scan for object containing `currentState` | 0.65 |
| 7 | Natural-language structured text | 0.40 |

Strategies 5-7 are fallbacks and do not require the `memphant_update` marker. Use the explicit marker format whenever possible.

---

## Prompt Instruction (copy-paste ready)

Include this at the end of your Memephant export prompt. It is automatically included by the app.

```
When you finish, include a project update block at the end of your response like this:

memphant_update
{
  "schemaVersion": "1.0.0",
  "summary": "one-sentence summary of the project",
  "currentState": "what is true right now after your work",
  "goals": ["any new goals to add"],
  "decisions": [{"decision": "any new decisions", "rationale": "why"}],
  "nextSteps": ["any new next steps to add"]
}
```

---

## Version History

| Version | Date | Change |
|---|---|---|
| 1.0.0 | 2026-04-16 | Initial stable spec. Added `schemaVersion` field. All fields now documented. |
| pre-1.0 | 2025 | Original format without version field. Still accepted by all 1.x parsers. |

---

## Future Migration (when MAJOR increments)

If a breaking change is needed:

1. Bump the MAJOR version in `MEMPHANT_UPDATE_SCHEMA_VERSION` in `exportFormatters.ts` and in `SUPPORTED_SCHEMA_MAJOR` in `diffEngine.ts`.
2. Update this document with a new version history entry and migration notes.
3. The old app version will reject blocks with the new MAJOR and show: *"Please update Memephant to read this update."*
4. Old blocks (lower MAJOR) remain readable by new parsers unless you explicitly drop support.
