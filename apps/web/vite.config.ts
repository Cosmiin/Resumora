/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const api = "http://127.0.0.1:8788";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    proxy: { "/v1": api, "/health": api },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["src/test/setup.ts"],
    pool: "threads",
  },
});
