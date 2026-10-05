// jobs.rs: who may run at the same time (Zoltan, 2026-10-01; docs/identity.md
// 9). The Identity can be switched while work runs, and work of different
// kinds runs side by side:
// - local heavy work (build, check, render, avatar placement) loads this
//   computer: one shared queue, LOCAL_HEAVY_LIMIT at a time;
// - a job that spends a key (script, voice, music, scenes, avatar) runs next
//   to the render, but one key does one job at a time ("it can get mixed
//   up"). Two Identities on the same App key wait for each other; an
//   Identity with its own key does not;
// - everything else (lists, tests, small reads) runs freely.
// The registry also feeds the "Jobs" list in the top bar.

use std::collections::HashSet;
use std::sync::{Condvar, Mutex};

use serde_json::{json, Value};

/// Renders at the same time. A setting later, after a measurement
/// (docs/identity.md 9).
pub const LOCAL_HEAVY_LIMIT: usize = 1;

const LOCAL_HEAVY: &[&str] = &["build-video", "check-video", "render-video", "avatar-layout", "brand-preview", "motion-preview"];

/// Commands that spend a key on real work. Quick lookups (test a key, list
/// voices or avatars, a cost estimate, a voice sample) are not jobs.
const KEY_JOBS: &[&str] = &[
    "suggest-channel",
    "write-script",
    "keyword-ideas",
    "make-voice",
    "make-music",
    "make-scenes",
    "refill-scene",
    "make-avatar",
    "segment-voice",
    "segment-make",
    "footage-describe",
];

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Class {
    LocalHeavy,
    /// The key in use: "<key name>@<owner>", owner "app" or an Identity id.
    Key(String),
    Free,
}

pub fn class_of(command: &str, key: Option<(&str, &str)>) -> Class {
    if LOCAL_HEAVY.contains(&command) {
        return Class::LocalHeavy;
    }
    match key {
        Some((name, owner)) if KEY_JOBS.contains(&command) => Class::Key(format!("{name}@{owner}")),
        _ => Class::Free,
    }
}

#[derive(Clone, Debug)]
pub struct Info {
    pub command: String,
    pub identity: Option<String>,
    pub identity_name: Option<String>,
    pub project: Option<String>,
}

#[derive(Clone, Debug)]
struct Job {
    id: u64,
    info: Info,
    class: Class,
    running: bool,
}

#[derive(Default)]
struct State {
    next: u64,
    jobs: Vec<Job>,
}

impl State {
    fn heavy_running(&self) -> usize {
        self.jobs.iter().filter(|j| j.running && j.class == Class::LocalHeavy).count()
    }
    fn key_busy(&self, k: &str) -> bool {
        self.jobs.iter().any(|j| j.running && j.class == Class::Key(k.to_string()))
    }
    /// The running job this one waits for, if any.
    fn blocker(&self, class: &Class, limit: usize) -> Option<&Job> {
        match class {
            Class::LocalHeavy if self.heavy_running() >= limit => {
                self.jobs.iter().find(|j| j.running && j.class == Class::LocalHeavy)
            }
            Class::Key(k) if self.key_busy(k) => self.jobs.iter().find(|j| j.running && j.class == *class),
            _ => None,
        }
    }
}

#[derive(Default)]
pub struct Jobs {
    state: Mutex<State>,
    changed: Condvar,
}

/// Held while a job runs; dropping it frees the slot and wakes the waiters.
pub struct Ticket<'a> {
    jobs: &'a Jobs,
    id: u64,
}

impl Drop for Ticket<'_> {
    fn drop(&mut self) {
        let mut s = self.jobs.state.lock().unwrap_or_else(|e| e.into_inner());
        s.jobs.retain(|j| j.id != self.id);
        self.jobs.changed.notify_all();
    }
}

impl Jobs {
    /// Registers a job and blocks until it may run. `waiting` is called once
    /// with a sentence for the user when the job has to wait.
    pub fn start(&self, info: Info, class: Class, waiting: &mut dyn FnMut(String)) -> Ticket<'_> {
        self.start_with_limit(info, class, LOCAL_HEAVY_LIMIT, waiting)
    }

    fn start_with_limit(&self, info: Info, class: Class, limit: usize, waiting: &mut dyn FnMut(String)) -> Ticket<'_> {
        let mut s = self.state.lock().unwrap_or_else(|e| e.into_inner());
        s.next += 1;
        let id = s.next;
        s.jobs.push(Job { id, info, class: class.clone(), running: false });
        let mut told = false;
        loop {
            // first come, first served: an earlier waiter of the same kind goes first
            let earlier_waiting = s.jobs.iter().any(|j| j.id < id && !j.running && j.class == class && class != Class::Free);
            let blocked = match s.blocker(&class, limit) {
                None if !earlier_waiting => None,
                b => Some(b.map(waiting_text)),
            };
            let Some(msg) = blocked else { break };
            if !told {
                told = true;
                drop(s);
                waiting(msg.unwrap_or_else(|| "Waiting for an earlier job of the same kind.".into()));
                s = self.state.lock().unwrap_or_else(|e| e.into_inner());
                continue;
            }
            s = self.changed.wait(s).unwrap_or_else(|e| e.into_inner());
        }
        if let Some(j) = s.jobs.iter_mut().find(|j| j.id == id) {
            j.running = true;
        }
        self.changed.notify_all();
        Ticket { jobs: self, id }
    }

    /// Running and waiting jobs, for the "Jobs" list in the top bar.
    pub fn list(&self) -> Value {
        let s = self.state.lock().unwrap_or_else(|e| e.into_inner());
        Value::Array(
            s.jobs
                .iter()
                .filter(|j| j.class != Class::Free || j.info.project.is_some())
                .map(|j| {
                    json!({
                        "id": j.id,
                        "command": j.info.command,
                        "identity": j.info.identity,
                        "identityName": j.info.identity_name,
                        "project": j.info.project,
                        "state": if j.running { "running" } else { "waiting" },
                    })
                })
                .collect(),
        )
    }

    /// Identities with running or waiting work (their folder must not be renamed).
    pub fn busy_identities(&self) -> HashSet<String> {
        let s = self.state.lock().unwrap_or_else(|e| e.into_inner());
        s.jobs.iter().filter_map(|j| j.info.identity.clone()).collect()
    }
}

