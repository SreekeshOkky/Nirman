import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const brandName = env.VITE_BRAND_NAME || "Nirmanam";
  const accent = env.VITE_THEME_ACCENT || "#b8481a";

  return {
    plugins: [
      react(),
      VitePWA({
        strategies: "injectManifest",
        srcDir: "src",
        filename: "sw.js",
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
          share_target: {
            action: "/scan",
            method: "POST",
            enctype: "multipart/form-data",
            params: {
              files: [
                {
                  name: "screenshot",
                  accept: ["image/jpeg", "image/png", "image/webp"],
                },
              ],
            },
          },
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
        injectManifest: {
          globPatterns: ["**/*.{js,css,html,png,svg,ico,webmanifest}"],
        },
      }),
    ],
  };
});
