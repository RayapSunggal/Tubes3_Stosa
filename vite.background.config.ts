import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  root: "src",
  publicDir: false,
  build: {
    outDir: "../dist",
    emptyOutDir: false,
    copyPublicDir: false,
    lib: {
      entry: resolve(__dirname, "src/nodes/background.ts"),
      name: "JudolDetectorBackground",
      formats: ["iife"],
      fileName: () => "background.js",
    },
  },
});
