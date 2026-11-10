// pages.ts: the top menu and its pages (UI simplification, Zoltan,
// 2026-10-08, DECISIONS 119; new order 2026-11-05, DECISIONS 175). Eight menus:
// Home, ONE Video, Identity, Wizards, Playlist, Publishing, Settings (Video Recording Editing moved to ITV Editor, DECISIONS 184). Nothing waits
// behind a switch: every menu is always there. `scope` says what a page edits:
// the App (every Identity on this computer) or the active Identity
// (docs/identity.md 2). A big page has sub pages (SUB_PAGES) in the left column.
// Pure data, no Tauri imports, so the Node tests can load it.

import type { StepId } from "./steps";

// ITV Editor is built from this same source (DECISIONS 184): VITE_ITV_APP=editor at
// build time. In Node (the tests) there is no import.meta.env, so it is IdeaToVideo.
export const EDITOR: boolean = (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_ITV_APP === "editor";

export type MenuId = "home" | "videos" | "edit" | "playlist" | "publishing" | "wizards" | "identity" | "settings";
export type PageMenu = "playlist" | "publishing" | "wizards" | "identity" | "settings";
export type PageId =
  | "planner" | "research" | "courses"
  | "thumbnail" | "pdt"
  | "brandchannel" | "cta" | "look" | "motion" | "scenes"
  | "channel" | "voice" | "avatar" | "footage" | "dictionary" | "identity"
  | "photos"
  | "health" | "connections" | "transfer" | "folders" | "backup" | "plan" | "legal";
export type Scope = "app" | "identity";

export type SettingsPage = { id: PageId; title: string; menu: PageMenu; scope: Scope; steps: StepId[] };

// `lines`: a long title drawn on several lines, so the whole menu fits on one row (DECISIONS 175)
const MAIN_MENUS: { id: MenuId; title: string; lines?: string[] }[] = [
  { id: "home", title: "Home" },
  { id: "videos", title: "ONE Video" },
  { id: "identity", title: "Identity" },
  { id: "wizards", title: "Wizards" },
  { id: "playlist", title: "Playlist" },
  { id: "publishing", title: "Publishing" },
  // editing a recording is its own app now, ITV Editor (DECISIONS 184)
  { id: "settings", title: "Settings" },
];

const MAIN_PAGES: SettingsPage[] = [
  // the whole channel's plan, never one video. Keywords first, the planner reads what they found (DECISIONS 175)
  // `vidiq`: the setup step of its key. The page itself does not show it, the key is on Connections
  { id: "research", title: "Keyword Research", menu: "playlist", scope: "identity", steps: ["vidiq"] },
  // one evergreen playlist from keyword research (DECISIONS 127)
  { id: "planner", title: "Playlist Planner", menu: "playlist", scope: "identity", steps: [] },
  // a course or playlist as one prepared video per entry (DECISIONS 121)
  { id: "courses", title: "Create Playlist File", menu: "playlist", scope: "identity", steps: [] },
  // after the video: its thumbnail and the way to the publishing app
  { id: "thumbnail", title: "Thumbnail", menu: "publishing", scope: "identity", steps: [] },
  { id: "pdt", title: "PDT Connection", menu: "publishing", scope: "app", steps: [] },
  // what the wizards make, for every video of this Identity
  // prepares the YouTube channel itself: 13 questions, a kit to paste in, the Traffic Card (DECISIONS 174)
  { id: "brandchannel", title: "YouTube Brand Channel Wizard", menu: "wizards", scope: "identity", steps: [] },
  // the CTA wizard's comment calls (docs/wizards/cta.md)
  { id: "cta", title: "CTA", menu: "wizards", scope: "identity", steps: [] },
  // the setup's Brand step lives here, but the page shows the Brand wizard
  // instead of its fields (docs/wizards/brand.md 5)
  { id: "look", title: "Design", menu: "wizards", scope: "identity", steps: ["brand"] },
  // the Motion wizard's profile (docs/wizards/motion.md 6)
  { id: "motion", title: "Motion", menu: "wizards", scope: "identity", steps: [] },
  // block packs: scene types someone designed (DECISIONS 107)
  { id: "scenes", title: "Scenes", menu: "wizards", scope: "identity", steps: [] },
  // the active Identity
  { id: "channel", title: "YouTube Channel & Audience", menu: "identity", scope: "identity", steps: ["audience", "brandVoice", "profile", "youtube", "landing", "language"] },
  { id: "voice", title: "Audio Voice", menu: "identity", scope: "identity", steps: ["narrator"] },
  { id: "avatar", title: "AI Avatar", menu: "identity", scope: "identity", steps: ["heygen"] },
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

// ITV Editor's short menu (Zoltan, 2026-11-09, DECISIONS 184): Home, Identity,
// Publishing, Settings. Nothing else.
const EDITOR_MENUS: { id: MenuId; title: string; lines?: string[] }[] = [
  { id: "home", title: "Home" },
  { id: "identity", title: "Identity" },
  { id: "publishing", title: "Publishing" },
  { id: "settings", title: "Settings" },
];
const EDITOR_PAGES: SettingsPage[] = [
  { id: "footage", title: "Footage", menu: "identity", scope: "identity", steps: [] },
  { id: "photos", title: "Thumbnail photos", menu: "identity", scope: "identity", steps: [] },
  { id: "thumbnail", title: "Thumbnail", menu: "publishing", scope: "identity", steps: [] },
  { id: "pdt", title: "PDT Connection", menu: "publishing", scope: "app", steps: [] },
  { id: "connections", title: "Connections", menu: "settings", scope: "app", steps: ["ai"] },
  { id: "health", title: "Health check", menu: "settings", scope: "app", steps: [] },
  { id: "backup", title: "Backup", menu: "settings", scope: "app", steps: [] },
  { id: "transfer", title: "Import & Export", menu: "settings", scope: "app", steps: [] },
  { id: "legal", title: "Legal", menu: "settings", scope: "app", steps: [] },
];

export const menusFor = (editor: boolean) => (editor ? EDITOR_MENUS : MAIN_MENUS);
export const pagesFor = (editor: boolean) => (editor ? EDITOR_PAGES : MAIN_PAGES);
export const MENUS = menusFor(EDITOR);
export const SETTINGS_PAGES: SettingsPage[] = pagesFor(EDITOR);

/** A big page's parts, one on screen at a time. `page`: this link opens another page. */
export type SubPage = { id: string; title: string; page?: PageId };
export const SUB_PAGES: Partial<Record<PageId, SubPage[]>> = {
  connections: [
    { id: "providers", title: "AI Apps" },
    { id: "services", title: "AI Services" },
    { id: "ai", title: "Which AI for which job" },
    { id: "keys", title: "Remove all keys" },
  ],
  footage: EDITOR ? [{ id: "own", title: "Your footage" }] : [
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
