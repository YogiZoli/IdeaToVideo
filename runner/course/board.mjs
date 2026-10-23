// course/board.mjs: the Channels board on Home (DECISIONS 127). For one
// Identity's videos folder: every playlist or course with how many videos are
// done, the next one to make and where it stands, and per video whether it
// went to Publishing and whether the user ticked Uploaded. It only reads the
// course groups (listCourses) and each ONE Video's project.json; nothing new
// is stored for the board itself.
//
// "Uploaded" is the user's tick with the YouTube link: the upload itself
// stays manual in YouTube Studio, the app never uploads.

import { loadProject, saveProject, appendLog } from "../project.mjs";
import { listCourses } from "./index.mjs";

// A video is done when it is rendered and its preview approved (the "Your
// video" tab is done, tabs.ts).
export const isDone = (p) => p?.render?.state === "done" && p?.gates?.review?.state === "approved";

export function channelBoard(projectsDir) {
  const { courses } = listCourses(projectsDir);
  return {
    playlists: courses.map((c) => {
      const videos = c.lessons.map((l) => {
        let p = null;
        try {
          p = l.dir ? loadProject(l.dir) : null;
        } catch {
          // a broken project.json: shown as not made
        }
        return {
          id: l.id,
          position: l.position,
          title: l.videoTitle || l.title,
          dir: l.dir,
          gates: p?.gates ?? null,
          rendered: p?.render?.state === "done",
          done: isDone(p),
          sentAt: p?.publishing?.sentAt ?? null,
          upload: p?.upload ?? null,
        };
      });
      const next = videos.find((v) => v.dir && !v.done) ?? null;
      return { slug: c.slug, title: c.title, playlist: c.playlist, total: videos.length, done: videos.filter((v) => v.done).length, uploaded: videos.filter((v) => v.upload).length, next: next ? next.id : null, videos };
    }),
  };
}

// The 11 character video id of a YouTube link, or null. Takes watch, youtu.be,
// shorts, live and Studio links.
export function youtubeVideoId(raw) {
  const text = String(raw ?? "").trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(text)) return text;
  let u;
  try {
    u = new URL(text);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  const host = u.hostname.replace(/^(www|m)\./, "");
  let id = null;
  if (host === "youtu.be") id = u.pathname.slice(1).split("/")[0];
  else if (host === "youtube.com" || host === "studio.youtube.com") {
    id = u.searchParams.get("v") ?? (/^\/(?:shorts|live|embed|video)\/([^/]+)/.exec(u.pathname)?.[1] ?? null);
  }
  return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
}

// The Uploaded tick: with a YouTube link it is set, with `clear` it is taken
// back. The date is the day of the tick unless the user gives one.
export function setUpload(projectDir, { url, at = null, clear = false }, now = new Date()) {
  const project = loadProject(projectDir);
  if (clear) {
    delete project.upload;
    saveProject(projectDir, project);
    appendLog(projectDir, "upload: tick taken back");
    return { upload: null };
  }
  const videoId = youtubeVideoId(url);
  if (!videoId) throw new Error("Paste the link of the video on YouTube, like https://www.youtube.com/watch?v=... or https://youtu.be/...");
  const day = at && /^\d{4}-\d{2}-\d{2}$/.test(at) ? `${at}T12:00:00.000Z` : now.toISOString();
  project.upload = { at: day, url: `https://www.youtube.com/watch?v=${videoId}`, videoId };
  saveProject(projectDir, project);
  appendLog(projectDir, `upload: ticked, ${project.upload.url}`);
  return { upload: project.upload };
}

// Send to Publishing worked: kept on the ONE Video, so the board shows it.
export function markSent(projectDir, cardId, now = new Date()) {
  const project = loadProject(projectDir);
  project.publishing = { sentAt: now.toISOString(), ...(typeof cardId === "string" && cardId.length <= 100 ? { cardId } : {}) };
  saveProject(projectDir, project);
}
