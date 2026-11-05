// transferList.ts: everything that can come into or go out of the app, in one place (Settings,
// Import & Export, DECISIONS 175). Most of it is done where it belongs, so a row says where, and
// `page` opens that page; `here`: the buttons are on this page. Pure data, no Tauri imports, so
// the Node tests can load it. Adding an import or an export anywhere? Add its row here too.

import type { PageId } from "./pages";

export type TransferRow = { what: string; files: string; where: string; page?: PageId; here?: boolean };

export const IMPORTS: TransferRow[] = [
  { what: "A whole Identity", files: ".zip", where: "This page; or Identity, Manage Identity", here: true },
  { what: "Your look", files: ".zip, .json, .css", where: "This page", here: true },
  { what: "Extra scene designs", files: ".itvpack", where: "This page", here: true },
  { what: "Evergreen Traffic Card", files: ".md", where: "Identity, YouTube Channel & Audience", page: "channel" },
  { what: "A course or playlist", files: ".json, or pasted text", where: "Playlist, Create Playlist File", page: "courses" },
  { what: "A script or notes", files: "pasted text", where: "Home, A new video; or pasted texts on Home, Week batch" },
  { what: "A recording to edit", files: ".mp4, .mov, .m4v, .mkv, .webm, .avi", where: "Video Recording Editing" },
  { what: "Your own clips as B-roll", files: ".mp4, .mov, .webm, .m4v", where: "Identity, Footage", page: "footage" },
  { what: "Stock photos and videos, free images", files: "picked from a search", where: "Identity, Footage", page: "footage" },
  { what: "Comment call clips", files: ".mp4, .mov, .webm, .m4v, or a video in your HeyGen account", where: "Wizards, CTA", page: "cta" },
  { what: "Logo", files: ".png, .jpg, .svg, .webp", where: "Wizards, Design", page: "look" },
  { what: "Your photos for thumbnails", files: ".jpg, .png, .webp", where: "Publishing, Thumbnail, With my face", page: "thumbnail" },
  { what: "Your own music for one video", files: ".mp3, .wav, .m4a, .aac, .ogg, .flac", where: "A video's Voice and music step" },
  { what: "Your own music for every video", files: "audio files in the Identity's music folder", where: "Home, The recipe, Music: My own files" },
  { what: "A clip for one shot", files: ".mp4, .mov, .webm, .m4v", where: "A video's Shot map step, per shot" },
  { what: "A backup of one video", files: "from your backup folder", where: "ONE Video, Restore from backup" },
  { what: "A backup of everything", files: "your backup folder", where: "The first screen on a new computer: Restore from a backup" },
];

export const EXPORTS: TransferRow[] = [
  { what: "A whole Identity", files: ".zip", where: "This page; or Identity, Manage Identity", here: true },
  { what: "Your look", files: ".zip", where: "This page", here: true },
  { what: "Extra scene designs", files: ".itvpack", where: "This page", here: true },
  { what: "Diagnostics for the person helping you", files: ".zip", where: "This page", here: true },
  { what: "The finished video", files: ".mp4", where: "A video's Your video step, Download" },
  { what: "The Publishing Card", files: ".json", where: "Publishing, PDT Connection; or a video's Your video step", page: "pdt" },
  { what: "Send to your publishing app", files: "over the internet", where: "A video's Your video step; or Publishing, PDT Connection", page: "pdt" },
  { what: "The thumbnail", files: "inside the Publishing Card", where: "Publishing, Thumbnail", page: "thumbnail" },
  { what: "The YouTube texts", files: "copied", where: "A video's Your video step" },
  { what: "Evergreen Traffic Card", files: ".md", where: "Wizards, YouTube Brand Channel Wizard, Download as .md", page: "brandchannel" },
  { what: "The channel kit's texts", files: "copied", where: "Wizards, YouTube Brand Channel Wizard", page: "brandchannel" },
  { what: "A course or playlist", files: ".json", where: "Playlist, Create Playlist File; or ONE Video, Course or playlist filter", page: "courses" },
  { what: "The planned playlist", files: "copied", where: "Playlist, Playlist Planner, Copy the file", page: "planner" },
  { what: "Backup of every video and the settings", files: "a folder you choose", where: "Settings, Backup", page: "backup" },
];
