import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  build: {
    outDir: "dist",
    emptyOutDir: false,
    lib: {
      entry: resolve(__dirname, "src/reader-entry.ts"),
      name: "ResumoraReader",
      formats: ["iife"],
      fileName: () => "reader.js",
    },
  },
});
