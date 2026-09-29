// config.rs: config.json in the app config dir (SPEC 4.1). Non-secret settings
// only. The runner's `validate-config` checks it before every save (the schema
// lives in one place, runner/schema), and the write is atomic: a crash mid-save
// never leaves a half-written file.

use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

use serde_json::Value;

pub const FILE_NAME: &str = "config.json";
pub const PROJECTS_FOLDER: &str = "IdeaToVideo Projects";
/// The app's first name. Only used to find and move data from test installs.
pub const LEGACY_IDENTIFIER: &str = "com.zoltangero.studio";
pub const LEGACY_PROJECTS_FOLDER: &str = "Studio Projects";

pub fn load(path: &Path) -> Result<Option<Value>, String> {
    match fs::read_to_string(path) {
        Ok(s) => serde_json::from_str(&s)
            .map(Some)
            .map_err(|e| format!("config.json is damaged: {e}")),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(format!("Could not read config.json: {e}")),
    }
}

/// Write to a temp file next to the target, flush to disk, then rename over it.
pub fn write_atomic(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let dir = path.parent().ok_or("config path has no folder")?;
    fs::create_dir_all(dir).map_err(|e| format!("Could not create {}: {e}", dir.display()))?;
    let tmp = path.with_extension("json.tmp");
    {
        let mut f = fs::File::create(&tmp).map_err(|e| format!("Could not write settings: {e}"))?;
        f.write_all(bytes).map_err(|e| format!("Could not write settings: {e}"))?;
        f.sync_all().map_err(|e| format!("Could not write settings: {e}"))?;
    }
    fs::rename(&tmp, path).map_err(|e| format!("Could not save settings: {e}"))
}

/// The runner answers `{ "errors": [...] }` for validate-config.
pub fn errors_from_validation(result: &Value) -> Vec<String> {
    result
        .get("errors")
        .and_then(Value::as_array)
        .map(|a| a.iter().map(|e| e.as_str().map(String::from).unwrap_or_else(|| e.to_string())).collect())
        .unwrap_or_default()
}

/// The projects folder: the one set in Settings, else Documents/Studio Projects.
pub fn projects_dir(config: Option<&Value>, documents: Option<PathBuf>, home: Option<PathBuf>) -> Result<PathBuf, String> {
    if let Some(p) = config
        .and_then(|c| c.get("projectsDir"))
        .and_then(Value::as_str)
        .filter(|s| !s.trim().is_empty())
    {
        let p = PathBuf::from(p);
        if !p.is_absolute() {
            return Err("The projects folder must be a full path.".into());
        }
        return Ok(p);
    }
    documents
        .or(home)
        .map(|d| d.join(PROJECTS_FOLDER))
        .ok_or_else(|| "Could not find the Documents folder. Set a projects folder in Settings.".into())
}

