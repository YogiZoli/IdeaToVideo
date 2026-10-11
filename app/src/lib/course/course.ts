// course.ts: Course import (DECISIONS 121), the UI's side: the types the
// runner's course commands answer with (runner/course/index.mjs), and the
// one kind of link the app opens for a course. Pure data, no Tauri imports.

export type Series = { courseSlug: string; courseTitle?: string; lessonId: string; playlistPosition: number; playlistCount?: number; playlistId?: string | null; playlistUrl?: string | null };
export type Playlist = { id: string | null; url: string | null };

export type CoursePreview = {
  version: string;
  course: { title: string; slug: string; boldPromise: string; idealClient: string };
  playlist: Playlist | null;
  lessons: { id: string; position: number; moduleTitle: string; title: string; minutes: number; exists: boolean }[];
  warnings: string[];
  newCount: number;
  existingCount: number;
};

export type LessonResult = { id: string; position: number; title: string; dir: string; action: "created" | "updated" | "unchanged"; updated: string[]; kept: string[]; scriptKept?: boolean };
export type CourseResult = {
  course: { slug: string; title: string };
  playlist: Playlist | null;
  again: boolean;
  created: number;
  updated: number;
  unchanged: number;
  lessons: LessonResult[];
  gone: { id: string; title: string; dir: string }[];
  warnings: string[];
  file: string;
};

export type CourseLesson = { id: string; position: number; title: string; dir: string | null; videoTitle: string | null; status: string | null };
export type Course = { slug: string; title: string; playlist: Playlist | null; importedAt: string; lessons: CourseLesson[]; hasFile: boolean };

// Only a YouTube playlist address is ever opened (the same rule as the
// runner's, and the only youtube.com address in the opener scope).
const PLAYLIST_URL = /^https:\/\/www\.youtube\.com\/playlist\?list=[A-Za-z0-9_-]{1,100}$/;
export const playlistLink = (url: string | null | undefined): string | null => (typeof url === "string" && PLAYLIST_URL.test(url) ? url : null);

export const videos = (n: number) => `${n} ${n === 1 ? "video" : "videos"}`;
