use std::fs;
use std::path::{Path, PathBuf};

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
    ];

    ignored_parts.iter().any(|part| normalized.contains(part))
}

fn is_sensitive_file(path: &str) -> bool {
    let normalized = path.replace("\\", "/").to_lowercase();

    // Only block real secret-style files, not normal code files
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

#[tauri::command]
fn scan_project_folder(folder_path: String) -> Result<Vec<String>, String> {
    let root = PathBuf::from(folder_path);

    if !root.exists() {
        return Err("Selected folder does not exist".to_string());
    }

    if !root.is_dir() {
        return Err("Selected path is not a folder".to_string());
    }

    let mut results: Vec<String> = Vec::new();
    collect_safe_files(&root, &root, &mut results)?;
    results.sort();

    Ok(results)
}

#[tauri::command]
fn save_project_file(project_name: String, project_data: String) -> Result<String, String> {
    let safe_name = project_name.replace(" ", "_");
    let mut path = PathBuf::from("projects");

    if !path.exists() {
        fs::create_dir_all(&path).map_err(|e| e.to_string())?;
    }

    path.push(format!("{}.json", safe_name));

    fs::write(&path, project_data).map_err(|e| e.to_string())?;

    Ok(path.display().to_string())
}

#[tauri::command]
fn load_projects() -> Result<Vec<String>, String> {
    let path = Path::new("projects");

    if !path.exists() {
        return Ok(vec![]);
    }

    let mut projects = vec![];

    for entry in fs::read_dir(path).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let file_name = entry.file_name().to_string_lossy().to_string();
        projects.push(file_name);
    }

    projects.sort();

    Ok(projects)
}

#[tauri::command]
fn load_project_file(file_name: String) -> Result<String, String> {
    let mut path = PathBuf::from("projects");
    path.push(file_name);

    let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    Ok(content)
}

#[tauri::command]
fn delete_project_file(file_name: String) -> Result<String, String> {
    let mut path = PathBuf::from("projects");
    path.push(file_name);

    if !path.exists() {
        return Err("Project file not found".to_string());
    }

    fs::remove_file(&path).map_err(|e| e.to_string())?;

    Ok(format!("Deleted {}", path.display()))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            scan_project_folder,
            save_project_file,
            load_projects,
            load_project_file,
            delete_project_file
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}