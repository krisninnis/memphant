# Memphant Update Protocol Specification

**Schema version:** 1.1.0  
**Protocol format version:** 1.1.0

---

## Overview

The `memphant_update` protocol is how an AI session communicates project-state changes back to the Memphant desktop app. The app detects the update block in an AI response, diffs it against the current project, lets the user review changes, and applies them in a single merge operation.

---

## Update Block Format

An update block is a JSON object preceded by the bare trigger word `memphant_update` on its own line:

```
memphant_update
{
  "summary": "...",
  "currentState": "...",
  ...
}
```

The JSON block may appear anywhere in the AI response. Only one block is processed per response — the first valid block wins.

---

## Schema 1.1.0 Fields

### Existing fields (schema ≤ 1.0.0)

All of these use **APPEND** merge semantics: new items are added to existing arrays; duplicates are silently dropped.

| Field | Type | Merge rule |
|---|---|---|
| `summary` | `string` | REPLACE |
| `currentState` | `string` | REPLACE |
| `goals` | `string[]` | APPEND (deduplicate) |
| `rules` | `string[]` | APPEND (deduplicate) |
| `decisions` | `Decision[]` | APPEND (deduplicate by `.decision` text) |
| `nextSteps` | `string[]` | APPEND (deduplicate) |
| `openQuestions` | `string[]` | APPEND (deduplicate) |
| `session_note` | `string` | Stored as `lastSessionNote` in platform state |

### New fields (schema 1.1.0)

These three fields are **optional** — omit them unless you have something meaningful to say.

#### `inProgress` — `string[]`

The set of tasks actively being worked on right now. Uses **REPLACE-ALL** semantics.

- If `inProgress` is **present** in the update block, the entire existing array is replaced.
- If `inProgress` is an **empty array `[]`**, the field is cleared entirely.
- If `inProgress` is **absent** from the update block, the existing value is left untouched.

```json
"inProgress": ["Implementing Stripe webhook handler", "Writing migration tests"]
```

To clear the field when no tasks are in flight:

```json
"inProgress": []
```

#### `lastSessionSummary` — `string`

A 2–4 sentence recap of what happened in this session. Uses **REPLACE** semantics.

- If present and non-empty, replaces the existing value.
- If absent, the existing value is left untouched.

```json
"lastSessionSummary": "We wired up the Stripe checkout flow and fixed the logout hang bug. Tests pass. Next session should focus on the billing portal integration."
```

#### `openQuestion` — `string`

The single most important decision or question the user should focus on next. Uses **REPLACE** semantics.

- If present and non-empty, replaces the existing value.
- If absent, the existing value is left untouched.

```json
"openQuestion": "Should we use Stripe Checkout hosted pages or build our own form?"
```

---

## Complete Example Update Block

```
memphant_update
{
  "currentState": "Stripe checkout flow is wired up. Webhook handler is complete. Billing portal still TODO.",
  "add_nextSteps": ["Test Stripe webhook locally with Stripe CLI", "Build billing portal redirect"],
  "inProgress": ["Integrating Stripe Customer Portal"],
  "lastSessionSummary": "We implemented the Stripe checkout session API and connected the webhook to update Supabase. All tests pass. The Customer Portal integration is next.",
  "openQuestion": "Should the Customer Portal open in the system browser or an in-app webview?"
}
```

---

## Merge Rules Summary

| Field | Present in block | Absent from block |
|---|---|---|
| `inProgress` | Replaces entire array (`[]` = clear) | Existing value unchanged |
| `lastSessionSummary` | Replaces string | Existing value unchanged |
| `openQuestion` | Replaces string | Existing value unchanged |
| `goals`, `rules`, `nextSteps`, `openQuestions` | Appends new items (deduplicates) | Existing value unchanged |
| `summary`, `currentState` | Replaces string | Existing value unchanged |

---

## Backward Compatibility

- All three 1.1.0 fields are **optional** at both the protocol and schema level.
- A `memphant_update` block that omits all three new fields is perfectly valid and processes identically to the 1.0.0 protocol.
- Projects loaded from disk without a `schema_version` field (or with the legacy numeric value `1`) are silently migrated to schema `1.1.0` on next save. No field values are changed during this migration.
- An AI that sends `schemaVersion: "1.0.0"` in its update block will be processed correctly — old-format blocks continue to work.

---

## Edge Cases

| Scenario | Behaviour |
|---|---|
| `inProgress: []` in block | Field is cleared — interpreted as "nothing in flight right now" |
| `inProgress` absent from block | Field is untouched — AI didn't say anything about it |
| `lastSessionSummary: ""` (empty string) | Treated as absent — existing value is left unchanged |
| `openQuestion: "  "` (whitespace only) | Treated as absent — existing value is left unchanged |
| Duplicate items in `inProgress` | Whitespace-trimmed; blank strings are dropped before replace |
| Project loaded without `schema_version` | Treated as pre-1.1.0; stamped `1.1.0` on next disk write |

---

## AI Instructions

When ending a session, emit a `memphant_update` block. Include `inProgress`, `lastSessionSummary`, and `openQuestion` only when you have something meaningful to say — omit them if not applicable rather than sending empty or placeholder values.

The `inProgress` field should reflect tasks that are **actively being executed**, not the full backlog. Use `nextSteps` for the full to-do list.

Use `openQuestion` to surface **one** concrete decision the user should make before the next session — not a general status note. If there is nothing blocking, omit it.
