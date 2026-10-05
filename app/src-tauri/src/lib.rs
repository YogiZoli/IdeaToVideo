// lib.rs: the Tauri commands the UI can call. Nothing here returns a key.
// Every outgoing network call happens in the Node runner, the UI talks to no
// external address (strict CSP in tauri.conf.json).
//
// Two levels of settings (DECISIONS 67, docs/identity.md): the App
// (config.json: AI default, projects folder, active Identity) and the
// Identities (identities/<id>/identity.json). The UI merges the two into the
// effective settings the gates read (app/src/lib/identity.ts).

mod backup;
mod brand;
mod config;
mod edition;
mod identity;
mod jobs;
mod keys;
mod log;
mod runner;

use std::path::{Path, PathBuf};
use std::sync::Mutex;

use serde_json::{json, Value};
use tauri::{AppHandle, Emitter, Manager};

/// App-wide state: the job registry, the local log, and a one-time notice for
/// the UI (what the move to Identities could not do).
#[derive(Default)]
struct Core {
    jobs: jobs::Jobs,
    log: log::Log,
    notice: Mutex<Option<String>>,
}

/// One line in the local log from the core (log.rs).
fn note(app: &AppHandle, level: &str, event: &str, data: Value) {
    app.state::<Core>().log.write("core", level, event, data, &[]);
}

/// Runner commands that finish a piece of work worth a backup right away.
const AUTO_BACKUP_AFTER: &[&str] = &["approve-gate", "render-video", "make-avatar", "avatar-layout", "remove-avatar"];
/// Runner commands that read or write backups: the core adds the backup
/// folder, the projects folder and the Identity folders from the App settings.
const BACKUP_COMMANDS: &[&str] = &["backup-project", "backup-all", "backup-estimate", "list-backups", "restore-project"];

fn config_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path().app_config_dir().map_err(|e| format!("No config folder: {e}"))
}

fn config_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(config_dir(app)?.join(config::FILE_NAME))
}

/// The App settings, schema 2. A schema 1 file means the move to Identities
/// failed at start; the UI shows the reason.
fn load_app_config(app: &AppHandle) -> Result<Option<Value>, String> {
    let cfg = config::load(&config_path(app)?)?;
    if let Some(c) = &cfg {
        if c.get("schema").and_then(Value::as_u64) != Some(2) {
            let why = app.state::<Core>().notice.lock().map(|n| n.clone()).unwrap_or_default();
            return Err(format!("The settings could not be moved to Identities. {}", why.unwrap_or_default()));
        }
    }
    Ok(cfg)
}

fn runner_paths(app: &AppHandle) -> Result<runner::Paths, String> {
    let resources = app.path().resource_dir().map_err(|e| format!("No resource folder: {e}"))?;
    let script = runner::plain_path(resources.join("runner").join("main.mjs"));
    let ffmpeg = Some(runner::plain_path(resources.join("ffmpeg")));
    let engine = Some(runner::plain_path(resources.join("engine")));
    // local, not roaming: the render browser alone is about 280 MB
    let data = app.path().app_local_data_dir().ok().map(runner::plain_path);
    if !script.exists() {
        return Err(format!("The runner is missing ({}). Reinstall the app.", script.display()));
    }
    Ok(runner::Paths { node: runner::plain_path(runner::node_path()?), script, ffmpeg, engine, data })
}

fn projects_dir(app: &AppHandle, cfg: Option<&Value>) -> Result<PathBuf, String> {
    config::projects_dir(cfg, app.path().document_dir().ok(), app.path().home_dir().ok())
}

/// The active Identity: the one config.json names, else the first one.
fn active<'a>(cfg: Option<&Value>, all: &'a [Value]) -> Option<&'a Value> {
    let want = cfg.and_then(|c| c.get("activeIdentity")).and_then(Value::as_str);
    all.iter().find(|v| Some(identity::str_of(v, "id")) == want).or_else(|| all.first())
}

