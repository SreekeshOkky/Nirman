// Client-side UPI receipt scanning: preprocess a screenshot, OCR it with
// Tesseract (WASM, runs entirely in the browser), and heuristically map the
// text to a ledger entry. No screenshot ever leaves the device.

import { parseUpiReceipt, otsuThreshold, parseAmountString, pickAmountBox } from "./upiParse";

export { parseUpiReceipt };

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not open that image"));
    img.src = src;
  });
}

// Grayscale, auto-invert dark-theme screenshots, boost contrast and upscale
// small images. This is the single biggest accuracy win for UPI screenshots.
export async function preprocessImage(file, { targetWidth = 1600, invert = "auto" } = {}) {
  if (typeof document === "undefined" || !file) return file;
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const baseW = img.naturalWidth || img.width || 1;
    const baseH = img.naturalHeight || img.height || 1;
    const scale = baseW < targetWidth ? Math.min(2.5, targetWidth / baseW) : 1;
    const w = Math.max(1, Math.round(baseW * scale));
    const h = Math.max(1, Math.round(baseH * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, w, h);
    const data = ctx.getImageData(0, 0, w, h);
    const px = data.data;
    let sum = 0;
    for (let i = 0; i < px.length; i += 4) {
      const g = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
      px[i] = px[i + 1] = px[i + 2] = g;
      sum += g;
    }
    const mean = sum / (w * h);
    const doInvert = invert === true || (invert === "auto" && mean < 128);
    for (let i = 0; i < px.length; i += 4) {
      const g = doInvert ? 255 - px[i] : px[i];
      // Darken mid-tones and push highlights to white so thin text stays legible.
      const v = g < 150 ? Math.max(0, g * 0.55) : Math.min(255, 255 - (255 - g) * 0.65);
      px[i] = px[i + 1] = px[i + 2] = v;
    }
    ctx.putImageData(data, 0, 0);
    return canvas;
  } finally {
    URL.revokeObjectURL(url);
  }
}

let progressCb = null;
let workerPromise = null;

function getWorker() {
  if (!workerPromise) {
    workerPromise = import("tesseract.js")
      .then(({ createWorker }) =>
        createWorker("eng", 1, {
          logger: (m) => {
            try {
              if (progressCb) progressCb(m);
            } catch {
              /* ignore progress errors */
            }
          },
        }),
      )
      .catch((err) => {
        workerPromise = null;
        throw err;
      });
  }
  return workerPromise;
}

export async function recognizeDetailed(image, onProgress, { psm = 3, whitelist = "" } = {}) {
  progressCb = onProgress || null;
  const worker = await getWorker();
  await worker.setParameters({
    tessedit_pageseg_mode: String(psm),
    tessedit_char_whitelist: whitelist || "",
  });
  const { data } = await worker.recognize(image, {}, { text: true, blocks: true });
  const words = [];
  (data.blocks || []).forEach((b) =>
    (b.paragraphs || []).forEach((p) =>
      (p.lines || []).forEach((l) =>
        (l.words || []).forEach((w) => {
          if (w.text && w.text.trim() && w.bbox) {
            words.push({ text: w.text, confidence: w.confidence, bbox: w.bbox });
          }
        }),
      ),
    ),
  );
  return { text: data.text || "", words };
}

export async function recognizeText(image, onProgress, options = {}) {
  const { text } = await recognizeDetailed(image, onProgress, options);
  return text;
}

async function readAmountRegion(source, bbox) {
  const boxH = bbox.y1 - bbox.y0;
  const pad = Math.round(boxH * 0.3);
  const x0 = Math.max(0, Math.round(bbox.x0 - pad));
  const y0 = Math.max(0, Math.round(bbox.y0 - pad));
  const x1 = Math.min(source.width, Math.round(bbox.x1 + pad));
  const y1 = Math.min(source.height, Math.round(bbox.y1 + pad));
  const w = Math.max(1, x1 - x0);
  const h = Math.max(1, y1 - y0);
  const scale = Math.min(3, Math.max(1, Math.round(1400 / w)));
  const cw = w * scale;
  const ch = h * scale;
  const canvas = document.createElement("canvas");
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(source, x0, y0, w, h, 0, 0, cw, ch);
  const data = ctx.getImageData(0, 0, cw, ch);
  const px = data.data;
  const gray = new Uint8Array(cw * ch);
  for (let i = 0, j = 0; i < px.length; i += 4, j += 1) gray[j] = px[i];
  const threshold = otsuThreshold(gray);
  for (let i = 0, j = 0; i < px.length; i += 4, j += 1) {
    const v = gray[j] > threshold ? 255 : 0;
    px[i] = px[i + 1] = px[i + 2] = v;
  }
  ctx.putImageData(data, 0, 0);
  const text = await recognizeText(canvas, null, { psm: 7 });
  return parseAmountString(text);
}

export async function scanUpiScreenshot(file, categories, onProgress, options = {}) {
  const image =
    options.preprocess === false ? file : await preprocessImage(file, options);
  const { text, words } = await recognizeDetailed(image, onProgress, options);
  const result = parseUpiReceipt(text, categories);
  if (image && typeof image.getContext === "function" && words.length) {
    const box = pickAmountBox(words);
    if (box) {
      const refined = await readAmountRegion(image, box.bbox);
      if (refined) result.amount = refined;
    }
  }
  return result;
}
