import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import pkg from "./package.json";

const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(async () => ({
  define: {
    "import.meta.env.VITE_APP_VERSION": JSON.stringify(pkg.version),
  },

  plugins: [
    react(),
    VitePWA({
      registerType: "prompt",
      includeAssets: [
        "favicon.ico",
        "apple-touch-icon.png",
        "mask-icon.svg",
        "screenshots/desktop-wide.png",
      ],
      manifest: {
        name: "Memephant",
        short_name: "Memephant",
        description: "Your project context, ready for any AI",
        theme_color: "#1a1a2e",
        background_color: "#1a1a2e",
        display: "standalone",

        icons: [
          {
            src: "pwa-192x192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "pwa-512x512.png",
            sizes: "512x512",
            type: "image/png",
          },
          {
            src: "pwa-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],

        screenshots: [
          {
            src: "/screenshots/desktop-wide.png",
            sizes: "1280x800",
            type: "image/png",
            form_factor: "wide",
            label: "Memephant desktop workspace",
          },
        ],
      },

      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
        cleanupOutdatedCaches: true,
        skipWaiting: false,
      },

      devOptions: {
        enabled: false,
      },
    }),
  ],

  clearScreen: false,

  server: {
    port: 1420,
    strictPort: true,
    host: host || "0.0.0.0",
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
}));