/// Runs a runner command on a blocking thread, forwarding progress as events.
/// `job`: registered in the Jobs list and queued by its class (jobs.rs).
async fn run_command(
    app: AppHandle,
    command: String,
    request: Value,
    api_key: Option<String>,
    job: Option<(jobs::Info, jobs::Class)>,
) -> Result<Value, String> {
    let paths = runner_paths(&app)?;
    tauri::async_runtime::spawn_blocking(move || {
        let core = app.state::<Core>();
        // the key a job uses is masked by value in every log line
        let secret = api_key.clone().unwrap_or_default();
        let secrets = [secret.as_str()];
        let started = std::time::Instant::now();
        let project = job.as_ref().and_then(|(i, _)| i.project.clone());
        let who = job.as_ref().map(|(i, c)| {
            json!({ "identity": i.identity, "identityName": i.identity_name, "class": format!("{c:?}"), "project": i.project })
        });
        core.log.write(
            "runner",
            "info",
            "run_start",
            json!({ "command": command, "request": log::safe(&request), "job": who, "key": api_key.is_some() }),
            &secrets,
        );
        // every step change, every retry, model switch, repair or wait, and the
        // render percent in tens
        let (mut last_step, mut last_bucket) = (String::new(), -1i64);
        let mut on_progress = |v: Value| {
            let step = v.get("step").and_then(Value::as_str).unwrap_or("").to_string();
            let bucket = v.get("percent").and_then(Value::as_f64).map(|p| (p / 10.0) as i64);
            let always = matches!(step.as_str(), "waiting" | "retry" | "fallback" | "repairing" | "estimate");
            if always || step != last_step || bucket.is_some_and(|b| b != last_bucket) {
                let level = if matches!(step.as_str(), "retry" | "fallback" | "repairing") { "warn" } else { "info" };
                core.log.write("runner", level, "run_progress", json!({ "command": command, "progress": log::safe(&v) }), &secrets);
                last_step = step;
                if let Some(b) = bucket {
                    last_bucket = b;
                }
            }
            let _ = app.emit("runner-progress", runner::progress_payload(&command, project.as_deref(), v));
        };
        let ticket = job.map(|(info, class)| {
            let t = core.jobs.start(info, class, &mut |message| {
                on_progress(json!({ "event": "progress", "step": "waiting", "message": message }));
                let _ = app.emit("jobs-changed", core.jobs.list());
            });
            let _ = app.emit("jobs-changed", core.jobs.list());
            t
        });
        // The computer must not fall asleep while a script is written, a voice
        // is read or a video renders (Zoltan, 2026-09-30). Held for exactly
        // as long as the runner works. On Windows the request belongs to the
        // calling thread, so it is made and released here, on this thread. If
        // the system refuses, the work runs anyway.
        let _awake = keepawake::Builder::default()
            .idle(true)
            .reason(format!("{} is making your video", edition::PRODUCT_NAME))
            .app_name(edition::PRODUCT_NAME)
            .app_reverse_domain("app.ideatovideo.desktop")
            .create()
            .ok();
        let result = runner::run(&paths, &command, &request, api_key, &mut on_progress);
        let ms = started.elapsed().as_millis() as u64;
        match &result {
            Ok(v) => core.log.write("runner", "info", "run_end", json!({ "command": command, "ms": ms, "result": log::safe(v) }), &secrets),
            Err(e) => core.log.write("runner", "error", "run_failed", json!({ "command": command, "ms": ms, "message": e }), &secrets),
        }
        if ticket.is_some() {
            drop(ticket);
            let _ = app.emit("jobs-changed", core.jobs.list());
        }
        result
    })
    .await
    .map_err(|e| format!("The runner crashed: {e}"))?
}

/// The App settings and/or one Identity through the runner's schema check.
async fn validate(app: &AppHandle, config: Option<&Value>, ident: Option<&Value>) -> Result<(), String> {
    let mut req = json!({});
    if let Some(c) = config {
        req["config"] = c.clone();
    }
    if let Some(i) = ident {
        req["identity"] = i.clone();
    }
    let result = run_command(app.clone(), "validate-config".into(), req, None, None).await?;
    let errors = config::errors_from_validation(&result);
    if errors.is_empty() {
        Ok(())
    } else {
        Err(format!("Settings not saved: {}", errors.join("; ")))
    }
}

fn write_app_config(app: &AppHandle, cfg: &Value) -> Result<(), String> {
    let bytes = serde_json::to_vec_pretty(cfg).map_err(|e| e.to_string())?;
    config::write_atomic(&config_path(app)?, &bytes)
}

/// The UI plays the project's audio and shows its images through the asset
/// protocol. Its scope starts empty (tauri.conf.json) and gets exactly three
/// folders: the projects folder, the cached voice samples and the cached
/// avatar previews.
fn allow_media(app: &AppHandle, projects: &Path) {
    let scope = app.asset_protocol_scope();
    let _ = scope.allow_directory(projects, true);
    if let Ok(d) = app.path().app_local_data_dir() {
        let _ = scope.allow_directory(d.join("voice-previews"), true);
        let _ = scope.allow_directory(d.join("avatar-previews"), true);
        // the Brand wizard's real preview (runner/brand/preview.mjs)
        let _ = scope.allow_directory(d.join("brand-preview"), true);
        // the Motion wizard's preview video (runner/motion/preview.mjs)
        let _ = scope.allow_directory(d.join("motion-preview"), true);
    }
    // the Identities' logos, and the shipped fonts for the wizard's own preview
    if let Ok(c) = config_dir(app) {
        let _ = scope.allow_directory(identity::root(&c), true);
    }
    if let Ok(r) = app.path().resource_dir() {
        let _ = scope.allow_directory(runner::plain_path(r.join("library").join("fonts")), true);
    }
}

/// Everything the UI needs at start: the App settings, the active Identity
/// and the list, the plan, folders, and where keys are saved.
#[tauri::command]
fn app_state(app: AppHandle) -> Result<Value, String> {
    let cfg = load_app_config(&app)?;
    let all = identity::list(&config_dir(&app)?);
    let current = active(cfg.as_ref(), &all);
    let root = projects_dir(&app, cfg.as_ref())?;
    let videos = current.map(|i| root.join(identity::str_of(i, "folder"))).unwrap_or_else(|| root.clone());
    allow_media(&app, &root);
    let id = current.map(|i| identity::str_of(i, "id"));
    let sources = keys::sources(id);
    let notice = app.state::<Core>().notice.lock().ok().and_then(|mut n| n.take());
    let backup_root = backup::root(cfg.as_ref());
    Ok(json!({
        "app": cfg,
        "identity": current,
        "identities": all.iter().map(|v| json!({
            "id": v["id"], "name": v["name"], "folder": v["folder"],
            "youtubeUrl": v.pointer("/channel/youtubeUrl").cloned().unwrap_or(Value::Null),
        })).collect::<Vec<_>>(),
        "edition": edition::info(edition::tier()),
        "projectsRoot": root,
        "projectsDir": videos,
        "defaultProjectsDir": projects_dir(&app, None).ok(),
        "keys": keys::status_from(&sources),
        "keySources": sources,
        "version": app.package_info().version.to_string(),
        "notice": notice,
        "backupRoot": backup_root,
        "log": app.state::<Core>().log.status(),
    }))
}