/// One-time move from the old app name. `new_dir` is this app's config dir,
/// `old_dir` the old one (a sibling folder). Copies config.json and the brand
/// folder, rewrites the logo path, and keeps using the old projects folder if
/// it has projects and none is set. Returns the migrated config, if any.
pub fn migrate_legacy(new_dir: &Path, old_dir: &Path, documents: Option<&Path>) -> Result<Option<Value>, String> {
    let new_cfg = new_dir.join(FILE_NAME);
    let old_cfg = old_dir.join(FILE_NAME);
    if new_cfg.exists() || !old_cfg.exists() {
        return Ok(None);
    }
    let Some(mut cfg) = load(&old_cfg)? else { return Ok(None) };

    let old_brand = old_dir.join("brand");
    if old_brand.is_dir() {
        let new_brand = new_dir.join("brand");
        fs::create_dir_all(&new_brand).map_err(|e| e.to_string())?;
        for entry in fs::read_dir(&old_brand).map_err(|e| e.to_string())?.flatten() {
            let _ = fs::copy(entry.path(), new_brand.join(entry.file_name()));
        }
        if let Some(logo) = cfg.pointer("/brand/logo").and_then(Value::as_str) {
            if let Some(name) = Path::new(logo).file_name() {
                cfg["brand"]["logo"] = Value::String(new_brand.join(name).to_string_lossy().to_string());
            }
        }
    }

    let unset = cfg.get("projectsDir").map_or(true, |v| v.is_null());
    if let (true, Some(docs)) = (unset, documents) {
        let old_projects = docs.join(LEGACY_PROJECTS_FOLDER);
        let has_projects = fs::read_dir(&old_projects).map(|mut d| d.next().is_some()).unwrap_or(false);
        if has_projects {
            cfg["projectsDir"] = Value::String(old_projects.to_string_lossy().to_string());
        }
    }

    let bytes = serde_json::to_vec_pretty(&cfg).map_err(|e| e.to_string())?;
    write_atomic(&new_cfg, &bytes)?;
    Ok(Some(cfg))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn tmpdir(name: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("studio-test-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&d);
        d
    }

    #[test]
    fn missing_file_is_none_and_roundtrip_works() {
        let d = tmpdir("cfg");
        let p = d.join(FILE_NAME);
        assert_eq!(load(&p).unwrap(), None);
        write_atomic(&p, br#"{"schema":1}"#).unwrap();
        assert_eq!(load(&p).unwrap(), Some(json!({"schema": 1})));
        write_atomic(&p, br#"{"schema":1,"x":2}"#).unwrap();
        assert_eq!(load(&p).unwrap().unwrap()["x"], 2);
        assert!(!p.with_extension("json.tmp").exists());
        fs::remove_dir_all(&d).unwrap();
    }

    #[test]
    fn damaged_file_is_an_error() {
        let d = tmpdir("bad");
        let p = d.join(FILE_NAME);
        write_atomic(&p, b"{not json").unwrap();
        assert!(load(&p).unwrap_err().contains("damaged"));
        fs::remove_dir_all(&d).unwrap();
    }

    #[test]
    fn validation_errors_are_read() {
        assert!(errors_from_validation(&json!({"errors": []})).is_empty());
        assert_eq!(errors_from_validation(&json!({"errors": ["llm: required"]})), vec!["llm: required"]);
    }

    #[test]
    fn legacy_config_is_moved_once() {
        let base = tmpdir("migrate");
        let (old, new, docs) = (base.join("old"), base.join("new"), base.join("docs"));
        fs::create_dir_all(old.join("brand")).unwrap();
        fs::write(old.join("brand").join("logo.png"), b"png").unwrap();
        let logo = old.join("brand").join("logo.png").to_string_lossy().to_string();
        let cfg0 = json!({"schema": 1, "brand": {"logo": logo}, "projectsDir": null});
        write_atomic(&old.join(FILE_NAME), &serde_json::to_vec(&cfg0).unwrap()).unwrap();
        fs::create_dir_all(docs.join(LEGACY_PROJECTS_FOLDER).join("2026-09-29_x")).unwrap();

        let cfg = migrate_legacy(&new, &old, Some(&docs)).unwrap().unwrap();
        assert!(new.join("brand").join("logo.png").exists());
        assert!(cfg["brand"]["logo"].as_str().unwrap().starts_with(&*new.to_string_lossy()));
        assert!(cfg["projectsDir"].as_str().unwrap().ends_with(LEGACY_PROJECTS_FOLDER));
        assert_eq!(load(&new.join(FILE_NAME)).unwrap().unwrap(), cfg);
        // second run: the new config exists, nothing happens
        assert!(migrate_legacy(&new, &old, Some(&docs)).unwrap().is_none());
        fs::remove_dir_all(&base).unwrap();
    }

    #[test]
    fn projects_dir_default_and_override() {
        let docs = Some(PathBuf::from("/docs"));
        assert_eq!(projects_dir(None, docs.clone(), None).unwrap(), PathBuf::from("/docs").join(PROJECTS_FOLDER));
        let abs = if cfg!(windows) { "C:\\videos" } else { "/videos" };
        let cfg = json!({ "projectsDir": abs });
        assert_eq!(projects_dir(Some(&cfg), docs.clone(), None).unwrap(), PathBuf::from(abs));
        assert!(projects_dir(Some(&json!({ "projectsDir": "relative" })), docs, None).is_err());
        assert!(projects_dir(None, None, None).is_err());
    }
}
