import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const brandName = env.VITE_BRAND_NAME || "Nirmanam";
  const accent = env.VITE_THEME_ACCENT || "#ef6f39";

  return {
    plugins: [
      react(),
      VitePWA({
        registerType: "autoUpdate",
        injectRegister: "inline",
        includeAssets: [
          "icons/pwa-192.png",
          "icons/pwa-512.png",
          "icons/pwa-1024.png",
          "icons/apple-touch-icon.png",
          "icons/icon.svg",
        ],
        manifest: {
          name: brandName,
          short_name: brandName,
          description:
            "A construction-site ledger for builders and supervisors.",
          theme_color: accent,
          background_color: "#f7f8f4",
          display: "standalone",
          orientation: "portrait",
          start_url: "/",
          scope: "/",
          icons: [
            { src: "/icons/pwa-192.png", sizes: "192x192", type: "image/png" },
            { src: "/icons/pwa-512.png", sizes: "512x512", type: "image/png" },
            { src: "/icons/pwa-1024.png", sizes: "1024x1024", type: "image/png" },
            {
              src: "/icons/maskable-512.png",
              sizes: "512x512",
              type: "image/png",
              purpose: "maskable",
            },
          ],
        },
        workbox: {
          globPatterns: ["**/*.{js,css,html,png,svg,ico,webmanifest}"],
          navigateFallbackDenylist: [/^\/api\//, /^\/rest\//, /^\/auth\//],
        },
      }),
    ],
  };
});
