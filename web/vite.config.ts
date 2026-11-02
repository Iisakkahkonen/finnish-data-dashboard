import { defineConfig } from "vite";

// Relative base so the site works under a GitHub Pages sub-path.
// publicDir points at the repo's data folder, so indicators.json is copied
// into the build output without a separate sync step.
export default defineConfig({
  base: "./",
  publicDir: "../data",
});
