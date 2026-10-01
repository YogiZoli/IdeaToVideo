// pages.ts: how Settings splits the onboarding steps into sub-pages, so one
// page shows at a time instead of one long scroll (2026-10-01). Pure data,
// no Tauri imports, so the Node tests can load it.

import type { StepId } from "./steps";

export type PageId = "ai" | "channel" | "look" | "voice" | "research" | "general";

export type SettingsPage = { id: PageId; title: string; steps: StepId[] };

export const SETTINGS_PAGES: SettingsPage[] = [
  { id: "ai", title: "AI and keys", steps: ["ai"] },
  { id: "channel", title: "Channel", steps: ["audience", "brandVoice", "profile", "youtube", "landing", "language"] },
  { id: "look", title: "Look", steps: ["brand"] },
  { id: "voice", title: "Voice and avatar", steps: ["narrator", "heygen"] },
  { id: "research", title: "Research", steps: ["vidiq"] },
  { id: "general", title: "General", steps: [] },
];
