//! VCP Slice 2 — State Manifest Generator
//!
//! Produces a `Manifest`: an indexed, content-hashed list of every citable item
//! (decisions, goals, rules, open questions) in a project. The manifest is a
//! pure function of the project state — no I/O, no side effects.
//!
//! Slice 3 will wire `build_state_manifest` into the Claude export path behind a
//! feature flag. Nothing in this file is reachable from the frontend yet.

use sha2::{Digest, Sha256};

// ── Input structs ─────────────────────────────────────────────────────────────
// These mirror the normalised TypeScript in-memory shape (post Slice 1 migration).
// camelCase renames match the JSON keys the frontend will serialise.

/// A single decision, as stored in the project's `decisions[]` array.
#[derive(Debug, Clone, serde::Deserialize)]
pub struct DecisionItem {
    pub id: Option<String>,
    pub decision: String,
    pub rationale: Option<String>,
    #[serde(rename = "alternativesConsidered")]
    pub alternatives_considered: Option<Vec<String>>,
    pub source: Option<String>,
}

/// The subset of project state consumed by the manifest builder.
/// All Slice-1 ID fields are `Option` for backward compatibility with projects
/// that have not yet been migrated (e.g. opened for the first time after upgrade).
#[derive(Debug, Clone, serde::Deserialize)]
pub struct ProjectState {
    pub id: String,
    pub goals: Vec<String>,
    #[serde(rename = "goalIds")]
    pub goal_ids: Option<Vec<String>>,
    pub rules: Vec<String>,
    #[serde(rename = "ruleIds")]
    pub rule_ids: Option<Vec<String>>,
    pub decisions: Vec<DecisionItem>,
    #[serde(rename = "openQuestions")]
    pub open_questions: Vec<String>,
    #[serde(rename = "openQuestionIds")]
    pub open_question_ids: Option<Vec<String>>,
}

// ── Output structs ────────────────────────────────────────────────────────────

/// The kind of a citable item.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ItemKind {
    Decision,
    Goal,
    Rule,
    OpenQuestion,
}

/// A single citable item in the manifest.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ManifestItem {
    /// Stable ID from Slice 1 — e.g. "D-001", "G-003".
    pub id: String,
    pub kind: ItemKind,
    /// SHA-256 of canonical content, hex-encoded, first 12 chars.
    pub content_hash: String,
    /// Human-readable preview: whitespace normalised, truncated to ≤80 chars.
    pub preview: String,
}

/// The complete state manifest for a project snapshot.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct Manifest {
    /// Manifest schema version — "1.0.0". Independent of project schema version.
    pub schema_version: String,
    pub project_id: String,
    /// ISO 8601 UTC timestamp of generation.
    pub generated_at: String,
    pub item_count: usize,
    /// Order-insensitive digest of all (id, content_hash) pairs.
    pub state_digest: String,
    /// Items sorted lexicographically by id.
    pub items: Vec<ManifestItem>,
}

// ── Hashing helpers ───────────────────────────────────────────────────────────

/// SHA-256 of `input` bytes → lowercase hex → first 12 chars.
fn sha256_hex_12(input: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(input.as_bytes());
    let result = hasher.finalize();
    let hex = format!("{:x}", result);
    hex[..12].to_string()
}

/// Canonical content hash for a Decision.
///
/// Assembled string (each component separated by `\n`, only included when present
/// and non-empty after trimming):
///   1. decision text (trimmed)
///   2. rationale (trimmed)
///   3. alternatives_considered — sorted, joined by `\n`
///   4. source (trimmed)
fn hash_decision(item: &DecisionItem) -> String {
    let mut parts: Vec<String> = Vec::new();

    let decision = item.decision.trim().to_string();
    parts.push(decision);

    if let Some(r) = &item.rationale {
        let trimmed = r.trim().to_string();
        if !trimmed.is_empty() {
            parts.push(trimmed);
        }
    }

    if let Some(alts) = &item.alternatives_considered {
        let mut sorted: Vec<String> = alts
            .iter()
            .map(|a| a.trim().to_string())
            .filter(|a| !a.is_empty())
            .collect();
        if !sorted.is_empty() {
            sorted.sort();
            parts.push(sorted.join("\n"));
        }
    }

    if let Some(s) = &item.source {
        let trimmed = s.trim().to_string();
        if !trimmed.is_empty() {
            parts.push(trimmed);
        }
    }

    sha256_hex_12(&parts.join("\n"))
}

/// Canonical content hash for a plain-string item (goal, rule, open question).
fn hash_string_item(text: &str) -> String {
    sha256_hex_12(text.trim())
}

