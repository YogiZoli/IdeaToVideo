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
    ("segment-import-list", Some(&["service"])),
    ("segment-import", Some(&["service"])),
    ("packs-list", None),
    ("scenes-state", None),
    ("stock-suggest", None),
    ("stock-search", Some(&["service"])),
    ("stock-add", Some(&["service"])),
    ("scenes-save", None),
    ("pack-import", None),
    ("pack-export", None),
    ("pack-remove", None),
    ("pack-state", None),
    ("broll-settings", None),
    ("broll-settings-save", None),
    ("broll-state", None),
    ("broll-plan", Some(&["llm", "provider"])),
    ("broll-estimate", None),
    ("broll-balance", Some(&["service"])),
    ("broll-make", Some(&["service"])),
    ("broll-update", None),
    ("broll-again", None),
    ("broll-remove", None),
    ("card-send", Some(&["service"])),
    // were missing: the UI called them, the core refused them (2026-10-08 log)
    ("packaging-state", None),
    ("packaging-save", None),
    ("packaging-make", Some(&["llm", "provider"])),
    ("brand-import", None),
    // Course import (DECISIONS 121): files only, no key, no service
    ("course-preview", None),
    ("course-import", None),
    ("course-list", None),
    ("course-export", None),
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

/// The check-in (Zoltan, 2026-10-06: look first, never stop a step unseen).
/// Every PULSE_SECS the core looks at the run: is the runner still talking
/// (it says "alive" every 20 s, main.mjs), and does any of its processes
/// work (CPU time of the whole tree grows). The UI shows the state in words;
/// nothing is ever stopped by it, only the user's Stop does that.
pub const PULSE_SECS: u64 = 15;
/// No news, no work, this long: the UI says the step seems stuck and offers
/// Stop. A step waiting for a service (AI, voice, HeyGen) does no work while
/// it waits, so "no work" only counts for steps on this computer.
pub const STALL_SECS: u64 = 600;
/// The steps that do their work on this computer.
const LOCAL_WORK: &[&str] = &[
    "build-video", "check-video", "render-video", "avatar-layout", "brand-preview", "motion-preview", "set-music", "simple-scenes",
    "backup-project", "backup-all", "restore-project", "browser-ensure",
];

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

    /// CPU seconds every process of the run used so far (the ones that ended
    /// too), the measure of "is it working".
    #[cfg(windows)]
    pub fn cpu_seconds(&self) -> Option<f64> {
        use windows_sys::Win32::System::JobObjects::{JobObjectBasicAccountingInformation, QueryInformationJobObject, JOBOBJECT_BASIC_ACCOUNTING_INFORMATION};
        // SAFETY: a query on the job handle this Tree owns, into a local struct.
        unsafe {
            let mut info: JOBOBJECT_BASIC_ACCOUNTING_INFORMATION = std::mem::zeroed();
            let size = std::mem::size_of::<JOBOBJECT_BASIC_ACCOUNTING_INFORMATION>() as u32;
            let ok = QueryInformationJobObject(self.job as _, JobObjectBasicAccountingInformation, &mut info as *mut _ as *mut _, size, std::ptr::null_mut()) != 0;
            ok.then(|| (info.TotalUserTime + info.TotalKernelTime) as f64 / 10_000_000.0)
        }
    }

    #[cfg(unix)]
    pub fn cpu_seconds(&self) -> Option<f64> {
        let out = Command::new("ps").args(["-A", "-o", "pgid=,time="]).stderr(Stdio::null()).output().ok()?;
        let text = String::from_utf8_lossy(&out.stdout);
        let mut total = 0.0;
        for line in text.lines() {
            let mut it = line.split_whitespace();
            if it.next().and_then(|g| g.parse::<i32>().ok()) == Some(self.pgid) {
                total += it.next().map(ps_time).unwrap_or(0.0);
            }
        }
        Some(total)
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

/// "[[dd-]hh:]mm:ss[.cc]" from ps, in seconds.
#[cfg(unix)]
fn ps_time(t: &str) -> f64 {
    let (days, rest) = t.split_once('-').map(|(d, r)| (d.parse::<f64>().unwrap_or(0.0), r)).unwrap_or((0.0, t));
    let secs = rest.split(':').fold(0.0, |acc, p| acc * 60.0 + p.parse::<f64>().unwrap_or(0.0));
    days * 86400.0 + secs
}

/// The state of a run at a check-in, for the UI: working, waiting (for a
/// service, which is normal), or stuck (nothing at all for STALL_SECS).
pub fn pulse_state(local: bool, quiet: u64, idle: u64, busy: bool, stall: u64) -> &'static str {
    if quiet >= stall || (local && idle >= stall) {
        "stuck"
    } else if busy || quiet < PULSE_SECS * 4 {
        "working"
    } else {
        "waiting"
    }
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
    run_with(paths, command, request, api_key, control, diag, on_progress, (PULSE_SECS, STALL_SECS))
}

