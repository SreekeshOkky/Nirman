// Client-side UPI receipt scanning: preprocess a screenshot, OCR it with
// Tesseract (WASM, runs entirely in the browser), and heuristically map the
// text to a ledger entry. No screenshot ever leaves the device.

const APPS = [
  { re: /super\s*\.?\s*money|supermoney|superyes/i, name: "super.money" },
  { re: /phonepe/i, name: "PhonePe" },
  { re: /google\s*pay|gpay|googlepay/i, name: "Google Pay" },
  { re: /paytm/i, name: "Paytm" },
  { re: /amazon\s*pay|amazonpay/i, name: "Amazon Pay" },
  { re: /whatsapp\s*pay/i, name: "WhatsApp Pay" },
  { re: /bharatpe/i, name: "BharatPe" },
  { re: /freecharge/i, name: "Freecharge" },
  { re: /jupiter/i, name: "Jupiter" },
  { re: /\bfi\s*money\b|fimoney/i, name: "Fi Money" },
  { re: /bhim/i, name: "BHIM" },
  { re: /cred\b/i, name: "CRED" },
  { re: /mobikwik/i, name: "MobiKwik" },
  { re: /navi\b/i, name: "Navi" },
  { re: /slice/i, name: "Slice" },
];

// Scanned UPI screenshots are treated as expenses (money paid out). Change this
// to "income" if a deployment wants the opposite default.
const SCAN_ENTRY_TYPE = "expense";

const INCOME_RE =
  /\b(received from|money received|you received|credited to|credited|credit|deposited|refund|cashback|added to)\b/i;
const EXPENSE_RE =
  /\b(paid to|you paid|sent to|debited from|debited|transfer to|transferred|payment to|withdrawn|withdrawal|purchase|paid|sent)\b/i;

const MONTHS = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};

const CATEGORY_HINTS = [
  [/\b(cement|concrete|rmc|sand|aggregate|brick|block|masonry)\b/i, ["cement", "concrete", "brick", "sand"]],
  [/\b(steel|tmt|rebar|rod|sariya|saria)\b/i, ["steel", "rebar", "rod"]],
  [/\b(labour|labor|wage|wages|mistri|mazdoor|worker|workmen|contractor)\b/i, ["labour", "labor", "wage", "contractor"]],
  [/\b(rent|rental|jcb|mixer|crane|machine|equipment|excavator|hire)\b/i, ["rent", "equipment", "machine", "hire"]],
  [/\b(electric|electrical|wiring|wire|switch|cable|mcb)\b/i, ["electric"]],
  [/\b(plumb|plumbing|pipe|fitting|sanitary|tap|bathroom)\b/i, ["plumb", "pipe", "sanitary", "fitting"]],
  [/\b(transport|diesel|petrol|fuel|lorry|truck|freight|delivery|tipper)\b/i, ["transport", "fuel", "freight", "logistics"]],
  [/\b(paint|painting|primer|putty)\b/i, ["paint"]],
  [/\b(tile|tiles|marble|granite|flooring|vitrified)\b/i, ["tile", "marble", "granite", "floor"]],
  [/\b(wood|timber|ply|plywood|door|window|furniture)\b/i, ["wood", "timber", "door", "window"]],
  [/\b(advance|booking|token amount)\b/i, ["advance", "booking", "token"]],
  [/\b(client|customer|owner|milestone)\b/i, ["client", "customer", "milestone"]],
];

const BALANCE_RE = /\b(balance|available|a\/c|account\s*bal|limit|total\s*balance)\b/i;

