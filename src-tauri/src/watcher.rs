//! Folder watcher - Phase 1 hardened core.
//!
//! This module is compiled only when the `folder_watcher` feature flag is set.
//! Phase 1 keeps the implementation Rust-only and in-memory:
//! - allowlist predicates
//! - notify subscription for one root path
//! - normalized filtered event buffering
//! - no summarisation, redaction, disk writes, or Tauri commands yet
//!
//! Policy references (read before extending this module):
//!   docs/folder-watcher-allowlist.md
//!   docs/folder-watcher-redaction-policy.md
//!   docs/memphant-bet.md

use notify::{
    event::{CreateKind, EventKind, ModifyKind, RemoveKind},
    recommended_watcher, Event, RecommendedWatcher, RecursiveMode, Watcher,
};
use std::fs;
use std::path::{Component, Path, PathBuf};
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc, Mutex,
};
use std::time::{SystemTime, UNIX_EPOCH};

const MAX_ALLOWED_FILE_SIZE_BYTES: u64 = 500 * 1024;
const DEDUPE_WINDOW_MS: u64 = 200;
const ALLOWED_EXTENSIONS: &[&str] = &[
    "ts", "tsx", "js", "jsx", "mjs", "cjs", "rs", "toml", "py", "go", "html", "css", "scss",
    "md", "mdx", "sql", "json", "yml", "yaml",
];
const DENIED_FILENAME_SUBSTRINGS: &[&str] = &[
    "secret",
    "secrets",
    "credentials",
    "token",
    "apikey",
    "api_key",
    ".pem",
    ".key",
    ".p12",
    ".pfx",
];
const DENIED_PATH_SEGMENTS: &[&str] = &[
    "node_modules",
    "target",
    "dist",
    "build",
    "out",
    ".next",
    ".nuxt",
    "coverage",
    ".git",
    ".vscode",
    ".idea",
    "internal",
];

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BufferedOperation {
    Added,
    Modified,
    Deleted,
    Renamed,
    Other,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BufferedEvent {
    pub relative_path: PathBuf,
    pub operation: BufferedOperation,
    pub timestamp_ms: u64,
}

pub struct FolderWatcher {
    root: PathBuf,
    running: Arc<AtomicBool>,
    buffer: Arc<Mutex<Vec<BufferedEvent>>>,
    watcher: Option<RecommendedWatcher>,
}

#[derive(Default)]
pub struct WatcherManager {
    active: Option<FolderWatcher>,
}

impl FolderWatcher {
    pub fn start(root: &Path) -> Result<Self, String> {
        if !root.exists() {
            return Err(format!("watcher root does not exist: {}", root.display()));
        }

        if !root.is_dir() {
            return Err(format!("watcher root is not a directory: {}", root.display()));
        }

        let root = root
            .canonicalize()
            .map_err(|err| format!("failed to canonicalize watcher root: {err}"))?;
        let running = Arc::new(AtomicBool::new(true));
        let buffer = Arc::new(Mutex::new(Vec::new()));

        let callback_root = root.clone();
        let callback_running = Arc::clone(&running);
        let callback_buffer = Arc::clone(&buffer);

        let mut watcher = recommended_watcher(move |result: notify::Result<Event>| {
            if !callback_running.load(Ordering::SeqCst) {
                return;
            }

            let event = match result {
                Ok(event) => event,
                Err(_) => return,
            };

            let normalized = normalize_event(&callback_root, event, current_timestamp_ms());
            push_deduped_events(&callback_buffer, normalized);
        })
        .map_err(|err| format!("failed to create filesystem watcher: {err}"))?;

        watcher
            .watch(&root, RecursiveMode::Recursive)
            .map_err(|err| format!("failed to watch {}: {err}", root.display()))?;

        Ok(Self {
            root,
            running,
            buffer,
            watcher: Some(watcher),
        })
    }

    pub fn stop(&mut self) -> Result<(), String> {
        self.running.store(false, Ordering::SeqCst);

        if let Some(mut watcher) = self.watcher.take() {
            watcher
                .unwatch(&self.root)
                .map_err(|err| format!("failed to stop watching {}: {err}", self.root.display()))?;
        }

        Ok(())
    }

    #[allow(dead_code)]
    pub fn drain(&self) -> Vec<BufferedEvent> {
        match self.buffer.lock() {
            Ok(mut guard) => std::mem::take(&mut *guard),
            Err(_) => Vec::new(),
        }
    }

    pub fn peek(&self) -> Vec<BufferedEvent> {
        self.buffer
            .lock()
            .map(|guard| guard.clone())
            .unwrap_or_default()
    }

    pub fn root(&self) -> &Path {
        &self.root
    }
}

impl Drop for FolderWatcher {
    fn drop(&mut self) {
        let _ = self.stop();
    }
}

impl WatcherManager {
    pub fn start(&mut self, root: &Path) -> Result<(), String> {
        self.stop()?;
        let watcher = FolderWatcher::start(root)?;
        self.active = Some(watcher);
        Ok(())
    }

    pub fn stop(&mut self) -> Result<(), String> {
        if let Some(mut watcher) = self.active.take() {
            watcher.stop()?;
        }

        Ok(())
    }

    #[allow(dead_code)]
    pub fn drain(&self) -> Vec<BufferedEvent> {
        self.active
            .as_ref()
            .map(|watcher| watcher.drain())
            .unwrap_or_default()
    }

    pub fn peek(&self) -> Vec<BufferedEvent> {
        self.active
            .as_ref()
            .map(|watcher| watcher.peek())
            .unwrap_or_default()
    }

    pub fn active_root(&self) -> Option<&Path> {
        self.active.as_ref().map(|watcher| watcher.root())
    }

}

pub fn is_path_allowed(root: &Path, candidate: &Path) -> bool {
    let relative = match candidate.strip_prefix(root) {
        Ok(path) if !path.as_os_str().is_empty() => path,
        _ => return false,
    };

    let file_name = match candidate.file_name().and_then(|name| name.to_str()) {
        Some(name) => name,
        None => return false,
    };

    let lower_file_name = file_name.to_ascii_lowercase();

    if lower_file_name.starts_with(".env") {
        return false;
    }

    if lower_file_name == "supabase-rls-fix.sql" {
        return false;
    }

    if DENIED_FILENAME_SUBSTRINGS
        .iter()
        .any(|needle| lower_file_name.contains(needle))
    {
        return false;
    }

    if is_explicitly_denied_filename(&lower_file_name) {
        return false;
    }

    let extension = match candidate.extension().and_then(|ext| ext.to_str()) {
        Some(ext) => ext.to_ascii_lowercase(),
        None => return false,
    };

    if !ALLOWED_EXTENSIONS.contains(&extension.as_str()) {
        return false;
    }

    let segments = match relative_segments(relative) {
        Some(segments) if !segments.is_empty() => segments,
        _ => return false,
    };

    if segments
        .iter()
        .any(|segment| DENIED_PATH_SEGMENTS.contains(&segment.as_str()))
    {
        return false;
    }

    match segments.as_slice() {
        [_file] => true,
        [first, ..] if first == "src" => true,
        [first, second, ..] if first == "src-tauri" && second == "src" => true,
        [first, ..] if first == "api" => true,
        [first, ..] if first == "scripts" => true,
        [first, rest @ ..] if first == "chrome-extension" => {
            !matches!(rest.first(), Some(next) if next == "dist")
        }
        [first, rest @ ..] if first == "public" => {
            !matches!(rest.first(), Some(next) if next == "build")
        }
        [first, ..] if first == "docs" => true,
        [first, ..] if first == "landing" => true,
        _ => false,
    }
}

pub fn is_file_size_allowed(path: &Path) -> bool {
    match fs::metadata(path) {
        Ok(metadata) => metadata.is_file() && metadata.len() <= MAX_ALLOWED_FILE_SIZE_BYTES,
        Err(_) => false,
    }
}

fn normalize_event(root: &Path, event: Event, timestamp_ms: u64) -> Vec<BufferedEvent> {
    let operation = normalize_operation(&event.kind);
    let candidate_paths = choose_candidate_paths(&event, operation);
    let mut normalized = Vec::new();

    for path in candidate_paths {
        if !path_passes_buffer_filters(root, path, operation) {
            continue;
        }

        let relative_path = match path.strip_prefix(root) {
            Ok(relative) => relative.to_path_buf(),
            Err(_) => continue,
        };

        normalized.push(BufferedEvent {
            relative_path,
            operation,
            timestamp_ms,
        });
    }

    normalized
}

fn normalize_operation(kind: &EventKind) -> BufferedOperation {
    match kind {
        EventKind::Create(CreateKind::Any)
        | EventKind::Create(CreateKind::File)
        | EventKind::Create(CreateKind::Folder) => BufferedOperation::Added,
        EventKind::Modify(ModifyKind::Data(_))
        | EventKind::Modify(ModifyKind::Metadata(_))
        | EventKind::Modify(ModifyKind::Any) => BufferedOperation::Modified,
        EventKind::Modify(ModifyKind::Name(_)) => BufferedOperation::Renamed,
        EventKind::Remove(RemoveKind::Any)
        | EventKind::Remove(RemoveKind::File)
        | EventKind::Remove(RemoveKind::Folder) => BufferedOperation::Deleted,
        _ => BufferedOperation::Other,
    }
}

fn choose_candidate_paths<'a>(event: &'a Event, operation: BufferedOperation) -> Vec<&'a Path> {
    match operation {
        BufferedOperation::Renamed => event
            .paths
            .last()
            .map(|path| vec![path.as_path()])
            .unwrap_or_default(),
        _ => event.paths.iter().map(|path| path.as_path()).collect(),
    }
}

