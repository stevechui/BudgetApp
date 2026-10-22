// Copies the PDF.js worker and Tesseract OCR assets into public/ so statement
// parsing runs fully offline. Runs on postinstall; output is gitignored.
import { cpSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const root = join(dirname(new URL(import.meta.url).pathname), "..");
const pkgDir = (name) => dirname(require.resolve(`${name}/package.json`));

const pdfjsOut = join(root, "public/pdfjs");
mkdirSync(pdfjsOut, { recursive: true });
cpSync(join(pkgDir("pdfjs-dist"), "build/pdf.worker.min.mjs"), join(pdfjsOut, "pdf.worker.min.mjs"));

const tessOut = join(root, "public/tesseract");
mkdirSync(join(tessOut, "core"), { recursive: true });
mkdirSync(join(tessOut, "lang"), { recursive: true });
cpSync(join(pkgDir("tesseract.js"), "dist/worker.min.js"), join(tessOut, "worker.min.js"));

const coreDir = pkgDir("tesseract.js-core");
for (const file of readdirSync(coreDir)) {
  if (file.endsWith(".wasm.js")) cpSync(join(coreDir, file), join(tessOut, "core", file));
}

cpSync(
  join(pkgDir("@tesseract.js-data/eng"), "4.0.0_best_int/eng.traineddata.gz"),
  join(tessOut, "lang/eng.traineddata.gz"),
);

console.log("Copied PDF.js and Tesseract assets to public/");
