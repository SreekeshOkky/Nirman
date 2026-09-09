import sharp from "sharp";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(fileURLToPath(import.meta.url));
const svg = path.join(root, "../public/icons/icon.svg");
const outDir = path.join(root, "../public/icons");

const targets = [
  { name: "pwa-192.png", size: 192 },
  { name: "pwa-512.png", size: 512 },
  { name: "pwa-1024.png", size: 1024 },
  { name: "apple-touch-icon.png", size: 180 },
  { name: "maskable-512.png", size: 512, pad: true },
];

for (const t of targets) {
  let s = sharp(svg).resize(t.size, t.size);
  if (t.pad) {
    const inner = await sharp(svg)
      .resize(Math.round(t.size * 0.62), Math.round(t.size * 0.62))
      .png()
      .toBuffer();
    s = sharp({
      create: {
        width: t.size,
        height: t.size,
        channels: 4,
        background: { r: 239, g: 111, b: 57, alpha: 1 },
      },
    }).composite([{ input: inner }]);
  }
  await s.png().toFile(path.join(outDir, t.name));
  console.log("wrote", t.name);
}
