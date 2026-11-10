// split.ts: which videos belong to which app (DECISIONS 184). A video made from a
// recording opens in ITV Editor, a video made from a script in IdeaToVideo; both read
// the same projects folder. Pure, no Tauri imports, so the Node tests load it.

// the same switch as pages.ts (a value import between .ts files does not load in the Node tests)
const EDITOR: boolean = (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_ITV_APP === "editor";

type Kindable = { recipe?: { engine?: string } | null };

export const isRecording = (p: Kindable) => p.recipe?.engine === "recorded";
/** This video is shown in this app. */
export const ofApp = (editor: boolean) => (p: Kindable) => (editor ? isRecording(p) : !isRecording(p));
export const ofThisApp = ofApp(EDITOR);
