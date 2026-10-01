// backup.rs: the core's part of the backups (DECISIONS 66, docs/backup.md).
// The ONE Video files are copied by the runner (runner/backup.mjs); here:
// where the backup folder is (only the one set in the App settings, never a
// path from the UI), the settings backup (the App settings without keys, and
// every Identity as an export zip), the restore of those on a new computer,
// and the cloud folders the app can suggest.

use std::fs;
use std::path::{Path, PathBuf};

use serde_json::{json, Value};

use crate::{config, edition, identity};

pub const SETTINGS_DIR: &str = "_settings";
pub const SETTINGS_FORMAT: &str = "ideatovideo-settings/1";

/// "<chosen folder>/IdeaToVideo_Backup" (the product name from edition.rs).
pub fn root_name() -> String {
    format!("{}_Backup", edition::PRODUCT_NAME)
}

/// The backup root from the App settings, None when no folder is chosen.
pub fn root(cfg: Option<&Value>) -> Option<PathBuf> {
    cfg.and_then(|c| c.pointer("/backup/dir"))
        .and_then(Value::as_str)
        .filter(|s| !s.trim().is_empty())
        .map(|d| PathBuf::from(d).join(root_name()))
}

pub fn level(cfg: Option<&Value>) -> u64 {
    cfg.and_then(|c| c.pointer("/backup/level")).and_then(Value::as_u64).filter(|l| (1..=4).contains(l)).unwrap_or(4)
}

pub fn auto(cfg: Option<&Value>) -> bool {
    root(cfg).is_some() && cfg.and_then(|c| c.pointer("/backup/auto")).and_then(Value::as_bool).unwrap_or(true)
}

fn settings_file() -> String {
    format!("{}_settings.json", edition::PRODUCT_NAME)
}

/// Writes the App settings and every Identity (export zip, never a key) into
/// <root>/_settings. Old files stay: nothing is deleted from a backup.
pub fn save_settings(root: &Path, config_dir: &Path, cfg: &Value) -> Result<usize, String> {
    let dir = root.join(SETTINGS_DIR);
    fs::create_dir_all(&dir).map_err(|e| format!("Could not create {}: {e}", dir.display()))?;
    let all = identity::list(config_dir);
    let active = cfg.get("activeIdentity").and_then(Value::as_str);
    let mut list = Vec::new();
    for ident in &all {
        let file = format!("{}.identity.zip", identity::str_of(ident, "folder"));
        identity::export(config_dir, ident, edition::PRODUCT_NAME, &dir.join(&file))?;
        list.push(json!({ "name": ident["name"], "folder": ident["folder"], "file": file }));
    }
    let active_name = all.iter().find(|v| Some(identity::str_of(v, "id")) == active).map(|v| v["name"].clone());
    let doc = json!({
        "format": SETTINGS_FORMAT,
        "product": edition::PRODUCT_NAME,
        "savedAt": identity::now_iso(),
        "app": cfg,
        "identities": list,
        "active": active_name,
    });
    config::write_atomic(&dir.join(settings_file()), &serde_json::to_vec_pretty(&doc).unwrap())?;
    Ok(all.len())
}

/// The backup root inside a folder the user picked on a new computer: the
/// folder itself, or its IdeaToVideo_Backup.
pub fn find_root(picked: &Path) -> Option<PathBuf> {
    [picked.to_path_buf(), picked.join(root_name())]
        .into_iter()
        .find(|r| r.join(SETTINGS_DIR).join(settings_file()).is_file())
}

/// Reads a settings backup: the App settings to use on this computer and the
/// Identity files to import (in order), plus the name of the active one.
pub fn read_settings(root: &Path) -> Result<(Value, Vec<PathBuf>, Option<String>), String> {
    let dir = root.join(SETTINGS_DIR);
    let doc = config::load(&dir.join(settings_file()))?.ok_or("No settings in this backup.")?;
    if doc.get("format").and_then(Value::as_str) != Some(SETTINGS_FORMAT) {
        return Err("The settings backup has an unknown format.".into());
    }
    let old = doc.get("app").cloned().unwrap_or_else(|| json!({}));
    let mut app = json!({ "schema": 2, "onboarded": true });
    for f in ["ui", "llm", "defaults"] {
        if let Some(v) = old.get(f) {
            app[f] = v.clone();
        }
    }
    if app.get("llm").is_none() {
        app["llm"] = json!({ "provider": "gemini", "model": "gemini-3.5-flash" });
    }
    // the projects folder only when it exists on this computer
    if let Some(p) = old.get("projectsDir").and_then(Value::as_str).filter(|p| Path::new(p).is_dir()) {
        app["projectsDir"] = json!(p);
    }
    // backups go on into the folder the user just picked
    let level = old.pointer("/backup/level").cloned().unwrap_or(json!(4));
    let picked = root.parent().unwrap_or(root);
    app["backup"] = json!({ "dir": picked.to_string_lossy(), "level": level, "auto": true });

    let files = doc
        .get("identities")
        .and_then(Value::as_array)
        .map(|a| {
            a.iter()
                .filter_map(|i| i.get("file").and_then(Value::as_str))
                .filter(|f| !f.contains(['/', '\\']) && f.ends_with(".identity.zip"))
                .map(|f| dir.join(f))
                .filter(|p| p.is_file())
                .collect()
        })
        .unwrap_or_default();
    let active = doc.get("active").and_then(Value::as_str).map(String::from);
    Ok((app, files, active))
}

