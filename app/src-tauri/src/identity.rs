// identity.rs: the Identity level above the ONE Videos (DECISIONS 67,
// docs/identity.md). One Identity = one brand, pen name or client, with 0 or
// 1 YouTube channel. Its settings live in
// <app config dir>/identities/<id>/identity.json, next to its own files
// (brand/logo, later the wizards' results). Its ONE Videos live in
// <projects root>/<folder>/. The id never changes: it ties the settings file,
// the keychain account (identity-<id>) and the folder together. Keys are never
// in identity.json and never in an export.

use std::fs;
use std::io::{Read, Write};
use std::path::{Component, Path, PathBuf};

use serde_json::{json, Value};

use crate::config;

pub const DIR: &str = "identities";
pub const FILE: &str = "identity.json";
pub const FIRST_NAME: &str = "My Identity";
/// Where a logo chosen during setup waits until its Identity exists.
const STAGING: &str = ".new";

pub const EXPORT_FORMAT: &str = "ideatovideo-identity";
pub const EXPORT_VERSION: u64 = 1;
const EXPORT_MAX_FILES: usize = 200;
const EXPORT_MAX_FILE: u64 = 20 * 1024 * 1024;
const EXPORT_MAX_TOTAL: u64 = 60 * 1024 * 1024;
/// File types an Identity folder may hold (and an import may bring).
const ASSET_EXTS: &[&str] = &["png", "jpg", "jpeg", "svg", "webp", "md", "json", "txt", "woff", "woff2", "ttf", "otf"];

/// The fields of the old one-file config (schema 1) that belong to an Identity.
const IDENTITY_FIELDS: &[&str] = &["brand", "channel", "narrator", "avatar", "research"];

// ---- names --------------------------------------------------------------------------

/// Ids are used in paths and keychain account names: lower-case ASCII, digits
/// and dashes, starting with a letter or digit, at most 60 characters.
pub fn check_id(id: &str) -> Result<(), String> {
    let ok = !id.is_empty()
        && id.len() <= 60
        && id.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
        && !id.starts_with('-');
    if ok {
        Ok(())
    } else {
        Err(format!("Not a valid Identity id: {id}"))
    }
}

/// Accented Latin letters to plain ones, for ids (the folder keeps accents).
fn fold(c: char) -> &'static str {
    match c {
        'á' | 'à' | 'â' | 'ä' | 'ã' | 'å' | 'ā' | 'ă' | 'ą' => "a",
        'é' | 'è' | 'ê' | 'ë' | 'ē' | 'ė' | 'ę' | 'ě' => "e",
        'í' | 'ì' | 'î' | 'ï' | 'ī' | 'į' => "i",
        'ó' | 'ò' | 'ô' | 'ö' | 'õ' | 'ő' | 'ø' | 'ō' => "o",
        'ú' | 'ù' | 'û' | 'ü' | 'ű' | 'ū' | 'ů' | 'ų' => "u",
        'ý' | 'ÿ' => "y",
        'ç' | 'ć' | 'č' => "c",
        'ñ' | 'ń' | 'ň' => "n",
        'ś' | 'š' | 'ş' | 'ș' => "s",
        'ź' | 'ż' | 'ž' => "z",
        'ł' => "l",
        'ř' => "r",
        'ť' | 'ț' => "t",
        'ď' | 'đ' => "d",
        'ß' => "ss",
        'æ' => "ae",
        'œ' => "oe",
        _ => "",
    }
}

/// A new id from a name, unique among `taken`: "Zoltán Gerő" -> "zoltan-gero".
pub fn make_id(name: &str, taken: &[String]) -> String {
    let mut s = String::new();
    for c in name.to_lowercase().chars() {
        if c.is_ascii_alphanumeric() {
            s.push(c);
        } else if !fold(c).is_empty() {
            s.push_str(fold(c));
        } else if !s.ends_with('-') {
            s.push('-');
        }
    }
    let mut base: String = s.trim_matches('-').chars().take(50).collect();
    base = base.trim_end_matches('-').to_string();
    if base.is_empty() {
        base = "identity".into();
    }
    unique(&base, taken, "-")
}

fn unique(base: &str, taken: &[String], sep: &str) -> String {
    let lower: Vec<String> = taken.iter().map(|t| t.to_lowercase()).collect();
    if !lower.contains(&base.to_lowercase()) {
        return base.to_string();
    }
    (2..).map(|n| format!("{base}{sep}{n}")).find(|c| !lower.contains(&c.to_lowercase())).unwrap()
}

const RESERVED: &[&str] = &[
    "con", "prn", "aux", "nul", "com1", "com2", "com3", "com4", "com5", "com6", "com7", "com8", "com9", "lpt1", "lpt2",
    "lpt3", "lpt4", "lpt5", "lpt6", "lpt7", "lpt8", "lpt9",
];

