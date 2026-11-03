// diagnostics.rs: "Export diagnostics" (Settings, App, General; Zoltan,
// 2026-10-06: if an error happened, or nothing happened, we can find out
// why). One zip a tester sends us: the app's local log, the App settings and
// the Identities' settings, and for every ONE Video its state (project.json),
// its own log.txt and the engine's logs of the last build and render. Never
// a key (keys live only in the OS keychain), never audio, video or the
// script's text.

use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

/// The files of a ONE Video that tell what happened in it.
const VIDEO_FILES: &[&str] = &["project.json", "log.txt", "build/render.log", "build/lint.log", "build/check.log", "avatar/avatar.json", "avatar/pending.json"];
/// The log of the last 30 days is plenty; older files stay on disk.
const LOG_DAYS: usize = 30;
/// One file larger than this is cut to its end (a huge check.log).
const MAX_FILE: u64 = 4 * 1024 * 1024;

pub struct Sources<'a> {
    pub logs: Option<&'a Path>,
    pub config_dir: &'a Path,
    pub projects_root: &'a Path,
    pub about: String,
}

fn read_capped(p: &Path) -> Option<Vec<u8>> {
    let len = fs::metadata(p).ok()?.len();
    let bytes = fs::read(p).ok()?;
    if len <= MAX_FILE {
        return Some(bytes);
    }
    let cut = bytes.len() - MAX_FILE as usize;
    let mut out = format!("[first {cut} bytes left out]\n").into_bytes();
    out.extend_from_slice(&bytes[cut..]);
    Some(out)
}

/// The ONE Video folders under the projects folder: <root>/<Identity>/<video>
/// (and older ones directly under the root).
fn video_dirs(root: &Path) -> Vec<PathBuf> {
    let mut out = Vec::new();
    let Ok(level1) = fs::read_dir(root) else { return out };
    for a in level1.flatten() {
        let p = a.path();
        if !p.is_dir() {
            continue;
        }
        if p.join("project.json").exists() {
            out.push(p);
            continue;
        }
        if let Ok(level2) = fs::read_dir(&p) {
            out.extend(level2.flatten().map(|b| b.path()).filter(|q| q.join("project.json").exists()));
        }
    }
    out.sort();
    out
}

/// Writes the zip; returns how many files went in.
pub fn export(src: &Sources, out: &Path) -> Result<usize, String> {
    if let Some(dir) = out.parent() {
        fs::create_dir_all(dir).map_err(|e| format!("Could not create the folder {}: {e}", dir.display()))?;
    }
    let file = fs::File::create(out).map_err(|e| format!("Could not write {}: {e}", out.display()))?;
    let mut zip = zip::ZipWriter::new(file);
    let opts = zip::write::SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);
    let mut n = 0usize;
    let mut put = |zip: &mut zip::ZipWriter<fs::File>, name: &str, bytes: &[u8]| -> Result<(), String> {
        zip.start_file(name, opts).map_err(|e| e.to_string())?;
        zip.write_all(bytes).map_err(|e| e.to_string())?;
        n += 1;
        Ok(())
    };
    put(&mut zip, "README.txt", src.about.as_bytes())?;

    if let Some(logs) = src.logs {
        let mut days: Vec<PathBuf> = fs::read_dir(logs)
            .map(|r| r.flatten().map(|e| e.path()).filter(|p| p.extension().is_some_and(|x| x == "jsonl" || x == "log")).collect())
            .unwrap_or_default();
        days.sort();
        for p in days.iter().rev().take(LOG_DAYS) {
            if let (Some(name), Some(bytes)) = (p.file_name(), read_capped(p)) {
                put(&mut zip, &format!("logs/{}", name.to_string_lossy()), &bytes)?;
            }
        }
    }
    if let Some(bytes) = read_capped(&src.config_dir.join(crate::config::FILE_NAME)) {
        put(&mut zip, "settings/config.json", &bytes)?;
    }
    let idents = crate::identity::root(src.config_dir);
    if let Ok(list) = fs::read_dir(&idents) {
        for e in list.flatten() {
            let id = e.file_name().to_string_lossy().to_string();
            for f in ["identity.json", "motion.json", "cta.json", "last-used.json"] {
                if let Some(bytes) = read_capped(&e.path().join(f)) {
                    put(&mut zip, &format!("settings/identities/{id}/{f}"), &bytes)?;
                }
            }
        }
    }
    for dir in video_dirs(src.projects_root) {
        let rel = dir.strip_prefix(src.projects_root).unwrap_or(&dir).to_string_lossy().replace('\\', "/");
        for f in VIDEO_FILES {
            if let Some(bytes) = read_capped(&dir.join(f)) {
                put(&mut zip, &format!("videos/{rel}/{f}"), &bytes)?;
            }
        }
    }
    zip.finish().map_err(|e| e.to_string())?;
    Ok(n)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_zip_holds_logs_settings_and_video_states_but_no_media() {
        let base = std::env::temp_dir().join(format!("itv-diag-{}", std::process::id()));
        let logs = base.join("logs");
        let cfg = base.join("cfg");
        let root = base.join("Projects");
        let video = root.join("My Identity").join("2026-10-06_x");
        fs::create_dir_all(&logs).unwrap();
        fs::create_dir_all(cfg.join("identities").join("my-identity")).unwrap();
        fs::create_dir_all(video.join("build")).unwrap();
        fs::create_dir_all(video.join("audio")).unwrap();
        fs::write(logs.join("2026-10-06.jsonl"), "{}\n").unwrap();
        fs::write(cfg.join(crate::config::FILE_NAME), "{}").unwrap();
        fs::write(cfg.join("identities").join("my-identity").join("identity.json"), "{}").unwrap();
        fs::write(video.join("project.json"), "{}").unwrap();
        fs::write(video.join("log.txt"), "x").unwrap();
        fs::write(video.join("build").join("render.log"), "r").unwrap();
        fs::write(video.join("audio").join("vo.mp3"), "AUDIO").unwrap();
        fs::write(video.join("script.md"), "the script").unwrap();
        let out = base.join("out").join("diag.zip");
        let n = export(&Sources { logs: Some(&logs), config_dir: &cfg, projects_root: &root, about: "about".into() }, &out).unwrap();
        let mut z = zip::ZipArchive::new(fs::File::open(&out).unwrap()).unwrap();
        let names: Vec<String> = (0..z.len()).map(|i| z.by_index(i).unwrap().name().to_string()).collect();
        assert_eq!(n, names.len());
        for want in ["README.txt", "logs/2026-10-06.jsonl", "settings/config.json", "settings/identities/my-identity/identity.json", "videos/My Identity/2026-10-06_x/project.json", "videos/My Identity/2026-10-06_x/log.txt", "videos/My Identity/2026-10-06_x/build/render.log"] {
            assert!(names.iter().any(|x| x == want), "{want} in {names:?}");
        }
        assert!(!names.iter().any(|x| x.ends_with(".mp3") || x.ends_with("script.md")), "{names:?}");
        fs::remove_dir_all(&base).unwrap();
    }
}
