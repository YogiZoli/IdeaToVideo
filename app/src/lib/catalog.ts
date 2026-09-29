// catalog.ts: static choices the UI offers. Provider labels and default models
// mirror runner/providers/llm.mjs (SPEC 5 order); the runner stays the source of
// truth for the actual calls.

import type { Config } from "./api";

export type Provider = { id: string; label: string; model: string; keyUrl: string; note?: string };

export const LLM_PROVIDERS: Provider[] = [
  { id: "gemini", label: "Gemini", model: "gemini-2.5-flash", keyUrl: "https://aistudio.google.com/apikey", note: "Free tier available. Recommended to start." },
  { id: "openrouter", label: "OpenRouter", model: "openrouter/auto", keyUrl: "https://openrouter.ai/keys", note: "One key, many models." },
  { id: "claude", label: "Claude", model: "claude-sonnet-5", keyUrl: "https://console.anthropic.com/settings/keys" },
  { id: "openai", label: "ChatGPT (OpenAI API)", model: "", keyUrl: "https://platform.openai.com/api-keys", note: "Type the model name you want to use." },
  { id: "deepseek", label: "DeepSeek", model: "deepseek-chat", keyUrl: "https://platform.deepseek.com/api_keys" },
  { id: "grok", label: "Grok (xAI)", model: "", keyUrl: "https://console.x.ai", note: "Type the model name you want to use." },
];

export const SERVICE_KEY_URLS: Record<string, string> = {
  elevenlabs: "https://elevenlabs.io/app/settings/api-keys",
  heygen: "https://app.heygen.com/settings?nav=API",
  vidiq: "https://app.vidiq.com",
};

export const LANGUAGES: { code: string; label: string; voice: string }[] = [
  { code: "en", label: "English", voice: "en-US-AndrewNeural" },
  { code: "hu", label: "Hungarian", voice: "hu-HU-TamasNeural" },
  { code: "de", label: "German", voice: "de-DE-ConradNeural" },
  { code: "es", label: "Spanish", voice: "es-ES-AlvaroNeural" },
  { code: "fr", label: "French", voice: "fr-FR-HenriNeural" },
  { code: "it", label: "Italian", voice: "it-IT-DiegoNeural" },
  { code: "pt", label: "Portuguese", voice: "pt-BR-AntonioNeural" },
  { code: "nl", label: "Dutch", voice: "nl-NL-MaartenNeural" },
  { code: "pl", label: "Polish", voice: "pl-PL-MarekNeural" },
  { code: "ro", label: "Romanian", voice: "ro-RO-EmilNeural" },
];

export const DEFAULT_PRESET = "blue-professional";

export function defaultVoice(lang: string | undefined): string {
  return LANGUAGES.find((l) => l.code === lang)?.voice ?? LANGUAGES[0].voice;
}

export function defaultConfig(): Config {
  return {
    schema: 1,
    onboarded: false,
    ui: { language: "en" },
    llm: { provider: "gemini", model: "gemini-2.5-flash" },
    brand: { preset: DEFAULT_PRESET, logo: null },
    channel: { audience: "", brandVoice: "", profile: "", youtubeUrl: null, landingUrl: null, ctaText: null, contentLanguage: "en" },
    narrator: { provider: "edge-tts", voice: defaultVoice("en") },
    avatar: { enabled: false },
    research: { vidiq: false },
    defaults: { scriptTemplate: "ownership", autopilot: false, targetLengthMin: 8 },
    projectsDir: null,
  };
}

// Empty strings become null where the schema wants a nullable URL.
export function cleanConfig(c: Config): Config {
  const n = (v: string | null | undefined) => (v && v.trim() ? v.trim() : null);
  return {
    ...c,
    channel: { ...c.channel, youtubeUrl: n(c.channel.youtubeUrl), landingUrl: n(c.channel.landingUrl), ctaText: n(c.channel.ctaText) },
    narrator: { ...c.narrator, voice: n(c.narrator.voice) },
    projectsDir: n(c.projectsDir),
  };
}