/// The readable folder name for an Identity's ONE Videos: the name without
/// what Windows forbids in a file name, accents kept, unique among `taken`
/// (compared without case, as Windows and macOS do).
pub fn make_folder(name: &str, taken: &[String]) -> String {
    let cleaned: String = name
        .chars()
        .filter(|c| !matches!(c, '\\' | '/' | ':' | '*' | '?' | '"' | '<' | '>' | '|') && !c.is_control())
        .collect();
    let mut base = cleaned.split_whitespace().collect::<Vec<_>>().join(" ");
    base = base.trim_end_matches(['.', ' ']).chars().take(60).collect::<String>().trim().to_string();
    if base.is_empty() || base.starts_with('.') {
        base = "Identity".into();
    }
    if RESERVED.contains(&base.to_lowercase().as_str()) {
        base.push('_');
    }
    unique(&base, taken, " ")
}

// ---- storage ------------------------------------------------------------------------

pub fn root(config_dir: &Path) -> PathBuf {
    config_dir.join(DIR)
}

pub fn dir_of(config_dir: &Path, id: &str) -> Result<PathBuf, String> {
    check_id(id)?;
    Ok(root(config_dir).join(id))
}

pub fn staging_dir(config_dir: &Path) -> PathBuf {
    root(config_dir).join(STAGING)
}

pub fn load(config_dir: &Path, id: &str) -> Result<Value, String> {
    let p = dir_of(config_dir, id)?.join(FILE);
    match config::load(&p)? {
        Some(v) => Ok(v),
        None => Err(format!("Identity not found: {id}")),
    }
}

pub fn save(config_dir: &Path, ident: &Value) -> Result<(), String> {
    let id = id_of(ident)?;
    let bytes = serde_json::to_vec_pretty(ident).map_err(|e| e.to_string())?;
    config::write_atomic(&dir_of(config_dir, &id)?.join(FILE), &bytes)
}

pub fn id_of(ident: &Value) -> Result<String, String> {
    let id = ident.get("id").and_then(Value::as_str).ok_or("The Identity has no id.")?;
    check_id(id)?;
    Ok(id.to_string())
}

pub fn str_of<'a>(ident: &'a Value, field: &str) -> &'a str {
    ident.get(field).and_then(Value::as_str).unwrap_or("")
}

/// Every Identity, sorted by name. A damaged file is skipped, not fatal.
pub fn list(config_dir: &Path) -> Vec<Value> {
    let mut out = Vec::new();
    let Ok(entries) = fs::read_dir(root(config_dir)) else { return out };
    for e in entries.flatten() {
        let name = e.file_name().to_string_lossy().to_string();
        if check_id(&name).is_err() {
            continue;
        }
        if let Ok(Some(v)) = config::load(&e.path().join(FILE)) {
            if str_of(&v, "id") == name {
                out.push(v);
            }
        }
    }
    out.sort_by_key(|v| str_of(v, "name").to_lowercase());
    out
}

pub fn ids(all: &[Value]) -> Vec<String> {
    all.iter().map(|v| str_of(v, "id").to_string()).collect()
}

pub fn folders(all: &[Value]) -> Vec<String> {
    all.iter().map(|v| str_of(v, "folder").to_string()).collect()
}

/// The Identity whose ONE Videos folder holds `path` (a project or the
/// Identity's own folder under the projects root).
pub fn owner_of(path: &Path, projects_root: &Path, all: &[Value]) -> Option<String> {
    let rel = path.strip_prefix(projects_root).ok()?;
    let first = match rel.components().next()? {
        Component::Normal(s) => s.to_string_lossy().to_string(),
        _ => return None,
    };
    all.iter()
        .find(|v| str_of(v, "folder").eq_ignore_ascii_case(&first))
        .map(|v| str_of(v, "id").to_string())
}

/// UTC "2026-10-01T10:00:00Z" without a date crate.
pub fn now_iso() -> String {
    let secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);
    iso_from_unix(secs)
}

pub fn iso_from_unix(secs: i64) -> String {
    let (days, rem) = (secs.div_euclid(86_400), secs.rem_euclid(86_400));
    // civil_from_days (H. Hinnant)
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = yoe + era * 400 + i64::from(m <= 2);
    format!("{y:04}-{m:02}-{d:02}T{:02}:{:02}:{:02}Z", rem / 3600, rem % 3600 / 60, rem % 60)
}

/// Fills id, folder and createdAt of a new Identity. `ident` carries the
/// fields the user set (name, channel, brand...).
pub fn complete_new(mut ident: Value, all: &[Value]) -> Result<Value, String> {
    let name = str_of(&ident, "name").trim().to_string();
    let name = if name.is_empty() { FIRST_NAME.to_string() } else { name };
    let obj = ident.as_object_mut().ok_or("The Identity must be an object.")?;
    obj.insert("schema".into(), json!(1));
    obj.insert("id".into(), json!(make_id(&name, &ids(all))));
    obj.insert("folder".into(), json!(make_folder(&name, &folders(all))));
    obj.insert("name".into(), json!(name));
    obj.insert("createdAt".into(), json!(now_iso()));
    Ok(ident)
}

