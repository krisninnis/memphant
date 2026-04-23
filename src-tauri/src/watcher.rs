//! Folder watcher — Phase 1 skeleton.
//!
//! This module is compiled only when the `folder_watcher` feature flag is set.
//! It holds the configuration struct and the entry-point function.
//! No actual file watching is performed yet — Phase 2 will add the
//! notify-based watcher loop, allowlist filtering, and redaction pipeline.
//!
//! Policy references (read before extending this module):
//!   docs/folder-watcher-allowlist.md     — what paths/extensions may be watched
//!   docs/folder-watcher-redaction-policy.md — what may be written to memory files
//!   docs/memphant-bet.md                 — six-week bet context

/// Configuration for a per-project folder watcher instance.
///
/// One `WatcherConfig` is created per linked project when the watcher is started.
/// `root_path` must be the absolute path to the project's linked folder —
/// the same path stored in `linkedFolder.path` on the TypeScript side.
/// It is NEVER written to any memory file or export (see redaction policy).
#[derive(Debug, Clone)]
pub struct WatcherConfig {
    /// Stable project identifier — used for log lines and memory-file routing.
    pub project_id: String,
    /// Absolute path to the project root being watched. Never exported or logged
    /// to any user-visible surface — local audit log only.
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
        // Disabled in config — start nothing, log nothing.
        return Ok(());
    }

    // Phase 1: skeleton only — no file watching yet.
    eprintln!("[watcher] started for {}", config.project_id);

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

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
}
