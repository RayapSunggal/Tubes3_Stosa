import { resolve } from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  root: "src",
  publicDir: "public",
  plugins: [react()],
  build: {
    outDir: "../dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup: resolve(__dirname, "src/popup.html"),
        offscreen: resolve(__dirname, "src/offscreen.html"),
        background: resolve(__dirname, "src/nodes/background.ts")
      },
      output: {
        entryFileNames: "[name].js"
      }
    }
  },
});
