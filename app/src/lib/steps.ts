// steps.ts: the 12 onboarding steps (PRD 5) and what "Use recommended" and
// "Skip, use default" do on each. Settings shows the same sections.

import type { Config } from "./api";
import { runner } from "./api";
import { DEFAULT_PRESET, LLM_PROVIDERS, defaultVoice } from "./catalog";

export type StepId =
  | "ai" | "brand" | "audience" | "brandVoice" | "profile" | "youtube"
  | "landing" | "language" | "narrator" | "heygen" | "vidiq" | "import";

export type Step = { id: StepId; title: string; intro: string; required?: boolean; canRecommend: boolean };

export const STEPS: Step[] = [
  { id: "ai", title: "AI key", intro: "The AI writes your scripts. It uses your own API key, which is stored only in your system keychain.", required: true, canRecommend: true },
  { id: "brand", title: "Brand", intro: "Colors and fonts of your videos come from a preset. Add your logo if you have one.", canRecommend: true },
  { id: "audience", title: "Audience", intro: "Who do you make videos for? One clear viewer makes every script better.", canRecommend: true },
  { id: "brandVoice", title: "Brand Voice", intro: "How your scripts sound: tone, style, words to avoid. This is not the Narrator Voice.", canRecommend: true },
  { id: "profile", title: "Channel Profile", intro: "What is your channel about, and what makes it different?", canRecommend: false },
  { id: "youtube", title: "YouTube channel", intro: "The address of your channel, if you already have one.", canRecommend: false },
  { id: "landing", title: "Landing page", intro: "A page where viewers get your free offer. Scripts will point to it at the end.", canRecommend: false },
  { id: "language", title: "Content language", intro: "The language of your scripts, narration and on-screen text. The app itself stays in English.", canRecommend: true },
  { id: "narrator", title: "Narrator Voice", intro: "The voice that reads your script. Free by default, or ElevenLabs with your own key.", canRecommend: true },
  { id: "heygen", title: "HeyGen (avatar)", intro: "Optional: a talking avatar in the corner of your video, with your HeyGen key and credits.", canRecommend: false },
  { id: "vidiq", title: "vidIQ (keywords)", intro: "Optional: keyword data for your topics. The key is stored now and used in a later version.", canRecommend: false },
  { id: "import", title: "Import from Planner", intro: "If you use the Planner app, you will be able to import your channel and video plans here.", canRecommend: false },
];

/** "Skip, use default": resets the step to the PRD 5 default. */
export function skipStep(id: StepId, c: Config): Config {
  const ch = { ...c.channel };
  switch (id) {
    case "ai":
      return { ...c, llm: { provider: "gemini", model: "gemini-3.8-flash" } };
    case "brand":
      return { ...c, brand: { preset: DEFAULT_PRESET, logo: null } };
    case "audience":
      return { ...c, channel: { ...ch, audience: "" } };
    case "brandVoice":
      return { ...c, channel: { ...ch, brandVoice: "" } };
    case "profile":
      return { ...c, channel: { ...ch, profile: "" } };
    case "youtube":
      return { ...c, channel: { ...ch, youtubeUrl: null } };
    case "landing":
      return { ...c, channel: { ...ch, landingUrl: null, ctaText: null } };
    case "language":
      return { ...c, channel: { ...ch, contentLanguage: "en" }, narrator: { ...c.narrator, voice: c.narrator.provider === "edge-tts" ? defaultVoice("en") : c.narrator.voice } };
    case "narrator":
      return { ...c, narrator: { provider: "edge-tts", voice: defaultVoice(ch.contentLanguage) } };
    case "heygen":
      return { ...c, avatar: { enabled: false } };
    case "vidiq":
      return { ...c, research: { vidiq: false } };
    case "import":
      return c;
  }
}

/** "Use recommended". Audience and Brand Voice ask the AI (needs the AI key). */
export async function recommendStep(id: StepId, c: Config): Promise<Config> {
  if (id === "audience" || id === "brandVoice") {
    const r = await runner<{ text: string }>("suggest-channel", { llm: c.llm, field: id, channel: c.channel });
    return { ...c, channel: { ...c.channel, [id]: r.text } };
  }
  if (id === "ai") {
    const p = LLM_PROVIDERS.find((x) => x.id === c.llm.provider) ?? LLM_PROVIDERS[0];
    return { ...c, llm: { provider: p.id, model: p.model || c.llm.model } };
  }
  if (id === "narrator") return { ...c, narrator: { provider: "edge-tts", voice: defaultVoice(c.channel.contentLanguage) } };
  return skipStep(id, c);
}

/** Can the user move on from this step? Only the AI key is mandatory. */
export function stepReady(id: StepId, c: Config, keys: Record<string, boolean>): string | null {
  if (id === "ai") {
    if (!keys[c.llm.provider]) return "Save an API key to continue. Without it the app cannot write scripts.";
    if (!c.llm.model.trim()) return "Type a model name to continue.";
  }
  if (id === "narrator" && c.narrator.provider === "elevenlabs") {
    if (!keys.elevenlabs) return "Save your ElevenLabs key, or skip to use the free voice.";
    if (!c.narrator.voice?.trim()) return "Type an ElevenLabs voice ID, or skip to use the free voice.";
  }
  return null;
}
