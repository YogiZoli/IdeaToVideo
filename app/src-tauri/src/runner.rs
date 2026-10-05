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
    ("skip-gate", None),
    ("youtube-texts", Some(&["llm", "provider"])),
    ("simple-scenes", None),
    ("avatar-layout", None),
    ("build-video", None),
    ("check-video", None),
    ("render-video", None),
    ("autopilot-mark", None),
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
    ("cta-state", None),
    ("cta-check", None),
    ("cta-save", None),
    ("footage-list", None),
    ("footage-add", None),
    ("footage-update", None),
    ("footage-remove", None),
    ("footage-mode", None),
    ("footage-describe", Some(&["llm", "provider"])),
    ("last-used", None),
    ("segments-list", None),
    ("segment-add", None),
    ("segment-remove", None),
    ("segment-voice", Some(&["narrator", "provider"])),
    ("segment-make", Some(&["service"])),
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

/// No line from the runner for this long means it is stuck: it is stopped.
/// The runner says "alive" every 20 s (main.mjs), even while it waits for a
/// slow service, so only a frozen process stays silent this long.
pub const SILENCE_SECS: u64 = 300;

/// Every process one runner run starts: Node and everything Node starts (the
/// render's Chrome, ffmpeg). Windows: a Job Object that kills them all when
/// it is closed or terminated, also when the app itself ends. macOS and
/// Linux: the runner's own process group.
pub struct Tree {
    #[cfg(windows)]
    job: isize,
    #[cfg(unix)]
    pgid: i32,
}

impl Tree {
    #[cfg(windows)]
    fn of(child: &std::process::Child) -> Option<Tree> {
        use std::os::windows::io::AsRawHandle;
        use windows_sys::Win32::Foundation::CloseHandle;
        use windows_sys::Win32::System::JobObjects::{
            AssignProcessToJobObject, CreateJobObjectW, JobObjectExtendedLimitInformation, SetInformationJobObject,
            JOBOBJECT_EXTENDED_LIMIT_INFORMATION, JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
        };
        // SAFETY: plain Win32 calls on a handle this function owns; the
        // child's handle stays valid while `child` lives.
        unsafe {
            let job = CreateJobObjectW(std::ptr::null(), std::ptr::null());
            if job.is_null() {
                return None;
            }
            let mut info: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = std::mem::zeroed();
            info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
            let size = std::mem::size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32;
            let ok = SetInformationJobObject(job, JobObjectExtendedLimitInformation, &info as *const _ as *const _, size) != 0
                && AssignProcessToJobObject(job, child.as_raw_handle() as _) != 0;
            if !ok {
                CloseHandle(job);
                return None;
            }
            Some(Tree { job: job as isize })
        }
    }

    #[cfg(unix)]
    fn of(child: &std::process::Child) -> Option<Tree> {
        Some(Tree { pgid: child.id() as i32 })
    }

    /// Ends every process of the run at once.
    pub fn kill(&self) {
        #[cfg(windows)]
        // SAFETY: the job handle is open until Drop.
        unsafe {
            windows_sys::Win32::System::JobObjects::TerminateJobObject(self.job as _, 1);
        }
        #[cfg(unix)]
        {
            let _ = Command::new("kill").args(["-KILL", &format!("-{}", self.pgid)]).stderr(Stdio::null()).status();
        }
    }
}

impl Drop for Tree {
    // The run is over: whatever it left behind (a Chrome that did not exit)
    // goes with it.
    fn drop(&mut self) {
        #[cfg(windows)]
        // SAFETY: closing the handle this Tree owns, once.
        unsafe {
            windows_sys::Win32::Foundation::CloseHandle(self.job as _);
        }
        #[cfg(unix)]
        self.kill();
    }
}

/// Stops one run from another thread: the Stop button, the watchdog, quitting.
#[derive(Default)]
pub struct Control {
    /// The job id in the Jobs list (jobs.rs), for the Stop button.
    pub job: Option<u64>,
    stopped: std::sync::atomic::AtomicBool,
    reason: std::sync::Mutex<Option<String>>,
    tree: std::sync::Mutex<Option<Tree>>,
}

impl Control {
    pub fn new(job: Option<u64>) -> Self {
        Control { job, ..Default::default() }
    }

    /// Ends the run with `reason` as its error. The first reason wins.
    pub fn stop(&self, reason: &str) {
        if let Ok(mut r) = self.reason.lock() {
            r.get_or_insert_with(|| reason.to_string());
        }
        self.stopped.store(true, std::sync::atomic::Ordering::SeqCst);
        if let Ok(t) = self.tree.lock() {
            if let Some(t) = t.as_ref() {
                t.kill();
            }
        }
    }

    pub fn stopped(&self) -> Option<String> {
        if !self.stopped.load(std::sync::atomic::Ordering::SeqCst) {
            return None;
        }
        Some(self.reason.lock().ok().and_then(|r| r.clone()).unwrap_or_else(|| "Stopped.".into()))
    }
}

/// The user's sentence for a run the watchdog ended.
pub fn silence_text(command: &str) -> String {
    format!(
        "The step ({command}) gave no sign of life for {} minutes, so the app ended it. Nothing else is lost: press the button again to retry.",
        SILENCE_SECS / 60
    )
}

/// Runs one command to the end. Blocking: call it from a blocking task.
/// `control` stops it from outside; `diag` gets the runner's own error
/// output (stderr) for the local log, never for the user's eyes.
pub fn run(
    paths: &Paths,
    command: &str,
    request: &Value,
    api_key: Option<String>,
    control: &Control,
    diag: &mut String,
    on_progress: &mut dyn FnMut(Value),
) -> Result<Value, String> {
    run_with_silence(paths, command, request, api_key, control, diag, on_progress, SILENCE_SECS)
}

