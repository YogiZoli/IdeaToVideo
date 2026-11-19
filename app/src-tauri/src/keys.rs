// keys.rs: API keys live only in the OS keychain (SPEC 4.2): Windows Credential
// Manager, macOS Keychain. Service name `ideatovideo.<provider>` (the app was
// called Studio before; `migrate_legacy` moves `studio.<provider>` entries).
// Two levels (DECISIONS 67, docs/identity.md 4): the App key under the
// account `default`, and an Identity's own key under `identity-<id>`. An
// Identity uses its own key when it has one, else the App key. The UI can
// set, delete and ask "is it set, and where?", it never gets a key back. The
// only reader is runner.rs, which hands the key to the sidecar in an env var.

use std::collections::BTreeMap;

use serde_json::{json, Value};

/// Every key name the app knows: the 6 LLM providers (SPEC 5) and the services.
pub const ALLOWED: &[&str] = &[
    "gemini",
    "openrouter",
    "claude",
    "openai",
    "deepseek",
    "grok",
    "elevenlabs",
    "googlecloud",
    "azure",
    "heygen",
    "kie",
    "vidiq",
    "pixabay",
    "unsplash",
    "publishing",
];

const APP_ACCOUNT: &str = "default";
pub const PREFIX: &str = "ideatovideo";
const LEGACY_PREFIX: &str = "studio";

/// Which level a key is saved on or read from.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Scope<'a> {
    App,
    Identity(&'a str),
}

pub fn check_name(name: &str) -> Result<(), String> {
    if ALLOWED.contains(&name) {
        Ok(())
    } else {
        Err(format!("Unknown key name: {name}"))
    }
}

pub fn service_name(name: &str) -> String {
    format!("{PREFIX}.{name}")
}

pub fn account(scope: Scope) -> Result<String, String> {
    match scope {
        Scope::App => Ok(APP_ACCOUNT.into()),
        Scope::Identity(id) => {
            crate::identity::check_id(id)?;
            Ok(format!("identity-{id}"))
        }
    }
}

/// A pasted key: trimmed, no inner whitespace or control characters, sane length.
/// The error message never contains the value.
pub fn clean_value(value: &str) -> Result<String, String> {
    let v = value.trim();
    if v.is_empty() {
        return Err("The key is empty.".into());
    }
    if v.len() > 500 {
        return Err("This does not look like an API key (too long).".into());
    }
    if v.chars().any(|c| c.is_whitespace() || c.is_control()) {
        return Err("The key contains spaces or line breaks. Copy it again.".into());
    }
    Ok(v.to_string())
}

fn entry(name: &str, scope: Scope) -> Result<keyring::Entry, String> {
    check_name(name)?;
    keyring::Entry::new(&service_name(name), &account(scope)?).map_err(|e| format!("Keychain error: {e}"))
}

pub fn set(name: &str, value: &str, scope: Scope) -> Result<(), String> {
    let v = clean_value(value)?;
    entry(name, scope)?
        .set_password(&v)
        .map_err(|e| format!("Could not save the key in the system keychain: {e}"))
}

/// Internal only: never exposed as a Tauri command.
pub fn get(name: &str, scope: Scope) -> Result<Option<String>, String> {
    match entry(name, scope)?.get_password() {
        Ok(v) => Ok(Some(v)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(format!("Could not read the system keychain: {e}")),
    }
}

pub fn delete(name: &str, scope: Scope) -> Result<(), String> {
    match entry(name, scope)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(format!("Could not delete the key: {e}")),
    }
}

/// The key a job uses, and whose it is ("app" or the Identity id): the
/// Identity's own key first, then the App key. `app_only` skips the
/// Identity's key (the App settings page tests the App key).
/// The AI services, in the order the chain tries them after the configured one.
const AI_NAMES: &[&str] = &["gemini", "claude", "openrouter", "deepseek", "openai", "grok"];

/// Every other AI key a job of this owner can use, as JSON for the runner (the chain in
/// runner/providers/llm.mjs). A keychain that cannot be read here only means a shorter chain.
pub fn other_ai(primary: Option<&str>, identity: Option<&str>, app_only: bool) -> Option<String> {
    let list: Vec<serde_json::Value> = AI_NAMES
        .iter()
        .filter(|n| Some(**n) != primary)
        .filter_map(|n| resolve(n, identity, app_only).ok().flatten().map(|(k, _)| serde_json::json!({ "provider": n, "apiKey": k })))
        .collect();
    (!list.is_empty()).then(|| serde_json::Value::Array(list).to_string())
}

pub fn resolve(name: &str, identity: Option<&str>, app_only: bool) -> Result<Option<(String, String)>, String> {
    resolve_with(identity, app_only, |scope| get(name, scope))
}

fn resolve_with(
    identity: Option<&str>,
    app_only: bool,
    get: impl Fn(Scope) -> Result<Option<String>, String>,
) -> Result<Option<(String, String)>, String> {
    if let (Some(id), false) = (identity, app_only) {
        if let Some(v) = get(Scope::Identity(id))? {
            return Ok(Some((v, id.to_string())));
        }
    }
    Ok(get(Scope::App)?.map(|v| (v, "app".to_string())))
}