/// Compute the order-insensitive state digest from all (id, content_hash) pairs.
///
/// Steps:
///   1. Collect (id, content_hash) pairs.
///   2. Sort lexicographically by id.
///   3. Concatenate as `id=hash` lines joined by `\n`.
///   4. SHA-256 hex, first 12 chars.
///
/// An empty manifest (no items) produces the digest of the empty string "".
fn compute_state_digest(items: &[ManifestItem]) -> String {
    let mut pairs: Vec<(&str, &str)> = items
        .iter()
        .map(|item| (item.id.as_str(), item.content_hash.as_str()))
        .collect();
    pairs.sort_by_key(|(id, _)| *id);

    let body = pairs
        .iter()
        .map(|(id, hash)| format!("{}={}", id, hash))
        .collect::<Vec<_>>()
        .join("\n");

    sha256_hex_12(&body)
}

// ── Preview helper ────────────────────────────────────────────────────────────

/// Normalise whitespace (collapse all runs to a single space, trim), then
/// truncate to ≤80 chars. Appends `…` (U+2026, 3 UTF-8 bytes) if truncated.
fn make_preview(text: &str) -> String {
    // Collapse whitespace
    let normalised: String = text
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ");

    if normalised.chars().count() <= 80 {
        normalised
    } else {
        let truncated: String = normalised.chars().take(80).collect();
        format!("{}…", truncated)
    }
}

// ── Main entry point ──────────────────────────────────────────────────────────

/// Build a `Manifest` from a `ProjectState`.
///
/// Returns `Err` if any citable item is missing its stable ID. Post Slice-1
/// migration, all items loaded through the normal app path will have IDs.
/// A missing ID indicates a migration bug or a code path that bypassed
/// `generateId` — surfacing this as an error prevents a silently incomplete
/// manifest from entering an export.
///
/// Items in the returned `Manifest::items` are sorted lexicographically by id.
pub fn build_state_manifest(project: &ProjectState) -> Result<Manifest, String> {
    let mut items: Vec<ManifestItem> = Vec::new();

    // ── Decisions ─────────────────────────────────────────────────────────────
    for (idx, decision) in project.decisions.iter().enumerate() {
        let id = decision.id.as_deref().ok_or_else(|| {
            format!(
                "decision at index {} is missing a stable id — run Slice-1 migration first",
                idx
            )
        })?;
        let content_hash = hash_decision(decision);
        let preview = make_preview(&decision.decision);
        items.push(ManifestItem {
            id: id.to_string(),
            kind: ItemKind::Decision,
            content_hash,
            preview,
        });
    }

    // ── Goals ─────────────────────────────────────────────────────────────────
    let goal_ids = project.goal_ids.as_deref().unwrap_or(&[]);
    for (idx, goal) in project.goals.iter().enumerate() {
        let id = goal_ids.get(idx).map(|s| s.as_str()).ok_or_else(|| {
            format!(
                "goal at index {} is missing a stable id — run Slice-1 migration first",
                idx
            )
        })?;
        let content_hash = hash_string_item(goal);
        let preview = make_preview(goal);
        items.push(ManifestItem {
            id: id.to_string(),
            kind: ItemKind::Goal,
            content_hash,
            preview,
        });
    }

    // ── Rules ─────────────────────────────────────────────────────────────────
    let rule_ids = project.rule_ids.as_deref().unwrap_or(&[]);
    for (idx, rule) in project.rules.iter().enumerate() {
        let id = rule_ids.get(idx).map(|s| s.as_str()).ok_or_else(|| {
            format!(
                "rule at index {} is missing a stable id — run Slice-1 migration first",
                idx
            )
        })?;
        let content_hash = hash_string_item(rule);
        let preview = make_preview(rule);
        items.push(ManifestItem {
            id: id.to_string(),
            kind: ItemKind::Rule,
            content_hash,
            preview,
        });
    }

    // ── Open Questions ────────────────────────────────────────────────────────
    let oq_ids = project.open_question_ids.as_deref().unwrap_or(&[]);
    for (idx, question) in project.open_questions.iter().enumerate() {
        let id = oq_ids.get(idx).map(|s| s.as_str()).ok_or_else(|| {
            format!(
                "open_question at index {} is missing a stable id — run Slice-1 migration first",
                idx
            )
        })?;
        let content_hash = hash_string_item(question);
        let preview = make_preview(question);
        items.push(ManifestItem {
            id: id.to_string(),
            kind: ItemKind::OpenQuestion,
            content_hash,
            preview,
        });
    }

    // Sort all items by id for stable ordering and digest computation.
    items.sort_by(|a, b| a.id.cmp(&b.id));

    let state_digest = compute_state_digest(&items);
    let item_count = items.len();

    Ok(Manifest {
        schema_version: "1.0.0".to_string(),
        project_id: project.id.clone(),
        generated_at: chrono_now(),
        item_count,
        state_digest,
        items,
    })
}

