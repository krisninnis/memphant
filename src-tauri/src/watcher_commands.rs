//! Tauri commands for the folder watcher feature.
//!
//! This module always compiles so the Tauri command registration stays stable.
//! The real watcher-backed implementation is enabled only with the
//! `folder_watcher` feature flag.

#[cfg(feature = "folder_watcher")]
use crate::summariser::{
    load_recent_commit_messages, summarize_recent_activity_with_commits,
};
#[cfg(feature = "folder_watcher")]
use std::path::PathBuf;
use std::sync::Mutex;

pub struct WatcherCommandState {
    #[cfg(feature = "folder_watcher")]
    pub manager: Mutex<crate::watcher::WatcherManager>,
    #[cfg(not(feature = "folder_watcher"))]
    #[allow(dead_code)]
    pub disabled: Mutex<()>,
}

impl Default for WatcherCommandState {
    fn default() -> Self {
        Self {
            #[cfg(feature = "folder_watcher")]
            manager: Mutex::new(crate::watcher::WatcherManager::default()),
            #[cfg(not(feature = "folder_watcher"))]
            disabled: Mutex::new(()),
        }
    }
}

#[tauri::command]
pub async fn get_recent_activity(
    _project_id: String,
    _folder_path: String,
    _state: tauri::State<'_, WatcherCommandState>,
) -> Result<String, String> {
    #[cfg(feature = "folder_watcher")]
    {
        if _project_id.trim().is_empty() {
            return Err("get_recent_activity: project_id must not be empty".to_string());
        }

        if _folder_path.trim().is_empty() {
            return Err("get_recent_activity: folder_path must not be empty".to_string());
        }

        let requested_root = PathBuf::from(&_folder_path)
            .canonicalize()
            .map_err(|err| format!("get_recent_activity: failed to resolve folder path: {err}"))?;

        let mut manager = _state
            .manager
            .lock()
            .map_err(|_| "get_recent_activity: watcher state lock poisoned".to_string())?;

        let should_replace = manager
            .active_root()
            .map(|active_root| active_root != requested_root.as_path())
            .unwrap_or(true);

        if should_replace {
            manager.start(&requested_root)?;
        }

        let events = manager.drain();
        let commits = load_recent_commit_messages(&requested_root);

        Ok(summarize_recent_activity_with_commits(&events, &commits))
    }
    #[cfg(not(feature = "folder_watcher"))]
    {
        Err("folder_watcher feature not enabled".to_string())
    }
}
