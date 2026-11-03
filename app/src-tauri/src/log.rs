// log.rs: the local log (docs/backup.md B; Zoltan, 2026-10-01). So that Claude,
// working on this same computer, can read what the app did and what the user
// saw, without screenshots: <app local data>/logs/<UTC date>.jsonl, one JSON
// event per line. Generous on purpose ("rather more than less": not every
// session runs on the strongest model). Never deleted by the app, only by the
// user (Settings, App, General). Local only, it goes nowhere (SPEC 9).
//
// Never in the log: a key (anything that looks like one is masked, and the
// key a job used is masked by value), a script, a narration, an audience
// text. Requests and results go through `safe`: identifiers, choices, paths,
// numbers and booleans stay; free text becomes its length.

use std::fs::{self, File, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use serde_json::{json, Map, Value};

#[derive(Default)]
struct State {
    dir: Option<PathBuf>,
    file: Option<(String, File)>,
    seq: u64,
    session: String,
    errors: u64,
    warnings: u64,
}

#[derive(Default)]
pub struct Log {
    state: Mutex<State>,
}

/// UTC time with milliseconds: "2026-10-01T20:15:03.120Z".
pub fn now_ms() -> String {
    let d = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default();
    let base = crate::identity::iso_from_unix(d.as_secs() as i64);
    format!("{}.{:03}Z", base.trim_end_matches('Z'), d.subsec_millis())
}

impl Log {
    /// Starts logging into `dir` (created when missing). A new session id
    /// marks every line until the app closes.
    pub fn open(&self, dir: PathBuf) {
        let mut s = self.state.lock().unwrap_or_else(|e| e.into_inner());
        let _ = fs::create_dir_all(&dir);
        s.dir = Some(dir);
        s.session = format!("{}-{}", now_ms().replace([':', '.'], ""), std::process::id());
    }

    /// Writes one event. `src`: core, ui or runner. `level`: info, warn, error.
    /// `data` is merged into the line after redaction. Logging never fails
    /// the caller.
    pub fn write(&self, src: &str, level: &str, event: &str, data: Value, secrets: &[&str]) {
        let mut s = self.state.lock().unwrap_or_else(|e| e.into_inner());
        let Some(dir) = s.dir.clone() else { return };
        s.seq += 1;
        match level {
            "error" => s.errors += 1,
            "warn" => s.warnings += 1,
            _ => {}
        }
        let ts = now_ms();
        let mut line = Map::new();
        line.insert("ts".into(), json!(ts));
        line.insert("session".into(), json!(s.session));
        line.insert("seq".into(), json!(s.seq));
        line.insert("src".into(), json!(src));
        line.insert("level".into(), json!(level));
        line.insert("event".into(), json!(event));
        if let Value::Object(m) = redact_value(&data, secrets) {
            for (k, v) in m {
                let k = if line.contains_key(&k) { format!("x_{k}") } else { k };
                line.insert(k, v);
            }
        } else if !data.is_null() {
            line.insert("data".into(), redact_value(&data, secrets));
        }
        let day = ts[..10].to_string();
        if s.file.as_ref().map(|(d, _)| d != &day).unwrap_or(true) {
            let path = dir.join(format!("{day}.jsonl"));
            s.file = OpenOptions::new().create(true).append(true).open(path).ok().map(|f| (day, f));
        }
        if let Some((_, f)) = s.file.as_mut() {
            let mut text = Value::Object(line).to_string();
            text.push('\n');
            let _ = f.write_all(text.as_bytes());
        }
    }

    pub fn info(&self, event: &str, data: Value) {
        self.write("core", "info", event, data, &[]);
    }

    /// For Settings: where the log is, how big, and this session's counts.
    pub fn status(&self) -> Value {
        let s = self.state.lock().unwrap_or_else(|e| e.into_inner());
        let (files, bytes) = s.dir.as_deref().map(size_of).unwrap_or((0, 0));
        json!({
            "dir": s.dir,
            "files": files,
            "bytes": bytes,
            "session": s.session,
            "errors": s.errors,
            "warnings": s.warnings,
        })
    }

    /// Settings, "Delete logs": every log file; the current day starts again.
    pub fn delete_all(&self) -> Result<usize, String> {
        let mut s = self.state.lock().unwrap_or_else(|e| e.into_inner());
        s.file = None;
        let Some(dir) = s.dir.clone() else { return Ok(0) };
        let mut n = 0;
        for e in fs::read_dir(&dir).map_err(|e| e.to_string())?.flatten() {
            if e.path().extension().and_then(|x| x.to_str()) == Some("jsonl") || e.path().extension().and_then(|x| x.to_str()) == Some("log") {
                fs::remove_file(e.path()).map_err(|e| format!("Could not delete {}: {e}", e))?;
                n += 1;
            }
        }
        Ok(n)
    }
}

fn size_of(dir: &Path) -> (u64, u64) {
    let Ok(entries) = fs::read_dir(dir) else { return (0, 0) };
    entries
        .flatten()
        .filter(|e| e.path().extension().and_then(|x| x.to_str()) == Some("jsonl"))
        .fold((0, 0), |(n, b), e| (n + 1, b + e.metadata().map(|m| m.len()).unwrap_or(0)))
}

// ---- redaction ----------------------------------------------------------------------

/// Does this token look like an API key? Known prefixes, or a long run with
/// upper case, lower case and digits mixed inside one piece (keys are; words,
/// slugs like "2026-10-01_from-freelancer-to-owner", hex hashes and file
/// names like "IdeaToVideo-diagnostics-20261006-1016" are not: their pieces
/// between "-" and "_" are words or numbers, Zoltan's log of 2026-10-06).
fn looks_like_key(t: &str) -> bool {
    let known = ["AIza", "sk-", "sk_", "xai-", "pk-", "hg_"];
    if t.len() >= 20 && known.iter().any(|p| t.starts_with(p)) {
        return true;
    }
    t.len() >= 32
        && t.chars().any(|c| c.is_ascii_digit())
        && t.chars().any(|c| c.is_ascii_uppercase())
        && t.chars().any(|c| c.is_ascii_lowercase())
        && t
            .split(['-', '_'])
            .any(|p| p.chars().any(|c| c.is_ascii_digit()) && p.chars().any(|c| c.is_ascii_alphabetic()))
}

/// Masks the given secrets by value and every key-like token.
pub fn redact(text: &str, secrets: &[&str]) -> String {
    let mut s = text.to_string();
    for sec in secrets.iter().filter(|x| x.len() >= 8) {
        s = s.replace(sec, "[key]");
    }
    let mut out = String::with_capacity(s.len());
    let mut token = String::new();
    let flush = |token: &mut String, out: &mut String| {
        if looks_like_key(token) {
            out.push_str("[key]");
        } else {
            out.push_str(token);
        }
        token.clear();
    };
    for c in s.chars() {
        if c.is_ascii_alphanumeric() || c == '_' || c == '-' {
            token.push(c);
        } else {
            flush(&mut token, &mut out);
            out.push(c);
        }
    }
    flush(&mut token, &mut out);
    out
}

pub fn redact_value(v: &Value, secrets: &[&str]) -> Value {
    match v {
        Value::String(s) => Value::String(redact(s, secrets)),
        Value::Array(a) => Value::Array(a.iter().map(|x| redact_value(x, secrets)).collect()),
        Value::Object(m) => Value::Object(m.iter().map(|(k, x)| (k.clone(), redact_value(x, secrets))).collect()),
        other => other.clone(),
    }
}

// ---- what of a request or result may be logged ----------------------------------------

/// Fields whose text is a choice or an identifier, not the user's content.
const PLAIN: &[&str] = &[
    "command", "provider", "model", "service", "look", "quality", "field", "gate", "mode", "state", "voice", "voiceId",
    "lookId", "engine", "pace", "captions", "style", "position", "size", "language", "contentLanguage", "keyScope", "scriptTemplate", "preset", "id",
    "name", "folder", "status", "kind", "segment", "level", "event", "code", "step", "format", "version", "tier",
    "projectDir", "projectsDir", "projectsRoot", "backupRoot", "dir", "file", "path", "srt", "chaptersFile", "message",
    "error", "warning", "at", "createdAt", "youtubeUrl", "landingUrl", "logo", "identity", "activeIdentity", "music",
    "reason", "label", "title", "from", "to", "timing",
];

/// A request or result made safe to log: identifiers, choices, paths, numbers
/// and booleans as they are; other text as its length; long lists as a count
/// and their first items.
pub fn safe(v: &Value) -> Value {
    safe_at(v, None, 0)
}

fn safe_at(v: &Value, key: Option<&str>, depth: usize) -> Value {
    match v {
        Value::String(s) => {
            if key.is_some_and(|k| PLAIN.contains(&k)) && s.chars().count() <= 300 {
                Value::String(s.clone())
            } else {
                json!({ "len": s.chars().count() })
            }
        }
        Value::Array(a) => {
            if depth >= 4 {
                return json!({ "items": a.len() });
            }
            let first: Vec<Value> = a.iter().take(3).map(|x| safe_at(x, key, depth + 1)).collect();
            if a.len() <= 3 {
                Value::Array(first)
            } else {
                json!({ "items": a.len(), "first": first })
            }
        }
        Value::Object(m) => {
            if depth >= 4 {
                return json!({ "fields": m.len() });
            }
            Value::Object(m.iter().map(|(k, x)| (k.clone(), safe_at(x, Some(k), depth + 1))).collect())
        }
        other => other.clone(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keys_are_masked_text_is_not() {
        assert_eq!(redact("key AIzaSyA1234567890abcdefghijk end", &[]), "key [key] end");
        assert_eq!(redact("Bearer sk-ant-api03-abcdefghijklmnop1234", &[]), "Bearer [key]");
        assert_eq!(redact("x-api-key: Zm9vYmFyQmF6UXV4MTIzNDU2Nzg5MGFiY2RlZg", &[]), "x-api-key: [key]");
        assert_eq!(redact("secret=MYSECRETVALUE12", &["MYSECRETVALUE12"]), "secret=[key]");
        let plain = "C:/Users/gdp/Documents/Studio Projects/My Identity/2026-10-01_from-freelancer-to-owner/out/video.mp4";
        assert_eq!(redact(plain, &[]), plain);
        let zip = r"C:\Users\gdp\Downloads\IdeaToVideo-diagnostics-20261006-1016.zip";
        assert_eq!(redact(zip, &[]), zip);
        assert_eq!(redact("The Gemini quota is used up (HTTP 429).", &[]), "The Gemini quota is used up (HTTP 429).");
    }

    #[test]
    fn safe_keeps_choices_and_hides_content() {
        let req = json!({
            "projectDir": "C:/P/My Identity/x",
            "llm": { "provider": "gemini", "model": "gemini-3.5-flash" },
            "channel": { "audience": "first-time founders who...", "contentLanguage": "hu" },
            "input": { "topic": "How to start", "targetLengthMin": 8 },
            "autopilot": true,
            "rows": [1, 2, 3, 4, 5]
        });
        let s = safe(&req);
        assert_eq!(s["projectDir"], "C:/P/My Identity/x");
        assert_eq!(s["llm"]["model"], "gemini-3.5-flash");
        assert_eq!(s["channel"]["audience"], json!({ "len": 26 }));
        assert_eq!(s["channel"]["contentLanguage"], "hu");
        assert_eq!(s["input"]["topic"], json!({ "len": 12 }));
        assert_eq!(s["input"]["targetLengthMin"], 8);
        assert_eq!(s["autopilot"], true);
        assert_eq!(s["rows"]["items"], 5);
    }

    #[test]
    fn lines_go_to_a_daily_file_with_session_and_counts() {
        let dir = std::env::temp_dir().join(format!("itv-log-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        let log = Log::default();
        log.info("before_open", json!({})); // no folder yet: silently nothing
        log.open(dir.clone());
        log.info("app_start", json!({ "version": "0.1.0" }));
        log.write("ui", "error", "error_shown", json!({ "message": "bad key AIzaSyA1234567890abcdefghijk", "seq": 99 }), &[]);
        log.write("core", "warn", "slow", json!({}), &[]);
        let st = log.status();
        assert_eq!((st["errors"].as_u64(), st["warnings"].as_u64(), st["files"].as_u64()), (Some(1), Some(1), Some(1)));
        let text = fs::read_to_string(fs::read_dir(&dir).unwrap().next().unwrap().unwrap().path()).unwrap();
        let lines: Vec<Value> = text.lines().map(|l| serde_json::from_str(l).unwrap()).collect();
        assert_eq!(lines.len(), 3);
        assert_eq!(lines[0]["event"], "app_start");
        assert_eq!(lines[1]["src"], "ui");
        assert_eq!(lines[1]["seq"], 2, "core fields win");
        assert_eq!(lines[1]["x_seq"], 99);
        assert!(lines[1]["message"].as_str().unwrap().ends_with("[key]"));
        assert_eq!(lines[0]["session"], lines[2]["session"]);
        assert_eq!(log.delete_all().unwrap(), 1);
        assert_eq!(log.status()["files"], 0);
        log.info("after_delete", json!({}));
        assert_eq!(log.status()["files"], 1, "logging goes on after a delete");
        fs::remove_dir_all(&dir).unwrap();
    }
}
