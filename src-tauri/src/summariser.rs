//! Folder watcher activity summariser - Phase 2 Step 2.
//!
//! This module turns buffered watcher events into a compact markdown activity block.
//! It is intentionally rules-based only:
//! - no LLM calls
//! - no disk writes
//! - no UI wiring
//! - no export integration yet

use crate::watcher::{BufferedEvent, BufferedOperation};

const MAX_ACTIVITY_LINES: usize = 8;
const MAX_OUTPUT_CHARS: usize = 1_200;
const MAX_COMMIT_ITEMS: usize = 3;

#[derive(Debug, Clone, PartialEq, Eq)]
struct FileActivity {
    path: String,
    latest_timestamp_ms: u64,
    last_operation: BufferedOperation,
    total_events: usize,
}

pub fn summarize_recent_activity(events: &[BufferedEvent]) -> String {
    summarize_recent_activity_with_commits(events, &[])
}

pub fn summarize_recent_activity_with_commits(
    events: &[BufferedEvent],
    commits: &[String],
) -> String {
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
    let mut included_groups = 0usize;

    for operation in [
        BufferedOperation::Modified,
        BufferedOperation::Added,
        BufferedOperation::Deleted,
        BufferedOperation::Renamed,
        BufferedOperation::Other,
    ] {
        if included_groups >= MAX_ACTIVITY_LINES {
            break;
        }

        let grouped_paths = collect_grouped_paths(&activities, operation);
        if grouped_paths.is_empty() {
            continue;
        }

        let candidate = format_group_line(operation, &grouped_paths);
        if would_exceed_char_budget(&lines, &candidate) {
            append_overflow_line(&mut lines, activities.len());
            return lines.join("\n");
        }

        lines.push(candidate);
        included_groups += 1;
    }

    if !commits.is_empty() && included_groups < MAX_ACTIVITY_LINES {
        let commit_line = format_commit_line(commits);
        if !commit_line.is_empty() && !would_exceed_char_budget(&lines, &commit_line) {
            lines.push(commit_line);
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

fn collect_grouped_paths(activities: &[FileActivity], operation: BufferedOperation) -> Vec<String> {
    let mut grouped: Vec<&FileActivity> = activities
        .iter()
        .filter(|activity| activity.last_operation == operation)
        .collect();

    grouped.sort_by(|left, right| {
        right
            .latest_timestamp_ms
            .cmp(&left.latest_timestamp_ms)
            .then_with(|| left.path.cmp(&right.path))
    });

    grouped
        .into_iter()
        .map(|activity| format_activity_path(activity))
        .collect()
}

fn format_activity_path(activity: &FileActivity) -> String {
    match activity.last_operation {
        BufferedOperation::Modified if activity.total_events > 1 => {
            format!("`{}` ({} changes)", activity.path, activity.total_events)
        }
        _ => format!("`{}`", activity.path),
    }
}

fn format_group_line(operation: BufferedOperation, paths: &[String]) -> String {
    let label = match operation {
        BufferedOperation::Modified => "Edited",
        BufferedOperation::Added => "Added",
        BufferedOperation::Deleted => "Deleted",
        BufferedOperation::Renamed => "Renamed",
        BufferedOperation::Other => "Updated",
    };

    format!("- {}: {}.", label, paths.join(", "))
}

fn format_commit_line(commits: &[String]) -> String {
    let compact: Vec<String> = commits
        .iter()
        .filter_map(|commit| {
            let trimmed = commit.trim();
            (!trimmed.is_empty()).then(|| trimmed.replace('\n', " "))
        })
        .take(MAX_COMMIT_ITEMS)
        .collect();

    if compact.is_empty() {
        return String::new();
    }

    let mut line = format!("- Recent commits: {}.", compact.join(" | "));
    if commits.len() > MAX_COMMIT_ITEMS {
        line.push_str(" ...");
    }

    line
}

fn append_overflow_line(lines: &mut Vec<String>, total_files: usize) {
    let described_files = lines.len().saturating_sub(1);
    let remaining = total_files.saturating_sub(described_files);

    if remaining == 0 {
        return;
    }

    let overflow_line = format!("- ...and {} more file changes.", remaining);
    if !would_exceed_char_budget(lines, &overflow_line) {
        lines.push(overflow_line);
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
    fn unchanged_empty_behavior() {
        let summary = summarize_recent_activity(&[]);

        assert_eq!(summary, "## Recent activity\n- No recent file activity.");
    }

    #[test]
    fn grouped_operation_output_is_readable() {
        let events = vec![
            event("src/a.ts", BufferedOperation::Modified, 10),
            event("src/b.ts", BufferedOperation::Modified, 20),
            event("docs/x.md", BufferedOperation::Added, 30),
            event("src/old.ts", BufferedOperation::Deleted, 40),
            event("src/new-name.ts", BufferedOperation::Renamed, 50),
            event("src/b.ts", BufferedOperation::Modified, 60),
        ];

        let summary = summarize_recent_activity(&events);

        assert!(summary.starts_with("## Recent activity\n"));
        assert!(summary.contains("- Edited: `src/b.ts` (2 changes), `src/a.ts`."));
        assert!(summary.contains("- Added: `docs/x.md`."));
        assert!(summary.contains("- Deleted: `src/old.ts`."));
        assert!(summary.contains("- Renamed: `src/new-name.ts`."));
    }

    #[test]
    fn commit_line_is_included_when_commits_are_provided() {
        let events = vec![event("src/main.ts", BufferedOperation::Modified, 10)];
        let commits = vec![
            "abc123 Fix watcher dedupe".to_string(),
            "def456 Add summariser grouping".to_string(),
        ];

        let summary = summarize_recent_activity_with_commits(&events, &commits);

        assert!(summary.contains("- Edited: `src/main.ts`."));
        assert!(summary.contains("- Recent commits: abc123 Fix watcher dedupe | def456 Add summariser grouping."));
    }

    #[test]
    fn output_still_respects_the_cap() {
        let events: Vec<BufferedEvent> = (0..30)
            .map(|index| {
                event(
                    &format!("src/file-{index}.ts"),
                    match index % 4 {
                        0 => BufferedOperation::Modified,
                        1 => BufferedOperation::Added,
                        2 => BufferedOperation::Deleted,
                        _ => BufferedOperation::Renamed,
                    },
                    index as u64,
                )
            })
            .collect();
        let commits = vec![
            "abc123 first commit".to_string(),
            "def456 second commit".to_string(),
            "ghi789 third commit".to_string(),
            "jkl012 fourth commit".to_string(),
        ];

        let summary = summarize_recent_activity_with_commits(&events, &commits);
        let bullet_lines = summary.lines().filter(|line| line.starts_with("- ")).count();

        assert!(summary.starts_with("## Recent activity\n"));
        assert!(summary.len() <= MAX_OUTPUT_CHARS);
        assert!(bullet_lines <= MAX_ACTIVITY_LINES + 1);
    }

    #[test]
    fn preserves_relative_paths_only() {
        let events = vec![
            event("src\\windows\\main.ts", BufferedOperation::Modified, 10),
            event("docs\\guide.md", BufferedOperation::Added, 20),
        ];

        let summary = summarize_recent_activity(&events);

        assert!(summary.contains("`src/windows/main.ts`"));
        assert!(summary.contains("`docs/guide.md`"));
        assert!(!summary.contains("C:\\"));
    }
}
