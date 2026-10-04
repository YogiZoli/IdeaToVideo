// runner.rs: starts the Node sidecar (runner/main.mjs, see its header for the
// protocol) with the app's own pinned Node (DECISIONS 26). Only whitelisted
// commands run. When a command needs an API key, the key name comes from the
// request (e.g. llm.provider), is checked against the key whitelist, read from
// the keychain here and passed in STUDIO_API_KEY. It never goes to the UI.
// `progress` lines are forwarded to the UI as the `runner-progress` event.

use std::io::{BufRead, BufReader, Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

use serde_json::{json, Value};

/// command -> where in the request the key name sits (None: no key needed).
const COMMANDS: &[(&str, Option<&[&str]>)] = &[
    ("providers", None),
    ("validate-config", None),
    ("validate-brief", None),
    ("test-llm", Some(&["provider"])),
    ("test-service", Some(&["service"])),
    ("suggest-channel", Some(&["llm", "provider"])),
    ("create-project", None),
    ("list-projects", None),
    ("load-project", None),
    ("write-script", Some(&["llm", "provider"])),
    ("keyword-ideas", Some(&["service"])),
    ("save-script", None),
    ("approve-gate", None),
    ("tools-status", None),
    ("browser-ensure", None),
    ("list-voices", Some(&["narrator", "provider"])),
    ("make-voice", Some(&["narrator", "provider"])),
    ("voice-preview", None),
    ("voice-sample", Some(&["narrator", "provider"])),
    ("music-estimate", None),
    ("set-music", None),
    ("make-music", Some(&["music", "provider"])),
    ("make-scenes", Some(&["llm", "provider"])),
    ("scene-table", None),
    ("save-scenes", None),
    ("refill-scene", Some(&["llm", "provider"])),
    ("avatar-looks", Some(&["service"])),
    ("avatar-preview", None),
    ("avatar-plan", Some(&["service"])),
    ("make-avatar", Some(&["service"])),
    ("remove-avatar", None),
    ("avatar-layout", None),
    ("build-video", None),
    ("check-video", None),
    ("render-video", None),
    ("backup-project", None),
    ("backup-all", None),
    ("backup-estimate", None),
    ("list-backups", None),
    ("restore-project", None),
    ("backup-status", None),
    ("set-backup-level", None),
    ("brand-state", None),
    ("brand-check", None),
    ("brand-save", None),
    ("brand-preview", None),
    ("dictionary-load", None),
    ("dictionary-save", None),
    ("dictionary-check", None),
    ("motion-state", None),
    ("motion-check", None),
    ("motion-save", None),
    ("motion-preview", None),
];

pub fn check_command(command: &str) -> Result<Option<&'static [&'static str]>, String> {
    COMMANDS
        .iter()
        .find(|(c, _)| *c == command)
        .map(|(_, k)| *k)
        .ok_or_else(|| format!("Unknown runner command: {command}"))
}

/// The keychain entry this request needs, if any. Refuses unknown key names.
pub fn key_name_for(command: &str, request: &Value) -> Result<Option<String>, String> {
    let Some(path) = check_command(command)? else { return Ok(None) };
    let mut v = request;
    for p in path {
        v = v.get(*p).ok_or_else(|| format!("{command}: missing {}", path.join(".")))?;
    }
    let name = v.as_str().ok_or_else(|| format!("{command}: {} must be a string", path.join(".")))?;
    crate::keys::check_name(name)?;
    Ok(Some(name.to_string()))
}

/// Every path the UI sends must stay inside the projects folder (SPEC 9: file
/// access only to the Projects and the app folders). `projectsDir` must be the
/// projects folder itself or one Identity's ONE Videos folder in it
/// (`identity_folders`); `projectDir` a folder directly or deeper inside it.
pub fn check_paths(request: &Value, projects_root: &Path, identity_folders: &[String]) -> Result<(), String> {
    let root = dunce_canonical(projects_root)?;
    if let Some(p) = request.get("projectsDir") {
        let p = dunce_canonical(&PathBuf::from(p.as_str().ok_or("projectsDir must be a string")?))?;
        let allowed = p == root
            || identity_folders
                .iter()
                .any(|f| dunce_canonical(&projects_root.join(f)).is_ok_and(|c| c == p));
        if !allowed {
            return Err("That folder is not the projects folder set in Settings.".into());
        }
    }
    if let Some(p) = request.get("projectDir") {
        let p = dunce_canonical(&PathBuf::from(p.as_str().ok_or("projectDir must be a string")?))?;
        if p == root || !p.starts_with(&root) {
            return Err("That project is not inside the projects folder set in Settings.".into());
        }
    }
    Ok(())
}

