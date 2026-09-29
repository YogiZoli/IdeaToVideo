// lib.rs: the Tauri commands the UI can call. Nothing here returns a key.
// Every outgoing network call happens in the Node runner, the UI talks to no
// external address (strict CSP in tauri.conf.json).

mod config;
mod keys;
mod runner;

use std::path::PathBuf;

use serde_json::{json, Value};
use tauri::{AppHandle, Emitter, Manager};

fn config_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app
        .path()
        .app_config_dir()
        .map_err(|e| format!("No config folder: {e}"))?
        .join(config::FILE_NAME))
}

fn runner_paths(app: &AppHandle) -> Result<runner::Paths, String> {
    let script = runner::plain_path(
        app.path()
            .resource_dir()
            .map_err(|e| format!("No resource folder: {e}"))?
            .join("runner")
            .join("main.mjs"),
    );
    if !script.exists() {
        return Err(format!("The runner is missing ({}). Reinstall the app.", script.display()));
    }
    Ok(runner::Paths { node: runner::plain_path(runner::node_path()?), script })
}

fn projects_dir(app: &AppHandle, cfg: Option<&Value>) -> Result<PathBuf, String> {
    config::projects_dir(cfg, app.path().document_dir().ok(), app.path().home_dir().ok())
}

/// Runs a runner command on a blocking thread, forwarding progress as events.
async fn run_command(app: AppHandle, command: String, request: Value, api_key: Option<String>) -> Result<Value, String> {
    let paths = runner_paths(&app)?;
    tauri::async_runtime::spawn_blocking(move || {
        let mut on_progress = |v: Value| {
            let _ = app.emit("runner-progress", runner::progress_payload(&command, v));
        };
        runner::run(&paths, &command, &request, api_key, &mut on_progress)
    })
    .await
    .map_err(|e| format!("The runner crashed: {e}"))?
}

/// Everything the UI needs at start: settings, projects folder, which keys exist.
#[tauri::command]
fn app_state(app: AppHandle) -> Result<Value, String> {
    let cfg = config::load(&config_path(&app)?)?;
    let projects = projects_dir(&app, cfg.as_ref())?;
    Ok(json!({
        "config": cfg,
        "projectsDir": projects,
        "defaultProjectsDir": projects_dir(&app, None).ok(),
        "keys": keys::status(),
        "version": app.package_info().version.to_string(),
    }))
}

#[tauri::command]
async fn save_config(app: AppHandle, config: Value) -> Result<Value, String> {
    let result = run_command(app.clone(), "validate-config".into(), json!({ "config": config }), None).await?;
    let errors = config::errors_from_validation(&result);
    if !errors.is_empty() {
        return Err(format!("Settings not saved: {}", errors.join("; ")));
    }
    let projects = projects_dir(&app, Some(&config))?;
    std::fs::create_dir_all(&projects)
        .map_err(|e| format!("Could not create the projects folder {}: {e}", projects.display()))?;
    let bytes = serde_json::to_vec_pretty(&config).map_err(|e| e.to_string())?;
    config::write_atomic(&config_path(&app)?, &bytes)?;
    app_state(app)
}

#[tauri::command]
fn set_key(name: String, value: String) -> Result<(), String> {
    keys::set(&name, &value)
}

#[tauri::command]
fn delete_key(name: String) -> Result<(), String> {
    keys::delete(&name)
}

#[tauri::command]
fn key_status() -> std::collections::BTreeMap<String, bool> {
    keys::status()
}

/// The one door to the runner: whitelisted command, paths checked, key added.
#[tauri::command]
async fn run_runner(app: AppHandle, command: String, request: Value) -> Result<Value, String> {
    let key_name = runner::key_name_for(&command, &request)?;
    if request.get("projectsDir").is_some() || request.get("projectDir").is_some() {
        let cfg = config::load(&config_path(&app)?)?;
        let root = projects_dir(&app, cfg.as_ref())?;
        std::fs::create_dir_all(&root).map_err(|e| format!("Could not create the projects folder: {e}"))?;
        runner::check_paths(&request, &root)?;
    }
    let api_key = match key_name {
        Some(n) => keys::get(&n)?,
        None => None,
    };
    run_command(app, command, request, api_key).await
}

/// Copies the chosen logo into the app data folder, returns the stored path.
#[tauri::command]
fn import_logo(app: AppHandle, path: String) -> Result<String, String> {
    let src = PathBuf::from(&path);
    let ext = src
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_ascii_lowercase())
        .filter(|e| ["png", "jpg", "jpeg", "svg", "webp"].contains(&e.as_str()))
        .ok_or("The logo must be a PNG, JPG, SVG or WebP file.")?;
    let size = std::fs::metadata(&src).map_err(|_| "Logo file not found.")?.len();
    if size > 5 * 1024 * 1024 {
        return Err("The logo file is larger than 5 MB.".into());
    }
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?.join("brand");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let dest = dir.join(format!("logo.{ext}"));
    std::fs::copy(&src, &dest).map_err(|e| format!("Could not copy the logo: {e}"))?;
    Ok(dest.to_string_lossy().to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            app_state,
            save_config,
            set_key,
            delete_key,
            key_status,
            run_runner,
            import_logo
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
