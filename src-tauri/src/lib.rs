use std::fs;
use std::path::{Path, PathBuf};
use tauri::Manager;

fn is_ignored_path(path: &str) -> bool {
    let normalized = path.replace("\\", "/").to_lowercase();

    let ignored_parts = [
    "/node_modules/",
    "/.git/",
    "/dist/",
    "/build/",
    "/.next/",
    "/target/",
    "/.idea/",
    "/.vscode/",
    "/coverage/",
    "/out/",
    "/bin/",
    "/obj/",
    "/src-tauri/projects/",
];

    ignored_parts.iter().any(|part| normalized.contains(part))
}

fn is_sensitive_file(path: &str) -> bool {
    let normalized = path.replace("\\", "/").to_lowercase();

    let sensitive_extensions = [".env", ".pem", ".key", ".p12", ".pfx"];
    let sensitive_filenames = ["id_rsa", "id_dsa"];

    if sensitive_extensions
        .iter()
        .any(|ext| normalized.ends_with(ext))
    {
        return true;
    }

    if sensitive_filenames
        .iter()
        .any(|name| normalized.contains(name))
    {
        return true;
    }

    false
}

fn is_useful_file(path: &str) -> bool {
    let normalized = path.replace("\\", "/").to_lowercase();

    let important_names = [
        "readme.md",
        "readme.txt",
        "package.json",
        "package-lock.json",
        "cargo.toml",
        "tsconfig.json",
        "vite.config.ts",
        "vite.config.js",
        "next.config.js",
        "next.config.ts",
        "vercel.json",
        "netlify.toml",
        "dockerfile",
        "server.js",
        "server.ts",
        "app.js",
        "app.ts",
        "main.js",
        "main.ts",
        "main.rs",
        "lib.rs",
    ];

    if important_names.iter().any(|name| normalized.ends_with(name)) {
        return true;
    }

    let useful_extensions = [
        ".ts", ".tsx", ".js", ".jsx", ".rs", ".py", ".java", ".cs", ".go", ".php", ".rb",
        ".swift", ".kt", ".cpp", ".c", ".h", ".sql", ".html", ".css", ".scss", ".json",
        ".yml", ".yaml", ".md", ".txt",
    ];

    useful_extensions
        .iter()
        .any(|ext| normalized.ends_with(ext))
}

fn collect_safe_files(
    root: &Path,
    current: &Path,
    results: &mut Vec<String>,
) -> Result<(), String> {
    if current.is_dir() {
        for entry in fs::read_dir(current).map_err(|e| e.to_string())? {
            let entry = entry.map_err(|e| e.to_string())?;
            let path = entry.path();

            let path_str = path.to_string_lossy().to_string();

            if is_ignored_path(&path_str) {
                continue;
            }

            collect_safe_files(root, &path, results)?;
        }
    } else if current.is_file() {
        let path_str = current.to_string_lossy().to_string();

        if is_sensitive_file(&path_str) {
            return Ok(());
        }

        if !is_useful_file(&path_str) {
            return Ok(());
        }

        let relative = current
            .strip_prefix(root)
            .map_err(|e| e.to_string())?
            .to_string_lossy()
            .to_string();

        if relative.trim().is_empty() || relative == "{" {
            return Ok(());
        }

        results.push(relative);
    }

    Ok(())
}

fn compute_scan_hash(files: &[String]) -> String {
    let mut sorted = files.to_vec();
    sorted.sort();
    let raw = sorted.join("|");

    let mut hash: u64 = 5381;
    for byte in raw.bytes() {
        hash = hash.wrapping_mul(33).wrapping_add(byte as u64);
    }

    let hex = format!("{:016x}", hash);
    hex[..12].to_string()
}

// NEW: reads README and package.json from the root of a scanned folder.
// Returns only safe, non-sensitive content. Truncated to keep payloads small.
fn read_project_meta(root: &Path) -> ProjectMeta {
    // README — try .md first, then .txt
    let readme = ["README.md", "readme.md", "README.txt", "readme.txt"]
        .iter()
        .find_map(|name| {
            let path = root.join(name);
            if path.exists() {
                fs::read_to_string(&path)
                    .ok()
                    .map(|content| content.chars().take(2000).collect::<String>())
            } else {
                None
            }
        });

    // package.json — extract name, description, scripts keys only (never deps = no versions leaked)
    let package_json = {
        let path = root.join("package.json");
        if path.exists() {
            fs::read_to_string(&path).ok().and_then(|content| {
                // Parse just the fields we want — no serde_json dep needed, basic extraction
                let name = extract_json_string(&content, "name");
                let description = extract_json_string(&content, "description");
                let version = extract_json_string(&content, "version");

                if name.is_some() || description.is_some() {
                    Some(PackageInfo {
                        name,
                        description,
                        version,
                    })
                } else {
                    None
                }
            })
        } else {
            None
        }
    };

    // Cargo.toml — extract name and description
    let cargo_toml = {
        let path = root.join("Cargo.toml");
        if path.exists() {
            fs::read_to_string(&path).ok().and_then(|content| {
                let name = extract_toml_value(&content, "name");
                let description = extract_toml_value(&content, "description");

                if name.is_some() || description.is_some() {
                    Some(PackageInfo {
                        name,
                        description,
                        version: extract_toml_value(&content, "version"),
                    })
                } else {
                    None
                }
            })
        } else {
            None
        }
    };

    ProjectMeta {
        readme,
        package_json,
        cargo_toml,
    }
}

