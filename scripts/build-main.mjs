// Baut Hauptprozess und Preload (TypeScript) zu CommonJS – wie VD-Link scripts/build-main.mjs.
import { build } from "esbuild";

await build({
  entryPoints: { main: "src/main/main.ts", preload: "src/main/preload.ts", "preload-about": "src/main/preload-about.ts" },
  outdir: "dist-electron",
  outExtension: { ".js": ".cjs" },
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node22",
  external: ["electron"],
  sourcemap: true,
  logLevel: "info",
});
