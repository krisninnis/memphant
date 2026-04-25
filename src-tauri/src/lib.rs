use std::collections::BTreeSet;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::Mutex;
use tauri::menu::{Menu, MenuItem};
use tauri::Manager;
use tauri::tray::TrayIconBuilder;
use tauri_plugin_autostart::ManagerExt;

mod vcp;

// Folder watcher — compiled only when the `folder_watcher` feature flag is set.
// No Tauri commands registered yet; Phase 2 will add them.
#[cfg(feature = "folder_watcher")]
mod watcher;
#[cfg(feature = "folder_watcher")]
mod summariser;
mod watcher_commands;

#[derive(serde::Serialize)]
struct StateManifestPreview {
    manifest: vcp::Manifest,
    text: String,
    digest: String,
    item_count: usize,
}

#[derive(Default)]
struct TrayModeState {
    enabled: Mutex<bool>,
}

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

fn is_sensitive_file(path: &Path) -> bool {
    let normalized = path.to_string_lossy().replace("\\", "/").to_lowercase();
    let file_name = path
        .file_name()
        .map(|n| n.to_string_lossy().to_lowercase())
        .unwrap_or_default();

    let sensitive_extensions = [".pem", ".key", ".p12", ".pfx"];
    let sensitive_filenames = ["id_rsa", "id_dsa"];

    if file_name == ".env" || file_name.starts_with(".env.") {
        return true;
    }

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

fn contains_sensitive_content(path: &Path) -> bool {
    let metadata = match fs::metadata(path) {
        Ok(meta) => meta,
        Err(_) => return false,
    };

    if metadata.len() > 512_000 {
        return false;
    }

    let content = match fs::read_to_string(path) {
        Ok(text) => text,
        Err(_) => return false,
    };

    let sensitive_patterns = ["sk-", "AKIA", "ghp_", "xoxb-", "-----BEGIN", "eyJ"];

    sensitive_patterns.iter().any(|pattern| content.contains(pattern))
}

fn is_useful_file(path: &str) -> bool {
    let normalized = path.replace("\\", "/").to_lowercase();

    let important_names = [
        "readme.md",
        "readme.txt",
        "package.json",
        "package-lock.json",
        "pnpm-lock.yaml",
        "yarn.lock",
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
        "requirements.txt",
        "pyproject.toml",
        "go.mod",
    ];

    if important_names.iter().any(|name| normalized.ends_with(name)) {
        return true;
    }

    let useful_extensions = [
        ".ts", ".tsx", ".js", ".jsx", ".rs", ".py", ".java", ".cs", ".go", ".php", ".rb",
        ".swift", ".kt", ".cpp", ".c", ".h", ".sql", ".html", ".css", ".scss", ".json",
        ".yml", ".yaml", ".md", ".txt", ".toml",
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
        if is_sensitive_file(current) {
            return Ok(());
        }

        if contains_sensitive_content(current) {
            return Ok(());
        }

        let path_str = current.to_string_lossy().to_string();

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

fn first_readme_summary(readme: &Option<String>) -> Option<String> {
    let text = readme.as_ref()?;
    let mut collected = String::new();

    for line in text.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            if !collected.is_empty() {
                break;
            }
            continue;
        }
        if trimmed.starts_with('#') {
            continue;
        }

        if !collected.is_empty() {
            collected.push(' ');
        }
        collected.push_str(trimmed);

        if collected.len() >= 500 {
            break;
        }
    }

    let summary = collected.chars().take(500).collect::<String>().trim().to_string();
    if summary.is_empty() {
        None
    } else {
        Some(summary)
    }
}

fn read_project_meta(root: &Path) -> ProjectMeta {
    let readme = ["README.md", "readme.md", "README.txt", "readme.txt"]
        .iter()
        .find_map(|name| {
            let path = root.join(name);
            if path.exists() && !contains_sensitive_content(&path) {
                fs::read_to_string(&path)
                    .ok()
                    .map(|content| content.chars().take(2000).collect::<String>())
            } else {
                None
            }
        });

    let package_json = {
        let path = root.join("package.json");
        if path.exists() && !contains_sensitive_content(&path) {
            fs::read_to_string(&path).ok().and_then(|content| {
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

    let cargo_toml = {
        let path = root.join("Cargo.toml");
        if path.exists() && !contains_sensitive_content(&path) {
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

    let stack = detect_stack(root);
    let suggestions = build_scan_suggestions(&readme, &package_json, &cargo_toml, &stack);

    ProjectMeta {
        readme,
        package_json,
        cargo_toml,
        stack,
        suggestions,
    }
}

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

fn extract_json_block(root: &Path, file_name: &str) -> Option<String> {
    let path = root.join(file_name);
    if path.exists() && !contains_sensitive_content(&path) {
        fs::read_to_string(path).ok()
    } else {
        None
    }
}

fn extract_text_block(root: &Path, file_name: &str) -> Option<String> {
    let path = root.join(file_name);
    if path.exists() && !contains_sensitive_content(&path) {
        fs::read_to_string(path).ok()
    } else {
        None
    }
}

fn push_signal(signals: &mut Vec<StackSignal>, source: &str, signal: &str, detail: Option<&str>) {
    signals.push(StackSignal {
        source: source.to_string(),
        signal: signal.to_string(),
        detail: detail.map(|d| d.to_string()),
    });
}

fn detect_stack(root: &Path) -> TechStackInfo {
    let mut languages = BTreeSet::new();
    let mut frameworks = BTreeSet::new();
    let mut package_managers = BTreeSet::new();
    let mut build_tools = BTreeSet::new();
    let mut runtimes = BTreeSet::new();
    let mut signals: Vec<StackSignal> = Vec::new();

    let package_json = extract_json_block(root, "package.json").unwrap_or_default().to_lowercase();
    let cargo_toml = extract_text_block(root, "Cargo.toml").unwrap_or_default().to_lowercase();
    let requirements_txt = extract_text_block(root, "requirements.txt").unwrap_or_default().to_lowercase();
    let pyproject_toml = extract_text_block(root, "pyproject.toml").unwrap_or_default().to_lowercase();
    let _go_mod: String = extract_text_block(root, "go.mod").unwrap_or_default().to_lowercase();

    if root.join("package.json").exists() {
        languages.insert("JavaScript".to_string());
        runtimes.insert("Node.js".to_string());
        package_managers.insert("npm".to_string());
        push_signal(&mut signals, "package.json", "runtime", Some("Node.js"));
    }

    if root.join("tsconfig.json").exists() || package_json.contains("typescript") {
        languages.insert("TypeScript".to_string());
        push_signal(&mut signals, "tsconfig/package.json", "language", Some("TypeScript"));
    }

    if root.join("package-lock.json").exists() {
        package_managers.insert("npm".to_string());
        push_signal(&mut signals, "package-lock.json", "package-manager", Some("npm"));
    }

    if root.join("pnpm-lock.yaml").exists() {
        package_managers.insert("pnpm".to_string());
        push_signal(&mut signals, "pnpm-lock.yaml", "package-manager", Some("pnpm"));
    }

    if root.join("yarn.lock").exists() {
        package_managers.insert("yarn".to_string());
        push_signal(&mut signals, "yarn.lock", "package-manager", Some("yarn"));
    }

    if root.join("vite.config.ts").exists() || root.join("vite.config.js").exists() || package_json.contains("\"vite\"") {
        build_tools.insert("Vite".to_string());
        push_signal(&mut signals, "vite config/package.json", "build-tool", Some("Vite"));
    }

    if package_json.contains("\"react\"") {
        frameworks.insert("React".to_string());
        push_signal(&mut signals, "package.json", "framework", Some("React"));
    }

    if package_json.contains("\"next\"") {
        frameworks.insert("Next.js".to_string());
        push_signal(&mut signals, "package.json", "framework", Some("Next.js"));
    }

    if package_json.contains("\"vue\"") {
        frameworks.insert("Vue".to_string());
        push_signal(&mut signals, "package.json", "framework", Some("Vue"));
    }

    if package_json.contains("\"svelte\"") {
        frameworks.insert("Svelte".to_string());
        push_signal(&mut signals, "package.json", "framework", Some("Svelte"));
    }

    if package_json.contains("\"electron\"") {
        frameworks.insert("Electron".to_string());
        push_signal(&mut signals, "package.json", "framework", Some("Electron"));
    }

    if root.join("Cargo.toml").exists() {
        languages.insert("Rust".to_string());
        package_managers.insert("Cargo".to_string());
        push_signal(&mut signals, "Cargo.toml", "language", Some("Rust"));
    }

    if cargo_toml.contains("tauri") {
        frameworks.insert("Tauri".to_string());
        push_signal(&mut signals, "Cargo.toml", "framework", Some("Tauri"));
    }

    if cargo_toml.contains("axum") {
        frameworks.insert("Axum".to_string());
        push_signal(&mut signals, "Cargo.toml", "framework", Some("Axum"));
    }

    if cargo_toml.contains("rocket") {
        frameworks.insert("Rocket".to_string());
        push_signal(&mut signals, "Cargo.toml", "framework", Some("Rocket"));
    }

    if cargo_toml.contains("tokio") {
        runtimes.insert("Tokio".to_string());
        push_signal(&mut signals, "Cargo.toml", "runtime", Some("Tokio"));
    }

    if root.join("requirements.txt").exists() || root.join("pyproject.toml").exists() {
        languages.insert("Python".to_string());
        package_managers.insert("pip".to_string());
        push_signal(&mut signals, "requirements/pyproject", "language", Some("Python"));
    }

    if requirements_txt.contains("fastapi") || pyproject_toml.contains("fastapi") {
        frameworks.insert("FastAPI".to_string());
        push_signal(&mut signals, "requirements/pyproject", "framework", Some("FastAPI"));
    }

    if requirements_txt.contains("flask") || pyproject_toml.contains("flask") {
        frameworks.insert("Flask".to_string());
        push_signal(&mut signals, "requirements/pyproject", "framework", Some("Flask"));
    }

    if requirements_txt.contains("django") || pyproject_toml.contains("django") {
        frameworks.insert("Django".to_string());
        push_signal(&mut signals, "requirements/pyproject", "framework", Some("Django"));
    }

    if pyproject_toml.contains("poetry") {
        package_managers.insert("Poetry".to_string());
        push_signal(&mut signals, "pyproject.toml", "package-manager", Some("Poetry"));
    }

    if root.join("go.mod").exists() {
        languages.insert("Go".to_string());
        push_signal(&mut signals, "go.mod", "language", Some("Go"));
    }

    let confidence = if signals.len() >= 4 {
        "high"
    } else if signals.len() >= 2 {
        "medium"
    } else {
        "low"
    }
    .to_string();

    TechStackInfo {
        languages: languages.into_iter().collect(),
        frameworks: frameworks.into_iter().collect(),
        package_managers: package_managers.into_iter().collect(),
        build_tools: build_tools.into_iter().collect(),
        runtimes: runtimes.into_iter().collect(),
        confidence,
        signals,
    }
}

fn build_scan_suggestions(
    readme: &Option<String>,
    package_json: &Option<PackageInfo>,
    cargo_toml: &Option<PackageInfo>,
    stack: &TechStackInfo,
) -> ScanSuggestions {
    let project_name = package_json
        .as_ref()
        .and_then(|p| p.name.clone())
        .or_else(|| cargo_toml.as_ref().and_then(|c| c.name.clone()));

    let summary = package_json
        .as_ref()
        .and_then(|p| p.description.clone())
        .or_else(|| cargo_toml.as_ref().and_then(|c| c.description.clone()))
        .or_else(|| first_readme_summary(readme));

    let mut detected_tags: Vec<String> = Vec::new();
    detected_tags.extend(stack.frameworks.iter().cloned());
    detected_tags.extend(stack.languages.iter().cloned());
    detected_tags.extend(stack.build_tools.iter().cloned());
    detected_tags.dedup();
    detected_tags.truncate(8);

    ScanSuggestions {
        project_name,
        summary,
        detected_tags,
    }
}

// --- Structs ---

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
struct StackSignal {
    source: String,
    signal: String,
    detail: Option<String>,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
struct TechStackInfo {
    languages: Vec<String>,
    frameworks: Vec<String>,
    package_managers: Vec<String>,
    build_tools: Vec<String>,
    runtimes: Vec<String>,
    confidence: String,
    signals: Vec<StackSignal>,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
struct PackageInfo {
    name: Option<String>,
    description: Option<String>,
    version: Option<String>,
}

struct ProjectMeta {
    readme: Option<String>,
    package_json: Option<PackageInfo>,
    cargo_toml: Option<PackageInfo>,
    stack: TechStackInfo,
    suggestions: ScanSuggestions,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
struct ScanSuggestions {
    project_name: Option<String>,
    summary: Option<String>,
    detected_tags: Vec<String>,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
struct ScanMeta {
    readme: Option<String>,
    package_json: Option<PackageInfo>,
    cargo_toml: Option<PackageInfo>,
    stack: TechStackInfo,
    suggestions: ScanSuggestions,
}

#[derive(serde::Serialize, Debug)]
struct ScanResult {
    files: Vec<String>,
    scan_hash: String,
    meta: ScanMeta,
}

#[derive(serde::Serialize, Debug)]
struct RescanResult {
    project_id: String,
    files: Vec<String>,
    scan_hash: String,
    folder_exists: bool,
    meta: Option<ScanMeta>,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
struct GitCommit {
    hash: String,
    message: String,
    timestamp: String,
    author: String,
}

// --- Project storage helpers ---

fn projects_dir(app: &tauri::AppHandle) -> PathBuf {
    app.path()
        .app_data_dir()
        .unwrap_or_else(|_| PathBuf::from("."))
        .join("projects")
}

fn meta_to_scan_meta(meta: ProjectMeta) -> ScanMeta {
    ScanMeta {
        readme: meta.readme,
        package_json: meta.package_json,
        cargo_toml: meta.cargo_toml,
        stack: meta.stack,
        suggestions: meta.suggestions,
    }
}

// --- Tauri commands ---

#[tauri::command]
async fn scan_project_folder(folder_path: String) -> Result<ScanResult, String> {
    let root = Path::new(&folder_path);
    if !root.is_dir() {
        return Err(format!("Not a directory: {}", folder_path));
    }

    let mut files: Vec<String> = Vec::new();
    collect_safe_files(root, root, &mut files)?;
    files.sort();

    let scan_hash = compute_scan_hash(&files);
    let meta = meta_to_scan_meta(read_project_meta(root));

    Ok(ScanResult { files, scan_hash, meta })
}

#[tauri::command]
async fn rescan_linked_folder(
    project_id: String,
    folder_path: String,
) -> Result<RescanResult, String> {
    let root = Path::new(&folder_path);

    if !root.exists() {
        return Ok(RescanResult {
            project_id,
            files: vec![],
            scan_hash: String::new(),
            folder_exists: false,
            meta: None,
        });
    }

    if !root.is_dir() {
        return Err(format!("Not a directory: {}", folder_path));
    }

    let mut files: Vec<String> = Vec::new();
    collect_safe_files(root, root, &mut files)?;
    files.sort();

    let scan_hash = compute_scan_hash(&files);
    let meta = meta_to_scan_meta(read_project_meta(root));

    Ok(RescanResult {
        project_id,
        files,
        scan_hash,
        folder_exists: true,
        meta: Some(meta),
    })
}

#[tauri::command]
async fn get_git_log(
    folder_path: String,
    since_hash: Option<String>,
) -> Result<Vec<GitCommit>, String> {
    let root = Path::new(&folder_path);

    // Return empty if folder doesn't exist or has no git repo — never error
    if !root.is_dir() {
        return Ok(vec![]);
    }

    let git_dir = root.join(".git");
    if !git_dir.exists() {
        return Ok(vec![]);
    }

    let output = Command::new("git")
        .args([
            "-C",
            &folder_path,
            "log",
            "--format=%h|%s|%aI|%an",
            "-20",
        ])
        .output();

    let output = match output {
        Ok(o) => o,
        Err(_) => return Ok(vec![]), // git not installed — silent fail
    };

    if !output.status.success() {
        return Ok(vec![]);
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut commits: Vec<GitCommit> = Vec::new();

    for line in stdout.lines() {
        let parts: Vec<&str> = line.splitn(4, '|').collect();
        if parts.len() < 4 {
            continue;
        }

        let hash = parts[0].trim().to_string();

        // Stop if we've reached the since_hash (exclusive)
        if let Some(ref stop_hash) = since_hash {
            if hash.starts_with(stop_hash.as_str()) || stop_hash.starts_with(hash.as_str()) {
                break;
            }
        }

        commits.push(GitCommit {
            hash,
            message: parts[1].trim().to_string(),
            timestamp: parts[2].trim().to_string(),
            author: parts[3].trim().to_string(),
        });
    }

  

    Ok(commits)
}

#[tauri::command]
async fn save_project_file(
    app: tauri::AppHandle,
    project_name: String,
    project_data: String,
) -> Result<(), String> {
    let dir = projects_dir(&app);
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

    let stem = project_name
        .chars()
        .map(|c| if c.is_alphanumeric() || c == '-' || c == '_' { c } else { '_' })
        .take(100)
        .collect::<String>();

    let file_path = dir.join(format!("{}.json", stem));
    let tmp_path = dir.join(format!("{}.json.tmp", stem));

    fs::write(&tmp_path, &project_data).map_err(|e| e.to_string())?;
    fs::rename(&tmp_path, &file_path).map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
async fn load_projects(app: tauri::AppHandle) -> Result<Vec<String>, String> {
    let dir = projects_dir(&app);
    if !dir.exists() {
        return Ok(vec![]);
    }

    let mut files: Vec<String> = fs::read_dir(&dir)
        .map_err(|e| e.to_string())?
        .filter_map(|e| e.ok())
        .filter_map(|e| {
            let name = e.file_name().to_string_lossy().to_string();
            if name.ends_with(".json") && !name.ends_with(".tmp") && !name.contains("backup") {
                Some(name)
            } else {
                None
            }
        })
        .collect();

    files.sort();
    Ok(files)
}

#[tauri::command]
async fn load_project_file(app: tauri::AppHandle, file_name: String) -> Result<String, String> {
    let path = projects_dir(&app).join(&file_name);
    fs::read_to_string(&path).map_err(|e| format!("Could not read {}: {}", file_name, e))
}

#[tauri::command]
async fn delete_project_file(app: tauri::AppHandle, file_name: String) -> Result<(), String> {
    let path = projects_dir(&app).join(&file_name);
    if path.exists() {
        fs::remove_file(&path).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
async fn rename_project_file(
    app: tauri::AppHandle,
    from_file_name: String,
    to_file_name: String,
) -> Result<(), String> {
    if from_file_name == to_file_name {
        return Ok(());
    }

    for name in [&from_file_name, &to_file_name] {
        if name.contains("..") || name.contains('/') || name.contains('\\') {
            return Err("Invalid file name".to_string());
        }
        if !name.ends_with(".json") {
            return Err("Invalid file extension".to_string());
        }
    }

    let dir = projects_dir(&app);
    let from = dir.join(&from_file_name);
    let to = dir.join(&to_file_name);

    if !from.exists() {
        return Ok(());
    }

    if to.exists() {
        return Ok(());
    }

    fs::rename(&from, &to).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn get_projects_path(app: tauri::AppHandle) -> Result<String, String> {
    Ok(projects_dir(&app).to_string_lossy().to_string())
}

#[tauri::command]
async fn enable_autostart(app: tauri::AppHandle) -> Result<(), String> {
    app.autolaunch().enable().map_err(|e| e.to_string())
}

#[tauri::command]
async fn disable_autostart(app: tauri::AppHandle) -> Result<(), String> {
    app.autolaunch().disable().map_err(|e| e.to_string())
}

#[tauri::command]
async fn toggle_tray_mode(
    app: tauri::AppHandle,
    state: tauri::State<'_, TrayModeState>,
    enabled: bool,
) -> Result<(), String> {
    if let Ok(mut guard) = state.enabled.lock() {
        *guard = enabled;
    }

    if let Some(tray) = app.tray_by_id("memephant_tray") {
        tray.set_visible(enabled).map_err(|e| e.to_string())?;
    }

    Ok(())
}

#[tauri::command]
async fn write_text_file(file_path: String, content: String) -> Result<(), String> {
    let path = PathBuf::from(&file_path);
    if let Some(parent) = path.parent() {
        if !parent.exists() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
    }
    fs::write(&path, content.as_bytes()).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn generate_state_manifest(
    project: vcp::ProjectState,
) -> Result<StateManifestPreview, String> {
    let manifest = vcp::build_state_manifest(&project)?;
    let text = manifest.to_text();

    Ok(StateManifestPreview {
        digest: manifest.state_digest.clone(),
        item_count: manifest.item_count,
        manifest,
        text,
    })
}

#[tauri::command]
async fn backup_project_file(app: tauri::AppHandle, file_name: String) -> Result<(), String> {
    let projects = projects_dir(&app);
    let source = projects.join(&file_name);
    if !source.exists() {
        return Ok(());
    }

    let stem = file_name.trim_end_matches(".json");
    let backup_dir = projects.join("backups").join(stem);
    fs::create_dir_all(&backup_dir).map_err(|e| e.to_string())?;

    let mut existing: Vec<_> = fs::read_dir(&backup_dir)
        .map_err(|e| e.to_string())?
        .filter_map(|e| e.ok())
        .filter(|e| e.file_name().to_string_lossy().ends_with(".json"))
        .collect();

    existing.sort_by_key(|e| e.file_name());

    while existing.len() >= 5 {
        let oldest = existing.remove(0);
        let _ = fs::remove_file(oldest.path());
    }

    let next_num = existing.len() + 1;
    let backup_name = format!("{}_{:03}.json", stem, next_num);
    fs::copy(&source, &backup_dir.join(backup_name)).map_err(|e| e.to_string())?;

    Ok(())
}

fn setup_tray(app: &tauri::AppHandle) -> Result<(), tauri::Error> {
    let open = MenuItem::with_id(app, "open", "Open Memephant", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open, &quit])?;

    let mut builder = TrayIconBuilder::with_id("memephant_tray").menu(&menu);
    if let Some(icon) = app.default_window_icon().cloned() {
        builder = builder.icon(icon);
    }

    builder
        .on_menu_event(|app, event| {
            match event.id().as_ref() {
                "open" => {
                    if let Some(window) = app.get_webview_window("main") {
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                }
                "quit" => {
                    app.exit(0);
                }
                _ => {}
            }
        })
        .build(app)?;

    if let Some(tray) = app.tray_by_id("memephant_tray") {
        let _ = tray.set_visible(false);
    }

    Ok(())
}

// --- App entry point ---

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(TrayModeState::default())
        .manage(watcher_commands::WatcherCommandState::default())
        .setup(|app| {
            setup_tray(app.handle())?;
            Ok(())
        })
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .plugin(tauri_plugin_single_instance::init(|_app, _argv, _cwd| {}))
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let enabled = window
                    .app_handle()
                    .state::<TrayModeState>()
                    .enabled
                    .lock()
                    .map(|guard| *guard)
                    .unwrap_or(false);

                if enabled {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            scan_project_folder,
            rescan_linked_folder,
            get_git_log,
            save_project_file,
            load_projects,
            load_project_file,
            delete_project_file,
            rename_project_file,
            get_projects_path,
            backup_project_file,
            write_text_file,
            generate_state_manifest,
            watcher_commands::get_recent_activity,
            enable_autostart,
            disable_autostart,
            toggle_tray_mode,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