// Minimal JSON string extractor — avoids serde_json dependency.
// Finds `"key": "value"` and returns the value string.
fn extract_json_string(json: &str, key: &str) -> Option<String> {
    let pattern = format!("\"{}\"", key);
    let key_pos = json.find(&pattern)?;
    let after_key = &json[key_pos + pattern.len()..];
    let colon_pos = after_key.find(':')?;
    let after_colon = after_key[colon_pos + 1..].trim_start();

    if after_colon.starts_with('"') {
        let content = &after_colon[1..];
        let end = content.find('"')?;
        Some(content[..end].to_string())
    } else {
        None
    }
}

// Minimal TOML value extractor for key = "value" patterns.
fn extract_toml_value(toml: &str, key: &str) -> Option<String> {
    for line in toml.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with(key) {
            let after_key = trimmed[key.len()..].trim_start();
            if after_key.starts_with('=') {
                let after_eq = after_key[1..].trim_start();
                if after_eq.starts_with('"') {
                    let content = &after_eq[1..];
                    if let Some(end) = content.find('"') {
                        return Some(content[..end].to_string());
                    }
                }
            }
        }
    }
    None
}

#[derive(serde::Serialize)]
pub struct PackageInfo {
    name: Option<String>,
    description: Option<String>,
    version: Option<String>,
}

#[derive(serde::Serialize)]
pub struct ProjectMeta {
    readme: Option<String>,
    package_json: Option<PackageInfo>,
    cargo_toml: Option<PackageInfo>,
}

#[derive(serde::Serialize)]
pub struct RescanResult {
    files: Vec<String>,
    scan_hash: String,
    folder_exists: bool,
    meta: Option<ProjectMeta>,
}

// NEW: full scan result including project meta for auto-population
#[derive(serde::Serialize)]
pub struct ScanResult {
    files: Vec<String>,
    scan_hash: String,
    meta: ProjectMeta,
}

#[tauri::command]
fn scan_project_folder(folder_path: String) -> Result<ScanResult, String> {
    let root = PathBuf::from(&folder_path);

    if !root.exists() {
        return Err("Selected folder does not exist".to_string());
    }

    if !root.is_dir() {
        return Err("Selected path is not a folder".to_string());
    }

    let mut files: Vec<String> = Vec::new();
    collect_safe_files(&root, &root, &mut files)?;
    files.sort();

    let scan_hash = compute_scan_hash(&files);
    let meta = read_project_meta(&root);

    Ok(ScanResult {
        files,
        scan_hash,
        meta,
    })
}

#[tauri::command]
fn rescan_linked_folder(folder_path: String) -> Result<RescanResult, String> {
    let root = PathBuf::from(&folder_path);

    if !root.exists() || !root.is_dir() {
        return Ok(RescanResult {
            files: vec![],
            scan_hash: String::new(),
            folder_exists: false,
            meta: None,
        });
    }

    let mut files: Vec<String> = Vec::new();
    collect_safe_files(&root, &root, &mut files)?;
    files.sort();

    let scan_hash = compute_scan_hash(&files);
    let meta = read_project_meta(&root);

    Ok(RescanResult {
        files,
        scan_hash,
        folder_exists: true,
        meta: Some(meta),
    })
}

/// Sanitise a project name to a safe filename stem.
/// Allows letters, digits, hyphens, underscores. Max 100 chars.
/// Returns Err if the result would be empty (e.g. pure emoji input).
fn sanitize_project_name(name: &str) -> Result<String, String> {
    let stem: String = name
        .replace(' ', "_")
        .chars()
        .filter(|c| c.is_alphanumeric() || *c == '_' || *c == '-')
        .take(100)
        .collect();

    if stem.is_empty() {
        return Err("Project name must contain at least one letter or digit".to_string());
    }
    Ok(stem)
}

