// brand.ts: the Brand wizard's pure helpers (docs/wizards/brand.md). The colour
// arithmetic mirrors runner/brand/card.mjs, so the wizard checks contrast on
// every click without a runner call; scripts/app/brand.test.mjs keeps the two
// equal. No Tauri imports, so the Node tests can load it.

import type { BrandCard, CardColors, ContrastRow, ShippedFont } from "./api";

export const CORNERS = { none: 0, small: 6, medium: 14, large: 24 } as const;
export const COLOR_ROLES: (keyof CardColors)[] = ["background", "text", "muted", "surface", "border", "primary", "secondary", "tertiary"];

export function parseHex(hex: string): number[] | null {
  const m = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/i.exec(String(hex ?? "").trim());
  if (!m) return null;
  const h = m[1].length === 3 ? [...m[1]].map((c) => c + c).join("") : m[1];
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}
export const toHex = (rgb: number[]) => "#" + rgb.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");
export const normHex = (hex: string) => {
  const rgb = parseHex(hex);
  return rgb ? toHex(rgb) : null;
};
export const mix = (a: string, b: string, amount: number) => {
  const x = parseHex(a)!;
  const y = parseHex(b)!;
  return toHex(x.map((v, i) => v * amount + y[i] * (1 - amount)));
};

export function luminance(hex: string) {
  const [r, g, b] = parseHex(hex)!.map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string) {
  const [la, lb] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return Math.round(((la + 0.05) / (lb + 0.05)) * 100) / 100;
}

export function fixContrast(color: string, against: string, min: number) {
  if (contrast(color, against) >= min) return normHex(color)!;
  const toward = luminance(against) > 0.18 ? ["#000000", "#ffffff"] : ["#ffffff", "#000000"];
  for (const target of toward) {
    for (let step = 1; step <= 20; step++) {
      const c = mix(target, color, step / 20);
      if (contrast(c, against) >= min) return c;
    }
  }
  return luminance(against) > 0.18 ? "#000000" : "#ffffff";
}

export const CONTRAST_RULES = [
  { id: "text-on-background", fg: "text", bg: "background", min: 4.5, label: "Text on the background" },
  { id: "text-on-surface", fg: "text", bg: "surface", min: 4.5, label: "Text on cards" },
  { id: "muted-on-background", fg: "muted", bg: "background", min: 3, label: "Quiet text on the background" },
  { id: "primary-on-background", fg: "primary", bg: "background", min: 3, label: "Main color on the background" },
] as const;

export function contrastReport(card: BrandCard): ContrastRow[] {
  return CONTRAST_RULES.map((r) => {
    const ratio = contrast(card.colors[r.fg], card.colors[r.bg]);
    return { ...r, ratio, ok: ratio >= r.min, fix: ratio >= r.min ? null : fixContrast(card.colors[r.fg], card.colors[r.bg], r.min) };
  });
}

export const appearanceOf = (c: { background: string }) => (luminance(c.background) > 0.18 ? "light" : "dark");

// The Colors screen has three main fields; the rest follows them (the same
// rules as the runner: Blue Professional's 4% cards and 20% borders).
export function deriveFrom(main: { background: string; primary: string; secondary?: string }): CardColors {
  const light = appearanceOf(main) === "light";
  const text = light ? "#111111" : "#f4f5f7";
  const secondary = main.secondary ?? main.primary;
  return {
    background: normHex(main.background)!,
    text,
    muted: mix(text, main.background, 0.6),
    surface: mix(main.primary, main.background, 0.04),
    border: mix(main.primary, main.background, 0.2),
    primary: normHex(main.primary)!,
    secondary: normHex(secondary)!,
    tertiary: normHex(secondary)!,
  };
}

// ---- fonts in the webview -------------------------------------------------------------

// @font-face rules for the shipped fonts, so the wizard shows each font as it
// will be in the video. toUrl: Tauri's convertFileSrc.
export function fontFaceCss(fonts: ShippedFont[], fontsDir: string, toUrl: (p: string) => string) {
  const sep = fontsDir.includes("\\") ? "\\" : "/";
  return fonts
    .flatMap((f) => {
      const single = new Set(f.files.map((x) => x.weight)).size === 1 && !f.files[0].weight.includes(" ");
      return f.files.map((x) => `@font-face { font-family: 'ITV ${f.family}'; font-weight: ${single ? "100 900" : x.weight}; font-display: swap; src: url('${toUrl(fontsDir + sep + x.file.replace(/\//g, sep))}') format('woff2'); unicode-range: ${x.unicodeRange}; }`);
    })
    .join("\n");
}
// The wizard's own name for a shipped font (never clashes with the app's chrome fonts).
export const previewFamily = (family: string) => `'ITV ${family}', sans-serif`;

// One line per content language, with its special letters (runner/brand/preview.mjs).
export const SAMPLE_LINE: Record<string, string> = {
  en: "Clear ideas win attention",
  hu: "Őszinte ötletek győznek, ügyesen",
  de: "Größere Ideen überzeugen schön",
  es: "Las ideas claras ganan atención",
  fr: "Les idées claires gagnent, déjà",
  it: "Le idee chiare vincono così",
  pt: "Ideias claras ganham atenção",
  nl: "Heldere ideeën winnen aandacht",
  pl: "Jasne pomysły zdobywają uwagę",
  ro: "Ideile clare câștigă atenția",
};

// The display and body pairs the presets use, each once, in preset order.
export function fontPairs(presets: { label: string; card: BrandCard }[]) {
  const seen = new Set<string>();
  const out: { display: string; body: string; from: string }[] = [];
  for (const p of presets) {
    const key = `${p.card.fonts.display.family}|${p.card.fonts.body.family}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ display: p.card.fonts.display.family, body: p.card.fonts.body.family, from: p.label });
  }
  return out;
}

// ---- colours from a logo ----------------------------------------------------------

// The 3-5 most used clear colours of an image's pixels (RGBA), skipping
// transparent, near-white and near-black ones and near-duplicates.
export function paletteFromPixels(data: ArrayLike<number>, max = 5): string[] {
  const counts = new Map<string, number>();
  for (let i = 0; i + 3 < data.length; i += 4) {
    if (data[i + 3] < 200) continue;
    const [r, g, b] = [data[i], data[i + 1], data[i + 2]];
    const l = (r + g + b) / 3;
    if (l > 242 || l < 14) continue;
    const key = toHex([r, g, b].map((v) => Math.round(v / 24) * 24));
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const out: string[] = [];
  for (const [hex] of [...counts].sort((a, b) => b[1] - a[1])) {
    if (out.every((o) => contrast(o, hex) > 1.25 || distance(o, hex) > 60)) out.push(hex);
    if (out.length >= max) break;
  }
  return out;
}
const distance = (a: string, b: string) => {
  const [x, y] = [parseHex(a)!, parseHex(b)!];
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
};

export const fileName = (p: string | null | undefined) => (p ? p.split(/[\\/]/).pop() ?? "" : "");