/// Points brand.logo at the same file name inside `dir/brand`, when it exists
/// there (after a copy, a duplicate, an import or the migration).
pub fn rebase_logo(ident: &mut Value, dir: &Path) {
    let Some(logo) = ident.pointer("/brand/logo").and_then(Value::as_str) else { return };
    let Some(name) = Path::new(logo).file_name() else { return };
    let new = dir.join("brand").join(name);
    if new.exists() {
        ident["brand"]["logo"] = json!(new.to_string_lossy());
    }
}

/// Copies every file of `from` into `to` (one level of sub-folders: brand/,
/// later cta/ and the like). Only known file types.
fn copy_tree(from: &Path, to: &Path) -> Result<(), String> {
    let Ok(entries) = fs::read_dir(from) else { return Ok(()) };
    fs::create_dir_all(to).map_err(|e| e.to_string())?;
    for e in entries.flatten() {
        let p = e.path();
        if p.is_dir() {
            copy_tree(&p, &to.join(e.file_name()))?;
        } else if allowed_asset(&p) && e.file_name() != FILE {
            fs::copy(&p, to.join(e.file_name())).map_err(|e| format!("Could not copy a file: {e}"))?;
        }
    }
    Ok(())
}

fn allowed_asset(p: &Path) -> bool {
    p.extension()
        .and_then(|e| e.to_str())
        .map(|e| ASSET_EXTS.contains(&e.to_ascii_lowercase().as_str()))
        .unwrap_or(false)
}

/// Moves a logo chosen during setup (before the Identity existed) into it.
pub fn adopt_staging(config_dir: &Path, ident: &mut Value) -> Result<(), String> {
    let staging = staging_dir(config_dir);
    let logo = ident.pointer("/brand/logo").and_then(Value::as_str).map(PathBuf::from);
    let Some(logo) = logo.filter(|l| l.starts_with(&staging)) else { return Ok(()) };
    let dir = dir_of(config_dir, &id_of(ident)?)?;
    copy_tree(&staging, &dir)?;
    let _ = fs::remove_dir_all(&staging);
    let name = logo.file_name().ok_or("bad logo path")?;
    ident["brand"]["logo"] = json!(dir.join("brand").join(name).to_string_lossy());
    Ok(())
}

/// A copy of `src` under a new name: settings and files, never the ONE Videos.
pub fn duplicate(config_dir: &Path, src: &Value, name: &str, all: &[Value]) -> Result<Value, String> {
    let mut copy = src.clone();
    copy["name"] = json!(name);
    let mut copy = complete_new(copy, all)?;
    let from = dir_of(config_dir, &id_of(src)?)?;
    let to = dir_of(config_dir, &id_of(&copy)?)?;
    copy_tree(&from, &to)?;
    rebase_logo(&mut copy, &to);
    save(config_dir, &copy)?;
    Ok(copy)
}

/// Removes the settings folder of an Identity. The ONE Videos stay on disk.
pub fn remove(config_dir: &Path, id: &str) -> Result<(), String> {
    let d = dir_of(config_dir, id)?;
    fs::remove_dir_all(&d).map_err(|e| format!("Could not remove the Identity settings: {e}"))
}

/// Renames an Identity's ONE Videos folder after a name change. Returns the
/// folder that is in use afterwards, and a sentence when the rename did not
/// happen (the old name stays, nothing is lost).
pub fn rename_folder(projects_root: &Path, old: &str, new_name: &str, all: &[Value], busy: bool) -> (String, Option<String>) {
    let others: Vec<String> = folders(all).into_iter().filter(|f| !f.eq_ignore_ascii_case(old)).collect();
    let new = make_folder(new_name, &others);
    if new == old {
        return (old.to_string(), None);
    }
    if busy {
        return (old.to_string(), Some(format!("The folder keeps its name \"{old}\" while a job runs for this Identity. Save again later to rename it.")));
    }
    let (from, to) = (projects_root.join(old), projects_root.join(&new));
    if !from.exists() {
        return (new, None);
    }
    if to.exists() && !new.eq_ignore_ascii_case(old) {
        return (old.to_string(), Some(format!("A folder named \"{new}\" already exists, so the videos stay in \"{old}\".")));
    }
    match fs::rename(&from, &to) {
        Ok(()) => (new, None),
        Err(e) => (old.to_string(), Some(format!("The folder \"{old}\" could not be renamed ({e}), so it keeps its name."))),
    }
}

// ---- migration from the one-file config (schema 1) ------------------------------------

