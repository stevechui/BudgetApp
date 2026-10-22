"use client";

import type { TextItem } from "./types";

export type PageInfo = { page: number; method: "text" | "ocr"; items: number };

export type Extraction = { items: TextItem[]; pages: PageInfo[] };

export type ExtractProgress = { page: number; pageCount: number; stage: "text" | "ocr"; ocrProgress?: number };

export class PdfPasswordError extends Error {
  constructor(readonly incorrect: boolean) {
    super(incorrect ? "Incorrect password" : "This PDF is password protected");
  }
}

/** Pages with fewer text items than this are treated as scanned images. */
const MIN_TEXT_ITEMS = 5;
const OCR_SCALE = 2.5;

type OcrWorker = Awaited<ReturnType<typeof import("tesseract.js")["createWorker"]>>;

async function createOcrWorker(onProgress: (p: number) => void): Promise<OcrWorker> {
  const { createWorker, OEM } = await import("tesseract.js");
  return createWorker("eng", OEM.LSTM_ONLY, {
    workerPath: "/tesseract/worker.min.js",
    corePath: "/tesseract/core",
    langPath: "/tesseract/lang",
    workerBlobURL: false,
    logger: (m) => {
      if (m.status === "recognizing text") onProgress(m.progress);
    },
  });
}

/**
 * Reads a statement PDF in the browser. Each page's text layer is used when present;
 * pages without text are rendered and run through local OCR.
 */
export async function extractPdf(
  file: File,
  options: { password?: string; onProgress?: (p: ExtractProgress) => void } = {},
): Promise<Extraction> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdfjs/pdf.worker.min.mjs";

  const data = new Uint8Array(await file.arrayBuffer());
  const task = pdfjs.getDocument({ data, password: options.password });
  let doc;
  try {
    doc = await task.promise;
  } catch (e) {
    if (e instanceof pdfjs.PasswordException) {
      throw new PdfPasswordError(e.code === pdfjs.PasswordResponses.INCORRECT_PASSWORD);
    }
    throw e;
  }

  const items: TextItem[] = [];
  const pages: PageInfo[] = [];
  let ocr: OcrWorker | null = null;
  let currentPage = 0;
  const report = (stage: ExtractProgress["stage"], ocrProgress?: number) =>
    options.onProgress?.({ page: currentPage, pageCount: doc.numPages, stage, ocrProgress });

  try {
    for (let n = 1; n <= doc.numPages; n++) {
      currentPage = n;
      report("text");
      const page = await doc.getPage(n);
      const viewport = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      const pageItems: TextItem[] = [];
      for (const item of content.items) {
        if (!("str" in item) || !item.str.trim()) continue;
        const [, , , , x, y] = pdfjs.Util.transform(viewport.transform, item.transform);
        pageItems.push({ str: item.str, x, y, w: item.width, h: item.height || 8, page: n });
      }

      if (pageItems.length >= MIN_TEXT_ITEMS) {
        items.push(...pageItems);
        pages.push({ page: n, method: "text", items: pageItems.length });
        page.cleanup();
        continue;
      }

      report("ocr", 0);
      ocr ??= await createOcrWorker((p) => report("ocr", p));
      const ocrViewport = page.getViewport({ scale: OCR_SCALE });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(ocrViewport.width);
      canvas.height = Math.ceil(ocrViewport.height);
      // Transparent pixels read as black to OCR, which hides black text.
      await page.render({ canvas, viewport: ocrViewport, background: "white" }).promise;
      const { data: result } = await ocr.recognize(canvas, {}, { blocks: true });
      const ocrItems: TextItem[] = [];
      for (const block of result.blocks ?? []) {
        for (const para of block.paragraphs) {
          for (const line of para.lines) {
            for (const word of line.words) {
              if (!word.text.trim()) continue;
              const { x0, y0, x1, y1 } = word.bbox;
              ocrItems.push({
                str: word.text,
                x: x0 / OCR_SCALE,
                // Words in one OCR line share its bottom edge, so descenders don't split the line.
                y: line.bbox.y1 / OCR_SCALE,
                w: (x1 - x0) / OCR_SCALE,
                h: (y1 - y0) / OCR_SCALE,
                page: n,
              });
            }
          }
        }
      }
      items.push(...ocrItems);
      pages.push({ page: n, method: "ocr", items: ocrItems.length });
      canvas.width = canvas.height = 0;
      page.cleanup();
    }
  } finally {
    await ocr?.terminate();
    await task.destroy();
  }

  return { items, pages };
}
