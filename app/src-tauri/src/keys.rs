// keys.rs: API keys live only in the OS keychain (SPEC 4.2): Windows Credential
// Manager, macOS Keychain. Service name `ideatovideo.<provider>` (the app was
// called Studio before; `migrate_legacy` moves `studio.<provider>` entries). The UI can set,
// delete and ask "is it set?", it never gets a key back. The only reader is
// runner.rs, which hands the key to the sidecar in an env var.

use std::collections::BTreeMap;

/// Every key name the app knows: the 6 LLM providers (SPEC 5) and the services.
pub const ALLOWED: &[&str] = &[
    "gemini",
    "openrouter",
    "claude",
    "openai",
    "deepseek",
    "grok",
    "elevenlabs",
    "heygen",
    "vidiq",
];

const ACCOUNT: &str = "default";
pub const PREFIX: &str = "ideatovideo";
const LEGACY_PREFIX: &str = "studio";

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

fn entry(name: &str) -> Result<keyring::Entry, String> {
    check_name(name)?;
    keyring::Entry::new(&service_name(name), ACCOUNT).map_err(|e| format!("Keychain error: {e}"))
}

pub fn set(name: &str, value: &str) -> Result<(), String> {
    let v = clean_value(value)?;
    entry(name)?
        .set_password(&v)
        .map_err(|e| format!("Could not save the key in the system keychain: {e}"))
}

/// Internal only: never exposed as a Tauri command.
pub fn get(name: &str) -> Result<Option<String>, String> {
    match entry(name)?.get_password() {
        Ok(v) => Ok(Some(v)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(format!("Could not read the system keychain: {e}")),
    }
}

pub fn delete(name: &str) -> Result<(), String> {
    match entry(name)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(format!("Could not delete the key: {e}")),
    }
}

/// Moves keys saved under the old app name to the new one, then removes the old
/// entry. A key already saved under the new name wins. Returns how many moved.
pub fn migrate_legacy() -> usize {
    let mut moved = 0;
    for n in ALLOWED {
        let Ok(old) = keyring::Entry::new(&format!("{LEGACY_PREFIX}.{n}"), ACCOUNT) else { continue };
        let Ok(value) = old.get_password() else { continue };
        if !matches!(get(n), Ok(Some(_))) && set(n, &value).is_ok() {
            moved += 1;
        }
        let _ = old.delete_credential();
    }
    moved
}

/// Settings "Remove all keys": deletes every key this app can store.
pub fn delete_all() -> Result<(), String> {
    for n in ALLOWED {
        delete(n)?;
    }
    Ok(())
}

/// name -> is a key stored. Only booleans leave this module.
pub fn status() -> BTreeMap<String, bool> {
    ALLOWED
        .iter()
        .map(|n| (n.to_string(), matches!(get(n), Ok(Some(_)))))
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
        assert!(entry("../evil").is_err());
    }

    #[test]
    fn service_names() {
        assert_eq!(service_name("gemini"), "ideatovideo.gemini");
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
