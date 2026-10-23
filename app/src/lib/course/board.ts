// board.ts: the Channels board on Home (DECISIONS 127), the UI's side: the
// types the runner's channel-board command answers with
// (runner/course/board.mjs) and the words the board shows. Pure data, no
// Tauri imports, so the Node tests load it.

import type { Gate } from "../api";
import type { Playlist } from "./course";
import { firstOpen, TABS, type TabId } from "../tabs";

export type Upload = { at: string; url: string; videoId: string };
export type BoardVideo = { id: string; position: number; title: string; dir: string | null; gates: Record<string, Gate> | null; rendered: boolean; done: boolean; sentAt: string | null; upload: Upload | null };
export type BoardPlaylist = { slug: string; title: string; playlist: Playlist | null; total: number; done: number; uploaded: number; next: string | null; videos: BoardVideo[] };
export type Call = { slot: string; keyword: string; temperature?: string; segment?: boolean };

/** The step a video is at: the tab it opens on (tabs.ts firstOpen). */
export function nextTab(v: BoardVideo, hasHeygen: boolean): TabId {
  return firstOpen(v.gates ?? {}, v.rendered, hasHeygen);
}

export const tabName = (id: TabId) => TABS.find((t) => t.id === id)!.label;

/** "Script", or "Ready to send" / "Ready to upload" for a finished video. */
export function stepText(v: BoardVideo, hasHeygen: boolean): string {
  if (!v.dir) return "Not imported";
  if (!v.done) return tabName(nextTab(v, hasHeygen));
  if (v.upload) return "Uploaded";
  return v.sentAt ? "Ready to upload" : "Ready to send";
}

export const day = (iso: string | null | undefined) => (iso ? String(iso).slice(0, 10) : "");

// The only YouTube video address the app opens (and the opener scope lets through).
const WATCH = /^https:\/\/www\.youtube\.com\/watch\?v=[A-Za-z0-9_-]{11}$/;
export const watchLink = (url: string | null | undefined): string | null => (typeof url === "string" && WATCH.test(url) ? url : null);

export const VIDREV_URL = "https://vidrev.app/app/campaigns";