// std::fs::canonicalize and Tauri's resource_dir give \\?\C:\... on Windows.
// Node cannot start a script from such a path (EISDIR on lstat 'C:'), and the
// runner and the UI write plain paths, so the prefix is stripped.
pub fn plain_path(p: PathBuf) -> PathBuf {
    let s = p.to_string_lossy();
    match s.strip_prefix(r"\\?\") {
        Some(rest) if !rest.starts_with("UNC\\") => PathBuf::from(rest),
        _ => p,
    }
}

fn dunce_canonical(p: &Path) -> Result<PathBuf, String> {
    let c = std::fs::canonicalize(p).map_err(|_| format!("Folder not found: {}", p.display()))?;
    Ok(plain_path(c))
}

pub struct Paths {
    pub node: PathBuf,
    pub script: PathBuf,
    /// The bundled ffmpeg folder (resources/ffmpeg), when it is there. Only the
    /// render chain needs it; the runner reports its absence itself.
    pub ffmpeg: Option<PathBuf>,
    /// The bundled render engine (resources/engine: HyperFrames, GSAP) and the
    /// app data folder, where the runner keeps hyperframes' home (browser,
    /// caches). See runner/tools.mjs.
    pub engine: Option<PathBuf>,
    pub data: Option<PathBuf>,
}

/// "audio/music.<ext>" for a music file the voice gate accepts.
pub fn music_name(src: &Path) -> Result<String, String> {
    src.extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_ascii_lowercase())
        .filter(|e| ["mp3", "wav", "m4a", "aac", "ogg", "flac"].contains(&e.as_str()))
        .map(|e| format!("audio/music.{e}"))
        .ok_or_else(|| "Use an mp3, wav, m4a, aac, ogg or flac file for music.".to_string())
}

/// ffmpeg and ffprobe inside the bundled folder, if both exist.
pub fn ffmpeg_bins(dir: &Path) -> Option<(PathBuf, PathBuf)> {
    let exe = if cfg!(windows) { ".exe" } else { "" };
    let ffmpeg = dir.join(format!("ffmpeg{exe}"));
    let ffprobe = dir.join(format!("ffprobe{exe}"));
    (ffmpeg.exists() && ffprobe.exists()).then_some((ffmpeg, ffprobe))
}

/// Node sits next to the app executable (Tauri externalBin drops the target
/// triple from the name when it bundles or copies it for `tauri dev`).
pub fn node_path() -> Result<PathBuf, String> {
    let exe = std::env::current_exe().map_err(|e| format!("Could not find the app folder: {e}"))?;
    let dir = exe.parent().ok_or("Could not find the app folder")?;
    let name = if cfg!(windows) { "node.exe" } else { "node" };
    let p = dir.join(name);
    if p.exists() {
        Ok(p)
    } else {
        Err(format!("The bundled Node is missing ({}). Reinstall the app.", p.display()))
    }
}

/// Emits one parsed stdout line. Returns Some(final outcome) for result/error.
fn handle_line(line: &str, on_progress: &mut dyn FnMut(Value)) -> Option<Result<Value, String>> {
    let v: Value = serde_json::from_str(line).ok()?;
    match v.get("event").and_then(Value::as_str) {
        Some("progress") => {
            on_progress(v);
            None
        }
        Some("result") => Some(Ok(v.get("data").cloned().unwrap_or(Value::Null))),
        Some("error") => Some(Err(v
            .get("message")
            .and_then(Value::as_str)
            .unwrap_or("The runner failed.")
            .to_string())),
        _ => None,
    }
}

