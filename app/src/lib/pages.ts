// pages.ts: the top menu and its pages (UI simplification, Zoltan,
// 2026-10-08, DECISIONS 119). Five menus: Home, Videos, Wizards, Identity,
// Settings; each of the last three has at most six pages, one shown at a
// time. `scope` says what a page edits: the App (every Identity on this
// computer) or the active Identity (docs/identity.md 2). Pure data, no Tauri
// imports, so the Node tests can load it.

import type { StepId } from "./steps";

export type MenuId = "home" | "videos" | "wizards" | "identity" | "settings";
export type PageMenu = "wizards" | "identity" | "settings";
export type PageId =
  | "cta" | "look" | "motion" | "scenes"
  | "channel" | "voice" | "footage" | "dictionary" | "research" | "identity"
  | "general" | "connections" | "transfer" | "folders" | "backup" | "plan";
export type Scope = "app" | "identity";

export type SettingsPage = { id: PageId; title: string; menu: PageMenu; scope: Scope; steps: StepId[] };

export const MENUS: { id: MenuId; title: string }[] = [
  { id: "home", title: "Home" },
  { id: "videos", title: "Videos" },
  { id: "wizards", title: "Wizards" },
  { id: "identity", title: "Identity" },
  { id: "settings", title: "Settings" },
];

export const SETTINGS_PAGES: SettingsPage[] = [
  // what the wizards make
  // the CTA wizard's comment calls (docs/wizards/cta.md)
  { id: "cta", title: "CTA", menu: "wizards", scope: "identity", steps: [] },
  // the setup's Brand step lives here, but the page shows the Brand wizard
  // instead of its fields (docs/wizards/brand.md 5)
  { id: "look", title: "Brand", menu: "wizards", scope: "identity", steps: ["brand"] },
  // the Motion wizard's profile (docs/wizards/motion.md 6)
  { id: "motion", title: "Motion", menu: "wizards", scope: "identity", steps: [] },
  // block packs: scene types someone designed (DECISIONS 107)
  { id: "scenes", title: "Scenes", menu: "wizards", scope: "identity", steps: [] },
  // the active Identity
  { id: "channel", title: "YouTube Channel & Audience", menu: "identity", scope: "identity", steps: ["audience", "brandVoice", "profile", "youtube", "landing", "language"] },
  { id: "voice", title: "Voice & Avatar", menu: "identity", scope: "identity", steps: ["narrator", "heygen"] },
  // your own clips as B-roll (DECISIONS 82)
  { id: "footage", title: "Footage", menu: "identity", scope: "identity", steps: [] },
  { id: "dictionary", title: "Dictionary", menu: "identity", scope: "identity", steps: [] },
  { id: "research", title: "Resources", menu: "identity", scope: "identity", steps: ["vidiq"] },
  { id: "identity", title: "Manage Identity", menu: "identity", scope: "identity", steps: ["name"] },
  // the whole app
  { id: "general", title: "General", menu: "settings", scope: "app", steps: [] },
  // every key on one page, App and Identity (D3)
  { id: "connections", title: "Connections", menu: "settings", scope: "app", steps: ["ai"] },
  // every import and export on one page (D4)
  { id: "transfer", title: "Import & Export", menu: "settings", scope: "app", steps: [] },
  { id: "folders", title: "Folders", menu: "settings", scope: "app", steps: [] },
  { id: "backup", title: "Backup", menu: "settings", scope: "app", steps: [] },
  { id: "plan", title: "Plan", menu: "settings", scope: "app", steps: [] },
];

export const MENU_NOTE: Record<PageMenu, string> = {
  wizards: "What the wizards made for this Identity",
  identity: "Only for this Identity",
  settings: "For the whole app, every Identity",
};

/** The page a menu opens on. */
export const firstPage = (menu: PageMenu): PageId => SETTINGS_PAGES.find((p) => p.menu === menu)!.id;
export const menuOf = (id: PageId): PageMenu => SETTINGS_PAGES.find((p) => p.id === id)!.menu;
