import { brand } from "./brand";

// The app ships in one light theme. Older installs may have remembered a
// "dark" or "system" choice; it is cleared so they open in light too.
const PREF_KEY = "appearance";

export function applyTheme() {
  const accent = import.meta.env.VITE_THEME_ACCENT || "";
  // Every accent shade (hover, soft, text) is derived from this one value in
  // tokens.css.
  if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(accent))
    document.documentElement.style.setProperty("--brand-accent", accent);
  document.title = `${brand.name} | Construction ledger`;
  document.documentElement.removeAttribute("data-theme");
  try {
    window.localStorage.removeItem(PREF_KEY);
  } catch {
    // Storage unavailable: nothing was remembered.
  }
  // Match the browser/OS chrome to the page background.
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta)
    meta.setAttribute(
      "content",
      getComputedStyle(document.documentElement)
        .getPropertyValue("--color-paper")
        .trim() || "#f8f5ee",
    );
}
