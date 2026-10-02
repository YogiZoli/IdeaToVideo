// brand.rs: the Brand Identity Card as a file of its own (docs/wizards/brand.md
// 12): "Export Brand Identity Card" writes <Name>.brand.zip (manifest, the
// card, its FRAME.md, the logos); "Import Brand Identity Card" reads such a
// zip or a bare card .json. The card itself is validated by the runner
// (brand-save) before it is used. And the wizard's "Import tokens.css": the
// text of a design system's tokens file, read here so the UI never touches
// the disk.

use std::fs;
use std::io::{Read, Write};
use std::path::Path;

use serde_json::{json, Value};

pub const CARD_FILE: &str = "brand-identity-card.json";
pub const FRAME_FILE: &str = "FRAME.md";
const FORMAT: &str = "ideatovideo-brand-card";
const VERSION: u64 = 1;
const CARD_SCHEMA: &str = "brand-identity-card/1";
const MAX_FILE: u64 = 5 * 1024 * 1024;
const MAX_TOTAL: u64 = 12 * 1024 * 1024;
const MAX_TOKENS: u64 = 1024 * 1024;
const LOGO_EXTS: &[&str] = &["png", "jpg", "jpeg", "svg", "webp"];

/// "logo.png", "logo-dark.svg"...: the only logo names a card may use.
pub fn logo_name_ok(name: &str) -> bool {
    let Some((stem, ext)) = name.rsplit_once('.') else { return false };
    (stem == "logo" || stem == "logo-dark") && LOGO_EXTS.contains(&ext)
}

fn is_card(v: &Value) -> bool {
    v.get("schema").and_then(Value::as_str) == Some(CARD_SCHEMA) && v.get("colors").is_some_and(Value::is_object)
}

pub fn export(brand_dir: &Path, product: &str, out: &Path) -> Result<(), String> {
    let card_path = brand_dir.join(CARD_FILE);
    if !card_path.is_file() {
        return Err("Save your look first: there is no Brand Identity Card yet.".into());
    }
    let manifest = json!({ "format": FORMAT, "version": VERSION, "product": product, "exportedAt": crate::identity::now_iso() });
    let file = fs::File::create(out).map_err(|e| format!("Could not create {}: {e}", out.display()))?;
    let mut zip = zip::ZipWriter::new(file);
    let opts = zip::write::SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);
    let mut put = |name: &str, bytes: &[u8]| -> Result<(), String> {
        zip.start_file(name, opts).map_err(|e| e.to_string())?;
        zip.write_all(bytes).map_err(|e| e.to_string())
    };
    put("manifest.json", &serde_json::to_vec_pretty(&manifest).unwrap())?;
    put(CARD_FILE, &fs::read(&card_path).map_err(|e| e.to_string())?)?;
    if let Ok(frame) = fs::read(brand_dir.join(FRAME_FILE)) {
        put(FRAME_FILE, &frame)?;
    }
    let mut logos: Vec<_> = fs::read_dir(brand_dir).map_err(|e| e.to_string())?.flatten().map(|e| e.file_name().to_string_lossy().to_string()).filter(|n| logo_name_ok(n)).collect();
    logos.sort();
    for name in logos {
        put(&name, &fs::read(brand_dir.join(&name)).map_err(|e| e.to_string())?)?;
    }
    zip.finish().map_err(|e| format!("Could not finish the export: {e}"))?;
    Ok(())
}

