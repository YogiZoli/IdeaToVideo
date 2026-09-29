// config.rs: config.json in the app config dir (SPEC 4.1). Non-secret settings
// only. The runner's `validate-config` checks it before every save (the schema
// lives in one place, runner/schema), and the write is atomic: a crash mid-save
// never leaves a half-written file.

use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

use serde_json::Value;

pub const FILE_NAME: &str = "config.json";
pub const PROJECTS_FOLDER: &str = "Studio Projects";

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