#[allow(clippy::too_many_arguments)]
fn run_with_silence(
    paths: &Paths,
    command: &str,
    request: &Value,
    api_key: Option<String>,
    control: &Control,
    diag: &mut String,
    on_progress: &mut dyn FnMut(Value),
    silence: u64,
) -> Result<Value, String> {
    check_command(command)?;
    if let Some(why) = control.stopped() {
        return Err(why);
    }
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
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        cmd.process_group(0);
    }
    let mut child = cmd.spawn().map_err(|e| format!("Could not start the runner: {e}"))?;
    // Into the tree before the request goes in: the runner starts nothing
    // before it has read its request.
    if let Ok(mut t) = control.tree.lock() {
        *t = Tree::of(&child);
    }
    // a Stop that came while the process was starting
    if let Some(why) = control.stopped() {
        control.stop(&why);
    }

    let body = serde_json::to_vec(request).map_err(|e| e.to_string())?;
    {
        let mut stdin = child.stdin.take().ok_or("runner stdin")?;
        if let Err(e) = stdin.write_all(&body) {
            let why = control.stopped();
            control.stop("Stopped.");
            let _ = child.wait();
            return Err(why.unwrap_or_else(|| format!("Could not talk to the runner: {e}")));
        }
    } // dropped: stdin closed, the runner starts

    let mut stderr = child.stderr.take().ok_or("runner stderr")?;
    let err_reader = std::thread::spawn(move || {
        let mut s = String::new();
        let _ = stderr.read_to_string(&mut s);
        s
    });

    // stdout on its own thread, so this one can watch the time
    let stdout = child.stdout.take().ok_or("runner stdout")?;
    let (tx, rx) = std::sync::mpsc::channel::<String>();
    let out_reader = std::thread::spawn(move || {
        for line in BufReader::new(stdout).lines() {
            let Ok(line) = line else { break };
            if tx.send(line).is_err() {
                break;
            }
        }
    });

    let mut outcome = None;
    let mut last = std::time::Instant::now();
    loop {
        match rx.recv_timeout(std::time::Duration::from_millis(500)) {
            Ok(line) => {
                last = std::time::Instant::now();
                if let Some(o) = handle_line(&line, on_progress) {
                    outcome = Some(o);
                }
            }
            Err(std::sync::mpsc::RecvTimeoutError::Timeout) => {
                if last.elapsed().as_secs() >= silence && control.stopped().is_none() {
                    control.stop(&silence_text(command));
                }
            }
            Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => break,
        }
    }
    let _ = out_reader.join();
    let status = child.wait().map_err(|e| e.to_string())?;
    let err_text = err_reader.join().unwrap_or_default();
    let tail: String = err_text.chars().rev().take(2000).collect::<Vec<_>>().into_iter().rev().collect();
    *diag = tail.trim().to_string();
    match outcome {
        Some(o) => o,
        None => Err(control.stopped().unwrap_or_else(|| {
            format!("The step ended unexpectedly ({status}). The details are in the app's log (Settings, App, General, Export diagnostics).")
        })),
    }
}

/// `project`: the ONE Video the job works on, so the UI shows the bar in the
/// right video even after the view was closed and opened again.
pub fn progress_payload(command: &str, project: Option<&str>, v: Value) -> Value {
    json!({ "command": command, "project": project, "progress": v })
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
        assert!(run(&paths, "providers", &json!({}), None, &Control::default(), &mut String::new(), &mut |_| {}).is_ok());
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
        let r = run(&paths, "providers", &json!({}), None, &Control::default(), &mut String::new(), &mut |_| {}).unwrap();
        assert_eq!(r["providers"][0]["id"], "gemini");
        let e = run(&paths, "test-llm", &json!({"provider": "gemini"}), None, &Control::default(), &mut String::new(), &mut |_| {}).unwrap_err();
        assert!(e.contains("No API key"), "{e}");
    }

    // Stop ends the run at once, with its reason; the watchdog stops a
    // runner that says nothing (here: a script that only sleeps).
    #[test]
    fn stop_and_silence_end_a_run() {
        let dir = std::env::temp_dir().join(format!("itv-stop-test-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let script = dir.join("sleepy.mjs");
        std::fs::write(&script, "setTimeout(() => {}, 60000);\n").unwrap();
        let paths = Paths { node: PathBuf::from("node"), script: script.clone(), ffmpeg: None, engine: None, data: None };
        let t0 = std::time::Instant::now();
        let e = run_with_silence(&paths, "providers", &json!({}), None, &Control::default(), &mut String::new(), &mut |_| {}, 2).unwrap_err();
        assert!(e.contains("no sign of life"), "{e}");
        assert!(t0.elapsed().as_secs() < 20);

        let control = std::sync::Arc::new(Control::new(Some(7)));
        let c2 = control.clone();
        let stopper = std::thread::spawn(move || {
            std::thread::sleep(std::time::Duration::from_millis(1500));
            c2.stop("Stopped by you.");
        });
        let t0 = std::time::Instant::now();
        let e = run(&paths, "providers", &json!({}), None, &control, &mut String::new(), &mut |_| {}).unwrap_err();
        stopper.join().unwrap();
        assert_eq!(e, "Stopped by you.");
        assert!(t0.elapsed().as_secs() < 20);
        std::fs::remove_dir_all(&dir).unwrap();
    }
}
