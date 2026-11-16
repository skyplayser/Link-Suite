import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));

// Renderer (Oberfläche). Hauptprozess und Preload baut scripts/build-main.mjs mit esbuild (wie VD-Link).
export default defineConfig({
  base: "./",
  publicDir: root + "public",
  build: {
    outDir: "dist",
    target: "es2022",
    assetsInlineLimit: 0,
    rolldownOptions: { input: { main: root + "index.html", about: root + "about.html" } },
  },
});
