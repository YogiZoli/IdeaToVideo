// planner.ts: the Traffic Card and the Playlist Planner (DECISIONS 127), the
// UI's side: the types the runner's planner commands answer with
// (runner/planner/). Pure data, no Tauri imports.

export type CardKeyword = { keyword: string; volume: number | null; competition: string; score: number | null };
export type TrafficCard = {
  generated: string | null;
  audience: string;
  result: string;
  topic: string;
  frustration: string;
  proof: string;
  language: string | null;
  nameOptions: string[];
  keywords: CardKeyword[];
  playlists: { title: string; pillar: string; keyword: string; description: string }[];
  videos: { title: string; keyword: string; playlist: string; volume: number | null; competition: string }[];
};
export type CardField = { field: "name" | "audience" | "profile" | "contentLanguage"; label: string; now: string; value: string };
