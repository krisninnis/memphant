//! Folder watcher - Phase 1 core.
//!
//! This module is compiled only when the `folder_watcher` feature flag is set.
//! Phase 1 keeps the implementation Rust-only and in-memory:
//! - allowlist predicates
//! - notify subscription for one root path
//! - filtered event buffering
//! - no summarisation, redaction, disk writes, or Tauri commands yet
//!
//! Policy references (read before extending this module):
//!   docs/folder-watcher-allowlist.md
//!   docs/folder-watcher-redaction-policy.md
//!   docs/memphant-bet.md

use notify::{recommended_watcher, Event, RecommendedWatcher, RecursiveMode, Watcher};
use std::fs;
use std::path::{Component, Path, PathBuf};
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc, Mutex,
};

const MAX_ALLOWED_FILE_SIZE_BYTES: u64 = 500 * 1024;
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

/// Configuration for a per-project folder watcher instance.
///
/// One `WatcherConfig` is created per linked project when the watcher is started.
/// `root_path` must be the absolute path to the project's linked folder -
/// the same path stored in `linkedFolder.path` on the TypeScript side.
/// It is NEVER written to any memory file or export (see redaction policy).
#[derive(Debug, Clone)]
pub struct WatcherConfig {
    /// Stable project identifier - used for log lines and memory-file routing.
    pub project_id: String,
    /// Absolute path to the project root being watched. Never exported or logged
    /// to any user-visible surface - local audit log only.
    pub root_path: String,
    /// When false, `start_watcher` is a no-op. Allows the caller to pass a config
    /// unconditionally and let the watcher decide whether to start.
    pub enabled: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BufferedEvent {
    pub relative_path: PathBuf,
    pub kind: String,
}

pub struct FolderWatcher {
    root: PathBuf,
    running: Arc<AtomicBool>,
    buffer: Arc<Mutex<Vec<BufferedEvent>>>,
    watcher: Option<RecommendedWatcher>,
}

/// Start the folder watcher for a project.
///
/// Phase 1: logs a startup message and returns immediately.
/// Phase 2 will wire this into a Tauri command lifecycle.
///
/// Returns `Err` if the config is invalid (e.g. empty project_id).
/// Returns `Ok(())` immediately if `config.enabled` is false.
pub fn start_watcher(config: WatcherConfig) -> Result<(), String> {
    if config.project_id.trim().is_empty() {
        return Err("start_watcher: project_id must not be empty".to_string());
    }

    if !config.enabled {
        return Ok(());
    }

    eprintln!("[watcher] started for {}", config.project_id);

    Ok(())
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

            buffer_allowed_paths(&callback_root, &callback_running, &callback_buffer, event);
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

    pub fn drain(&self) -> Vec<BufferedEvent> {
        match self.buffer.lock() {
            Ok(mut guard) => std::mem::take(&mut *guard),
            Err(_) => Vec::new(),
        }
    }
}

impl Drop for FolderWatcher {
    fn drop(&mut self) {
        let _ = self.stop();
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

fn buffer_allowed_paths(
    root: &Path,
    running: &AtomicBool,
    buffer: &Mutex<Vec<BufferedEvent>>,
    event: Event,
) {
    if !running.load(Ordering::SeqCst) {
        return;
    }

    let kind = format!("{:?}", event.kind);
    let mut accepted = Vec::new();

    for path in event.paths {
        if !is_path_allowed(root, &path) || !is_file_size_allowed(&path) {
            continue;
        }

        let relative_path = match path.strip_prefix(root) {
            Ok(relative) => relative.to_path_buf(),
            Err(_) => continue,
        };

        accepted.push(BufferedEvent {
            relative_path,
            kind: kind.clone(),
        });
    }

    if accepted.is_empty() {
        return;
    }

    if let Ok(mut guard) = buffer.lock() {
        guard.extend(accepted);
    }
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
    use std::fs::{self, File};
    use std::io::Write;
    use std::thread;
    use std::time::{Duration, Instant};
    use tempfile::TempDir;

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

    #[test]
    fn start_watcher_ok_when_enabled() {
        let config = WatcherConfig {
            project_id: "test_project".to_string(),
            root_path: "/tmp/fake_root".to_string(),
            enabled: true,
        };
        assert!(start_watcher(config).is_ok());
    }

    #[test]
    fn start_watcher_ok_when_disabled() {
        let config = WatcherConfig {
            project_id: "test_project".to_string(),
            root_path: "/tmp/fake_root".to_string(),
            enabled: false,
        };
        assert!(start_watcher(config).is_ok());
    }

    #[test]
    fn start_watcher_err_on_empty_project_id() {
        let config = WatcherConfig {
            project_id: "".to_string(),
            root_path: "/tmp/fake_root".to_string(),
            enabled: true,
        };
        assert!(start_watcher(config).is_err());
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
    fn allowed_file_events_are_captured() {
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
            events
                .iter()
                .any(|event| event.relative_path == relative("src/main.ts")),
            "expected an event for src/main.ts, got {events:?}"
        );

        watcher.stop().expect("watcher should stop cleanly");
    }

    #[test]
    fn denied_file_events_are_not_buffered() {
        let temp_dir = TempDir::new().expect("temp dir should be created");
        let root = temp_dir.path();
        let mut watcher = FolderWatcher::start(root).expect("watcher should start");

        thread::sleep(Duration::from_millis(150));

        let denied_file = root.join("src").join("api_key_dump.ts");
        write_file(&denied_file, b"const token = 'nope';\n");

        thread::sleep(Duration::from_millis(400));

        let events = watcher.drain();
        assert!(
            events.is_empty(),
            "expected no buffered events for denied file, got {events:?}"
        );

        watcher.stop().expect("watcher should stop cleanly");
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
