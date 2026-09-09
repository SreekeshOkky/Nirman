import { brand } from "./brand";

function hexToRgb(hex) {
  const value = hex.replace("#", "");
  const full =
    value.length === 3
      ? value
          .split("")
          .map((ch) => ch + ch)
          .join("")
      : value;
  if (full.length !== 6 || Number.isNaN(parseInt(full, 16))) return null;
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  };
}

function shade(hex, factor) {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));
  return `rgb(${clamp(rgb.r * factor)}, ${clamp(rgb.g * factor)}, ${clamp(rgb.b * factor)})`;
}

export function applyTheme() {
  const root = document.documentElement;
  const accent = import.meta.env.VITE_THEME_ACCENT || "";
  const rgb = hexToRgb(accent);
  if (rgb) {
    const { r, g, b } = rgb;
    root.style.setProperty("--accent", accent);
    root.style.setProperty("--accent-hover", shade(accent, 0.86));
    root.style.setProperty("--accent-strong", shade(accent, 0.8));
    root.style.setProperty("--accent-soft", `rgba(${r}, ${g}, ${b}, 0.1)`);
    root.style.setProperty("--accent-border", `rgba(${r}, ${g}, ${b}, 0.35)`);
    root.style.setProperty("--accent-focus", `rgba(${r}, ${g}, ${b}, 0.5)`);
    root.style.setProperty("--accent-ring", `rgba(${r}, ${g}, ${b}, 0.2)`);
  }
  document.title = `${brand.name} | Construction ledger`;
  const themeColor = document.querySelector('meta[name="theme-color"]');
  if (themeColor && rgb) themeColor.setAttribute("content", accent);
}