fn path_passes_buffer_filters(root: &Path, path: &Path, operation: BufferedOperation) -> bool {
    if !is_path_allowed(root, path) {
        return false;
    }

    match operation {
        BufferedOperation::Deleted => true,
        _ => match fs::metadata(path) {
            Ok(_) => is_file_size_allowed(path),
            Err(_) => true,
        },
    }
}

fn push_deduped_events(buffer: &Mutex<Vec<BufferedEvent>>, events: Vec<BufferedEvent>) {
    if events.is_empty() {
        return;
    }

    if let Ok(mut guard) = buffer.lock() {
        for event in events {
            let should_skip = guard.last().is_some_and(|last| {
                last.relative_path == event.relative_path
                    && last.operation == event.operation
                    && event.timestamp_ms.saturating_sub(last.timestamp_ms) <= DEDUPE_WINDOW_MS
            });

            if !should_skip {
                guard.push(event);
            }
        }
    }
}

fn current_timestamp_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0)
}

fn relative_segments(path: &Path) -> Option<Vec<String>> {
    path.components()
        .map(|component| match component {
            Component::Normal(segment) => segment.to_str().map(|value| value.to_ascii_lowercase()),
            _ => None,
        })
        .collect()
}

fn is_explicitly_denied_filename(lower_file_name: &str) -> bool {
    lower_file_name.ends_with(".lock")
        || matches!(
            lower_file_name,
            "package-lock.json" | "pnpm-lock.yaml" | "yarn.lock" | "cargo.lock"
        )
        || lower_file_name.ends_with(".log")
        || lower_file_name.ends_with(".tmp")
        || lower_file_name.ends_with(".bak")
        || lower_file_name.ends_with(".swp")
}

