use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

#[derive(serde::Deserialize, Debug)]
pub struct CreateProjectFromTemplateInput {
    pub project_name: String,
    pub description: String,
    pub template_id: String,
    pub target_parent_folder: String,
}

#[derive(serde::Serialize, Debug)]
pub struct CreateProjectFromTemplateResult {
    pub folder_path: String,
    pub files_created: Vec<String>,
    pub scan_hash: String,
}

fn slugify_project_name(name: &str) -> String {
    let mut slug = name
        .trim()
        .to_lowercase()
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() {
                c
            } else if c == '-' || c == '_' || c.is_whitespace() {
                '-'
            } else {
                '-'
            }
        })
        .collect::<String>();

    while slug.contains("--") {
        slug = slug.replace("--", "-");
    }

    slug = slug.trim_matches('-').to_string();

    if slug.is_empty() {
        "new-project".to_string()
    } else {
        slug.chars().take(80).collect()
    }
}

fn validate_project_name(name: &str) -> Result<(), String> {
    let trimmed = name.trim();

    if trimmed.is_empty() {
        return Err("Project name is required.".to_string());
    }

    if trimmed.contains("..") || trimmed.contains('/') || trimmed.contains('\\') {
        return Err("Project name cannot contain path separators or traversal.".to_string());
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

fn write_template_file(
    project_root: &Path,
    relative_path: &str,
    content: &str,
    files_created: &mut Vec<String>,
) -> Result<(), String> {
    let file_path = project_root.join(relative_path);

    if !file_path.starts_with(project_root) {
        return Err(format!("Refusing to write outside project folder: {}", relative_path));
    }

    if let Some(parent) = file_path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    fs::write(&file_path, content.as_bytes()).map_err(|e| e.to_string())?;
    files_created.push(relative_path.to_string());

    Ok(())
}

fn template_readme(project_name: &str, description: &str, template_label: &str) -> String {
    format!(
        "# {project_name}

{description}

## Getting started

This project was created with Memephant Project Launchpad using the **{template_label}** template.

## Suggested next steps

1. Open this folder in your editor.
2. Review the generated starter files.
3. Use Memephant to copy project context into your preferred AI tool.
4. Paste useful AI updates back into Memephant to keep project memory current.

## Memephant tracking

Memephant is tracking this project from day one so your AI handoffs keep the project context intact.
"
    )
}

fn memephant_project_doc(project_name: &str, description: &str, template_label: &str) -> String {
    format!(
        "# Memephant Project Memory

## Project name

{project_name}

## What this project is

{description}

## Template

{template_label}

## Initial goals

- Build the first working version.
- Keep project context up to date in Memephant.
- Use AI handoff prompts to continue work without rebuilding context.

## Suggested next AI prompt

I am working on a project called {project_name}.

Project description:
{description}

Please help me plan the next implementation step. Keep the answer practical and return a concise project update at the end.

## How to continue with AI

1. Open Memephant.
2. Select this project.
3. Copy context for your chosen AI platform.
4. Continue the work in that AI.
5. Paste useful updates back into Memephant.
"
    )
}

fn create_template_files(
    project_root: &Path,
    project_name: &str,
    description: &str,
    template_id: &str,
) -> Result<Vec<String>, String> {
    let mut files_created = Vec::new();

    let template_label = match template_id {
        "blank-project" => "Blank project",
        "react-vite" => "React + Vite starter memory",
        "landing-page" => "Landing page starter",
        _ => return Err(format!("Unknown template: {}", template_id)),
    };

    write_template_file(
        project_root,
        "README.md",
        &template_readme(project_name, description, template_label),
        &mut files_created,
    )?;

    write_template_file(
        project_root,
        "memephant.project.md",
        &memephant_project_doc(project_name, description, template_label),
        &mut files_created,
    )?;

    write_template_file(
        project_root,
        ".gitignore",
        "node_modules\ndist\nbuild\n.env\n.env.*\n.DS_Store\n",
        &mut files_created,
    )?;

    match template_id {
        "blank-project" => {}

        "react-vite" => {
            let package_json = format!(
                r#"{{
  "name": "{}",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {{
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview"
  }},
  "dependencies": {{
    "@vitejs/plugin-react": "latest",
    "vite": "latest",
    "typescript": "latest",
    "react": "latest",
    "react-dom": "latest"
  }},
  "devDependencies": {{}}
}}
"#,
                slugify_project_name(project_name)
            );

            write_template_file(project_root, "package.json", &package_json, &mut files_created)?;

            write_template_file(
                project_root,
                "index.html",
                r#"<div id="root"></div>
<script type="module" src="/src/main.tsx"></script>
"#,
                &mut files_created,
            )?;

            write_template_file(
                project_root,
                "src/main.tsx",
                r#"import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './App.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
"#,
                &mut files_created,
            )?;

            write_template_file(
                project_root,
                "src/App.tsx",
                &format!(
                    r#"export default function App() {{
  return (
    <main className="app-shell">
      <section className="hero">
        <p className="eyebrow">Created with Memephant</p>
        <h1>{}</h1>
        <p>{}</p>
      </section>
    </main>
  );
}}
"#,
                    project_name, description
                ),
                &mut files_created,
            )?;

            write_template_file(
                project_root,
                "src/App.css",
                r#"body {
  margin: 0;
  font-family: system-ui, sans-serif;
  background: #0d0d1a;
  color: #f8fafc;
}

.app-shell {
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: 2rem;
}

.hero {
  max-width: 760px;
  padding: 3rem;
  border: 1px solid rgba(255,255,255,0.12);
  border-radius: 24px;
  background: rgba(255,255,255,0.04);
}

.eyebrow {
  color: #f4b667;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.12em;
}
"#,
                &mut files_created,
            )?;

            write_template_file(project_root, "public/.gitkeep", "", &mut files_created)?;
        }

        "landing-page" => {
            write_template_file(
                project_root,
                "index.html",
                &format!(
                    r#"<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>{}</title>
  <link rel="stylesheet" href="./styles.css" />
</head>
<body>
  <main class="page">
    <section class="hero">
      <p class="eyebrow">New project</p>
      <h1>{}</h1>
      <p>{}</p>
      <button id="cta">Get started</button>
    </section>
  </main>
  <script src="./script.js"></script>
</body>
</html>
"#,
                    project_name, project_name, description
                ),
                &mut files_created,
            )?;

            write_template_file(
                project_root,
                "styles.css",
                r#"body {
  margin: 0;
  font-family: system-ui, sans-serif;
  background: #0d0d1a;
  color: #fff;
}

.page {
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: 24px;
}

.hero {
  max-width: 720px;
  text-align: center;
  padding: 48px;
  border-radius: 24px;
  background: #12121f;
  border: 1px solid #2a2a40;
}

.eyebrow {
  color: #f4b667;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.12em;
}

button {
  margin-top: 24px;
  padding: 14px 20px;
  border: 0;
  border-radius: 12px;
  background: #d97706;
  color: #fff;
  font-weight: 700;
  cursor: pointer;
}
"#,
                &mut files_created,
            )?;

            write_template_file(
                project_root,
                "script.js",
                r#"document.getElementById('cta')?.addEventListener('click', () => {
  alert('Ready to build.');
});
"#,
                &mut files_created,
            )?;
        }

        _ => {}
    }

    Ok(files_created)
}

