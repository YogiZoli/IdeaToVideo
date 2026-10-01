// progressInfo.ts: what the progress bar tells the user besides the percent
// (Zoltan, 2026-10-01): what is happening right now, in words; what this step
// uses up (AI tokens, credits) and what it does not; and what the user may do
// meanwhile. Pure functions, no Tauri imports, so the Node tests load it.

/** Plain-words phase for a runner progress step. Unknown steps: null. */
export function phaseText(command: string, step: string | undefined): string | null {
  const s = step ?? "";
  const table: Record<string, string> = {
    writing: "The AI is writing the script",
    planning: "The AI is planning the scenes",
    repairing: "Fixing what the AI returned",
    voice: "Reading the script aloud",
    joining: "Joining the voice parts",
    mixing: "Mixing voice and music",
    sentences: "Timing every sentence",
    music: "ElevenLabs is composing the music",
    build: "Putting the scenes together",
    lint: "Checking the video for errors",
    check: "Checking the video for errors",
    snapshots: "Taking a still of every scene",
    sheet: "Making the overview sheet",
    render: "Recording the video frame by frame",
    browser: "Getting the video engine's browser",
    heygen: "HeyGen is making the avatar clips",
    upload: "Sending the narration to HeyGen",
    previews: "Loading avatar pictures",
    backup: "Copying files into the backup folder",
    retry: "The AI service did not answer, trying again",
    fallback: "The AI model is busy, switching to the other model",
  };
  if (table[s]) return table[s];
  if (command === "render-video") return "Recording the video frame by frame";
  return null;
}

/** What this step costs, said plainly, including what it does NOT use. */
export function costText(command: string, provider?: string): string {
  const local = "Runs on this computer only. No AI tokens and no credits from any service.";
  switch (command) {
    case "write-script":
    case "make-scenes":
    case "refill-scene":
      return "Uses AI tokens from your AI key (a few cents at most). No other credits.";
    case "make-voice":
      return provider === "elevenlabs"
        ? "Uses ElevenLabs characters from your plan. No AI tokens for the script."
        : "Uses your Gemini key for the voice (free tier or a few cents). No other credits.";
    case "make-music":
      return "Uses ElevenLabs credits for the music. No AI tokens.";
    case "make-avatar":
      return "Uses HeyGen credits (you approved the estimate). No AI tokens.";
    case "avatar-looks":
      return "Free: only reads your HeyGen avatar list. No credits.";
    default:
      return local; // set-music, build-video, render-video, check-video
  }
}

/** What the user may do meanwhile. */
export function adviceText(command: string): string {
  const where = command === "make-avatar" || command === "make-music" ? "The service works on it, and the app waits for the result and saves it" : "The app does this work on your computer";
  return `Keep the app open and do not put the computer to sleep or close the lid. ${where}, so the step stops if the computer sleeps. The app keeps the computer awake by itself while it works. You can use other programs meanwhile.`;
}

/** Percent from time alone. Past the estimate it keeps creeping toward 99
 * instead of freezing at 95, so the bar never looks dead. */
export function percentByTime(elapsed: number, expect: number | null): number {
  if (!expect) return 0;
  const r = elapsed / expect;
  if (r <= 1) return 95 * r;
  return 95 + 4 * (1 - Math.exp(-(r - 1)));
}

/** "1:05" style clock. */
export function clock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
