import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

// Relative base so the site works under a GitHub Pages sub-path.
// publicDir points at the repo's data folder, so indicators.json is copied
// into the build output without a separate sync step.
//
// In e2e mode the build swaps in a recording stand-in for Chart.js and a small
// synthetic dataset, so the browser tests are fast, offline and deterministic.
export default defineConfig(({ mode }) => {
  const e2e = mode === "e2e";
  return {
    base: "./",
    publicDir: e2e ? "e2e/fixture" : "../data",
    resolve: e2e
      ? { alias: { "chart.js": fileURLToPath(new URL("./e2e/chart-fake.js", import.meta.url)) } }
      : {},
  };
});