fn with_notice(mut state: Value, notice: Option<String>) -> Value {
    if notice.is_some() {
        state["notice"] = json!(notice);
    }
    state
}

/// Saves the App settings and/or one Identity. An Identity without a known
/// id is new: it gets an id and a folder (within the plan's limit) and
/// becomes the active one. A new name renames the ONE Videos folder.
#[tauri::command]
async fn save_settings(app: AppHandle, config: Option<Value>, identity: Option<Value>) -> Result<Value, String> {
    let dir = config_dir(&app)?;
    let all = identity::list(&dir);
    let mut cfg = match config {
        Some(c) => c,
        None => load_app_config(&app)?.ok_or("Finish the setup first.")?,
    };
    let root = projects_dir(&app, Some(&cfg))?;
    let mut notice = None;

    if let Some(mut ident) = identity {
        let known = ident
            .get("id")
            .and_then(Value::as_str)
            .and_then(|id| all.iter().find(|v| identity::str_of(v, "id") == id))
            .cloned();
        match known {
            None => {
                edition::check_room(edition::tier(), all.len())?;
                ident = identity::complete_new(ident, &all)?;
                validate(&app, Some(&cfg), Some(&ident)).await?;
                identity::save(&dir, &ident)?;
                identity::adopt_staging(&dir, &mut ident)?;
                cfg["activeIdentity"] = ident["id"].clone();
            }
            Some(old) => {
                for f in ["schema", "id", "folder", "createdAt"] {
                    ident[f] = old[f].clone();
                }
                validate(&app, Some(&cfg), Some(&ident)).await?;
                if identity::str_of(&ident, "name") != identity::str_of(&old, "name") {
                    let busy = app.state::<Core>().jobs.busy_identities().contains(identity::str_of(&old, "id"));
                    let (folder, note) =
                        identity::rename_folder(&root, identity::str_of(&old, "folder"), identity::str_of(&ident, "name"), &all, busy);
                    ident["folder"] = json!(folder);
                    notice = note;
                }
            }
        }
        identity::save(&dir, &ident)?;
        let videos = root.join(identity::str_of(&ident, "folder"));
        std::fs::create_dir_all(&videos).map_err(|e| format!("Could not create the folder {}: {e}", videos.display()))?;
    } else {
        validate(&app, Some(&cfg), None).await?;
    }

    std::fs::create_dir_all(&root).map_err(|e| format!("Could not create the projects folder {}: {e}", root.display()))?;
    write_app_config(&app, &cfg)?;
    note(&app, "info", "settings_saved", json!({ "active": cfg.get("activeIdentity"), "backup": cfg.get("backup"), "llm": cfg.get("llm"), "notice": notice }));
    settings_backup(&app);
    Ok(with_notice(app_state(app)?, notice))
}

/// The App settings and every Identity into the backup folder, when backups
/// are on. A failure is logged and never stops the caller.
fn settings_backup(app: &AppHandle) {
    let Ok(Some(cfg)) = load_app_config(app) else { return };
    if !backup::auto(Some(&cfg)) {
        return;
    }
    let (Some(root), Ok(dir)) = (backup::root(Some(&cfg)), config_dir(app)) else { return };
    match backup::save_settings(&root, &dir, &cfg) {
        Ok(n) => note(app, "info", "settings_backup", json!({ "dir": root.join(backup::SETTINGS_DIR), "identities": n })),
        Err(e) => note(app, "warn", "settings_backup_failed", json!({ "message": e })),
    }
}

/// Settings, App, Backup, "Back up now": the settings part.
#[tauri::command]
fn backup_settings_now(app: AppHandle) -> Result<usize, String> {
    let cfg = load_app_config(&app)?.ok_or("Finish the setup first.")?;
    let root = backup::root(Some(&cfg)).ok_or("No backup folder set. Choose one in Settings, App, Backup.")?;
    let n = backup::save_settings(&root, &config_dir(&app)?, &cfg)?;
    note(&app, "info", "settings_backup", json!({ "dir": root.join(backup::SETTINGS_DIR), "identities": n, "manual": true }));
    Ok(n)
}