/// Runs one command to the end. Blocking: call it from a blocking task.
pub fn run(
    paths: &Paths,
    command: &str,
    request: &Value,
    api_key: Option<String>,
    on_progress: &mut dyn FnMut(Value),
) -> Result<Value, String> {
    check_command(command)?;
    let mut cmd = Command::new(&paths.node);
    cmd.arg(&paths.script)
        .arg(command)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        // nothing from the user's shell may change how our Node behaves
        .env_remove("NODE_OPTIONS")
        .env_remove("NODE_PATH")
        .env_remove("STUDIO_API_KEY")
        .env("HYPERFRAMES_NO_TELEMETRY", "1")
        .env("HYPERFRAMES_NO_UPDATE_CHECK", "1")
        .env_remove("HYPERFRAMES_FFMPEG_PATH")
        .env_remove("HYPERFRAMES_FFPROBE_PATH")
        .env_remove("HYPERFRAMES_BROWSER_PATH")
        .env_remove("ITV_ENGINE_DIR")
        .env_remove("ITV_DATA_DIR");
    if let Some(e) = &paths.engine {
        cmd.env("ITV_ENGINE_DIR", e);
    }
    if let Some(d) = &paths.data {
        cmd.env("ITV_DATA_DIR", d);
    }
    // Always our own ffmpeg, never one from the user's PATH (DECISIONS 43).
    if let Some((ffmpeg, ffprobe)) = paths.ffmpeg.as_deref().and_then(ffmpeg_bins) {
        cmd.env("HYPERFRAMES_FFMPEG_PATH", ffmpeg).env("HYPERFRAMES_FFPROBE_PATH", ffprobe);
    }
    if let Some(k) = api_key {
        cmd.env("STUDIO_API_KEY", k);
    }
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    let mut child = cmd.spawn().map_err(|e| format!("Could not start the runner: {e}"))?;

    let body = serde_json::to_vec(request).map_err(|e| e.to_string())?;
    {
        let mut stdin = child.stdin.take().ok_or("runner stdin")?;
        stdin.write_all(&body).map_err(|e| format!("Could not talk to the runner: {e}"))?;
    } // dropped: stdin closed, the runner starts

    let mut stderr = child.stderr.take().ok_or("runner stderr")?;
    let err_reader = std::thread::spawn(move || {
        let mut s = String::new();
        let _ = stderr.read_to_string(&mut s);
        s
    });

    let mut outcome = None;
    let stdout = child.stdout.take().ok_or("runner stdout")?;
    for line in BufReader::new(stdout).lines() {
        let Ok(line) = line else { break };
        if let Some(o) = handle_line(&line, on_progress) {
            outcome = Some(o);
        }
    }
    let status = child.wait().map_err(|e| e.to_string())?;
    let err_text = err_reader.join().unwrap_or_default();
    outcome.unwrap_or_else(|| {
        let tail: String = err_text.chars().rev().take(800).collect::<Vec<_>>().into_iter().rev().collect();
        Err(format!("The runner stopped without an answer ({status}). {}", tail.trim()))
    })
}

