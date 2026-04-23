//! Folder watcher activity summariser - Phase 2 Step 1.
//!
//! This module turns buffered watcher events into a small markdown activity block.
//! It is intentionally rules-based only:
//! - no LLM calls
//! - no disk writes
//! - no UI wiring
//! - no export integration yet

use crate::watcher::{BufferedEvent, BufferedOperation};

const MAX_ACTIVITY_LINES: usize = 8;
const MAX_OUTPUT_CHARS: usize = 1_200;

#[derive(Debug, Clone, PartialEq, Eq)]
struct FileActivity {
    path: String,
    latest_timestamp_ms: u64,
    last_operation: BufferedOperation,
    total_events: usize,
}

pub fn summarize_recent_activity(events: &[BufferedEvent]) -> String {
    if events.is_empty() {
        return "## Recent activity\n- No recent file activity.".to_string();
    }

    let mut activities = collapse_events(events);
    activities.sort_by(|left, right| {
        right
            .latest_timestamp_ms
            .cmp(&left.latest_timestamp_ms)
            .then_with(|| left.path.cmp(&right.path))
    });

    let mut lines = vec!["## Recent activity".to_string()];
    let mut included = 0usize;

    for operation in [
        BufferedOperation::Modified,
        BufferedOperation::Added,
        BufferedOperation::Deleted,
        BufferedOperation::Renamed,
        BufferedOperation::Other,
    ] {
        let group: Vec<&FileActivity> = activities
            .iter()
            .filter(|activity| activity.last_operation == operation)
            .collect();

        if group.is_empty() {
            continue;
        }

        for activity in group {
            if included >= MAX_ACTIVITY_LINES {
                break;
            }

            let candidate = format_activity_line(activity);
            if would_exceed_char_budget(&lines, &candidate) {
                let remaining = activities.len().saturating_sub(included);
                if remaining > 0 {
                    lines.push(format!("- ...and {} more file changes.", remaining));
                }
                return lines.join("\n");
            }

            lines.push(candidate);
            included += 1;
        }

        if included >= MAX_ACTIVITY_LINES {
            break;
        }
    }

    let remaining = activities.len().saturating_sub(included);
    if remaining > 0 {
        let overflow_line = format!("- ...and {} more file changes.", remaining);
        if !would_exceed_char_budget(&lines, &overflow_line) {
            lines.push(overflow_line);
        }
    }

    lines.join("\n")
}

fn collapse_events(events: &[BufferedEvent]) -> Vec<FileActivity> {
    let mut activities: Vec<FileActivity> = Vec::new();

    for event in events {
        let path = event.relative_path.to_string_lossy().replace('\\', "/");

        if let Some(existing) = activities.iter_mut().find(|activity| activity.path == path) {
            existing.latest_timestamp_ms = existing.latest_timestamp_ms.max(event.timestamp_ms);
            existing.last_operation = event.operation;
            existing.total_events += 1;
            continue;
        }

        activities.push(FileActivity {
            path,
            latest_timestamp_ms: event.timestamp_ms,
            last_operation: event.operation,
            total_events: 1,
        });
    }

    activities
}

fn format_activity_line(activity: &FileActivity) -> String {
    match activity.last_operation {
        BufferedOperation::Added => format!("- Added `{}`.", activity.path),
        BufferedOperation::Deleted => format!("- Deleted `{}`.", activity.path),
        BufferedOperation::Renamed => format!("- Renamed `{}`.", activity.path),
        BufferedOperation::Other => format!("- Updated `{}`.", activity.path),
        BufferedOperation::Modified => {
            if activity.total_events > 1 {
                format!(
                    "- Edited `{}` ({} changes).",
                    activity.path, activity.total_events
                )
            } else {
                format!("- Edited `{}`.", activity.path)
            }
        }
    }
}

fn would_exceed_char_budget(lines: &[String], next_line: &str) -> bool {
    let current_len: usize = lines.iter().map(|line| line.len() + 1).sum();
    current_len + next_line.len() > MAX_OUTPUT_CHARS
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::watcher::{BufferedEvent, BufferedOperation};
    use std::path::PathBuf;

    fn event(path: &str, operation: BufferedOperation, timestamp_ms: u64) -> BufferedEvent {
        BufferedEvent {
            relative_path: PathBuf::from(path),
            operation,
            timestamp_ms,
        }
    }

    #[test]
    fn summarizes_empty_input() {
        let summary = summarize_recent_activity(&[]);

        assert_eq!(summary, "## Recent activity\n- No recent file activity.");
    }

    #[test]
    fn summarizes_grouped_plain_english_activity() {
        let events = vec![
            event("src/main.ts", BufferedOperation::Modified, 10),
            event("docs/guide.md", BufferedOperation::Added, 20),
            event("src/old.ts", BufferedOperation::Deleted, 30),
            event("src/new-name.ts", BufferedOperation::Renamed, 40),
        ];

        let summary = summarize_recent_activity(&events);

        assert!(summary.starts_with("## Recent activity\n"));
        assert!(summary.contains("- Edited `src/main.ts`."));
        assert!(summary.contains("- Added `docs/guide.md`."));
        assert!(summary.contains("- Deleted `src/old.ts`."));
        assert!(summary.contains("- Renamed `src/new-name.ts`."));
    }

    #[test]
    fn collapses_repetitive_edits_for_the_same_file() {
        let events = vec![
            event("src/main.ts", BufferedOperation::Modified, 10),
            event("src/main.ts", BufferedOperation::Modified, 11),
            event("src/main.ts", BufferedOperation::Modified, 12),
        ];

        let summary = summarize_recent_activity(&events);

        assert!(summary.contains("- Edited `src/main.ts` (3 changes)."));
        assert_eq!(summary.matches("src/main.ts").count(), 1);
    }

    #[test]
    fn keeps_paths_relative_only() {
        let events = vec![event("src\\windows\\main.ts", BufferedOperation::Modified, 10)];

        let summary = summarize_recent_activity(&events);

        assert!(summary.contains("`src/windows/main.ts`"));
        assert!(!summary.contains("C:\\"));
    }

    #[test]
    fn enforces_output_budget_cap() {
        let events: Vec<BufferedEvent> = (0..20)
            .map(|index| {
                event(
                    &format!("src/file-{index}.ts"),
                    BufferedOperation::Modified,
                    index as u64,
                )
            })
            .collect();

        let summary = summarize_recent_activity(&events);
        let bullet_lines = summary.lines().filter(|line| line.starts_with("- ")).count();

        assert!(summary.starts_with("## Recent activity\n"));
        assert!(summary.contains("...and "));
        assert!(bullet_lines <= MAX_ACTIVITY_LINES + 1);
        assert!(summary.len() <= MAX_OUTPUT_CHARS);
    }

    #[test]
    fn latest_operation_wins_for_a_file() {
        let events = vec![
            event("src/main.ts", BufferedOperation::Added, 10),
            event("src/main.ts", BufferedOperation::Modified, 20),
            event("src/main.ts", BufferedOperation::Deleted, 30),
        ];

        let summary = summarize_recent_activity(&events);

        assert!(summary.contains("- Deleted `src/main.ts`."));
        assert!(!summary.contains("- Added `src/main.ts`."));
    }
}