/// A new computer: the App settings and every Identity from a backup folder
/// (first run only). The keys are not in a backup: they are added again.
#[tauri::command]
async fn restore_settings(app: AppHandle, path: String) -> Result<Value, String> {
    let dir = config_dir(&app)?;
    if load_app_config(&app)?.is_some_and(|c| c["onboarded"] == true) && !identity::list(&dir).is_empty() {
        return Err("This computer already has settings. A restore is offered only at the first start.".into());
    }
    note(&app, "info", "restore_settings_start", json!({ "path": path }));
    let root = backup::find_root(Path::new(&path))
        .ok_or_else(|| format!("No backup found in that folder. Pick the folder that holds {}.", backup::root_name()))?;
    let (mut cfg, files, active) = backup::read_settings(&root)?;
    validate(&app, Some(&cfg), None).await?;
    let mut made: Vec<Value> = Vec::new();
    let mut skipped = Vec::new();
    for f in files {
        let all = identity::list(&dir);
        let result = async {
            let (ident, assets) = identity::read_export(&f)?;
            let probe = identity::complete_new(ident.clone(), &all)?;
            validate(&app, None, Some(&probe)).await?;
            let new = identity::import(&dir, ident, assets, &all)?;
            identity::save(&dir, &new)?;
            Ok::<Value, String>(new)
        }
        .await;
        match result {
            Ok(v) => made.push(v),
            Err(e) => skipped.push(format!("{}: {e}", f.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default())),
        }
    }
    let pick = made.iter().find(|v| Some(identity::str_of(v, "name")) == active.as_deref()).or(made.first());
    let pick = pick.ok_or("The backup has no Identity the app could import.")?;
    cfg["activeIdentity"] = pick["id"].clone();
    let projects = projects_dir(&app, Some(&cfg))?;
    for v in &made {
        let _ = std::fs::create_dir_all(projects.join(identity::str_of(v, "folder")));
    }
    write_app_config(&app, &cfg)?;
    let notice = (!skipped.is_empty()).then(|| format!("Not restored: {}", skipped.join("; ")));
    note(&app, "info", "restore_settings_done", json!({ "identities": made.len(), "skipped": skipped }));
    Ok(with_notice(app_state(app)?, notice))
}

/// Folders of Google Drive, OneDrive and Dropbox on this computer.
#[tauri::command]
fn cloud_folders() -> Vec<Value> {
    backup::cloud_folders()
}

/// One event from the UI into the local log (logger.ts).
#[tauri::command]
fn log_event(app: AppHandle, level: String, event: String, data: Value) {
    let level = if matches!(level.as_str(), "info" | "warn" | "error") { level } else { "info".into() };
    app.state::<Core>().log.write("ui", &level, &event, data, &[]);
}

#[tauri::command]
fn log_status(app: AppHandle) -> Value {
    app.state::<Core>().log.status()
}

/// Settings, App, General, "Delete logs": the only way logs go away.
#[tauri::command]
fn delete_logs(app: AppHandle) -> Result<Value, String> {
    let core = app.state::<Core>();
    let n = core.log.delete_all()?;
    core.log.info("logs_deleted", json!({ "files": n }));
    Ok(core.log.status())
}

fn set_active(app: &AppHandle, id: &str) -> Result<(), String> {
    let mut cfg = load_app_config(app)?.ok_or("Finish the setup first.")?;
    cfg["activeIdentity"] = json!(id);
    write_app_config(app, &cfg)
}

#[tauri::command]
fn set_active_identity(app: AppHandle, id: String) -> Result<Value, String> {
    identity::load(&config_dir(&app)?, &id)?;
    set_active(&app, &id)?;
    note(&app, "info", "identity_switched", json!({ "identity": id }));
    app_state(app)
}

/// "Duplicate this Identity": settings and files under a new name, the own
/// keys copied inside the core when `copy_keys` (the UI's default comes from
/// the plan). The ONE Videos are not copied.
#[tauri::command]
fn duplicate_identity(app: AppHandle, id: String, name: String, copy_keys: bool) -> Result<Value, String> {
    let dir = config_dir(&app)?;
    let all = identity::list(&dir);
    edition::check_room(edition::tier(), all.len())?;
    let src = identity::load(&dir, &id)?;
    let copy = identity::duplicate(&dir, &src, &name, &all)?;
    let new_id = identity::id_of(&copy)?;
    if copy_keys {
        keys::copy_identity(&id, &new_id)?;
    }
    let cfg = load_app_config(&app)?;
    let videos = projects_dir(&app, cfg.as_ref())?.join(identity::str_of(&copy, "folder"));
    std::fs::create_dir_all(&videos).map_err(|e| e.to_string())?;
    set_active(&app, &new_id)?;
    note(&app, "info", "identity_duplicated", json!({ "from": id, "to": new_id, "name": copy["name"], "copyKeys": copy_keys }));
    settings_backup(&app);
    app_state(app)
}

/// Removes an Identity's settings and own keys. Its ONE Videos stay on disk.
#[tauri::command]
fn delete_identity(app: AppHandle, id: String) -> Result<Value, String> {
    let dir = config_dir(&app)?;
    let all = identity::list(&dir);
    if all.len() <= 1 {
        return Err("This is the only Identity, so it cannot be deleted.".into());
    }
    if app.state::<Core>().jobs.busy_identities().contains(&id) {
        return Err("A job runs for this Identity. Delete it when the job is done.".into());
    }
    identity::load(&dir, &id)?;
    keys::delete_identity(&id)?;
    identity::remove(&dir, &id)?;
    note(&app, "info", "identity_deleted", json!({ "identity": id }));
    let cfg = load_app_config(&app)?;
    if cfg.as_ref().and_then(|c| c.get("activeIdentity")).and_then(Value::as_str) == Some(id.as_str()) {
        let next = identity::list(&dir).first().map(|v| identity::str_of(v, "id").to_string());
        if let Some(n) = next {
            set_active(&app, &n)?;
        }
    }
    app_state(app)
}