/// Turns a schema 1 config.json into the App config (schema 2) and the first
/// Identity, "My Identity" (docs/identity.md 5). Moves the logo and the ONE
/// Videos in the projects root into the Identity. Keys stay where they are:
/// they become the App keys. Safe to run twice: the Identity is written
/// before the config, and the config is the marker. Returns a notice for
/// whatever could not be moved.
pub fn migrate_v1(config_dir: &Path, legacy_brand: &Path, projects_root: impl Fn(&Value) -> Option<PathBuf>) -> Result<Option<String>, String> {
    let cfg_path = config_dir.join(config::FILE_NAME);
    let Some(old) = config::load(&cfg_path)? else { return Ok(None) };
    if old.get("schema").and_then(Value::as_u64) != Some(1) {
        return Ok(None);
    }

    let mut ident = json!({ "name": FIRST_NAME });
    for f in IDENTITY_FIELDS {
        if let Some(v) = old.get(*f) {
            ident[*f] = v.clone();
        }
    }
    if ident.get("channel").is_none() {
        ident["channel"] = json!({});
    }
    if ident.get("narrator").is_none() {
        ident["narrator"] = json!({ "provider": "gemini" });
    }
    let mut defaults = serde_json::Map::new();
    for f in ["scriptTemplate", "targetLengthMin"] {
        if let Some(v) = old.pointer(&format!("/defaults/{f}")) {
            defaults.insert(f.into(), v.clone());
        }
    }
    ident["defaults"] = Value::Object(defaults);
    ident["llm"] = Value::Null;

    // a second run after a crash reuses the same Identity
    let existing = list(config_dir);
    let mut ident = match existing.iter().find(|v| str_of(v, "name") == FIRST_NAME) {
        Some(prev) => {
            for f in ["schema", "id", "folder", "createdAt"] {
                ident[f] = prev[f].clone();
            }
            ident
        }
        None => complete_new(ident, &existing)?,
    };
    let dir = dir_of(config_dir, &id_of(&ident)?)?;
    if legacy_brand.is_dir() {
        copy_tree(legacy_brand, &dir.join("brand"))?;
        rebase_logo(&mut ident, &dir);
    }
    save(config_dir, &ident)?;

    let mut app = json!({ "schema": 2, "activeIdentity": ident["id"] });
    for f in ["onboarded", "ui", "llm", "projectsDir"] {
        if let Some(v) = old.get(f) {
            app[f] = v.clone();
        }
    }
    if let Some(a) = old.pointer("/defaults/autopilot") {
        app["defaults"] = json!({ "autopilot": a });
    }

    let mut notice = None;
    if let Some(root) = projects_root(&app) {
        let folder = str_of(&ident, "folder").to_string();
        let left = move_projects(&root, &root.join(&folder));
        if !left.is_empty() {
            notice = Some(format!(
                "{} video folder(s) could not be moved into \"{folder}\" and stay in {}: {}",
                left.len(),
                root.display(),
                left.join(", ")
            ));
        }
    }

    let bytes = serde_json::to_vec_pretty(&app).map_err(|e| e.to_string())?;
    config::write_atomic(&cfg_path, &bytes)?;
    Ok(notice)
}

/// Moves every folder with a project.json from `root` into `target`. Returns
/// the names that could not be moved.
fn move_projects(root: &Path, target: &Path) -> Vec<String> {
    let mut left = Vec::new();
    let Ok(entries) = fs::read_dir(root) else { return left };
    let entries: Vec<_> = entries.flatten().filter(|e| e.path().join("project.json").is_file()).collect();
    if entries.is_empty() {
        return left;
    }
    if fs::create_dir_all(target).is_err() {
        return entries.iter().map(|e| e.file_name().to_string_lossy().to_string()).collect();
    }
    for e in entries {
        let name = e.file_name();
        if fs::rename(e.path(), target.join(&name)).is_err() {
            left.push(name.to_string_lossy().to_string());
        }
    }
    left
}

// ---- export and import (the template business, DECISIONS 71) ---------------------------

