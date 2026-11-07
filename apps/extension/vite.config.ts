/// <reference types="vitest/config" />
import { resolve } from "node:path";
import { defineConfig, loadEnv } from "vite";
import { environmentsFrom } from "./src/environments";
import { buildManifest } from "./src/manifest";

export default defineConfig(({ mode }) => ({
  base: "./",
  plugins: [{
    name: "extension-manifest",
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "manifest.json",
        source: JSON.stringify(
          buildManifest(environmentsFrom(loadEnv(mode, __dirname, "VITE_"))),
          null,
          2,
        ),
      });
    },
  }],
  build: {
    outDir: "dist",
    rollupOptions: {
      input: {
        background: resolve(__dirname, "src/background.ts"),
        popup: resolve(__dirname, "popup.html"),
      },
      output: {
        entryFileNames: "[name].js",
        chunkFileNames: "[name].js",
        assetFileNames: "[name][extname]",
      },
    },
  },
  test: { environment: "jsdom" },
}));
