// kinds.ts: "What did you record?" on screen (DECISIONS 184). The same six kinds as
// runner/recorded/bubble.mjs, with the files each asks for. Pure, so the Node tests load it.

export type KindId = "screen" | "screen-bubble" | "talking-head" | "screen-share" | "profile-silhouette" | "screen-avatar";
export type Box = { x: number; y: number; w: number; h: number };
export type Slot = { id: string; label: string; hint: string; optional?: boolean };

export const DEFAULT_BOX: Box = { x: 0.02, y: 0.62, w: 0.18, h: 0.32 };

export const KINDS: { id: KindId; label: string; hint: string }[] = [
  { id: "screen", label: "Screen only", hint: "One screen file. The view zooms to your clicks and the cursor moves smoothly." },
  { id: "screen-bubble", label: "Screen with my face in a bubble", hint: "Two files, screen and camera, or one file that already has the bubble in it." },
  { id: "talking-head", label: "Talking head", hint: "One camera file: you talking to the camera." },
  { id: "screen-share", label: "Screen and camera, switching", hint: "Two files. The picture switches between you and the screen." },
  { id: "profile-silhouette", label: "Profile silhouette", hint: "Filmed from the side. The background goes, a silhouette stays." },
  { id: "screen-avatar", label: "Screen with an AI avatar bubble", hint: "One screen file. The face in the bubble is your Identity's avatar." },
];

const SCREEN: Slot = { id: "screen", label: "Screen file", hint: "The screen recording." };
const CAMERA: Slot = { id: "camera", label: "Camera file", hint: "You talking." };

export function slotsFor(kind: KindId, oneFile = false): Slot[] {
  switch (kind) {
    case "screen":
    case "screen-avatar":
      return [SCREEN];
    case "screen-bubble":
      return oneFile ? [{ id: "screen", label: "The one file", hint: "Your screen with the face bubble already in it." }] : [SCREEN, { ...CAMERA, hint: "Gives the face bubble." }];
    case "talking-head":
      return [{ ...CAMERA, hint: "You talking to the camera: one video file with picture and sound." }];
    case "screen-share":
      return [CAMERA, { ...SCREEN, hint: "What you show." }];
    case "profile-silhouette":
      return [{ id: "camera", label: "Side-angle take", hint: "Filmed from the side, against anything: the background goes." }, { id: "front", label: "Front take (the voice)", hint: "Gives the sound. Without it the side take's own sound is used.", optional: true }];
  }
}

/** What is still missing, as a sentence, or null. */
export function kindMissing(kind: KindId, files: Record<string, string>, oneFile = false): string | null {
  const need = slotsFor(kind, oneFile).filter((s) => !s.optional && !files[s.id]);
  if (!need.length) return null;
  return `Choose the ${need.map((s) => s.label.toLowerCase()).join(" and the ")}.`;
}