/// Writes `<Name>.identity.zip`: manifest.json, identity.json (no id, no
/// folder, no key, the logo as a relative path) and the Identity's files.
pub fn export(config_dir: &Path, ident: &Value, product: &str, out: &Path) -> Result<(), String> {
    let dir = dir_of(config_dir, &id_of(ident)?)?;
    let mut clean = ident.clone();
    if let Some(o) = clean.as_object_mut() {
        for f in ["id", "folder", "createdAt"] {
            o.remove(f);
        }
    }
    if let Some(name) = ident.pointer("/brand/logo").and_then(Value::as_str).and_then(|l| Path::new(l).file_name()) {
        clean["brand"]["logo"] = json!(format!("brand/{}", name.to_string_lossy()));
    }
    let manifest = json!({ "format": EXPORT_FORMAT, "version": EXPORT_VERSION, "product": product, "exportedAt": now_iso() });

    let file = fs::File::create(out).map_err(|e| format!("Could not create {}: {e}", out.display()))?;
    let mut zip = zip::ZipWriter::new(file);
    let opts = zip::write::SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);
    let mut put = |name: &str, bytes: &[u8]| -> Result<(), String> {
        zip.start_file(name, opts).map_err(|e| e.to_string())?;
        zip.write_all(bytes).map_err(|e| e.to_string())
    };
    put("manifest.json", &serde_json::to_vec_pretty(&manifest).unwrap())?;
    put(FILE, &serde_json::to_vec_pretty(&clean).unwrap())?;
    for (rel, path) in asset_files(&dir) {
        let bytes = fs::read(&path).map_err(|e| format!("Could not read {}: {e}", path.display()))?;
        put(&rel, &bytes)?;
    }
    zip.finish().map_err(|e| format!("Could not finish the export: {e}"))?;
    Ok(())
}

/// The Identity's own files as (zip path with '/', disk path), sorted.
fn asset_files(dir: &Path) -> Vec<(String, PathBuf)> {
    fn walk(base: &Path, d: &Path, out: &mut Vec<(String, PathBuf)>) {
        let Ok(entries) = fs::read_dir(d) else { return };
        for e in entries.flatten() {
            let p = e.path();
            if p.is_dir() {
                walk(base, &p, out);
            } else if allowed_asset(&p) && p.strip_prefix(base).map(|r| r != Path::new(FILE)).unwrap_or(false) {
                let rel = p.strip_prefix(base).unwrap().components().map(|c| c.as_os_str().to_string_lossy()).collect::<Vec<_>>().join("/");
                out.push((rel, p));
            }
        }
    }
    let mut out = Vec::new();
    walk(dir, dir, &mut out);
    out.sort();
    out
}

/// A safe relative path inside the zip: plain names, at most two levels, a
/// known file type. Everything else is refused (no "..", no absolute path).
fn safe_entry(name: &str) -> Option<PathBuf> {
    if name.contains('\\') || name.starts_with('/') {
        return None;
    }
    let parts: Vec<&str> = name.split('/').collect();
    if parts.len() > 3 || parts.iter().any(|p| p.is_empty() || *p == "." || *p == ".." || p.contains(':')) {
        return None;
    }
    let ok_chars = |p: &str| p.chars().all(|c| c.is_alphanumeric() || matches!(c, '.' | '_' | '-' | ' '));
    if !parts.iter().all(|p| ok_chars(p)) {
        return None;
    }
    let path: PathBuf = parts.iter().collect();
    allowed_asset(&path).then_some(path)
}

/// Reads an export: checks the manifest and every entry, returns the
/// identity.json (still to be validated by the schema) and the files.
pub fn read_export(zip_path: &Path) -> Result<(Value, Vec<(PathBuf, Vec<u8>)>), String> {
    let bad = |why: &str| format!("This is not an Identity file the app can import: {why}.");
    let file = fs::File::open(zip_path).map_err(|e| format!("Could not open the file: {e}"))?;
    let mut zip = zip::ZipArchive::new(file).map_err(|_| bad("not a zip file"))?;
    if zip.len() > EXPORT_MAX_FILES {
        return Err(bad("too many files"));
    }
    let (mut manifest, mut ident, mut files, mut total) = (None, None, Vec::new(), 0u64);
    for i in 0..zip.len() {
        let mut entry = zip.by_index(i).map_err(|_| bad("a damaged entry"))?;
        if entry.is_dir() {
            continue;
        }
        let name = entry.name().to_string();
        if entry.size() > EXPORT_MAX_FILE {
            return Err(bad(&format!("{name} is too large")));
        }
        total += entry.size();
        if total > EXPORT_MAX_TOTAL {
            return Err(bad("too large in total"));
        }
        let mut bytes = Vec::new();
        entry.by_ref().take(EXPORT_MAX_FILE + 1).read_to_end(&mut bytes).map_err(|_| bad("a damaged entry"))?;
        if bytes.len() as u64 > EXPORT_MAX_FILE {
            return Err(bad(&format!("{name} is too large")));
        }
        match name.as_str() {
            "manifest.json" => manifest = serde_json::from_slice::<Value>(&bytes).ok(),
            FILE => ident = Some(serde_json::from_slice::<Value>(&bytes).map_err(|_| bad("identity.json is damaged"))?),
            _ => files.push((safe_entry(&name).ok_or_else(|| bad(&format!("unexpected file {name}")))?, bytes)),
        }
    }
    let manifest = manifest.ok_or_else(|| bad("no manifest"))?;
    if manifest.get("format").and_then(Value::as_str) != Some(EXPORT_FORMAT) {
        return Err(bad("unknown format"));
    }
    if manifest.get("version").and_then(Value::as_u64).map_or(true, |v| v > EXPORT_VERSION) {
        return Err(bad("made by a newer version of the app"));
    }
    let ident = ident.ok_or_else(|| bad("no identity.json"))?;
    if !ident.is_object() {
        return Err(bad("identity.json is not an object"));
    }
    Ok((ident, files))
}