function parseAmount(text) {
  const lines = text.split(/\r?\n/);
  const keyLines = [];
  lines.forEach((line, idx) => {
    if (INCOME_RE.test(line) || EXPENSE_RE.test(line)) keyLines.push(idx);
  });
  const collect = (re) => {
    const out = [];
    lines.forEach((line, idx) => {
      if (BALANCE_RE.test(line)) return;
      let m;
      re.lastIndex = 0;
      while ((m = re.exec(line))) {
        const raw = m[1];
        const val = Number(raw.replace(/,/g, ""));
        if (!isFinite(val) || val <= 0) continue;
        const grouped = raw.includes(",") || raw.includes(".");
        // skip bare years such as "2026"
        if (val >= 1900 && val <= 2099 && !grouped) continue;
        const start = m.index;
        const end = m.index + m[0].length;
        // skip clock times like 3:24
        if (line[start - 1] === ":" || line[end] === ":") continue;
        // skip long reference numbers such as UTRs
        if (!grouped && raw.replace(/\D/g, "").length >= 9) continue;
        out.push({ val, line: idx });
      }
    });
    return out;
  };
  // Tiers: currency-prefixed, Indian-grouped, then any plain number.
  const tiers = [
    /(?:₹|rs\.?|inr)\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/gi,
    /\b(\d{1,3}(?:,\d{2,3})+(?:\.\d{1,2})?)\b/g,
    /\b(\d{2,6}(?:\.\d{1,2})?)\b/g,
  ];
  for (const re of tiers) {
    const cands = collect(re);
    if (!cands.length) continue;
    if (keyLines.length) {
      const near = cands.filter((c) =>
        keyLines.some((k) => Math.abs(c.line - k) <= 2),
      );
      if (near.length) return near.sort((a, b) => b.val - a.val)[0].val;
    }
    return cands.sort((a, b) => b.val - a.val)[0].val;
  }
  return "";
}

