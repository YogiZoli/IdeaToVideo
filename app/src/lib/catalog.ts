// catalog.ts: static choices the UI offers. Provider labels and default models
// mirror runner/providers/llm.mjs (SPEC 5 order); the runner stays the source of
// truth for the actual calls.

import type { Config } from "./api";
import { FIRST_IDENTITY_NAME } from "./identity";

export type Provider = { id: string; label: string; model: string; keyUrl: string; note?: string };

export const LLM_PROVIDERS: Provider[] = [
  { id: "gemini", label: "Gemini", model: "gemini-3.5-flash", keyUrl: "https://aistudio.google.com/apikey", note: "Free tier available. Recommended to start." },
  { id: "openrouter", label: "OpenRouter", model: "openrouter/auto", keyUrl: "https://openrouter.ai/keys", note: "One key, many models." },
  { id: "claude", label: "Claude", model: "claude-sonnet-5-5", keyUrl: "https://console.anthropic.com/settings/keys" },
  { id: "openai", label: "ChatGPT (OpenAI API)", model: "", keyUrl: "https://platform.openai.com/api-keys", note: "Type the model name you want to use." },
  { id: "deepseek", label: "DeepSeek", model: "deepseek-chat", keyUrl: "https://platform.deepseek.com/api_keys" },
  { id: "grok", label: "Grok (xAI)", model: "", keyUrl: "https://console.x.ai", note: "Type the model name you want to use." },
];

// The models offered per provider (DECISIONS 89), the strongest first, and
// the efforts each takes. A provider without a list, or "Other model", takes
// any model name. Claude's list mirrors runner/providers/claude.mjs.
export type ModelChoice = { id: string; label: string; efforts: string[] };
const ALL_EFFORTS = ["low", "medium", "high", "xhigh", "max"];
const LMH = ["low", "medium", "high"];
export const MODEL_CHOICES: Record<string, ModelChoice[]> = {
  claude: [
    { id: "claude-fable-5-1", label: "Claude Fable 5.1", efforts: ALL_EFFORTS },
    { id: "claude-opus-5-5", label: "Claude Opus 5.5", efforts: ALL_EFFORTS },
    { id: "claude-sonnet-5-5", label: "Claude Sonnet 5.5", efforts: ALL_EFFORTS },
    { id: "claude-haiku-4-5", label: "Claude Haiku 4.5", efforts: [] },
  ],
  gemini: [
    { id: "gemini-3.8-flash", label: "Gemini 3.8 Flash", efforts: LMH },
    { id: "gemini-3.5-flash", label: "Gemini 3.5 Flash", efforts: LMH },
    { id: "gemini-3.1-flash-lite", label: "Gemini 3.1 Flash Lite", efforts: LMH },
  ],
  openrouter: [{ id: "openrouter/auto", label: "OpenRouter Auto", efforts: LMH }],
  deepseek: [{ id: "deepseek-chat", label: "DeepSeek Chat", efforts: [] }],
};
// providers whose typed-in model names may take an effort
const OPEN_EFFORTS: Record<string, string[]> = { openai: LMH, openrouter: LMH, gemini: LMH, claude: ALL_EFFORTS };
export const EFFORT_LABELS: Record<string, string> = { low: "Low", medium: "Medium", high: "High", xhigh: "Extra high", max: "Max" };

export const modelChoices = (provider: string): ModelChoice[] => MODEL_CHOICES[provider] ?? [];
export function effortChoices(provider: string, model: string): string[] {
  const known = modelChoices(provider).find((m) => m.id === model);
  return known ? known.efforts : (OPEN_EFFORTS[provider] ?? []);
}

export const SERVICE_KEY_URLS: Record<string, string> = {
  elevenlabs: "https://elevenlabs.io/app/settings/api-keys",
  heygen: "https://app.heygen.com/settings?nav=API",
  vidiq: "https://app.vidiq.com/account/settings/mcp",
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

// The looks to start from (library/presets.map.json, the HyperFrames presets).
// Setup offers them; Settings, Brand opens the wizard for the rest.
export const PRESETS: { id: string; label: string }[] = [
  { id: "blue-professional", label: "Blue Professional" },
  { id: "biennale-yellow", label: "Biennale Yellow" },
  { id: "blockframe", label: "Blockframe" },
  { id: "broadside", label: "Broadside" },
  { id: "capsule", label: "Capsule" },
  { id: "cartesian", label: "Cartesian" },
  { id: "cobalt-grid", label: "Cobalt Grid" },
  { id: "code-editorial", label: "Code Editorial" },
  { id: "coral", label: "Coral" },
  { id: "creative-mode", label: "Creative Mode" },
  { id: "editorial-forest", label: "Editorial Forest" },
];

// The free Narrator Voice: Gemini TTS with the user's Gemini key (phase 2).
// "edge-tts" (phase 1 test configs) is treated as Gemini.
export const GEMINI_DEFAULT_VOICE = "Kore";
export const GEMINI_VOICES = ["Kore", "Charon", "Puck", "Zephyr", "Fenrir", "Leda", "Orus", "Aoede", "Callirrhoe", "Autonoe", "Enceladus", "Iapetus", "Umbriel", "Algieba", "Despina", "Erinome", "Algenib", "Rasalgethi", "Laomedeia", "Achernar", "Alnilam", "Schedar", "Gacrux", "Pulcherrima", "Achird", "Zubenelgenubi", "Vindemiatrix", "Sadachbia", "Sadaltager", "Sulafat"];
export const narratorProvider = (p: string | undefined) => (p === "edge-tts" || !p ? "gemini" : p);

export function defaultVoice(lang: string | undefined): string {
  return LANGUAGES.find((l) => l.code === lang)?.voice ?? LANGUAGES[0].voice;
}

/** The effective settings of a fresh setup (App defaults + a new Identity). */
export function defaultConfig(): Config {
  return {
    name: FIRST_IDENTITY_NAME,
    onboarded: false,
    ui: { language: "en" },
    llm: { provider: "gemini", model: "gemini-3.5-flash" },
    brand: { preset: DEFAULT_PRESET, logo: null },
    channel: { audience: "", brandVoice: "", profile: "", youtubeUrl: null, landingUrl: null, ctaText: null, contentLanguage: "en" },
    narrator: { provider: "gemini", voice: GEMINI_DEFAULT_VOICE },
    avatar: { enabled: false },
    research: { vidiq: false },
    defaults: { scriptTemplate: "ownership", autopilot: false, targetLengthMin: 8 },
  };
}

// Empty strings become null where the schema wants a nullable URL.
export function cleanConfig(c: Config): Config {
  const n = (v: string | null | undefined) => (v && v.trim() ? v.trim() : null);
  return {
    ...c,
    channel: { ...c.channel, youtubeUrl: n(c.channel.youtubeUrl), landingUrl: n(c.channel.landingUrl), ctaText: n(c.channel.ctaText) },
    narrator: { ...c.narrator, voice: n(c.narrator.voice) },
  };
}