/// Folders of the cloud desktop clients on this computer, to suggest as the
/// backup folder: [{ label, path }].
pub fn cloud_folders() -> Vec<Value> {
    let mut out: Vec<(String, PathBuf)> = Vec::new();
    let home = std::env::var_os("USERPROFILE").or_else(|| std::env::var_os("HOME")).map(PathBuf::from);
    if cfg!(windows) {
        for letter in 'C'..='Z' {
            let p = PathBuf::from(format!("{letter}:\\My Drive"));
            if p.is_dir() {
                out.push(("Google Drive".into(), p));
            }
        }
        for var in ["OneDriveConsumer", "OneDriveCommercial", "OneDrive"] {
            if let Some(p) = std::env::var_os(var).map(PathBuf::from).filter(|p| p.is_dir()) {
                out.push(("OneDrive".into(), p));
            }
        }
    }
    if let Some(h) = &home {
        for (label, rel) in [("Google Drive", "Google Drive"), ("Google Drive", "My Drive"), ("Dropbox", "Dropbox"), ("OneDrive", "OneDrive")] {
            let p = h.join(rel);
            if p.is_dir() {
                out.push((label.into(), p));
            }
        }
        // macOS: ~/Library/CloudStorage/GoogleDrive-x/My Drive, OneDrive-x, Dropbox
        if let Ok(entries) = fs::read_dir(h.join("Library").join("CloudStorage")) {
            for e in entries.flatten() {
                let name = e.file_name().to_string_lossy().to_string();
                let (label, p) = if name.starts_with("GoogleDrive") {
                    ("Google Drive", e.path().join("My Drive"))
                } else if name.starts_with("OneDrive") {
                    ("OneDrive", e.path())
                } else if name.starts_with("Dropbox") {
                    ("Dropbox", e.path())
                } else {
                    continue;
                };
                if p.is_dir() {
                    out.push((label.into(), p));
                }
            }
        }
    }
    let mut seen = std::collections::HashSet::new();
    out.into_iter()
        .filter(|(_, p)| seen.insert(p.to_string_lossy().to_lowercase()))
        .map(|(label, p)| json!({ "label": label, "path": p }))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn root_level_and_auto_come_from_the_app_settings() {
        assert_eq!(root(None), None);
        assert_eq!(root(Some(&json!({ "backup": { "dir": "" } }))), None);
        let cfg = json!({ "backup": { "dir": "G:/My Drive", "level": 2 } });
        assert_eq!(root(Some(&cfg)).unwrap(), PathBuf::from("G:/My Drive").join("IdeaToVideo_Backup"));
        assert_eq!(level(Some(&cfg)), 2);
        assert_eq!(level(Some(&json!({ "backup": { "level": 9 } }))), 4);
        assert!(auto(Some(&cfg)), "on by default once a folder is set");
        assert!(!auto(Some(&json!({ "backup": { "dir": "G:/x", "auto": false } }))));
        assert!(!auto(None));
    }

    #[test]
    fn settings_backup_and_restore_on_a_new_computer() {
        let base = std::env::temp_dir().join(format!("itv-bset-{}", std::process::id()));
        let _ = fs::remove_dir_all(&base);
        let (old_cfg, drive) = (base.join("old"), base.join("My Drive"));
        let a = identity::complete_new(json!({ "name": "Zoltan Gero", "channel": {}, "narrator": { "provider": "gemini" } }), &[]).unwrap();
        identity::save(&old_cfg, &a).unwrap();
        let b = identity::complete_new(json!({ "name": "VoxFlow", "channel": {}, "narrator": { "provider": "gemini" } }), &[a.clone()]).unwrap();
        identity::save(&old_cfg, &b).unwrap();
        let cfg = json!({
            "schema": 2, "onboarded": true, "llm": { "provider": "claude", "model": "claude-sonnet-5" },
            "projectsDir": "Z:/nowhere", "activeIdentity": "voxflow",
            "backup": { "dir": drive.to_string_lossy(), "level": 2, "auto": true }
        });
        let r = root(Some(&cfg)).unwrap();
        assert_eq!(save_settings(&r, &old_cfg, &cfg).unwrap(), 2);
        assert!(r.join(SETTINGS_DIR).join("VoxFlow.identity.zip").is_file());

        assert_eq!(find_root(&drive).unwrap(), r);
        assert_eq!(find_root(&r).unwrap(), r);
        assert!(find_root(&base).is_none());
        let (app, files, active) = read_settings(&r).unwrap();
        assert_eq!(app["llm"]["provider"], "claude");
        assert!(app.get("projectsDir").is_none(), "a folder that is not on this computer is dropped");
        assert_eq!(app["backup"]["level"], 2);
        assert_eq!(PathBuf::from(app["backup"]["dir"].as_str().unwrap()), drive);
        assert_eq!(files.len(), 2);
        assert_eq!(active.as_deref(), Some("VoxFlow"));
        let text = fs::read_to_string(r.join(SETTINGS_DIR).join("IdeaToVideo_settings.json")).unwrap();
        assert!(!text.to_lowercase().contains("apikey"));
        fs::remove_dir_all(&base).unwrap();
    }
}
