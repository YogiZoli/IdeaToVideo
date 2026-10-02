// pages.ts: how Settings splits into sub-pages, one shown at a time
// (2026-10-01), in two groups (docs/identity.md 7): "App" for every Identity
// on this computer, and the active Identity's own pages. Pure data, no Tauri
// imports, so the Node tests can load it.

import type { StepId } from "./steps";

export type PageId = "app-ai" | "folders" | "backup" | "plan" | "general" | "identity" | "channel" | "look" | "dictionary" | "voice" | "research" | "identity-ai";
export type Group = "app" | "identity";

export type SettingsPage = { id: PageId; title: string; group: Group; steps: StepId[] };

export const SETTINGS_PAGES: SettingsPage[] = [
  { id: "app-ai", title: "AI and keys", group: "app", steps: ["ai"] },
  { id: "folders", title: "Folders", group: "app", steps: [] },
  { id: "backup", title: "Backup", group: "app", steps: [] },
  { id: "plan", title: "Plan", group: "app", steps: [] },
  { id: "general", title: "General", group: "app", steps: [] },
  { id: "identity", title: "Identity", group: "identity", steps: ["name"] },
  { id: "channel", title: "YouTube channel and audience", group: "identity", steps: ["audience", "brandVoice", "profile", "youtube", "landing", "language"] },
  // the setup's Brand step lives here, but the page shows the Brand wizard
  // instead of its fields (docs/wizards/brand.md 5)
  { id: "look", title: "Brand", group: "identity", steps: ["brand"] },
  { id: "dictionary", title: "Dictionary", group: "identity", steps: [] },
  { id: "voice", title: "Voice and avatar", group: "identity", steps: ["narrator", "heygen"] },
  { id: "research", title: "Research", group: "identity", steps: ["vidiq"] },
  { id: "identity-ai", title: "AI and keys", group: "identity", steps: [] },
];

export const GROUP_NOTE: Record<Group, string> = {
  app: "For all Identities on this computer",
  identity: "Only for this Identity",
};
