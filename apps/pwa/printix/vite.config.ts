import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv, type Plugin } from "vite";
import { VitePWA } from "vite-plugin-pwa";
import { headersForApi } from "./src/headers/csp-headers";

// Writes the build's own API origin into out/_headers (see src/headers/csp-headers.ts).
function apiOriginHeaders(apiUrl: string | undefined): Plugin {
  return {
    name: "printix-api-origin-headers",
    apply: "build",
    closeBundle() {
      const file = path.resolve(import.meta.dirname, "out/_headers");
      writeFileSync(file, headersForApi(readFileSync(file, "utf8"), apiUrl));
    },
  };
}

// The scanner is files only (out/), served by Cloudflare Pages with
// public/_headers; every server answer comes from FastAPI.
export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    // loadEnv also reads VITE_ variables set in the shell.
    apiOriginHeaders(loadEnv(mode, import.meta.dirname, "VITE_").VITE_API_URL),
    // The service worker keeps every file of the app on the phone, so the
    // scanner opens with no signal. API calls are never cached: a ticket is
    // only ever checked by the server or by the saved offline list.
    VitePWA({
      registerType: "prompt",
      injectRegister: false,
      manifest: false,
      workbox: {
        globPatterns: ["**/*.{html,js,css,wasm,woff2,png,webmanifest}"],
        // The barcode reader's WebAssembly and the main script are large.
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        navigateFallback: "/index.html",
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "./src") },
  },
  server: { port: 3064, strictPort: true },
  preview: { port: 3064, strictPort: true },
  build: { outDir: "out", emptyOutDir: true, target: "es2022" },
}));