/// Moves keys saved under the old app name to the new one, then removes the old
/// entry. A key already saved under the new name wins. Returns how many moved.
pub fn migrate_legacy() -> usize {
    let mut moved = 0;
    for n in ALLOWED {
        let Ok(old) = keyring::Entry::new(&format!("{LEGACY_PREFIX}.{n}"), APP_ACCOUNT) else { continue };
        let Ok(value) = old.get_password() else { continue };
        if !matches!(get(n, Scope::App), Ok(Some(_))) && set(n, &value, Scope::App).is_ok() {
            moved += 1;
        }
        let _ = old.delete_credential();
    }
    moved
}

/// Settings, App, "Remove all keys": the App keys and every Identity's own.
pub fn delete_all(identity_ids: &[String]) -> Result<(), String> {
    for n in ALLOWED {
        delete(n, Scope::App)?;
        for id in identity_ids {
            delete(n, Scope::Identity(id))?;
        }
    }
    Ok(())
}

/// Removes an Identity's own keys (when the Identity is deleted).
pub fn delete_identity(id: &str) -> Result<(), String> {
    for n in ALLOWED {
        delete(n, Scope::Identity(id))?;
    }
    Ok(())
}

/// Duplicate: the Identity's own keys copied to the new one, inside the core.
pub fn copy_identity(from: &str, to: &str) -> Result<usize, String> {
    let mut copied = 0;
    for n in ALLOWED {
        if let Some(v) = get(n, Scope::Identity(from))? {
            set(n, &v, Scope::Identity(to))?;
            copied += 1;
        }
    }
    Ok(copied)
}

/// name -> { app: bool, identity: bool }: where a key is saved.
pub fn sources(identity: Option<&str>) -> BTreeMap<String, Value> {
    ALLOWED
        .iter()
        .map(|n| {
            let app = matches!(get(n, Scope::App), Ok(Some(_)));
            let own = identity.is_some_and(|id| matches!(get(n, Scope::Identity(id)), Ok(Some(_))));
            (n.to_string(), json!({ "app": app, "identity": own }))
        })
        .collect()
}

/// name -> can a job of this Identity use a key. Only booleans leave this module.
pub fn status_from(sources: &BTreeMap<String, Value>) -> BTreeMap<String, bool> {
    sources
        .iter()
        .map(|(n, v)| (n.clone(), v["app"] == true || v["identity"] == true))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_known_names() {
        for n in ALLOWED {
            assert!(check_name(n).is_ok());
        }
        assert!(check_name("github").is_err());
        assert!(check_name("studio.gemini").is_err());
        assert!(check_name("").is_err());
        assert!(entry("../evil", Scope::App).is_err());
        assert!(entry("gemini", Scope::Identity("../evil")).is_err());
    }

    #[test]
    fn service_names() {
        assert_eq!(service_name("gemini"), "ideatovideo.gemini");
    }

    #[test]
    fn accounts_keep_app_and_identity_apart() {
        assert_eq!(account(Scope::App).unwrap(), "default");
        assert_eq!(account(Scope::Identity("voxflow")).unwrap(), "identity-voxflow");
        assert!(account(Scope::Identity("Vox Flow")).is_err());
    }

    #[test]
    fn identity_key_first_then_app_key() {
        let both = |s: Scope| -> Result<Option<String>, String> {
            Ok(Some(if s == Scope::App { "A".into() } else { "I".into() }))
        };
        let app_only = |s: Scope| -> Result<Option<String>, String> { Ok((s == Scope::App).then(|| "A".to_string())) };
        let none = |_: Scope| -> Result<Option<String>, String> { Ok(None) };
        assert_eq!(resolve_with(Some("vox"), false, both).unwrap(), Some(("I".into(), "vox".into())));
        assert_eq!(resolve_with(Some("vox"), true, both).unwrap(), Some(("A".into(), "app".into())));
        assert_eq!(resolve_with(Some("vox"), false, app_only).unwrap(), Some(("A".into(), "app".into())));
        assert_eq!(resolve_with(None, false, both).unwrap(), Some(("A".into(), "app".into())));
        assert_eq!(resolve_with(Some("vox"), false, none).unwrap(), None);
    }

    #[test]
    fn status_is_true_when_either_level_has_a_key() {
        let mut s = BTreeMap::new();
        s.insert("gemini".to_string(), json!({"app": true, "identity": false}));
        s.insert("heygen".to_string(), json!({"app": false, "identity": true}));
        s.insert("vidiq".to_string(), json!({"app": false, "identity": false}));
        let st = status_from(&s);
        assert!(st["gemini"] && st["heygen"] && !st["vidiq"]);
    }

    #[test]
    fn values_are_cleaned_and_errors_never_echo_the_key() {
        assert_eq!(clean_value("  AIzaSyTEST123  \n").unwrap(), "AIzaSyTEST123");
        let e = clean_value("AIza SyTEST").unwrap_err();
        assert!(!e.contains("AIza"));
        assert!(clean_value("   ").is_err());
        assert!(clean_value(&"x".repeat(501)).is_err());
    }
}