fn waiting_text(j: &Job) -> String {
    let what = match j.info.command.as_str() {
        "render-video" => "the render",
        "build-video" | "check-video" => "the video check",
        "avatar-layout" => "the avatar placement",
        "write-script" => "the script",
        "make-voice" => "the narration",
        "make-music" => "the music",
        "make-scenes" | "refill-scene" => "the scene plan",
        "make-avatar" => "the avatar clips",
        "segment-voice" | "segment-make" => "a CTA segment",
        _ => "another job",
    };
    let video = j
        .info
        .project
        .as_deref()
        .and_then(|p| std::path::Path::new(p).file_name())
        .map(|n| format!(" of {}", n.to_string_lossy()))
        .unwrap_or_default();
    let who = j.info.identity_name.as_deref().map(|n| format!(" ({n})")).unwrap_or_default();
    match j.class {
        Class::LocalHeavy => format!("Waiting: {what}{video}{who} runs first. This computer does one at a time."),
        _ => format!("Waiting: {what}{video}{who} uses the same key. One key does one job at a time."),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Arc;
    use std::time::Duration;

    fn info(cmd: &str, project: &str) -> Info {
        Info { command: cmd.into(), identity: Some("vox".into()), identity_name: Some("VoxFlow".into()), project: Some(project.into()) }
    }

    #[test]
    fn classes() {
        assert_eq!(class_of("render-video", None), Class::LocalHeavy);
        assert_eq!(class_of("brand-preview", None), Class::LocalHeavy, "the Brand preview renders stills");
        assert_eq!(class_of("motion-preview", None), Class::LocalHeavy, "the Motion preview renders a video");
        assert_eq!(class_of("write-script", Some(("gemini", "app"))), Class::Key("gemini@app".into()));
        assert_eq!(class_of("write-script", Some(("gemini", "vox"))), Class::Key("gemini@vox".into()));
        assert_eq!(class_of("list-voices", Some(("elevenlabs", "app"))), Class::Free);
        assert_eq!(class_of("test-llm", Some(("gemini", "app"))), Class::Free);
        assert_eq!(class_of("list-projects", None), Class::Free);
    }

    #[test]
    fn a_second_render_waits_but_a_script_does_not() {
        let jobs = Arc::new(Jobs::default());
        let first = jobs.start(info("render-video", "/p/A"), Class::LocalHeavy, &mut |_| {});
        // a key job runs next to the render
        let mut told = Vec::new();
        let script = jobs.start(info("write-script", "/p/C"), Class::Key("gemini@app".into()), &mut |m| told.push(m));
        assert!(told.is_empty());
        drop(script);

        let j2 = jobs.clone();
        let (tx, rx) = std::sync::mpsc::channel();
        let h = std::thread::spawn(move || {
            let mut msg = String::new();
            let _t = j2.start(info("render-video", "/p/B"), Class::LocalHeavy, &mut |m| msg = m);
            tx.send(msg).unwrap();
        });
        assert!(rx.recv_timeout(Duration::from_millis(200)).is_err(), "the second render waits");
        assert_eq!(jobs.list().as_array().unwrap().len(), 2);
        drop(first);
        let msg = rx.recv_timeout(Duration::from_secs(5)).unwrap();
        assert!(msg.contains("the render of A (VoxFlow) runs first"), "{msg}");
        h.join().unwrap();
        assert_eq!(jobs.list().as_array().unwrap().len(), 0);
    }

    #[test]
    fn one_key_one_job_but_two_keys_run_together() {
        let jobs = Arc::new(Jobs::default());
        let a = jobs.start(info("make-voice", "/p/A"), Class::Key("elevenlabs@app".into()), &mut |_| {});
        let mut told = false;
        let own = jobs.start(info("make-voice", "/p/B"), Class::Key("elevenlabs@vox".into()), &mut |_| told = true);
        assert!(!told, "an Identity with its own key does not wait");
        drop(own);
        let j2 = jobs.clone();
        let (tx, rx) = std::sync::mpsc::channel();
        let h = std::thread::spawn(move || {
            let mut msg = String::new();
            let _t = j2.start(info("make-music", "/p/C"), Class::Key("elevenlabs@app".into()), &mut |m| msg = m);
            tx.send(msg).unwrap();
        });
        assert!(rx.recv_timeout(Duration::from_millis(200)).is_err(), "same key waits");
        drop(a);
        assert!(rx.recv_timeout(Duration::from_secs(5)).unwrap().contains("same key"));
        h.join().unwrap();
    }

    #[test]
    fn busy_identities_are_known() {
        let jobs = Jobs::default();
        let t = jobs.start(info("render-video", "/p/A"), Class::LocalHeavy, &mut |_| {});
        assert!(jobs.busy_identities().contains("vox"));
        drop(t);
        assert!(jobs.busy_identities().is_empty());
    }
}