/// Makes a new Identity from a read export: new id and folder, a free name
/// ("VoxFlow 2"), the files in its folder, the logo path made absolute.
pub fn import(config_dir: &Path, mut ident: Value, files: Vec<(PathBuf, Vec<u8>)>, all: &[Value]) -> Result<Value, String> {
    let names: Vec<String> = all.iter().map(|v| str_of(v, "name").to_string()).collect();
    let wanted = str_of(&ident, "name").trim().to_string();
    let name = unique(if wanted.is_empty() { FIRST_NAME } else { &wanted }, &names, " ");
    ident["name"] = json!(name);
    let mut ident = complete_new(ident, all)?;
    let dir = dir_of(config_dir, &id_of(&ident)?)?;
    for (rel, bytes) in files {
        let p = dir.join(&rel);
        if let Some(parent) = p.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        fs::write(&p, bytes).map_err(|e| format!("Could not write {}: {e}", p.display()))?;
    }
    match ident.pointer("/brand/logo").and_then(Value::as_str).and_then(safe_entry) {
        Some(rel) if dir.join(&rel).is_file() => ident["brand"]["logo"] = json!(dir.join(rel).to_string_lossy()),
        _ => {
            if ident.pointer("/brand/logo").is_some() {
                ident["brand"]["logo"] = Value::Null;
            }
        }
    }
    Ok(ident)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tmpdir(name: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("itv-ident-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&d);
        fs::create_dir_all(&d).unwrap();
        d
    }

    #[test]
    fn ids_are_ascii_unique_and_checked() {
        assert_eq!(make_id("Zoltán Gerő", &[]), "zoltan-gero");
        assert_eq!(make_id("VoxFlow", &["voxflow".into()]), "voxflow-2");
        assert_eq!(make_id("!!!", &[]), "identity");
        assert_eq!(make_id("  Árvíztűrő tükörfúrógép  ", &[]), "arvizturo-tukorfurogep");
        assert!(make_id(&"x".repeat(200), &[]).len() <= 50);
        assert!(check_id("zoltan-gero").is_ok());
        for bad in ["", "../x", "Zoltan", "-x", "a b", "a/b", "a.b"] {
            assert!(check_id(bad).is_err(), "{bad}");
        }
    }

    #[test]
    fn folders_are_readable_and_safe() {
        assert_eq!(make_folder("Zoltán Gerő", &[]), "Zoltán Gerő");
        assert_eq!(make_folder("a/b:c*?", &[]), "abc");
        assert_eq!(make_folder("VoxFlow", &["voxflow".into()]), "VoxFlow 2");
        assert_eq!(make_folder("CON", &[]), "CON_");
        assert_eq!(make_folder("...", &[]), "Identity");
        assert_eq!(make_folder("name.  ", &[]), "name");
    }

    #[test]
    fn iso_dates() {
        assert_eq!(iso_from_unix(0), "1970-01-01T00:00:00Z");
        assert_eq!(iso_from_unix(1_790_000_000), "2026-09-21T14:13:20Z");
    }

    #[test]
    fn owner_comes_from_the_folder_under_the_projects_root() {
        let all = vec![json!({"id": "a", "folder": "Zoltan Gero"}), json!({"id": "b", "folder": "VoxFlow"})];
        let root = Path::new("/p");
        assert_eq!(owner_of(&root.join("VoxFlow").join("2026-10-01_x"), root, &all).as_deref(), Some("b"));
        assert_eq!(owner_of(&root.join("zoltan gero"), root, &all).as_deref(), Some("a"));
        assert_eq!(owner_of(&root.join("Other").join("x"), root, &all), None);
        assert_eq!(owner_of(Path::new("/elsewhere/VoxFlow"), root, &all), None);
    }

    #[test]
    fn migration_makes_the_first_identity_and_moves_logo_and_videos() {
        let base = tmpdir("migrate");
        let (cfg_dir, brand, projects) = (base.join("cfg"), base.join("data").join("brand"), base.join("projects"));
        fs::create_dir_all(&brand).unwrap();
        fs::write(brand.join("logo.png"), b"png").unwrap();
        fs::create_dir_all(projects.join("2026-09-30_first")).unwrap();
        fs::write(projects.join("2026-09-30_first").join("project.json"), b"{}").unwrap();
        fs::create_dir_all(projects.join("not-a-video")).unwrap();
        let v1 = json!({
            "schema": 1, "onboarded": true, "ui": {"language": "en"},
            "llm": {"provider": "gemini", "model": "gemini-3.5-flash"},
            "brand": {"preset": "coral", "logo": brand.join("logo.png").to_string_lossy()},
            "channel": {"audience": "founders", "youtubeUrl": "https://youtube.com/@x"},
            "narrator": {"provider": "gemini", "voice": "Kore"},
            "avatar": {"enabled": false}, "research": {"vidiq": true},
            "defaults": {"scriptTemplate": "ownership", "autopilot": true, "targetLengthMin": 6},
            "projectsDir": projects.to_string_lossy()
        });
        config::write_atomic(&cfg_dir.join(config::FILE_NAME), &serde_json::to_vec(&v1).unwrap()).unwrap();
        let root_of = |app: &Value| app.get("projectsDir").and_then(Value::as_str).map(PathBuf::from);

        let notice = migrate_v1(&cfg_dir, &brand, root_of).unwrap();
        assert_eq!(notice, None);
        let app = config::load(&cfg_dir.join(config::FILE_NAME)).unwrap().unwrap();
        assert_eq!(app["schema"], 2);
        assert_eq!(app["activeIdentity"], "my-identity");
        assert_eq!(app["defaults"]["autopilot"], true);
        assert!(app.get("channel").is_none());
        let ident = load(&cfg_dir, "my-identity").unwrap();
        assert_eq!(ident["name"], FIRST_NAME);
        assert_eq!(ident["folder"], FIRST_NAME);
        assert_eq!(ident["channel"]["audience"], "founders");
        assert_eq!(ident["research"]["vidiq"], true);
        assert_eq!(ident["defaults"], json!({"scriptTemplate": "ownership", "targetLengthMin": 6}));
        let logo = PathBuf::from(ident["brand"]["logo"].as_str().unwrap());
        assert!(logo.starts_with(cfg_dir.join(DIR).join("my-identity")) && logo.exists());
        assert!(projects.join(FIRST_NAME).join("2026-09-30_first").join("project.json").exists());
        assert!(projects.join("not-a-video").exists(), "only ONE Video folders move");
        // second run: already schema 2, nothing happens
        assert_eq!(migrate_v1(&cfg_dir, &brand, root_of).unwrap(), None);
        assert_eq!(list(&cfg_dir).len(), 1);
        fs::remove_dir_all(&base).unwrap();
    }

    #[test]
    fn duplicate_copies_settings_and_files_but_not_videos() {
        let base = tmpdir("dup");
        let src = complete_new(json!({"name": "VoxFlow", "channel": {}, "narrator": {"provider": "gemini"}}), &[]).unwrap();
        let d = dir_of(&base, "voxflow").unwrap();
        fs::create_dir_all(d.join("brand")).unwrap();
        fs::write(d.join("brand").join("logo.png"), b"png").unwrap();
        let mut src = src;
        src["brand"] = json!({"logo": d.join("brand").join("logo.png").to_string_lossy()});
        save(&base, &src).unwrap();
        let copy = duplicate(&base, &src, "VoxFlow HU", &list(&base)).unwrap();
        assert_eq!(copy["id"], "voxflow-hu");
        assert_eq!(copy["folder"], "VoxFlow HU");
        let logo = copy["brand"]["logo"].as_str().unwrap();
        assert!(logo.contains("voxflow-hu") && Path::new(logo).exists());
        assert_eq!(list(&base).len(), 2);
        remove(&base, "voxflow-hu").unwrap();
        assert_eq!(list(&base).len(), 1);
        fs::remove_dir_all(&base).unwrap();
    }

    #[test]
    fn folder_rename_follows_the_name_unless_busy() {
        let base = tmpdir("rename");
        fs::create_dir_all(base.join("Old").join("2026-10-01_x")).unwrap();
        let all = vec![json!({"id": "a", "folder": "Old"}), json!({"id": "b", "folder": "Taken"})];
        let (f, note) = rename_folder(&base, "Old", "Old", &all, false);
        assert_eq!((f.as_str(), note), ("Old", None));
        let (f, note) = rename_folder(&base, "Old", "New", &all, true);
        assert_eq!(f, "Old");
        assert!(note.unwrap().contains("job runs"));
        let (f, note) = rename_folder(&base, "Old", "Taken", &all, false);
        assert_eq!((f.as_str(), note), ("Taken 2", None));
        assert!(base.join("Taken 2").join("2026-10-01_x").exists());
        fs::remove_dir_all(&base).unwrap();
    }

    #[test]
    fn export_and_import_roundtrip_without_ids_or_keys() {
        let base = tmpdir("export");
        let mut src = complete_new(json!({"name": "VoxFlow", "channel": {"audience": "a"}, "narrator": {"provider": "gemini"}, "llm": {"provider": "claude", "model": "claude-sonnet-5"}}), &[]).unwrap();
        let d = dir_of(&base, "voxflow").unwrap();
        fs::create_dir_all(d.join("brand")).unwrap();
        fs::write(d.join("brand").join("logo.png"), b"png").unwrap();
        fs::write(d.join("brand").join("evil.exe"), b"mz").unwrap();
        src["brand"] = json!({"logo": d.join("brand").join("logo.png").to_string_lossy()});
        save(&base, &src).unwrap();
        let out = base.join("VoxFlow.identity.zip");
        export(&base, &src, "IdeaToVideo", &out).unwrap();

        let (ident, files) = read_export(&out).unwrap();
        assert!(ident.get("id").is_none() && ident.get("folder").is_none());
        assert_eq!(ident["brand"]["logo"], "brand/logo.png");
        assert_eq!(ident["llm"]["provider"], "claude");
        assert_eq!(files.len(), 1, "only known file types travel");
        let new = import(&base, ident, files, &list(&base)).unwrap();
        assert_eq!(new["name"], "VoxFlow 2");
        assert_eq!(new["id"], "voxflow-2");
        let logo = new["brand"]["logo"].as_str().unwrap();
        assert!(Path::new(logo).exists() && logo.contains("voxflow-2"));
        fs::remove_dir_all(&base).unwrap();
    }

    // The Brand wizard's results travel with the Identity (docs/wizards/brand.md 3).
    #[test]
    fn export_carries_the_brand_card_frame_dark_logo_and_dictionary() {
        let base = tmpdir("brandexport");
        let src = complete_new(json!({"name": "Anna", "channel": {}, "narrator": {"provider": "gemini"}}), &[]).unwrap();
        let d = dir_of(&base, "anna").unwrap();
        fs::create_dir_all(d.join("brand")).unwrap();
        for f in ["brand-identity-card.json", "FRAME.md", "logo-dark.svg"] {
            fs::write(d.join("brand").join(f), b"x").unwrap();
        }
        fs::write(d.join("dictionary.json"), b"{}").unwrap();
        save(&base, &src).unwrap();
        let out = base.join("Anna.identity.zip");
        export(&base, &src, "IdeaToVideo", &out).unwrap();
        let (ident, files) = read_export(&out).unwrap();
        let mut names: Vec<String> = files.iter().map(|(p, _)| p.to_string_lossy().replace('\\', "/")).collect();
        names.sort();
        assert_eq!(names, ["brand/FRAME.md", "brand/brand-identity-card.json", "brand/logo-dark.svg", "dictionary.json"]);
        let new = import(&base, ident, files, &list(&base)).unwrap();
        let nd = dir_of(&base, new["id"].as_str().unwrap()).unwrap();
        assert!(nd.join("brand").join("brand-identity-card.json").exists() && nd.join("dictionary.json").exists());
        let copy = duplicate(&base, &src, "Anna Copy", &list(&base)).unwrap();
        let cd = dir_of(&base, copy["id"].as_str().unwrap()).unwrap();
        assert!(cd.join("brand").join("FRAME.md").exists() && cd.join("dictionary.json").exists());
        fs::remove_dir_all(&base).unwrap();
    }

    #[test]
    fn import_refuses_unsafe_or_foreign_files() {
        let base = tmpdir("import");
        let make = |entries: &[(&str, &[u8])]| {
            let p = base.join(format!("t{}.zip", entries.len() + entries.iter().map(|e| e.0.len()).sum::<usize>()));
            let mut z = zip::ZipWriter::new(fs::File::create(&p).unwrap());
            for (n, b) in entries {
                z.start_file(*n, zip::write::SimpleFileOptions::default()).unwrap();
                z.write_all(b).unwrap();
            }
            z.finish().unwrap();
            p
        };
        let manifest = br#"{"format":"ideatovideo-identity","version":1}"#;
        let ident = br#"{"name":"X","channel":{},"narrator":{"provider":"gemini"}}"#;
        assert!(read_export(&make(&[("manifest.json", manifest), ("identity.json", ident)])).is_ok());
        for evil in ["../evil.png", "/abs.png", "brand/../../x.png", "brand/run.exe", "a/b/c/d.png", "C:x.png"] {
            let e = read_export(&make(&[("manifest.json", manifest), ("identity.json", ident), (evil, b"x")])).unwrap_err();
            assert!(e.contains("unexpected file"), "{evil}: {e}");
        }
        assert!(read_export(&make(&[("identity.json", ident)])).unwrap_err().contains("no manifest"));
        let newer = br#"{"format":"ideatovideo-identity","version":99}"#;
        assert!(read_export(&make(&[("manifest.json", newer), ("identity.json", ident)])).unwrap_err().contains("newer"));
        fs::write(base.join("plain.zip"), b"not a zip").unwrap();
        assert!(read_export(&base.join("plain.zip")).unwrap_err().contains("not a zip"));
        fs::remove_dir_all(&base).unwrap();
    }
}