#[tauri::command]
pub async fn create_project_from_template_folder(
    input: CreateProjectFromTemplateInput,
) -> Result<CreateProjectFromTemplateResult, String> {
    validate_project_name(&input.project_name)?;

    let parent = PathBuf::from(&input.target_parent_folder);

    if !parent.is_dir() {
        return Err("Target parent folder does not exist or is not a directory.".to_string());
    }

    let slug = slugify_project_name(&input.project_name);
    let project_root = parent.join(slug);

    if !project_root.starts_with(&parent) {
        return Err("Refusing to create folder outside selected parent folder.".to_string());
    }

    if project_root.exists() {
        return Err("A folder with this project name already exists. Choose another name.".to_string());
    }

    fs::create_dir(&project_root).map_err(|e| e.to_string())?;

    let files_created = create_template_files(
        &project_root,
        input.project_name.trim(),
        input.description.trim(),
        input.template_id.trim(),
    )?;

    let scan_hash = compute_scan_hash(&files_created);

    Ok(CreateProjectFromTemplateResult {
        folder_path: project_root.to_string_lossy().to_string(),
        files_created,
        scan_hash,
    })
}

#[tauri::command]
pub async fn open_project_folder(folder_path: String) -> Result<(), String> {
    let path = PathBuf::from(&folder_path);

    if !path.is_dir() {
        return Err("Folder does not exist.".to_string());
    }

    #[cfg(target_os = "windows")]
    {
        Command::new("explorer")
            .arg(&path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }

    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg(&path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }

    #[cfg(target_os = "linux")]
    {
        Command::new("xdg-open")
            .arg(&path)
            .spawn()
            .map_err(|e| e.to_string())?;
    }

    Ok(())
}