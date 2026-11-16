import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The scanner is files only (out/), served by Cloudflare Pages with
// public/_headers; every server answer comes from FastAPI.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "./src") },
  },
  server: { port: 3064, strictPort: true },
  preview: { port: 3064, strictPort: true },
  build: { outDir: "out", emptyOutDir: true, target: "es2022" },
});
