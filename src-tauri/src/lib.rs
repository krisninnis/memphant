use std::fs;
use std::path::{Path, PathBuf};

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
        .invoke_handler(tauri::generate_handler![
            save_project_file,
            load_projects,
            load_project_file,
            delete_project_file
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}