/// "Export Identity": a zip without keys, for another computer or user.
#[tauri::command]
fn export_identity(app: AppHandle, id: String, path: String) -> Result<String, String> {
    let dir = config_dir(&app)?;
    let ident = identity::load(&dir, &id)?;
    let mut out = PathBuf::from(path);
    if out.extension().and_then(|e| e.to_str()).map(|e| e.to_ascii_lowercase()) != Some("zip".into()) {
        out.set_extension("zip");
    }
    identity::export(&dir, &ident, edition::PRODUCT_NAME, &out)?;
    note(&app, "info", "identity_exported", json!({ "identity": id, "file": out }));
    Ok(out.to_string_lossy().to_string())
}

/// "Import Identity": a new Identity from an export, checked file by file
/// and against the schema, within the plan's limit. It becomes the active one.
#[tauri::command]
async fn import_identity(app: AppHandle, path: String) -> Result<Value, String> {
    let dir = config_dir(&app)?;
    let all = identity::list(&dir);
    edition::check_room(edition::tier(), all.len())?;
    let (ident, files) = identity::read_export(Path::new(&path))?;
    // the schema check runs before anything is written
    let probe = identity::complete_new(ident.clone(), &all)?;
    validate(&app, None, Some(&probe)).await.map_err(|e| e.replace("Settings not saved", "This Identity file cannot be imported"))?;
    let new = identity::import(&dir, ident, files, &all)?;
    identity::save(&dir, &new)?;
    let cfg = load_app_config(&app)?;
    let videos = projects_dir(&app, cfg.as_ref())?.join(identity::str_of(&new, "folder"));
    std::fs::create_dir_all(&videos).map_err(|e| e.to_string())?;
    set_active(&app, identity::str_of(&new, "id"))?;
    note(&app, "info", "identity_imported", json!({ "identity": new["id"], "name": new["name"], "file": path }));
    settings_backup(&app);
    app_state(app)
}

fn active_id(app: &AppHandle) -> Result<Option<String>, String> {
    let cfg = load_app_config(app)?;
    let all = identity::list(&config_dir(app)?);
    Ok(active(cfg.as_ref(), &all).map(|v| identity::str_of(v, "id").to_string()))
}

/// `scope`: "app" or "identity" (the active Identity's own key).
fn key_scope<'a>(scope: &str, id: &'a Option<String>) -> Result<keys::Scope<'a>, String> {
    match (scope, id) {
        ("app", _) => Ok(keys::Scope::App),
        ("identity", Some(id)) => Ok(keys::Scope::Identity(id)),
        ("identity", None) => Err("There is no Identity yet.".into()),
        _ => Err(format!("Unknown key scope: {scope}")),
    }
}

#[tauri::command]
fn set_key(app: AppHandle, name: String, value: String, scope: String) -> Result<(), String> {
    let id = active_id(&app)?;
    let r = keys::set(&name, &value, key_scope(&scope, &id)?);
    // the name and the level only, never the value
    let level = if r.is_ok() { "info" } else { "warn" };
    note(&app, level, "key_saved", json!({ "name": name, "scope": scope, "identity": id, "error": r.as_ref().err() }));
    r
}

#[tauri::command]
fn delete_key(app: AppHandle, name: String, scope: String) -> Result<(), String> {
    let id = active_id(&app)?;
    note(&app, "info", "key_deleted", json!({ "name": name, "scope": scope, "identity": id }));
    keys::delete(&name, key_scope(&scope, &id)?)
}

#[tauri::command]
fn delete_all_keys(app: AppHandle) -> Result<(), String> {
    note(&app, "info", "keys_deleted_all", json!({}));
    keys::delete_all(&identity::ids(&identity::list(&config_dir(&app)?)))
}

/// For the active Identity: which keys a job can use, and where they are saved.
#[tauri::command]
fn key_status(app: AppHandle) -> Result<Value, String> {
    let id = active_id(&app)?;
    let sources = keys::sources(id.as_deref());
    Ok(json!({ "keys": keys::status_from(&sources), "keySources": sources }))
}

/// The running and waiting jobs of every Identity.
#[tauri::command]
fn job_list(app: AppHandle) -> Value {
    app.state::<Core>().jobs.list()
}