/// A card from a .brand.zip or a .json: the card (not yet schema-checked)
/// and the logos in it, by their checked names.
pub fn read(path: &Path) -> Result<(Value, Vec<(String, Vec<u8>)>), String> {
    let bad = |why: &str| format!("This is not a Brand Identity Card the app can import: {why}.");
    let ext = path.extension().and_then(|e| e.to_str()).map(|e| e.to_ascii_lowercase()).unwrap_or_default();
    if ext == "json" {
        let size = fs::metadata(path).map_err(|e| format!("Could not open the file: {e}"))?.len();
        if size > MAX_FILE {
            return Err(bad("the file is too large"));
        }
        let v: Value = serde_json::from_slice(&fs::read(path).map_err(|e| e.to_string())?).map_err(|_| bad("not JSON"))?;
        return if is_card(&v) { Ok((v, Vec::new())) } else { Err(bad("no brand-identity-card/1 in it")) };
    }
    let file = fs::File::open(path).map_err(|e| format!("Could not open the file: {e}"))?;
    let mut zip = zip::ZipArchive::new(file).map_err(|_| bad("not a zip or .json file"))?;
    if zip.len() > 10 {
        return Err(bad("too many files"));
    }
    let (mut manifest, mut card, mut logos, mut total) = (None, None, Vec::new(), 0u64);
    for i in 0..zip.len() {
        let mut entry = zip.by_index(i).map_err(|_| bad("a damaged entry"))?;
        if entry.is_dir() {
            continue;
        }
        let name = entry.name().to_string();
        total += entry.size();
        if entry.size() > MAX_FILE || total > MAX_TOTAL {
            return Err(bad("too large"));
        }
        let mut bytes = Vec::new();
        entry.by_ref().take(MAX_FILE + 1).read_to_end(&mut bytes).map_err(|_| bad("a damaged entry"))?;
        match name.as_str() {
            "manifest.json" => manifest = serde_json::from_slice::<Value>(&bytes).ok(),
            CARD_FILE => card = Some(serde_json::from_slice::<Value>(&bytes).map_err(|_| bad("the card is damaged"))?),
            FRAME_FILE => {} // generated again from the card on save
            n if logo_name_ok(n) => logos.push((n.to_string(), bytes)),
            n => return Err(bad(&format!("unexpected file {n}"))),
        }
    }
    let manifest = manifest.ok_or_else(|| bad("no manifest"))?;
    if manifest.get("format").and_then(Value::as_str) != Some(FORMAT) {
        return Err(bad("unknown format"));
    }
    if manifest.get("version").and_then(Value::as_u64).map_or(true, |v| v > VERSION) {
        return Err(bad("made by a newer version of the app"));
    }
    let card = card.ok_or_else(|| bad("no card in it"))?;
    if !is_card(&card) {
        return Err(bad("no brand-identity-card/1 in it"));
    }
    Ok((card, logos))
}

/// Puts imported logos in the Identity's brand folder: one file per variant,
/// so an older logo of the same variant in another format goes.
pub fn write_logos(brand_dir: &Path, logos: &[(String, Vec<u8>)]) -> Result<(), String> {
    fs::create_dir_all(brand_dir).map_err(|e| e.to_string())?;
    for (name, bytes) in logos {
        let stem = name.rsplit_once('.').map(|(s, _)| s).unwrap_or("logo");
        for ext in LOGO_EXTS {
            let _ = fs::remove_file(brand_dir.join(format!("{stem}.{ext}")));
        }
        fs::write(brand_dir.join(name), bytes).map_err(|e| format!("Could not write the logo: {e}"))?;
    }
    Ok(())
}

