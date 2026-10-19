import { brand } from "./brand";

// Appearance preference, remembered per device: "light" (default), "dark",
// or "system" to follow the phone/computer setting.
const PREF_KEY = "appearance";
export const APPEARANCES = ["light", "dark", "system"];

const darkQuery =
  typeof window !== "undefined" && window.matchMedia
    ? window.matchMedia("(prefers-color-scheme: dark)")
    : null;

export function getAppearance() {
  try {
    const value = window.localStorage.getItem(PREF_KEY);
    return APPEARANCES.includes(value) ? value : "light";
  } catch {
    return "light";
  }
}

function resolve(pref) {
  if (pref === "system") return darkQuery?.matches ? "dark" : "light";
  return pref;
}

function paint(pref) {
  const mode = resolve(pref);
  const root = document.documentElement;
  if (mode === "dark") root.setAttribute("data-theme", "dark");
  else root.removeAttribute("data-theme");
  // Match the browser/OS chrome to the page background.
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta)
    meta.setAttribute(
      "content",
      getComputedStyle(root).getPropertyValue("--ground").trim() || "#f6f4f0",
    );
}

export function setAppearance(pref) {
  try {
    window.localStorage.setItem(PREF_KEY, pref);
  } catch {
    // Storage unavailable: the choice applies for this visit only.
  }
  paint(pref);
}

const isHex = (value) => /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(value);

export function applyTheme() {
  const accent = import.meta.env.VITE_THEME_ACCENT || "";
  // Every accent shade (hover, soft, text, dark mode) is derived from this
  // one value in styles.css.
  if (isHex(accent))
    document.documentElement.style.setProperty("--brand-accent", accent);
  document.title = `${brand.name} | Construction ledger`;
  paint(getAppearance());
  darkQuery?.addEventListener?.("change", () => {
    if (getAppearance() === "system") paint("system");
  });
}
