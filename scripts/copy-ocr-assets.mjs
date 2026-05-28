import { mkdir, copyFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = fileURLToPath(new URL("..", import.meta.url));

const assets = [
  {
    from: "node_modules/tesseract.js/dist/worker.min.js",
    to: "dist/tesseract/worker.min.js",
  },
  {
    from: "node_modules/tesseract.js-core/tesseract-core-lstm.wasm.js",
    to: "dist/tesseract/tesseract-core-lstm.wasm.js",
  },
  {
    from: "node_modules/tesseract.js-core/tesseract-core-lstm.wasm",
    to: "dist/tesseract/tesseract-core-lstm.wasm",
  },
  {
    from: "node_modules/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz",
    to: "dist/tessdata/4.0.0_best_int/eng.traineddata.gz",
  },
];

for (const asset of assets) {
  const source = resolve(rootDir, asset.from);
  const target = resolve(rootDir, asset.to);

  await mkdir(dirname(target), { recursive: true });
  await copyFile(source, target);
}

console.log(`Copied ${assets.length} OCR assets.`);
