// edition.rs: the one place for the product name, the plan (Solo or Agency)
// and what the plan allows (DECISIONS 67, docs/identity.md 6). A white label
// edition changes this file; the signed licence file that sets the plan comes
// in phase 4. The plan is deliberately not in config.json, so editing a
// settings file cannot change it.

use serde_json::{json, Value};

pub const PRODUCT_NAME: &str = "IdeaToVideo";

// Solo is only reachable in debug builds until the licence file (phase 4).
#[cfg_attr(not(debug_assertions), allow(dead_code))]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Tier {
    /// One Identity.
    Solo,
    /// Unlimited Identities.
    Agency,
}

impl Tier {
    pub fn name(self) -> &'static str {
        match self {
            Tier::Solo => "Solo",
            Tier::Agency => "Agency",
        }
    }

    /// How many Identities the plan allows. None: unlimited.
    pub fn identity_limit(self) -> Option<usize> {
        match self {
            Tier::Solo => Some(1),
            Tier::Agency => None,
        }
    }

    /// The default of "Copy this Identity's own keys" on Duplicate (Zoltan,
    /// 2026-10-01: on for Agency; may change per plan later).
    pub fn copy_keys_on_duplicate(self) -> bool {
        match self {
            Tier::Solo => false,
            Tier::Agency => true,
        }
    }
}

/// No licence yet (phase 4): every install is Agency. Debug builds can try
/// the Solo plan with ITV_TIER=solo.
pub fn tier() -> Tier {
    #[cfg(debug_assertions)]
    if std::env::var("ITV_TIER").is_ok_and(|v| v.eq_ignore_ascii_case("solo")) {
        return Tier::Solo;
    }
    Tier::Agency
}

/// Refuses a new Identity (New, Duplicate, Import) beyond the plan's limit.
pub fn check_room(tier: Tier, existing: usize) -> Result<(), String> {
    match tier.identity_limit() {
        Some(n) if existing >= n => Err(format!(
            "The {} plan includes {n} Identity. The Agency plan includes unlimited Identities.",
            tier.name()
        )),
        _ => Ok(()),
    }
}

/// What the UI needs to know about the edition.
pub fn info(tier: Tier) -> Value {
    json!({
        "product": PRODUCT_NAME,
        "tier": tier.name(),
        "identityLimit": tier.identity_limit(),
        "copyKeysDefault": tier.copy_keys_on_duplicate(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn solo_allows_one_identity_agency_unlimited() {
        assert!(check_room(Tier::Solo, 0).is_ok());
        let e = check_room(Tier::Solo, 1).unwrap_err();
        assert!(e.contains("Solo") && e.contains("Agency"), "{e}");
        assert!(check_room(Tier::Agency, 500).is_ok());
        assert_eq!(info(Tier::Agency)["identityLimit"], Value::Null);
        assert_eq!(info(Tier::Solo)["identityLimit"], 1);
        assert_eq!(info(Tier::Agency)["copyKeysDefault"], true);
    }
}