/// The one door to the runner: whitelisted command, paths checked, the key
/// of the right Identity added, the job queued by its class.
#[tauri::command]
async fn run_runner(app: AppHandle, command: String, mut request: Value) -> Result<Value, String> {
    let key_name = runner::key_name_for(&command, &request)?;
    let cfg = load_app_config(&app)?;
    let all = identity::list(&config_dir(&app)?);
    let root = projects_dir(&app, cfg.as_ref())?;
    let folders = identity::folders(&all);
    let path_of = |f: &str| request.get(f).and_then(Value::as_str).map(PathBuf::from);
    let (project, videos) = (path_of("projectDir"), path_of("projectsDir"));
    if project.is_some() || videos.is_some() {
        std::fs::create_dir_all(&root).map_err(|e| format!("Could not create the projects folder: {e}"))?;
        for f in &folders {
            let _ = std::fs::create_dir_all(root.join(f));
        }
        runner::check_paths(&request, &root, &folders)?;
    }
    // A job belongs to the Identity whose folder holds its ONE Video, not to
    // whichever Identity is on screen: a render keeps its own key when the
    // user switches meanwhile.
    let owner = project
        .as_deref()
        .or(videos.as_deref())
        .and_then(|p| identity::owner_of(p, &root, &all))
        .or_else(|| active(cfg.as_ref(), &all).map(|v| identity::str_of(v, "id").to_string()));
    let owner_folder = owner
        .as_deref()
        .and_then(|o| all.iter().find(|v| identity::str_of(v, "id") == o))
        .map(|v| identity::str_of(v, "folder").to_string());
    if BACKUP_COMMANDS.contains(&command.as_str()) {
        request["projectsRoot"] = json!(root);
        request["folders"] = json!(folders);
        request["level"] = json!(backup::level(cfg.as_ref()));
        request["identityFolder"] = json!(owner_folder);
        if command != "backup-estimate" {
            let r = backup::root(cfg.as_ref()).ok_or("No backup folder set. Choose one in Settings, App, Backup.")?;
            std::fs::create_dir_all(&r).map_err(|e| format!("Could not create the backup folder {}: {e}", r.display()))?;
            request["backupRoot"] = json!(r);
        }
    }
    // The Identity's folder (Brand Identity Card, dictionary), always set
    // here from the job's owner, never taken from the UI.
    if let Some(obj) = request.as_object_mut() {
        obj.remove("identityDir");
    }
    if let Some(id) = owner.as_deref() {
        request["identityDir"] = json!(runner::plain_path(identity::dir_of(&config_dir(&app)?, id)?));
    }
    let app_only = request.get("keyScope").and_then(Value::as_str) == Some("app");
    let resolved = match &key_name {
        Some(n) => keys::resolve(n, owner.as_deref(), app_only)?,
        None => None,
    };
    let class = jobs::class_of(
        &command,
        key_name.as_deref().zip(resolved.as_ref().map(|(_, who)| who.as_str())),
    );
    let info = jobs::Info {
        command: command.clone(),
        identity_name: owner
            .as_deref()
            .and_then(|o| all.iter().find(|v| identity::str_of(v, "id") == o))
            .map(|v| identity::str_of(v, "name").to_string()),
        identity: owner,
        project: project.as_ref().map(|p| p.to_string_lossy().to_string()),
    };
    let auto = AUTO_BACKUP_AFTER.contains(&command.as_str()) && backup::auto(cfg.as_ref());
    let later = info.clone();
    let result = run_command(app.clone(), command, request, resolved.map(|(k, _)| k), Some((info, class))).await;
    if let (true, Some(dir), Ok(_)) = (auto, project, &result) {
        tauri::async_runtime::spawn(auto_backup(app, dir, owner_folder, later));
    }
    result
}

/// A ONE Video backup after an approval or a render, in the background. The
/// UI hears "backup-done" and shows the time.
async fn auto_backup(app: AppHandle, dir: PathBuf, folder: Option<String>, info: jobs::Info) {
    let cfg = load_app_config(&app).ok().flatten();
    let Some(root) = backup::root(cfg.as_ref()) else { return };
    let _ = std::fs::create_dir_all(&root);
    let req = json!({
        "projectDir": dir, "backupRoot": root, "identityFolder": folder, "level": backup::level(cfg.as_ref()),
    });
    let job = jobs::Info { command: "backup-project".into(), ..info };
    let r = run_command(app.clone(), "backup-project".into(), req, None, Some((job, jobs::Class::Free))).await;
    let payload = match &r {
        Ok(v) => json!({ "projectDir": dir, "ok": true, "result": v }),
        Err(e) => json!({ "projectDir": dir, "ok": false, "error": e }),
    };
    let _ = app.emit("backup-done", payload);
}

/// The active Identity's brand folder (Brand Identity Card, FRAME.md, logos).
fn brand_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let id = active_id(app)?.ok_or("No Identity yet.")?;
    Ok(identity::dir_of(&config_dir(app)?, &id)?.join("brand"))
}

/// "Export Brand Identity Card": <path>.zip with the card, FRAME.md and logos.
#[tauri::command]
fn export_brand(app: AppHandle, path: String) -> Result<String, String> {
    let mut out = PathBuf::from(path);
    if out.extension().and_then(|e| e.to_str()).map(|e| e.to_ascii_lowercase()) != Some("zip".into()) {
        out.set_extension("zip");
    }
    brand::export(&brand_dir(&app)?, edition::PRODUCT_NAME, &out)?;
    note(&app, "info", "brand_exported", json!({ "file": out }));
    Ok(out.to_string_lossy().to_string())
}

/// "Import Brand Identity Card": from a .brand.zip (its logos go into the
/// active Identity's brand folder) or a .json. Returns the card; the UI saves
/// it through the runner (brand-save), which checks it against the schema.
#[tauri::command]
fn import_brand(app: AppHandle, path: String) -> Result<Value, String> {
    let (card, logos) = brand::read(&PathBuf::from(&path))?;
    brand::write_logos(&brand_dir(&app)?, &logos)?;
    note(&app, "info", "brand_imported", json!({ "logos": logos.len() }));
    Ok(card)
}

/// "Import tokens.css": the text of the tokens file the user picked.
#[tauri::command]
fn read_tokens_file(path: String) -> Result<String, String> {
    brand::read_tokens(&PathBuf::from(path))
}

