// pages.ts: the top menu and its pages (UI simplification, Zoltan,
// 2026-10-08, DECISIONS 119; new order 2026-11-04, DECISIONS 168). Seven menus:
// Home, Videos, Playlist, Publishing, Wizards, Identity, Settings. Nothing waits
// behind a switch: every menu is always there. `scope` says what a page edits:
// the App (every Identity on this computer) or the active Identity
// (docs/identity.md 2). A big page has sub pages (SUB_PAGES) in the left column.
// Pure data, no Tauri imports, so the Node tests can load it.

import type { StepId } from "./steps";

export type MenuId = "home" | "videos" | "playlist" | "publishing" | "wizards" | "identity" | "settings";
export type PageMenu = "playlist" | "publishing" | "wizards" | "identity" | "settings";
export type PageId =
  | "planner" | "research" | "courses"
  | "thumbnail" | "pdt"
  | "cta" | "look" | "motion" | "scenes"
  | "channel" | "voice" | "avatar" | "photos" | "footage" | "dictionary" | "identity"
  | "health" | "connections" | "transfer" | "folders" | "backup" | "plan" | "legal";
export type Scope = "app" | "identity";

export type SettingsPage = { id: PageId; title: string; menu: PageMenu; scope: Scope; steps: StepId[] };

export const MENUS: { id: MenuId; title: string }[] = [
  { id: "home", title: "Home" },
  { id: "videos", title: "Videos" },
  { id: "playlist", title: "Playlist" },
  { id: "publishing", title: "Publishing" },
  { id: "wizards", title: "Wizards" },
  { id: "identity", title: "Identity" },
  { id: "settings", title: "Settings" },
];

export const SETTINGS_PAGES: SettingsPage[] = [
  // the whole channel's plan, never one video
  // one evergreen playlist from keyword research (DECISIONS 127)
  { id: "planner", title: "Playlist Planner", menu: "playlist", scope: "identity", steps: [] },
  { id: "research", title: "Keyword Research", menu: "playlist", scope: "identity", steps: ["vidiq"] },
  // a course or playlist as one prepared video per entry (DECISIONS 121)
  { id: "courses", title: "Course or Playlist File", menu: "playlist", scope: "identity", steps: [] },
  // after the video: its thumbnail and the way to the publishing app
  { id: "thumbnail", title: "Thumbnail", menu: "publishing", scope: "identity", steps: [] },
  { id: "pdt", title: "PDT Connection", menu: "publishing", scope: "app", steps: [] },
  // what the wizards make, for every video of this Identity
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
  { id: "voice", title: "Audio Voice", menu: "identity", scope: "identity", steps: ["narrator"] },
  { id: "avatar", title: "AI Avatar", menu: "identity", scope: "identity", steps: ["heygen"] },
  // the profile photos a thumbnail "with my face" uses (DECISIONS 131)
  { id: "photos", title: "Thumbnail", menu: "identity", scope: "identity", steps: [] },
  // your own clips as B-roll (DECISIONS 82)
  { id: "footage", title: "Footage", menu: "identity", scope: "identity", steps: [] },
  { id: "dictionary", title: "Dictionary", menu: "identity", scope: "identity", steps: [] },
  { id: "identity", title: "Manage Identity", menu: "identity", scope: "identity", steps: ["name"] },
  // the whole app
  // keys, models, ffmpeg, disk, internet: OK or what to fix (docs/AUDIT_REPORT.md)
  { id: "health", title: "Health check", menu: "settings", scope: "app", steps: [] },
  // every key, App and Identity (D3)
  { id: "connections", title: "Connections", menu: "settings", scope: "app", steps: ["ai"] },
  // the files that go in or out (D4)
  { id: "transfer", title: "Import & Export", menu: "settings", scope: "app", steps: [] },
  { id: "folders", title: "Folders", menu: "settings", scope: "app", steps: [] },
  { id: "backup", title: "Backup", menu: "settings", scope: "app", steps: [] },
  { id: "plan", title: "Account Plan", menu: "settings", scope: "app", steps: [] },
  { id: "legal", title: "Legal", menu: "settings", scope: "app", steps: [] },
];

/** A big page's parts, one on screen at a time. `page`: this link opens another page. */
export type SubPage = { id: string; title: string; page?: PageId };
export const SUB_PAGES: Partial<Record<PageId, SubPage[]>> = {
  connections: [
    { id: "ai", title: "AI" },
    { id: "providers", title: "AI providers" },
    { id: "services", title: "Services" },
    { id: "publishing", title: "Publishing", page: "pdt" },
    { id: "keys", title: "Remove all keys" },
  ],
  footage: [
    { id: "own", title: "Your footage" },
    { id: "ai", title: "AI B-roll" },
    { id: "stock", title: "Stock photos and videos" },
    { id: "free", title: "Free images" },
  ],
};

export const MENU_NOTE: Record<PageMenu, string> = {
  playlist: "The plan of a whole channel, not of one video",
  publishing: "What goes out with a video",
  wizards: "For every video of this Identity",
  identity: "Only for this Identity",
  settings: "For the whole app, every Identity",
};

/** The page a menu opens on. */
export const firstPage = (menu: PageMenu): PageId => SETTINGS_PAGES.find((p) => p.menu === menu)!.id;
export const menuOf = (id: PageId): PageMenu => SETTINGS_PAGES.find((p) => p.id === id)!.menu;