/// Validate that a file_name is safe to use inside the projects folder:
///  - must end with ".json"
///  - must not contain path separators or ".."
fn validate_file_name(file_name: &str) -> Result<(), String> {
    if !file_name.ends_with(".json") {
        return Err("Only .json files are allowed".to_string());
    }
    if file_name.contains('/') || file_name.contains('\\') || file_name.contains("..") {
        return Err("Invalid file name".to_string());
    }
    Ok(())
}

/// Resolve the projects directory inside Tauri's app data dir, creating it if needed.
/// Falls back to a local `projects/` folder when running outside Tauri (e.g. `cargo test`).
fn projects_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let base = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Could not resolve app data directory: {}", e))?;
    let path = base.join("projects");
    if !path.exists() {
        fs::create_dir_all(&path).map_err(|e| e.to_string())?;
    }
    Ok(path)
}

#[tauri::command]
fn get_projects_path(app: tauri::AppHandle) -> Result<String, String> {
    let path = projects_dir(&app)?;
    Ok(path.to_string_lossy().to_string())
}

/// Rotate backups for a project — keeps last MAX_BACKUPS numbered snapshots.
/// Backup files are stored in projects/backups/<stem>/<stem>_001.json … _005.json
#[tauri::command]
fn backup_project_file(app: tauri::AppHandle, file_name: String) -> Result<(), String> {
    const MAX_BACKUPS: u32 = 5;

    validate_file_name(&file_name)?;
    let projects_path = projects_dir(&app)?;
    let source = projects_path.join(&file_name);

    if !source.exists() {
        // Nothing to back up yet
        return Ok(());
    }

    // Backup dir: <projects>/backups/<stem>/
    let stem = file_name.trim_end_matches(".json");
    let backup_dir = projects_path.join("backups").join(stem);
    fs::create_dir_all(&backup_dir).map_err(|e| e.to_string())?;

    // Shift existing backups: _005 is dropped, _004 → _005, … _001 → _002
    for i in (1..MAX_BACKUPS).rev() {
        let old_name = format!("{}_{:03}.json", stem, i);
        let new_name = format!("{}_{:03}.json", stem, i + 1);
        let old_path = backup_dir.join(&old_name);
        let new_path = backup_dir.join(&new_name);
        if old_path.exists() {
            let _ = fs::rename(&old_path, &new_path); // ignore errors on rotation
        }
    }

    // Copy current file to _001
    let first_backup = backup_dir.join(format!("{}_{:03}.json", stem, 1));
    fs::copy(&source, &first_backup).map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
fn save_project_file(
    app: tauri::AppHandle,
    project_name: String,
    project_data: String,
) -> Result<String, String> {
    let stem = sanitize_project_name(&project_name)?;
    let file_name = format!("{}.json", stem);
    let dir = projects_dir(&app)?;

    // Atomic write: write to .tmp then rename
    let tmp_path = dir.join(format!("{}.tmp", stem));
    let final_path = dir.join(&file_name);

    fs::write(&tmp_path, &project_data).map_err(|e| e.to_string())?;
    fs::rename(&tmp_path, &final_path).map_err(|e| {
        // Clean up tmp on failure
        let _ = fs::remove_file(&tmp_path);
        e.to_string()
    })?;

    Ok(file_name)
}

#[tauri::command]
fn load_projects(app: tauri::AppHandle) -> Result<Vec<String>, String> {
    let path = projects_dir(&app)?;
    if !path.exists() {
        return Ok(vec![]);
    }

    let mut projects = vec![];
    for entry in fs::read_dir(&path).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let file_name = entry.file_name().to_string_lossy().to_string();
        // Only surface valid .json files (skip .tmp files from interrupted writes)
        if file_name.ends_with(".json") && !file_name.contains("..") && !file_name.ends_with(".tmp") {
            projects.push(file_name);
        }
    }
    projects.sort();
    Ok(projects)
}

#[tauri::command]
fn load_project_file(app: tauri::AppHandle, file_name: String) -> Result<String, String> {
    validate_file_name(&file_name)?;
    let mut path = projects_dir(&app)?;
    path.push(&file_name);
    let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    Ok(content)
}

#[tauri::command]
fn delete_project_file(app: tauri::AppHandle, file_name: String) -> Result<String, String> {
    validate_file_name(&file_name)?;
    let mut path = projects_dir(&app)?;
    path.push(&file_name);

    if !path.exists() {
        return Err("Project file not found".to_string());
    }

    fs::remove_file(&path).map_err(|e| e.to_string())?;
    Ok(format!("Deleted {}", file_name))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            scan_project_folder,
            rescan_linked_folder,
            get_projects_path,
            backup_project_file,
            save_project_file,
            load_projects,
            load_project_file,
            delete_project_file
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}