/// Copies the chosen logo into the active Identity's folder (or, during setup
/// of a new Identity, into a waiting folder it adopts on save). Returns the
/// stored path.
#[tauri::command]
fn import_logo(app: AppHandle, path: String, for_new: bool, variant: Option<String>) -> Result<String, String> {
    // "dark": the version for dark backgrounds (Brand Identity Card logo.dark)
    let stem = match variant.as_deref() {
        None | Some("light") => "logo",
        Some("dark") => "logo-dark",
        Some(v) => return Err(format!("Unknown logo variant: {v}")),
    };
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
    let cfg_dir = config_dir(&app)?;
    let base = match (for_new, active_id(&app)?) {
        (false, Some(id)) => identity::dir_of(&cfg_dir, &id)?,
        _ => {
            let s = identity::staging_dir(&cfg_dir);
            let _ = std::fs::remove_dir_all(&s);
            s
        }
    };
    let dir = base.join("brand");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    // one file per variant: the same logo in another format replaces it
    for old in ["png", "jpg", "jpeg", "svg", "webp"] {
        let _ = std::fs::remove_file(dir.join(format!("{stem}.{old}")));
    }
    let dest = dir.join(format!("{stem}.{ext}"));
    std::fs::copy(&src, &dest).map_err(|e| format!("Could not copy the logo: {e}"))?;
    Ok(dest.to_string_lossy().to_string())
}

/// "Add footage" (Settings, Identity, Footage): copies the video the user
/// picked into the active Identity's footage folder under a temporary name;
/// the runner (footage-add) measures it, finds its cuts and keeps it.
#[tauri::command]
fn import_footage(app: AppHandle, path: String) -> Result<String, String> {
    let src = PathBuf::from(&path);
    let ext = src
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_ascii_lowercase())
        .filter(|e| ["mp4", "mov", "webm", "m4v"].contains(&e.as_str()))
        .ok_or("Footage must be a video file (MP4, MOV, WebM).")?;
    let size = std::fs::metadata(&src).map_err(|_| "Video file not found.")?.len();
    if size > 4 * 1024 * 1024 * 1024 {
        return Err("The video file is larger than 4 GB. Cut it into parts.".into());
    }
    let id = active_id(&app)?.ok_or("No Identity yet.")?;
    let dir = identity::dir_of(&config_dir(&app)?, &id)?.join("footage");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let stamp = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis()).unwrap_or(0);
    let stem = src.file_stem().and_then(|s| s.to_str()).unwrap_or("clip").chars().filter(|c| c.is_alphanumeric() || *c == '-' || *c == '_' || *c == ' ').take(60).collect::<String>();
    let name = format!("incoming-{stamp}{stem}.{ext}");
    std::fs::copy(&src, dir.join(&name)).map_err(|e| format!("Could not copy the video: {e}"))?;
    Ok(name)
}

/// "Upload a segment" (CTA wizard): copies the video the user picked into the
/// active Identity's segments folder under a temporary name; the runner
/// (segment-add) checks its length and keyword and keeps or deletes it.
#[tauri::command]
fn import_segment(app: AppHandle, path: String) -> Result<String, String> {
    let src = PathBuf::from(&path);
    let ext = src
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_ascii_lowercase())
        .filter(|e| ["mp4", "mov", "webm", "m4v"].contains(&e.as_str()))
        .ok_or("A segment must be a video file (MP4, MOV, WebM).")?;
    let size = std::fs::metadata(&src).map_err(|_| "Video file not found.")?.len();
    if size > 500 * 1024 * 1024 {
        return Err("The video file is larger than 500 MB. A segment is at most 30 seconds.".into());
    }
    let id = active_id(&app)?.ok_or("No Identity yet.")?;
    let dir = identity::dir_of(&config_dir(&app)?, &id)?.join("segments");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let stamp = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis()).unwrap_or(0);
    let name = format!("incoming-{stamp}.{ext}");
    std::fs::copy(&src, dir.join(&name)).map_err(|e| format!("Could not copy the video: {e}"))?;
    Ok(name)
}

/// "Export publishing data": copies a rendered video's <video>.publish.json
/// (runner/gates/render/publish.mjs) to where the user chose. Only that kind
/// of file, only from inside the projects folder.
#[tauri::command]
fn export_publish(app: AppHandle, file: String, path: String) -> Result<String, String> {
    let cfg = load_app_config(&app)?;
    let root = projects_dir(&app, cfg.as_ref())?;
    runner::check_paths(&json!({ "projectDir": file }), &root, &[])?;
    if !file.to_ascii_lowercase().ends_with(".publish.json") {
        return Err("Only the publishing data of a video can be exported here.".into());
    }
    let mut out = PathBuf::from(path);
    if out.extension().and_then(|e| e.to_str()).map(|e| e.to_ascii_lowercase()) != Some("json".into()) {
        out.set_extension("json");
    }
    std::fs::copy(&file, &out).map_err(|e| format!("Could not save the publishing data: {e}"))?;
    note(&app, "info", "publish_exported", json!({ "file": out }));
    Ok(out.to_string_lossy().to_string())
}