#[cfg(test)]
mod tests {
    use super::*;
    use notify::event::{EventAttributes, RenameMode};
    use std::fs::{self, File};
    use std::io::Write;
    use std::thread;
    use std::time::{Duration, Instant};
    use tempfile::TempDir;
    use crate::summariser::summarize_recent_activity_with_commits;

    fn test_root() -> PathBuf {
        PathBuf::from("/repo")
    }

    fn candidate(path: &str) -> PathBuf {
        test_root().join(path)
    }

    fn wait_for_events<F>(watcher: &FolderWatcher, predicate: F) -> Vec<BufferedEvent>
    where
        F: Fn(&[BufferedEvent]) -> bool,
    {
        let deadline = Instant::now() + Duration::from_secs(5);
        let mut collected = Vec::new();

        while Instant::now() < deadline {
            let drained = watcher.drain();
            if !drained.is_empty() {
                collected.extend(drained);
                if predicate(&collected) {
                    return collected;
                }
            }

            thread::sleep(Duration::from_millis(50));
        }

        collected
    }

    fn relative(path: &str) -> PathBuf {
        PathBuf::from(path)
    }

    fn write_file(path: &Path, contents: &[u8]) {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).expect("parent directory should be created");
        }

        let mut file = File::create(path).expect("file should be created");
        file.write_all(contents).expect("file should be written");
        file.sync_all().expect("file should be flushed");
    }

    fn synthetic_event(kind: EventKind, paths: Vec<PathBuf>) -> Event {
        Event {
            kind,
            paths,
            attrs: EventAttributes::default(),
        }
    }

    #[test]
    fn manager_starts_with_one_root() {
        let temp_dir = TempDir::new().expect("temp dir should be created");
        let root = temp_dir.path().canonicalize().expect("root should canonicalize");
        let mut manager = WatcherManager::default();

        manager.start(&root).expect("manager should start watcher");

        assert_eq!(manager.active_root(), Some(root.as_path()));

        manager.stop().expect("manager stop should succeed");
    }

    #[test]
    fn manager_replaces_watcher_with_second_root() {
        let first_dir = TempDir::new().expect("first temp dir should be created");
        let second_dir = TempDir::new().expect("second temp dir should be created");
        let first_root = first_dir
            .path()
            .canonicalize()
            .expect("first root should canonicalize");
        let second_root = second_dir
            .path()
            .canonicalize()
            .expect("second root should canonicalize");
        let mut manager = WatcherManager::default();

        manager
            .start(&first_root)
            .expect("manager should start first watcher");
        assert_eq!(manager.active_root(), Some(first_root.as_path()));

        manager
            .start(&second_root)
            .expect("manager should replace watcher");
        assert_eq!(manager.active_root(), Some(second_root.as_path()));

        manager.stop().expect("manager stop should succeed");
    }

    #[test]
    fn manager_stop_leaves_no_active_watcher() {
        let temp_dir = TempDir::new().expect("temp dir should be created");
        let root = temp_dir.path().canonicalize().expect("root should canonicalize");
        let mut manager = WatcherManager::default();

        manager.start(&root).expect("manager should start watcher");
        manager.stop().expect("manager stop should succeed");

        assert_eq!(manager.active_root(), None);
    }

    #[test]
    fn drain_on_empty_manager_returns_empty() {
        let manager = WatcherManager::default();

        assert!(manager.drain().is_empty());
    }

    #[test]
    fn manager_generates_summary_from_buffered_events() {
        let temp_dir = TempDir::new().expect("temp dir should be created");
        let root = temp_dir.path().canonicalize().expect("root should canonicalize");
        let mut manager = WatcherManager::default();

        manager.start(&root).expect("manager should start watcher");
        thread::sleep(Duration::from_millis(150));

        let allowed_file = root.join("src").join("main.ts");
        write_file(&allowed_file, b"export const ready = true;\n");
        thread::sleep(Duration::from_millis(400));

        let summary = summarize_recent_activity_with_commits(&manager.drain(), &[]);
        assert!(summary.starts_with("## Recent activity\n"));
        assert!(summary.contains("src/main.ts"));

        manager.stop().expect("manager stop should succeed");
    }

    #[test]
    fn manager_summary_drain_clears_buffered_events() {
        let temp_dir = TempDir::new().expect("temp dir should be created");
        let root = temp_dir.path().canonicalize().expect("root should canonicalize");
        let mut manager = WatcherManager::default();

        manager.start(&root).expect("manager should start watcher");
        thread::sleep(Duration::from_millis(150));

        let allowed_file = root.join("docs").join("note.md");
        write_file(&allowed_file, b"# Note\n");
        thread::sleep(Duration::from_millis(400));

        let first_summary = summarize_recent_activity_with_commits(&manager.drain(), &[]);
        assert!(first_summary.contains("docs/note.md"));

        let second_summary = summarize_recent_activity_with_commits(&manager.drain(), &[]);
        assert_eq!(second_summary, "## Recent activity\n- No recent file activity.");

        manager.stop().expect("manager stop should succeed");
    }

    #[test]
    fn empty_manager_returns_existing_empty_summary_block() {
        let manager = WatcherManager::default();

        assert_eq!(
            summarize_recent_activity_with_commits(&manager.drain(), &[]),
            "## Recent activity\n- No recent file activity."
        );
    }

    #[test]
    fn path_checks_deny_empty_and_root_only_cases() {
        let root = test_root();

        assert!(!is_path_allowed(Path::new(""), &root.join("src/main.ts")));
        assert!(!is_path_allowed(&root, &root));
        assert!(!is_path_allowed(&root, &root.join("src")));
    }

    #[test]
    fn path_checks_allow_known_extensions() {
        let root = test_root();

        assert!(is_path_allowed(&root, &candidate("src/main.ts")));
        assert!(is_path_allowed(&root, &candidate("src-tauri/src/lib.rs")));
        assert!(is_path_allowed(&root, &candidate("docs/spec.mdx")));
        assert!(is_path_allowed(&root, &candidate("landing/site.scss")));
        assert!(is_path_allowed(&root, &candidate("package.json")));
    }

    #[test]
    fn path_checks_deny_unknown_extensions() {
        let root = test_root();

        assert!(!is_path_allowed(&root, &candidate("src/logo.svg")));
        assert!(!is_path_allowed(&root, &candidate("docs/archive.txt")));
    }

    #[test]
    fn path_checks_allow_documented_directories() {
        let root = test_root();

        assert!(is_path_allowed(&root, &candidate("api/handlers/user.ts")));
        assert!(is_path_allowed(&root, &candidate("scripts/deploy.py")));
        assert!(is_path_allowed(
            &root,
            &candidate("chrome-extension/src/popup.tsx")
        ));
        assert!(is_path_allowed(&root, &candidate("public/app.css")));
    }

    #[test]
    fn path_checks_deny_explicitly_denied_directories() {
        let root = test_root();

        assert!(!is_path_allowed(
            &root,
            &candidate("chrome-extension/dist/bundle.js")
        ));
        assert!(!is_path_allowed(&root, &candidate("public/build/app.css")));
        assert!(!is_path_allowed(&root, &candidate("src/node_modules/react.js")));
        assert!(!is_path_allowed(&root, &candidate("target/debug/build.rs")));
        assert!(!is_path_allowed(&root, &candidate(".git/config.json")));
    }

    #[test]
    fn path_checks_deny_secret_like_filenames_case_insensitively() {
        let root = test_root();

        assert!(!is_path_allowed(&root, &candidate("src/Api_Key_Helper.ts")));
        assert!(!is_path_allowed(&root, &candidate("docs/CREDENTIALS.md")));
        assert!(!is_path_allowed(&root, &candidate("src/.ENV.local.ts")));
    }

    #[test]
    fn path_checks_allow_repo_root_top_level_files() {
        let root = test_root();

        assert!(is_path_allowed(&root, &candidate("README.md")));
        assert!(is_path_allowed(&root, &candidate("package.json")));
    }

    #[test]
    fn path_checks_deny_nested_files_outside_allowed_roots() {
        let root = test_root();

        assert!(!is_path_allowed(&root, &candidate("config/app.json")));
        assert!(!is_path_allowed(&root, &candidate("root/nested/README.md")));
    }

    #[test]
    fn path_checks_deny_internal_segments() {
        let root = test_root();

        assert!(!is_path_allowed(&root, &candidate("src/internal/tools.rs")));
        assert!(!is_path_allowed(&root, &candidate("docs/Internal/notes.md")));
    }

    #[test]
    fn path_checks_deny_supabase_rls_fix() {
        let root = test_root();

        assert!(!is_path_allowed(&root, &candidate("src/supabase-rls-fix.sql")));
        assert!(!is_path_allowed(&root, &candidate("supabase-rls-fix.sql")));
    }

    #[test]
    fn file_size_check_allows_limit_and_denies_above_it() {
        let temp_dir = TempDir::new().expect("temp dir should be created");
        let allowed_path = temp_dir.path().join("allowed.ts");
        let denied_path = temp_dir.path().join("denied.ts");

        write_file(&allowed_path, &vec![b'a'; MAX_ALLOWED_FILE_SIZE_BYTES as usize]);
        write_file(
            &denied_path,
            &vec![b'b'; (MAX_ALLOWED_FILE_SIZE_BYTES + 1) as usize],
        );

        assert!(is_file_size_allowed(&allowed_path));
        assert!(!is_file_size_allowed(&denied_path));
        assert!(!is_file_size_allowed(&temp_dir.path().join("missing.ts")));
    }

    #[test]
    fn create_or_write_is_captured_as_added_or_modified() {
        let temp_dir = TempDir::new().expect("temp dir should be created");
        let root = temp_dir.path();
        let mut watcher = FolderWatcher::start(root).expect("watcher should start");

        thread::sleep(Duration::from_millis(150));

        let allowed_file = root.join("src").join("main.ts");
        write_file(&allowed_file, b"export const ready = true;\n");

        let events = wait_for_events(&watcher, |events| {
            events
                .iter()
                .any(|event| event.relative_path == relative("src/main.ts"))
        });

        assert!(
            events.iter().any(|event| {
                event.relative_path == relative("src/main.ts")
                    && matches!(
                        event.operation,
                        BufferedOperation::Added | BufferedOperation::Modified
                    )
            }),
            "expected added or modified event for src/main.ts, got {events:?}"
        );

        watcher.stop().expect("watcher should stop cleanly");
    }

    #[test]
    fn delete_is_captured_even_after_the_file_is_gone() {
        let temp_dir = TempDir::new().expect("temp dir should be created");
        let root = temp_dir.path();
        let mut watcher = FolderWatcher::start(root).expect("watcher should start");

        thread::sleep(Duration::from_millis(150));

        let allowed_file = root.join("src").join("gone.ts");
        write_file(&allowed_file, b"export const alive = true;\n");

        let _ = wait_for_events(&watcher, |events| {
            events
                .iter()
                .any(|event| event.relative_path == relative("src/gone.ts"))
        });
        let _ = watcher.drain();

        fs::remove_file(&allowed_file).expect("file should be deleted");
        assert!(!allowed_file.exists(), "deleted file should be gone");

        let events = wait_for_events(&watcher, |events| {
            events.iter().any(|event| {
                event.relative_path == relative("src/gone.ts")
                    && event.operation == BufferedOperation::Deleted
            })
        });

        assert!(
            events.iter().any(|event| {
                event.relative_path == relative("src/gone.ts")
                    && event.operation == BufferedOperation::Deleted
            }),
            "expected deleted event for src/gone.ts, got {events:?}"
        );

        watcher.stop().expect("watcher should stop cleanly");
    }

    #[test]
    fn rename_is_captured_using_the_destination_path() {
        let root = test_root();
        let event = synthetic_event(
            EventKind::Modify(ModifyKind::Name(RenameMode::Both)),
            vec![candidate("src/old.ts"), candidate("src/new.ts")],
        );

        let normalized = normalize_event(&root, event, 1234);

        assert_eq!(
            normalized,
            vec![BufferedEvent {
                relative_path: relative("src/new.ts"),
                operation: BufferedOperation::Renamed,
                timestamp_ms: 1234,
            }]
        );
    }

    #[test]
    fn duplicate_noisy_events_are_collapsed() {
        let root = test_root();
        let event = synthetic_event(
            EventKind::Modify(ModifyKind::Data(notify::event::DataChange::Any)),
            vec![candidate("src/main.ts")],
        );

        let first = normalize_event(&root, event.clone(), 1_000);
        let second = normalize_event(&root, event, 1_100);
        let buffer = Mutex::new(Vec::new());

        push_deduped_events(&buffer, first);
        push_deduped_events(&buffer, second);

        let final_events = buffer.into_inner().expect("buffer should unlock cleanly");
        assert_eq!(final_events.len(), 1, "expected duplicate events to collapse");
        assert_eq!(final_events[0].relative_path, relative("src/main.ts"));
        assert_eq!(final_events[0].operation, BufferedOperation::Modified);
    }

    #[test]
    fn denied_paths_are_still_ignored() {
        let root = test_root();
        let event = synthetic_event(
            EventKind::Create(CreateKind::File),
            vec![candidate("src/api_key_dump.ts")],
        );

        let normalized = normalize_event(&root, event, 999);
        assert!(normalized.is_empty(), "expected denied path to be ignored");
    }

    #[test]
    fn stopping_the_watcher_stops_new_buffering() {
        let temp_dir = TempDir::new().expect("temp dir should be created");
        let root = temp_dir.path();
        let mut watcher = FolderWatcher::start(root).expect("watcher should start");

        thread::sleep(Duration::from_millis(150));

        let first_file = root.join("src").join("before_stop.ts");
        write_file(&first_file, b"export const beforeStop = true;\n");

        let initial_events = wait_for_events(&watcher, |events| {
            events
                .iter()
                .any(|event| event.relative_path == relative("src/before_stop.ts"))
        });

        assert!(
            initial_events
                .iter()
                .any(|event| event.relative_path == relative("src/before_stop.ts")),
            "expected an event before stop, got {initial_events:?}"
        );

        watcher.stop().expect("watcher should stop cleanly");

        let second_file = root.join("src").join("after_stop.ts");
        write_file(&second_file, b"export const afterStop = true;\n");

        thread::sleep(Duration::from_millis(400));

        let post_stop_events = watcher.drain();
        assert!(
            post_stop_events.is_empty(),
            "expected no events after stop, got {post_stop_events:?}"
        );
    }

    #[test]
    fn draining_returns_buffered_events_and_clears_the_queue() {
        let temp_dir = TempDir::new().expect("temp dir should be created");
        let root = temp_dir.path();
        let mut watcher = FolderWatcher::start(root).expect("watcher should start");

        thread::sleep(Duration::from_millis(150));

        let allowed_file = root.join("docs").join("note.md");
        write_file(&allowed_file, b"# Note\n");

        let drained_once = wait_for_events(&watcher, |events| {
            events
                .iter()
                .any(|event| event.relative_path == relative("docs/note.md"))
        });

        assert!(
            drained_once
                .iter()
                .any(|event| event.relative_path == relative("docs/note.md")),
            "expected drained events to include docs/note.md, got {drained_once:?}"
        );

        let drained_twice = watcher.drain();
        assert!(
            drained_twice.is_empty(),
            "expected second drain to be empty, got {drained_twice:?}"
        );

        watcher.stop().expect("watcher should stop cleanly");
    }
}
