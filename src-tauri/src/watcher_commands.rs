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
use std::fs;
#[cfg(feature = "folder_watcher")]
use std::path::{Path, PathBuf};
use std::sync::Mutex;
#[cfg(feature = "folder_watcher")]
use std::time::{Duration, SystemTime};

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

#[cfg(feature = "folder_watcher")]
const MAX_CHANGED_FILES: usize = 30;

#[cfg(feature = "folder_watcher")]
fn should_skip_directory(path: &Path) -> bool {
    let Some(name) = path.file_name().and_then(|value| value.to_str()) else {
        return false;
    };

    matches!(
        name,
        "node_modules" | ".git" | "target" | "dist" | ".next" | "build"
    )
}

#[cfg(feature = "folder_watcher")]
fn parse_js_iso_to_system_time(input: &str) -> Result<SystemTime, String> {
    let trimmed = input.trim();
    if trimmed.is_empty() {
        return Err("get_files_changed_since: since_iso must not be empty".to_string());
    }

    let without_z = trimmed
        .strip_suffix('Z')
        .ok_or_else(|| "get_files_changed_since: since_iso must end with 'Z'".to_string())?;

    let (date_part, time_part) = without_z
        .split_once('T')
        .ok_or_else(|| "get_files_changed_since: since_iso must include 'T'".to_string())?;

    let mut date_chunks = date_part.split('-');
    let year: i32 = date_chunks
        .next()
        .ok_or_else(|| "get_files_changed_since: missing year".to_string())?
        .parse()
        .map_err(|_| "get_files_changed_since: invalid year".to_string())?;
    let month: u32 = date_chunks
        .next()
        .ok_or_else(|| "get_files_changed_since: missing month".to_string())?
        .parse()
        .map_err(|_| "get_files_changed_since: invalid month".to_string())?;
    let day: u32 = date_chunks
        .next()
        .ok_or_else(|| "get_files_changed_since: missing day".to_string())?
        .parse()
        .map_err(|_| "get_files_changed_since: invalid day".to_string())?;

    if date_chunks.next().is_some() {
        return Err("get_files_changed_since: invalid date format".to_string());
    }

    let (time_main, fractional_part) = match time_part.split_once('.') {
        Some((main, fraction)) => (main, Some(fraction)),
        None => (time_part, None),
    };

    let mut time_chunks = time_main.split(':');
    let hour: u32 = time_chunks
        .next()
        .ok_or_else(|| "get_files_changed_since: missing hour".to_string())?
        .parse()
        .map_err(|_| "get_files_changed_since: invalid hour".to_string())?;
    let minute: u32 = time_chunks
        .next()
        .ok_or_else(|| "get_files_changed_since: missing minute".to_string())?
        .parse()
        .map_err(|_| "get_files_changed_since: invalid minute".to_string())?;
    let second: u32 = time_chunks
        .next()
        .ok_or_else(|| "get_files_changed_since: missing second".to_string())?
        .parse()
        .map_err(|_| "get_files_changed_since: invalid second".to_string())?;

    if time_chunks.next().is_some() {
        return Err("get_files_changed_since: invalid time format".to_string());
    }

    let millis = match fractional_part {
        Some(value) => {
            let digits: String = value.chars().take(3).collect();
            let padded = format!("{digits:0<3}");
            padded
                .parse::<u64>()
                .map_err(|_| "get_files_changed_since: invalid milliseconds".to_string())?
        }
        None => 0,
    };

    if !(1..=12).contains(&month) {
        return Err("get_files_changed_since: month out of range".to_string());
    }

    if !(1..=31).contains(&day) {
        return Err("get_files_changed_since: day out of range".to_string());
    }

    if hour > 23 || minute > 59 || second > 59 {
        return Err("get_files_changed_since: time component out of range".to_string());
    }

    fn days_from_civil(year: i32, month: u32, day: u32) -> i64 {
        let mut year = year as i64;
        let month = month as i64;
        let day = day as i64;

        year -= if month <= 2 { 1 } else { 0 };
        let era = if year >= 0 { year } else { year - 399 } / 400;
        let yoe = year - era * 400;
        let doy = (153 * (month + if month > 2 { -3 } else { 9 }) + 2) / 5 + day - 1;
        let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
        era * 146_097 + doe - 719_468
    }

    let days = days_from_civil(year, month, day);
    let seconds = days
        .checked_mul(86_400)
        .and_then(|value| value.checked_add(hour as i64 * 3_600))
        .and_then(|value| value.checked_add(minute as i64 * 60))
        .and_then(|value| value.checked_add(second as i64))
        .ok_or_else(|| "get_files_changed_since: timestamp overflow".to_string())?;

    if seconds < 0 {
        return Err("get_files_changed_since: timestamp before unix epoch".to_string());
    }

    Ok(
        SystemTime::UNIX_EPOCH
            + Duration::from_secs(seconds as u64)
            + Duration::from_millis(millis),
    )
}

#[cfg(feature = "folder_watcher")]
fn collect_changed_files(
    current: &Path,
    root: &Path,
    since: SystemTime,
    results: &mut Vec<String>,
) -> Result<(), String> {
    if results.len() >= MAX_CHANGED_FILES {
        return Ok(());
    }

    let Ok(entries) = fs::read_dir(current) else {
        return Ok(());
    };

    for entry_result in entries {
        if results.len() >= MAX_CHANGED_FILES {
            break;
        }

        let Ok(entry) = entry_result else {
            continue;
        };

        let path = entry.path();
        let Ok(file_type) = entry.file_type() else {
            continue;
        };

        if file_type.is_dir() {
            if should_skip_directory(&path) {
                continue;
            }

            collect_changed_files(&path, root, since, results)?;
            continue;
        }

        if !file_type.is_file() {
            continue;
        }

        let Ok(metadata) = entry.metadata() else {
            continue;
        };

        let Ok(modified) = metadata.modified() else {
            continue;
        };

        if modified <= since {
            continue;
        }

        let Ok(relative) = path.strip_prefix(root) else {
            continue;
        };

        results.push(relative.to_string_lossy().replace('\\', "/"));
    }

    Ok(())
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

        let events = manager.peek();
        let commits = load_recent_commit_messages(&requested_root);

        Ok(summarize_recent_activity_with_commits(&events, &commits))
    }
    #[cfg(not(feature = "folder_watcher"))]
    {
        Err("folder_watcher feature not enabled".to_string())
    }
}

#[tauri::command]
pub async fn get_files_changed_since(
    _folder_path: String,
    _since_iso: String,
) -> Result<Vec<String>, String> {
    #[cfg(feature = "folder_watcher")]
    {
        if _folder_path.trim().is_empty() {
            return Ok(vec![]);
        }

        let requested_root = PathBuf::from(&_folder_path)
            .canonicalize()
            .map_err(|err| {
                format!("get_files_changed_since: failed to resolve folder path: {err}")
            })?;

        if !requested_root.is_dir() {
            return Ok(vec![]);
        }

        let since = parse_js_iso_to_system_time(&_since_iso)?;
        let mut changed_files = Vec::new();

        collect_changed_files(&requested_root, &requested_root, since, &mut changed_files)?;

        Ok(changed_files)
    }
    #[cfg(not(feature = "folder_watcher"))]
    {
        Ok(vec![])
    }
}