/// The text of a tokens.css the user picked ("Import tokens.css").
pub fn read_tokens(path: &Path) -> Result<String, String> {
    let ext = path.extension().and_then(|e| e.to_str()).map(|e| e.to_ascii_lowercase()).unwrap_or_default();
    if ext != "css" {
        return Err("Choose a .css file with design tokens (for example tokens.css).".into());
    }
    let size = fs::metadata(path).map_err(|e| format!("Could not open the file: {e}"))?.len();
    if size > MAX_TOKENS {
        return Err("The tokens file is larger than 1 MB.".into());
    }
    String::from_utf8(fs::read(path).map_err(|e| e.to_string())?).map_err(|_| "The tokens file is not UTF-8 text.".into())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn tmpdir(name: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("itv-brand-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&d);
        fs::create_dir_all(&d).unwrap();
        d
    }

    const CARD: &[u8] = br##"{"schema":"brand-identity-card/1","colors":{"background":"#ffffff"},"fonts":{},"shape":{}}"##;

    #[test]
    fn export_and_read_roundtrip_with_logos() {
        let d = tmpdir("roundtrip");
        let brand = d.join("brand");
        fs::create_dir_all(&brand).unwrap();
        assert!(export(&brand, "IdeaToVideo", &d.join("x.zip")).unwrap_err().contains("Save your look first"));
        fs::write(brand.join(CARD_FILE), CARD).unwrap();
        fs::write(brand.join(FRAME_FILE), b"---").unwrap();
        fs::write(brand.join("logo.png"), b"png").unwrap();
        fs::write(brand.join("logo-dark.svg"), b"<svg/>").unwrap();
        fs::write(brand.join("notes.txt"), b"not a logo").unwrap();
        export(&brand, "IdeaToVideo", &d.join("Anna.brand.zip")).unwrap();
        let (card, logos) = read(&d.join("Anna.brand.zip")).unwrap();
        assert_eq!(card["schema"], CARD_SCHEMA);
        let names: Vec<_> = logos.iter().map(|(n, _)| n.as_str()).collect();
        assert_eq!(names, ["logo-dark.svg", "logo.png"]);
        // a bare card json works too
        fs::write(d.join("card.json"), CARD).unwrap();
        assert!(read(&d.join("card.json")).unwrap().1.is_empty());
        // logos replace the same variant in another format
        let target = d.join("other");
        fs::create_dir_all(&target).unwrap();
        fs::write(target.join("logo.webp"), b"old").unwrap();
        write_logos(&target, &logos).unwrap();
        assert!(!target.join("logo.webp").exists() && target.join("logo.png").exists() && target.join("logo-dark.svg").exists());
        fs::remove_dir_all(&d).unwrap();
    }

    #[test]
    fn read_refuses_foreign_or_unsafe_content() {
        let d = tmpdir("refuse");
        let make = |name: &str, entries: &[(&str, &[u8])]| {
            let p = d.join(name);
            let mut z = zip::ZipWriter::new(fs::File::create(&p).unwrap());
            for (n, b) in entries {
                z.start_file(*n, zip::write::SimpleFileOptions::default()).unwrap();
                z.write_all(b).unwrap();
            }
            z.finish().unwrap();
            p
        };
        let manifest: &[u8] = br#"{"format":"ideatovideo-brand-card","version":1}"#;
        assert!(read(&make("ok.zip", &[("manifest.json", manifest), (CARD_FILE, CARD)])).is_ok());
        for evil in ["../logo.png", "brand/logo.png", "logo.exe", "run.js", "logo-light.png"] {
            let e = read(&make("evil.zip", &[("manifest.json", manifest), (CARD_FILE, CARD), (evil, b"x")])).unwrap_err();
            assert!(e.contains("unexpected file"), "{evil}: {e}");
        }
        assert!(read(&make("nocard.zip", &[("manifest.json", manifest)])).unwrap_err().contains("no card"));
        assert!(read(&make("newer.zip", &[("manifest.json", br#"{"format":"ideatovideo-brand-card","version":9}"#), (CARD_FILE, CARD)])).unwrap_err().contains("newer"));
        fs::write(d.join("other.json"), br#"{"schema":"video-brief-card/1"}"#).unwrap();
        assert!(read(&d.join("other.json")).unwrap_err().contains("no brand-identity-card/1"));
        fs::remove_dir_all(&d).unwrap();
    }

    #[test]
    fn tokens_files_are_css_text_and_small() {
        let d = tmpdir("tokens");
        fs::write(d.join("tokens.css"), ":root { --bg: #fff; }").unwrap();
        assert!(read_tokens(&d.join("tokens.css")).unwrap().contains("--bg"));
        fs::write(d.join("tokens.txt"), "x").unwrap();
        assert!(read_tokens(&d.join("tokens.txt")).is_err());
        fs::write(d.join("big.css"), vec![b'a'; 1024 * 1024 + 1]).unwrap();
        assert!(read_tokens(&d.join("big.css")).unwrap_err().contains("1 MB"));
        fs::remove_dir_all(&d).unwrap();
    }
}