pub fn progress_payload(command: &str, v: Value) -> Value {
    json!({ "command": command, "progress": v })
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn command_whitelist() {
        assert!(check_command("write-script").is_ok());
        assert!(check_command("rm").is_err());
        assert!(check_command("").is_err());
    }

    #[test]
    fn key_names_come_from_the_request_and_are_checked() {
        assert_eq!(key_name_for("providers", &json!({})).unwrap(), None);
        assert_eq!(key_name_for("test-llm", &json!({"provider": "gemini"})).unwrap().as_deref(), Some("gemini"));
        assert_eq!(key_name_for("write-script", &json!({"llm": {"provider": "claude"}})).unwrap().as_deref(), Some("claude"));
        assert_eq!(key_name_for("test-service", &json!({"service": "heygen"})).unwrap().as_deref(), Some("heygen"));
        assert!(key_name_for("test-llm", &json!({"provider": "github"})).is_err());
        assert!(key_name_for("write-script", &json!({})).is_err());
        assert!(key_name_for("test-llm", &json!({"provider": 5})).is_err());
    }

    #[test]
    fn paths_stay_inside_the_projects_folder() {
        let base = std::env::temp_dir().join(format!("studio-paths-{}", std::process::id()));
        let root = base.join("Projects");
        let ident = root.join("VoxFlow");
        let proj = ident.join("2026-09-29_x");
        let outside = base.join("elsewhere");
        let stranger = root.join("Not an Identity");
        std::fs::create_dir_all(&proj).unwrap();
        std::fs::create_dir_all(&outside).unwrap();
        std::fs::create_dir_all(&stranger).unwrap();
        let s = |p: &Path| p.to_string_lossy().to_string();
        let f = vec!["VoxFlow".to_string()];

        assert!(check_paths(&json!({}), &root, &f).is_ok());
        assert!(check_paths(&json!({"projectsDir": s(&root)}), &root, &f).is_ok());
        assert!(check_paths(&json!({"projectsDir": s(&ident)}), &root, &f).is_ok());
        assert!(check_paths(&json!({"projectsDir": s(&stranger)}), &root, &f).is_err());
        assert!(check_paths(&json!({"projectsDir": s(&proj)}), &root, &f).is_err());
        assert!(check_paths(&json!({"projectDir": s(&proj)}), &root, &f).is_ok());
        assert!(check_paths(&json!({"projectsDir": s(&outside)}), &root, &f).is_err());
        assert!(check_paths(&json!({"projectDir": s(&outside)}), &root, &f).is_err());
        assert!(check_paths(&json!({"projectDir": s(&root)}), &root, &f).is_err());
        let sneaky = format!("{}{}..{}elsewhere", s(&root), std::path::MAIN_SEPARATOR, std::path::MAIN_SEPARATOR);
        assert!(check_paths(&json!({"projectDir": sneaky}), &root, &f).is_err());
        std::fs::remove_dir_all(&base).unwrap();
    }

    #[test]
    fn verbatim_prefix_is_stripped() {
        let p = plain_path(PathBuf::from(r"\\?\C:\Program Files\Studio\runner\main.mjs"));
        assert_eq!(p, PathBuf::from(r"C:\Program Files\Studio\runner\main.mjs"));
        let unc = PathBuf::from(r"\\?\UNC\srv\share");
        assert_eq!(plain_path(unc.clone()), unc);
        assert_eq!(plain_path(PathBuf::from("/Applications/Studio.app")), PathBuf::from("/Applications/Studio.app"));
    }

    // The bug from the first manual test: a \\?\ script path must still start.
    #[cfg(windows)]
    #[test]
    fn runner_starts_from_a_verbatim_path() {
        let script = std::fs::canonicalize(Path::new(env!("CARGO_MANIFEST_DIR")).join("../../runner/main.mjs")).unwrap();
        assert!(script.to_string_lossy().starts_with(r"\\?\"));
        let paths = Paths { node: PathBuf::from("node"), script: plain_path(script), ffmpeg: None, engine: None, data: None };
        assert!(run(&paths, "providers", &json!({}), None, &mut |_| {}).is_ok());
    }

    #[test]
    fn music_names_are_fixed_and_checked() {
        assert_eq!(music_name(Path::new("C:/x/Song.MP3")).unwrap(), "audio/music.mp3");
        assert_eq!(music_name(Path::new("/x/bed.wav")).unwrap(), "audio/music.wav");
        assert!(music_name(Path::new("/x/evil.exe")).is_err());
        assert!(music_name(Path::new("/x/noext")).is_err());
    }

    #[test]
    fn ffmpeg_needs_both_binaries() {
        let dir = std::env::temp_dir().join(format!("itv-ffmpeg-test-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let exe = if cfg!(windows) { ".exe" } else { "" };
        assert!(ffmpeg_bins(&dir).is_none());
        std::fs::write(dir.join(format!("ffmpeg{exe}")), b"").unwrap();
        assert!(ffmpeg_bins(&dir).is_none());
        std::fs::write(dir.join(format!("ffprobe{exe}")), b"").unwrap();
        let (a, b) = ffmpeg_bins(&dir).unwrap();
        assert!(a.ends_with(format!("ffmpeg{exe}")) && b.ends_with(format!("ffprobe{exe}")));
        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn lines_are_parsed() {
        let mut seen = vec![];
        let mut on = |v: Value| seen.push(v);
        assert!(handle_line(r#"{"event":"progress","step":"writing"}"#, &mut on).is_none());
        assert!(handle_line("not json", &mut on).is_none());
        assert_eq!(handle_line(r#"{"event":"result","data":{"a":1}}"#, &mut on).unwrap().unwrap(), json!({"a": 1}));
        assert_eq!(handle_line(r#"{"event":"error","message":"no"}"#, &mut on).unwrap().unwrap_err(), "no");
        assert_eq!(seen.len(), 1);
    }

    // Runs the real runner with the Node on PATH (dev machine and CI).
    #[test]
    fn real_runner_roundtrip() {
        let script = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../runner/main.mjs");
        let paths = Paths { node: PathBuf::from("node"), script, ffmpeg: None, engine: None, data: None };
        let r = run(&paths, "providers", &json!({}), None, &mut |_| {}).unwrap();
        assert_eq!(r["providers"][0]["id"], "gemini");
        let e = run(&paths, "test-llm", &json!({"provider": "gemini"}), None, &mut |_| {}).unwrap_err();
        assert!(e.contains("No API key"), "{e}");
    }
}
