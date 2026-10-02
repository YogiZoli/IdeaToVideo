// fontsDom.ts: puts the shipped fonts into the page once (Tauri asset URLs),
// so the Brand wizard and the Settings picture show the real fonts.
import { convertFileSrc } from "@tauri-apps/api/core";
import type { BrandState } from "../api";
import { fontFaceCss } from "../brand";

export function ensureFonts(st: Pick<BrandState, "fonts" | "fontsDir">) {
  if (document.getElementById("itv-brand-fonts")) return;
  const style = document.createElement("style");
  style.id = "itv-brand-fonts";
  style.textContent = fontFaceCss(st.fonts, st.fontsDir, convertFileSrc);
  document.head.appendChild(style);
}