/// The finished video, out of the project (Zoltan, 2026-10-05): "Download"
/// (a place the user picked in the save dialog) and "Save a copy to Google
/// Drive" (the cloud's own folder on this computer, from `cloud_folders`).
/// Only a rendered .mp4 of a ONE Video, with its .srt next to it when there
/// is one. An existing file is never overwritten: a number is added.
#[tauri::command]
fn export_video(app: AppHandle, file: String, path: String) -> Result<String, String> {
    let cfg = load_app_config(&app)?;
    let root = projects_dir(&app, cfg.as_ref())?;
    runner::check_paths(&json!({ "projectDir": file }), &root, &[])?;
    if !file.to_ascii_lowercase().ends_with(".mp4") {
        return Err("Only a rendered video can be saved here.".into());
    }
    let mut out = PathBuf::from(&path);
    if out.extension().and_then(|e| e.to_str()).map(|e| e.to_ascii_lowercase()) != Some("mp4".into()) {
        out.set_extension("mp4");
    }
    if let Some(dir) = out.parent() {
        std::fs::create_dir_all(dir).map_err(|e| format!("Could not create the folder {}: {e}", dir.display()))?;
    }
    let stem = out.file_stem().and_then(|s| s.to_str()).unwrap_or("video").to_string();
    let mut n = 2;
    while out.exists() {
        out.set_file_name(format!("{stem} ({n}).mp4"));
        n += 1;
    }
    std::fs::copy(&file, &out).map_err(|e| format!("Could not save the video: {e}"))?;
    let srt = PathBuf::from(&file).with_extension("srt");
    if srt.exists() {
        let _ = std::fs::copy(&srt, out.with_extension("srt"));
    }
    note(&app, "info", "video_exported", json!({ "file": out }));
    Ok(out.to_string_lossy().to_string())
}

/// Copies a music file the user picked into the project (audio/music.<ext>),
/// returns that relative name for the voice gate. The runner never gets a
/// path outside the projects folder.
#[tauri::command]
fn import_music(app: AppHandle, project_dir: String, path: String) -> Result<String, String> {
    let cfg = load_app_config(&app)?;
    let root = projects_dir(&app, cfg.as_ref())?;
    runner::check_paths(&json!({ "projectDir": project_dir }), &root, &[])?;
    let src = PathBuf::from(&path);
    let name = runner::music_name(&src)?;
    let size = std::fs::metadata(&src).map_err(|_| "Music file not found.")?.len();
    if size > 200 * 1024 * 1024 {
        return Err("The music file is larger than 200 MB.".into());
    }
    let audio = PathBuf::from(&project_dir).join("audio");
    std::fs::create_dir_all(&audio).map_err(|e| e.to_string())?;
    // one music file per project: drop an earlier one with another extension
    if let Ok(entries) = std::fs::read_dir(&audio) {
        for e in entries.flatten() {
            if e.file_name().to_string_lossy().starts_with("music.") {
                let _ = std::fs::remove_file(e.path());
            }
        }
    }
    std::fs::copy(&src, PathBuf::from(&project_dir).join(&name)).map_err(|e| format!("Could not copy the music file: {e}"))?;
    Ok(name)
}

/// The app was called Studio during the first tests. Move its keys and
/// settings over once, silently; a failure only means starting fresh.
fn migrate_from_studio(app: &AppHandle) {
    keys::migrate_legacy();
    if let Ok(new_dir) = app.path().app_config_dir() {
        if let Some(old_dir) = new_dir.parent().map(|p| p.join(config::LEGACY_IDENTIFIER)) {
            let docs = app.path().document_dir().ok();
            let _ = config::migrate_legacy(&new_dir, &old_dir, docs.as_deref());
        }
    }
}

/// The one-file settings (schema 1) become the App settings and the first
/// Identity, "My Identity" (docs/identity.md 5).
fn migrate_to_identities(app: &AppHandle) {
    note(app, "info", "migration_check", json!({}));
    let (Ok(dir), Ok(data)) = (app.path().app_config_dir(), app.path().app_data_dir()) else { return };
    let result = identity::migrate_v1(&dir, &data.join("brand"), |cfg| projects_dir(app, Some(cfg)).ok());
    let notice = match result {
        Ok(n) => n,
        Err(e) => Some(e),
    };
    note(app, if notice.is_some() { "warn" } else { "info" }, "migration_done", json!({ "notice": notice }));
    if let Ok(mut n) = app.state::<Core>().notice.lock() {
        *n = notice;
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(Core::default())
        .setup(|app| {
            let h = app.handle();
            if let Ok(d) = h.path().app_local_data_dir() {
                h.state::<Core>().log.open(d.join("logs"));
            }
            note(h, "info", "app_start", json!({
                "version": h.package_info().version.to_string(),
                "os": std::env::consts::OS,
                "arch": std::env::consts::ARCH,
                "product": edition::PRODUCT_NAME,
                "tier": edition::tier().name(),
            }));
            migrate_from_studio(h);
            migrate_to_identities(h);
            if let Ok(dir) = h.path().app_config_dir() {
                let cfg = config::load(&dir.join(config::FILE_NAME)).ok().flatten();
                let get = |f: &str| cfg.as_ref().and_then(|c| c.get(f)).cloned();
                note(h, "info", "app_ready", json!({
                    "identities": identity::list(&dir).len(),
                    "active": get("activeIdentity"),
                    "projectsDir": get("projectsDir"),
                    "backup": get("backup"),
                    "llm": get("llm"),
                }));
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            app_state,
            save_settings,
            set_active_identity,
            duplicate_identity,
            delete_identity,
            export_identity,
            import_identity,
            set_key,
            delete_key,
            key_status,
            delete_all_keys,
            job_list,
            run_runner,
            import_logo,
            export_brand,
            import_brand,
            read_tokens_file,
            import_music,
            export_publish,
            export_video,
            import_segment,
            import_footage,
            backup_settings_now,
            restore_settings,
            cloud_folders,
            log_event,
            log_status,
            delete_logs
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
