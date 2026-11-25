// Server-side UPI screenshot OCR: the same Tesseract engine and parsing rules
// as the in-browser scanner (src/lib/upiScan.js), with sharp standing in for
// canvas. Used by the Vercel function (api/ocr.js) and the local server
// (scripts/ocr-server.mjs).

import sharp from "sharp";
import { createWorker } from "tesseract.js";
import {
  otsuThreshold,
  parseAmountString,
  parseUpiReceipt,
  pickAmountBox,
} from "../src/lib/upiParse.js";

let workerPromise = null;

function getWorker() {
  if (!workerPromise) {
    // Serverless filesystems are read-only except /tmp, where the language
    // data is cached between warm invocations.
    workerPromise = createWorker("eng", 1, { cachePath: "/tmp/tess" }).catch((err) => {
      workerPromise = null;
      throw err;
    });
  }
  return workerPromise;
}

async function recognize(image, { psm = 3 } = {}) {
  const worker = await getWorker();
  await worker.setParameters({ tessedit_pageseg_mode: String(psm), tessedit_char_whitelist: "" });
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

// Mirrors preprocessImage(): grayscale, invert dark-theme screenshots, boost
// contrast and upscale small images. Returns single-channel raw pixels for
// both the auto-chosen polarity and its opposite, since many receipts mix a
// coloured header (light text) with a dark or light body.
async function preprocess(input, targetWidth = 1600) {
  const meta = await sharp(input).rotate().metadata();
  const baseW = meta.autoOrient?.width || meta.width || 1;
  const scale = baseW < targetWidth ? Math.min(2.5, targetWidth / baseW) : 1;
  const { data, info } = await sharp(input)
    .rotate()
    .resize({ width: Math.round(baseW * scale) })
    .grayscale()
    .extractChannel(0)
    .raw()
    .toBuffer({ resolveWithObject: true });
  let sum = 0;
  for (let i = 0; i < data.length; i += 1) sum += data[i];
  const autoInvert = sum / data.length < 128;
  const variant = (invert) => {
    const out = Buffer.alloc(data.length);
    for (let i = 0; i < data.length; i += 1) {
      const g = invert ? 255 - data[i] : data[i];
      // Darken mid-tones and push highlights to white so thin text stays legible.
      out[i] = g < 150 ? Math.max(0, g * 0.55) : Math.min(255, 255 - (255 - g) * 0.65);
    }
    return { data: out, width: info.width, height: info.height };
  };
  return [variant(autoInvert), variant(!autoInvert)];
}

const toPng = ({ data, width, height }) =>
  sharp(data, { raw: { width, height, channels: 1 } }).png().toBuffer();

// Mirrors readAmountRegion(): crop the amount, binarise, upscale, re-read.
async function readAmountRegion(gray, bbox) {
  const pad = Math.round((bbox.y1 - bbox.y0) * 0.3);
  const x0 = Math.max(0, Math.round(bbox.x0 - pad));
  const y0 = Math.max(0, Math.round(bbox.y0 - pad));
  const x1 = Math.min(gray.width, Math.round(bbox.x1 + pad));
  const y1 = Math.min(gray.height, Math.round(bbox.y1 + pad));
  const w = Math.max(1, x1 - x0);
  const h = Math.max(1, y1 - y0);
  const scale = Math.min(3, Math.max(1, Math.round(1400 / w)));
  const { data, info } = await sharp(gray.data, { raw: { width: gray.width, height: gray.height, channels: 1 } })
    .extract({ left: x0, top: y0, width: w, height: h })
    .resize({ width: w * scale, height: h * scale })
    .extractChannel(0)
    .raw()
    .toBuffer({ resolveWithObject: true });
  const threshold = otsuThreshold(data);
  for (let i = 0; i < data.length; i += 1) data[i] = data[i] > threshold ? 255 : 0;
  const { text } = await recognize(await toPng({ data, width: info.width, height: info.height }), { psm: 7 });
  return parseAmountString(text);
}

export async function scanUpiImage(input) {
  const passes = [];
  for (const gray of await preprocess(input)) {
    const { text, words } = await recognize(await toPng(gray));
    passes.push({ gray, text, box: words.length ? pickAmountBox(words) : null });
  }
  // The main pass's text comes first so its date/payee win; the other pass
  // fills in what was unreadable in that polarity.
  const result = parseUpiReceipt(passes.map((p) => p.text).join("\n"), [], { fallbackToday: false });
  const best = passes
    .filter((p) => p.box)
    .sort((a, b) => b.box.h - a.box.h || b.box.confidence - a.box.confidence)[0];
  if (best) {
    const refined = await readAmountRegion(best.gray, best.box.bbox).catch(() => null);
    if (refined) result.amount = refined;
  }
  return {
    amount: result.amount || null,
    entry_date: result.entry_date || null,
    paid_to: result.paid_to || null,
    reference: result.reference || null,
    payment_method: result.payment_method,
    app: result.app || null,
    text: result.rawText,
  };
}

const MAX_BYTES = 10 * 1024 * 1024;

async function readBody(req) {
  if (Buffer.isBuffer(req.body)) return req.body;
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BYTES) throw Object.assign(new Error("Image too large"), { status: 413 });
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

// Node (req, res) handler: POST raw image bytes, get the parsed receipt back.
// Only the API calls this, authenticated by a shared secret.
export async function handleOcrRequest(req, res) {
  const secret = process.env.INTERNAL_API_SECRET;
  if (!secret || req.headers["x-internal-secret"] !== secret) return send(res, 401, { detail: "Unauthorized" });
  if (req.method !== "POST") return send(res, 405, { detail: "POST an image" });
  try {
    const body = await readBody(req);
    if (!body.length) return send(res, 400, { detail: "Empty image" });
    return send(res, 200, await scanUpiImage(body));
  } catch (err) {
    return send(res, err.status || 500, { detail: err.status ? err.message : "Could not read that image" });
  }
}