function isoDate(y, mo, d) {
  if (!y || !mo || !d || mo < 1 || mo > 12 || d < 1 || d > 31) return "";
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function parseDate(text) {
  const t = text.replace(/\s+/g, " ");
  const year = new Date().getFullYear();
  let m = t.match(
    /\b(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?,?\s+(\d{4})\b/i,
  );
  if (m) return isoDate(Number(m[3]), MONTHS[m[2].toLowerCase()], Number(m[1]));
  m = t.match(
    /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})\b/i,
  );
  if (m) return isoDate(Number(m[3]), MONTHS[m[1].toLowerCase()], Number(m[2]));
  m = t.match(/\b(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})\b/);
  if (m) {
    let y = Number(m[3]);
    if (y < 100) y += 2000;
    const a = Number(m[1]);
    const b = Number(m[2]);
    // Indian screenshots are day-first unless the second value cannot be a month.
    if (b > 12 && a <= 12) return isoDate(y, a, b);
    return isoDate(y, b, a);
  }
  // Day + month + 2-digit year ("1st Jul 26").
  m = t.match(
    /\b(\d{1,2})(?:st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?,?\s+(\d{2})\b/i,
  );
  if (m) return isoDate(2000 + Number(m[3]), MONTHS[m[2].toLowerCase()], Number(m[1]));
  // Month + day + 2-digit year ("Sep 2 26").
  m = t.match(
    /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+(\d{1,2}),?\s+(\d{2})\b/i,
  );
  if (m) return isoDate(2000 + Number(m[3]), MONTHS[m[1].toLowerCase()], Number(m[2]));
  // Month + day with no year ("September 2 at 1:06 PM").
  m = t.match(
    /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?\b/i,
  );
  if (m) return isoDate(year, MONTHS[m[1].toLowerCase()], Number(m[2]));
  // Day + month with no year ("2 September").
  m = t.match(
    /\b(\d{1,2})(?:st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\b/i,
  );
  if (m) return isoDate(year, MONTHS[m[2].toLowerCase()], Number(m[1]));
  return "";
}

function parseCounterparty(text) {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const labelRe =
    /^[^\p{L}\d]{0,3}(?:paid to|sent to|received from|payment to|payee|beneficiary(?:\s*name)?|account holder|account name|banking name|name|to|from|paid|received)\b[:\-–]?\s*(.*)$/iu;
  for (let i = 0; i < lines.length; i += 1) {
    const m = lines[i].match(labelRe);
    if (!m) continue;
    let val = (m[1] || "").trim();
    if (!val && lines[i + 1]) val = lines[i + 1];
    val = val
      .replace(/\s*(?:upi\s*id|vpa|upi)\b.*$/i, "")
      .replace(/[₹].*$/, "")
      .replace(/\b\d{6,}\b.*$/, "")
      .trim();
    if (!val) continue;
    if (/^(upi|transaction|utr|account|bank|balance|your|the)\b/i.test(val)) continue;
    return val.slice(0, 80);
  }
  // Fallback for screenshots where the "Paid to" label wasn't read: the payee
  // is usually the first plain name after the status line.
  const statusIdx = lines.findIndex((l) =>
    /\b(successful|success|completed|paid|received|sent|done)\b/i.test(l),
  );
  const start = statusIdx >= 0 ? statusIdx + 1 : 0;
  for (let i = start; i < lines.length; i += 1) {
    const l = lines[i];
    if (!/[A-Za-z]{3}/.test(l) || /@/.test(l) || /^\d/.test(l)) continue;
    if (
      /\b(upi|vpa|phonepe|google|gpay|paytm|amazon|bhim|cred|successful|transaction|amount|date|bank|ref|id|from|to|balance)\b/i.test(
        l,
      )
    )
      continue;
    return l.slice(0, 80);
  }
  return "";
}

function parseReference(text) {
  const m = text.match(
    /(?:utr|transaction\s*id|txn\s*id|transaction\s*no|reference\s*(?:no|number|id)?|ref\s*no|order\s*id|rrn)[:\s#]*([A-Za-z0-9]{6,})/i,
  );
  if (m) return m[1];
  const m2 = text.match(/\b(\d{12})\b/);
  return m2 ? m2[1] : "";
}

function suggestCategory(text, categories, entryType) {
  const pool = (categories || []).filter(
    (c) => c.type === entryType || c.type === "both" || !c.type,
  );
  const lower = text.toLowerCase();
  for (const c of pool) {
    const words = (c.name || "")
      .toLowerCase()
      .split(/[^a-z]+/)
      .filter((w) => w.length > 3);
    if (words.some((w) => lower.includes(w))) return c.id;
  }
  for (const [re, keys] of CATEGORY_HINTS) {
    if (!re.test(text)) continue;
    const hit = pool.find((c) =>
      keys.some((k) => (c.name || "").toLowerCase().includes(k)),
    );
    if (hit) return hit.id;
  }
  return "";
}

export function parseUpiReceipt(text, categories = []) {
  const raw = (text || "").replace(/\u00a0/g, " ");
  const app = (APPS.find((a) => a.re.test(raw)) || {}).name || "";

  // UPI screenshots are recorded as expenses by default (see SCAN_ENTRY_TYPE).
  const entry_type = SCAN_ENTRY_TYPE;

  const amount = parseAmount(raw);
  const entry_date = parseDate(raw) || new Date().toISOString().slice(0, 10);
  const counterparty = parseCounterparty(raw);
  const reference = parseReference(raw);
  const category_id = suggestCategory(raw, categories, entry_type);
  const payment_method = /\b(neft|imps|rtgs)\b/i.test(raw) ? "Bank Transfer" : "UPI";
  const verb = entry_type === "income" ? "UPI from" : "UPI to";
  const description = `${verb}${counterparty ? ` ${counterparty}` : ""} (${app || "UPI"})`.slice(0, 120);

  return {
    entry_type,
    amount: amount || "",
    entry_date,
    category_id,
    payment_method,
    description,
    note: reference ? `UPI ref: ${reference}` : "",
    counterparty,
    reference,
    app,
    rawText: raw,
  };
}

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

// Parse a short string like "₹400", "R410.00" or "1,250.00" into a number.
function parseAmountString(value) {
  if (!value) return null;
  const cleaned = value.replace(/[^\d.,]/g, "").replace(/,/g, "");
  const m = cleaned.match(/\d+(?:\.\d{1,2})?/);
  if (!m) return null;
  const num = Number(m[0]);
  return isFinite(num) && num > 0 ? num : null;
}

function otsuThreshold(gray) {
  const hist = new Array(256).fill(0);
  for (let i = 0; i < gray.length; i += 1) hist[gray[i]] += 1;
  const total = gray.length;
  let sum = 0;
  for (let i = 0; i < 256; i += 1) sum += i * hist[i];
  let sumB = 0;
  let wB = 0;
  let best = -1;
  let threshold = 127;
  for (let t = 0; t < 256; t += 1) {
    wB += hist[t];
    if (!wB) continue;
    const wF = total - wB;
    if (!wF) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > best) {
      best = between;
      threshold = t;
    }
  }
  return threshold;
}

// The amount is the largest number on a UPI receipt. Crop that region,
// binarise + upscale it and re-read it so a misread currency glyph (₹ -> digit)
// becomes a letter we can strip.
function pickAmountBox(words) {
  const cands = words
    .map((w) => ({
      ...w,
      h: (w.bbox?.y1 || 0) - (w.bbox?.y0 || 0),
      digits: (w.text.match(/\d/g) || []).length,
    }))
    .filter((w) => w.digits >= 2 && w.h > 0 && !/^\D*\d{9,}/.test(w.text));
  if (!cands.length) return null;
  cands.sort((a, b) => b.h - a.h || b.confidence - a.confidence);
  return cands[0];
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