#[allow(clippy::too_many_arguments)]
fn run_with(
    paths: &Paths,
    command: &str,
    request: &Value,
    api_key: Option<String>,
    control: &Control,
    diag: &mut String,
    on_progress: &mut dyn FnMut(Value),
    (pulse_secs, stall): (u64, u64),
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
    let local = LOCAL_WORK.contains(&command);
    let now = std::time::Instant::now;
    // last line of any kind (heartbeat too), last real step, last CPU work
    let (mut heard, mut news, mut worked, mut pulsed) = (now(), now(), now(), now());
    let mut cpu = None::<f64>;
    let mut stuck = false;
    loop {
        match rx.recv_timeout(std::time::Duration::from_millis(500)) {
            Ok(line) => {
                heard = now();
                if !line.contains("\"step\":\"alive\"") {
                    news = now();
                }
                if let Some(o) = handle_line(&line, on_progress) {
                    outcome = Some(o);
                }
            }
            Err(std::sync::mpsc::RecvTimeoutError::Timeout) => {}
            Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => break,
        }
        if pulsed.elapsed().as_secs() < pulse_secs {
            continue;
        }
        pulsed = now();
        // the check-in: is any process of the run working?
        let used = control.tree.lock().ok().and_then(|t| t.as_ref().and_then(Tree::cpu_seconds));
        let busy = matches!((cpu, used), (Some(a), Some(b)) if b - a >= 0.01 * pulse_secs as f64);
        if busy || (used.is_some() && cpu.is_none()) {
            worked = now();
        }
        cpu = used.or(cpu);
        let state = pulse_state(local, heard.elapsed().as_secs(), worked.elapsed().as_secs().min(news.elapsed().as_secs()), busy, stall);
        on_progress(json!({ "event": "progress", "step": "pulse", "state": state, "busy": busy, "quiet": news.elapsed().as_secs() }));
        // once into the log when it looks stuck, and once when it moves again
        if (state == "stuck") != stuck {
            stuck = state == "stuck";
            on_progress(json!({ "event": "progress", "step": if stuck { "stalled" } else { "moving" }, "quiet": news.elapsed().as_secs(), "local": local }));
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

    // Stop ends the run at once, with its reason. A runner that says nothing
    // is never stopped by the app: the check-in reports it stuck, the user
    // decides (Zoltan, 2026-10-06).
    #[test]
    fn a_silent_run_is_reported_not_stopped_and_stop_ends_it() {
        let dir = std::env::temp_dir().join(format!("itv-stop-test-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let script = dir.join("sleepy.mjs");
        std::fs::write(&script, "setTimeout(() => {}, 60000);\n").unwrap();
        let paths = Paths { node: PathBuf::from("node"), script: script.clone(), ffmpeg: None, engine: None, data: None };
        let control = std::sync::Arc::new(Control::new(Some(7)));
        let c2 = control.clone();
        let (tx, rx) = std::sync::mpsc::channel::<Value>();
        let runner = std::thread::spawn(move || {
            let tx = std::sync::Mutex::new(tx);
            run_with(&paths, "render-video", &json!({}), None, &c2, &mut String::new(), &mut |v| { let _ = tx.lock().unwrap().send(v); }, (1, 3))
        });
        let t0 = std::time::Instant::now();
        let mut said = Vec::new();
        while t0.elapsed().as_secs() < 20 && !said.iter().any(|v: &Value| v["step"] == "stalled") {
            if let Ok(v) = rx.recv_timeout(std::time::Duration::from_millis(200)) {
                said.push(v);
            }
        }
        assert!(said.iter().any(|v| v["step"] == "pulse"), "check-ins: {said:?}");
        assert!(said.iter().any(|v| v["step"] == "stalled"), "reported stuck: {said:?}");
        assert!(!runner.is_finished(), "never stopped by the app");
        control.stop("Stopped by you.");
        assert_eq!(runner.join().unwrap().unwrap_err(), "Stopped by you.");
        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn pulse_states() {
        // a busy render is working, a quiet AI call is waiting, a dead quiet
        // local step or a runner that says nothing at all is stuck
        assert_eq!(pulse_state(true, 5, 0, true, 600), "working");
        assert_eq!(pulse_state(false, 20, 900, false, 600), "working");
        assert_eq!(pulse_state(false, 70, 900, false, 600), "waiting");
        assert_eq!(pulse_state(true, 70, 900, false, 600), "stuck");
        assert_eq!(pulse_state(false, 700, 900, false, 600), "stuck");
    }
}