/// Returns the current UTC time as an ISO 8601 string.
/// Uses a simple manual approach to avoid pulling in the `chrono` crate.
fn chrono_now() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    // Format: YYYY-MM-DDTHH:MM:SSZ  (good enough for a manifest timestamp)
    let s = secs;
    let mins = s / 60;
    let hours = mins / 60;
    let days_total = hours / 24;
    let sec = s % 60;
    let min = (s / 60) % 60;
    let hour = (s / 3600) % 24;

    // Gregorian calendar arithmetic (no leap-second handling)
    let (year, month, day) = days_to_ymd(days_total);

    format!(
        "{:04}-{:02}-{:02}T{:02}:{:02}:{:02}Z",
        year, month, day, hour, min, sec
    )
}

/// Convert days since Unix epoch to (year, month, day).
fn days_to_ymd(mut days: u64) -> (u64, u64, u64) {
    // 400-year cycle = 146097 days
    let year400 = days / 146097;
    days %= 146097;
    // 100-year cycle = 36524 days
    let year100 = (days / 36524).min(3);
    days -= year100 * 36524;
    // 4-year cycle = 1461 days
    let year4 = days / 1461;
    days %= 1461;
    // remaining years
    let year1 = (days / 365).min(3);
    days -= year1 * 365;

    let year = year400 * 400 + year100 * 100 + year4 * 4 + year1 + 1970;
    let leap = (year % 4 == 0 && year % 100 != 0) || year % 400 == 0;
    let month_days: [u64; 12] = [31, if leap { 29 } else { 28 }, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    let mut month = 1u64;
    for &md in &month_days {
        if days < md {
            break;
        }
        days -= md;
        month += 1;
    }
    (year, month, days + 1)
}

// ── Text serialisation ────────────────────────────────────────────────────────

impl Manifest {
    /// Emit the human-readable bracketed-line form of the manifest.
    ///
    /// ```text
    /// # State Manifest
    /// # project: <id>  schema: 1.0.0  digest: <digest>  items: <n>
    ///
    /// [D-001] decision: Use PostgreSQL for primary data store
    /// [G-001] goal: Ship MVP by Q2
    /// [R-001] rule: Never commit secrets to the repo
    /// [Q-001] open_question: Should we support SSO in v1?
    /// ```
    pub fn to_text(&self) -> String {
        let mut lines = Vec::new();
        lines.push("# State Manifest".to_string());
        lines.push(format!(
            "# project: {}  schema: {}  digest: {}  items: {}",
            self.project_id, self.schema_version, self.state_digest, self.item_count
        ));
        lines.push(String::new());

        for item in &self.items {
            let kind_label = match item.kind {
                ItemKind::Decision => "decision",
                ItemKind::Goal => "goal",
                ItemKind::Rule => "rule",
                ItemKind::OpenQuestion => "open_question",
            };
            lines.push(format!("[{}] {}: {}", item.id, kind_label, item.preview));
        }

        lines.join("\n")
    }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    // Fixture JSON is loaded at compile time relative to this source file.
    const EMPTY_PROJECT: &str =
        include_str!("../../tests/fixtures/vcp/empty_project.json");
    const SMALL_MIXED: &str =
        include_str!("../../tests/fixtures/vcp/small_mixed_project.json");
    const SMALL_MIXED_EDITED: &str =
        include_str!("../../tests/fixtures/vcp/small_mixed_project_edited_rule.json");

    fn parse(json: &str) -> ProjectState {
        serde_json::from_str(json).expect("fixture JSON must be valid")
    }

    // ── Test 1: Empty project ─────────────────────────────────────────────────
    #[test]
    fn empty_project_has_zero_items() {
        let project = parse(EMPTY_PROJECT);
        let manifest = build_state_manifest(&project).expect("empty project must succeed");
        assert_eq!(manifest.item_count, 0);
        assert!(manifest.items.is_empty());
        // Digest of the empty string — must still be a valid 12-char hex string.
        assert_eq!(manifest.state_digest.len(), 12);
        assert!(
            manifest.state_digest.chars().all(|c| c.is_ascii_hexdigit()),
            "state_digest must be hex: {}",
            manifest.state_digest
        );
    }

    // ── Test 2: Deterministic hashing ────────────────────────────────────────
    #[test]
    fn manifest_is_deterministic() {
        let project = parse(SMALL_MIXED);
        let m1 = build_state_manifest(&project).expect("first build must succeed");
        let m2 = build_state_manifest(&project).expect("second build must succeed");

        assert_eq!(m1.state_digest, m2.state_digest, "state_digest must be stable");
        assert_eq!(m1.items.len(), m2.items.len());
        for (a, b) in m1.items.iter().zip(m2.items.iter()) {
            assert_eq!(a.id, b.id);
            assert_eq!(
                a.content_hash, b.content_hash,
                "content_hash for {} must be stable",
                a.id
            );
        }
    }

    // ── Test 3: All item kinds present ────────────────────────────────────────
    #[test]
    fn small_mixed_has_correct_kind_distribution() {
        let project = parse(SMALL_MIXED);
        let manifest = build_state_manifest(&project).expect("build must succeed");

        assert_eq!(manifest.item_count, 8, "expected 8 items total");

        let decisions = manifest.items.iter().filter(|i| i.kind == ItemKind::Decision).count();
        let goals     = manifest.items.iter().filter(|i| i.kind == ItemKind::Goal).count();
        let rules     = manifest.items.iter().filter(|i| i.kind == ItemKind::Rule).count();
        let questions = manifest.items.iter().filter(|i| i.kind == ItemKind::OpenQuestion).count();

        assert_eq!(decisions, 2, "expected 2 decisions");
        assert_eq!(goals,     3, "expected 3 goals");
        assert_eq!(rules,     2, "expected 2 rules");
        assert_eq!(questions, 1, "expected 1 open question");
    }

    // ── Test 4: Reordering invariance ─────────────────────────────────────────
    #[test]
    fn reordering_does_not_change_hashes_or_digest() {
        let canonical = parse(SMALL_MIXED);
        let m_canonical = build_state_manifest(&canonical).expect("canonical build must succeed");

        // Build a permuted version: reverse the goals and rules arrays (and their
        // parallel ID arrays) in memory.
        let mut permuted = canonical.clone();
        permuted.goals.reverse();
        if let Some(ref mut ids) = permuted.goal_ids {
            ids.reverse();
        }
        permuted.rules.reverse();
        if let Some(ref mut ids) = permuted.rule_ids {
            ids.reverse();
        }

        let m_permuted = build_state_manifest(&permuted).expect("permuted build must succeed");

        // Every item's content_hash must be identical.
        for item in &m_canonical.items {
            let counterpart = m_permuted.items.iter().find(|i| i.id == item.id)
                .unwrap_or_else(|| panic!("item {} missing from permuted manifest", item.id));
            assert_eq!(
                item.content_hash, counterpart.content_hash,
                "content_hash for {} changed after reorder",
                item.id
            );
        }

        // Top-level digest must be unchanged.
        assert_eq!(
            m_canonical.state_digest, m_permuted.state_digest,
            "state_digest changed after reorder"
        );
    }

    // ── Test 5: Edit sensitivity ──────────────────────────────────────────────
    #[test]
    fn single_char_edit_changes_hash_and_digest() {
        let original = parse(SMALL_MIXED);
        let edited   = parse(SMALL_MIXED_EDITED);

        let m_orig   = build_state_manifest(&original).expect("original build must succeed");
        let m_edited = build_state_manifest(&edited).expect("edited build must succeed");

        // Find the rule whose text changed — exactly one rule hash must differ.
        let changed_rules: Vec<_> = m_orig.items.iter()
            .filter(|i| i.kind == ItemKind::Rule)
            .filter(|orig_item| {
                m_edited.items.iter()
                    .find(|e| e.id == orig_item.id)
                    .map(|e| e.content_hash != orig_item.content_hash)
                    .unwrap_or(false)
            })
            .collect();

        assert_eq!(changed_rules.len(), 1, "exactly one rule hash should differ");

        // The top-level digest must also differ.
        assert_ne!(
            m_orig.state_digest, m_edited.state_digest,
            "state_digest must change when a rule is edited"
        );
    }

    // ── Test 6: Missing-ID defensive error ────────────────────────────────────
    #[test]
    fn missing_decision_id_returns_error() {
        let mut project = parse(SMALL_MIXED);
        // Strip the id from the first decision to simulate a migration miss.
        if let Some(d) = project.decisions.first_mut() {
            d.id = None;
        }
        let result = build_state_manifest(&project);
        assert!(result.is_err(), "should return Err when a decision id is missing");
        let msg = result.unwrap_err();
        assert!(
            msg.contains("decision at index 0"),
            "error message should name the item: {}",
            msg
        );
    }
}
