//! Folder watcher - Phase 1 skeleton.
//!
//! This module is compiled only when the `folder_watcher` feature flag is set.
//! It holds the configuration struct and the entry-point function.
//! No actual file watching is performed yet - Phase 2 will add the
//! notify-based watcher loop and redaction pipeline.
//!
//! Policy references (read before extending this module):
//!   docs/folder-watcher-allowlist.md
//!   docs/folder-watcher-redaction-policy.md
//!   docs/memphant-bet.md

use std::fs;
use std::path::{Component, Path};

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

/// Start the folder watcher for a project.
///
/// Phase 1: logs a startup message and returns immediately.
/// Phase 2 will spawn the notify-based watch loop here.
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

fn relative_segments(path: &Path) -> Option<Vec<String>> {
    path.components()
        .map(|component| match component {
            Component::Normal(segment) => {
                segment.to_str().map(|value| value.to_ascii_lowercase())
            }
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
    use std::env;
    use std::fs::{self, File};
    use std::io::Write;
    use std::path::PathBuf;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn test_root() -> PathBuf {
        PathBuf::from("/repo")
    }

    fn candidate(path: &str) -> PathBuf {
        test_root().join(path)
    }

    fn unique_temp_path(prefix: &str) -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock should be after unix epoch")
            .as_nanos();
        env::temp_dir().join(format!("memphant-watcher-{prefix}-{nanos}"))
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
        let temp_dir = unique_temp_path("size");
        fs::create_dir_all(&temp_dir).expect("temp dir should be created");

        let allowed_path = temp_dir.join("allowed.ts");
        let denied_path = temp_dir.join("denied.ts");

        let mut allowed_file = File::create(&allowed_path).expect("allowed file should be created");
        allowed_file
            .write_all(&vec![b'a'; MAX_ALLOWED_FILE_SIZE_BYTES as usize])
            .expect("allowed file should be written");

        let mut denied_file = File::create(&denied_path).expect("denied file should be created");
        denied_file
            .write_all(&vec![b'b'; (MAX_ALLOWED_FILE_SIZE_BYTES + 1) as usize])
            .expect("denied file should be written");

        assert!(is_file_size_allowed(&allowed_path));
        assert!(!is_file_size_allowed(&denied_path));
        assert!(!is_file_size_allowed(&temp_dir.join("missing.ts")));

        fs::remove_dir_all(&temp_dir).expect("temp dir should be removed");
    }
}
