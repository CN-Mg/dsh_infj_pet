/**
 * Derives the small packaged assets from the sprite sheet:
 *
 *   assets/icon.png    — the plugin-manager icon: the sage's head, cropped from
 *                        the resting frame and upscaled with nearest-neighbour
 *                        so it stays pixel art.
 *   assets/preview.png — a contact sheet of every animation, for the README.
 *
 * Both are generated, never hand-edited. `tools/check.mjs` re-derives the icon
 * and fails when the committed file disagrees, so the drawing has one source.
 *
 * Run with: node tools/build-icons.mjs [--check]
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PNG } from './png.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/** The icon: head and shoulders, taken from the first resting frame. */
export const ICON_CROP = { x: 52, y: 40, width: 96, height: 104 };
export const ICON_SCALE = 3;

/** The contact-sheet layout. */
const SHEET_SCALE = 1;
const SHEET_COLUMNS = 8;
const SHEET_GAP = 8;
const SHEET_BACKDROP = [0xdc, 0xea, 0xd8];

export function readPixel(image, x, y) {
  const at = (y * image.width + x) * image.channels;
  const data = image.data;
  if (image.colorType === 6) return [data[at], data[at + 1], data[at + 2], data[at + 3]];
  if (image.colorType === 4) return [data[at], data[at], data[at], data[at + 1]];
  return [data[at], data[at + 1], data[at + 2], 255];
}

/** Crops a region and scales it with nearest-neighbour, optionally on a colour. */
export function cropAndScale(image, region, scale, background) {
  const width = Math.round(region.width * scale);
  const height = Math.round(region.height * scale);
  const out = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    const sourceY = region.y + Math.floor(y / scale);
    for (let x = 0; x < width; x++) {
      const sourceX = region.x + Math.floor(x / scale);
      const [r, g, b, a] = readPixel(image, sourceX, sourceY);
      const at = (y * width + x) * 4;
      if (background) {
        const alpha = a / 255;
        out[at] = Math.round(r * alpha + background[0] * (1 - alpha));
        out[at + 1] = Math.round(g * alpha + background[1] * (1 - alpha));
        out[at + 2] = Math.round(b * alpha + background[2] * (1 - alpha));
        out[at + 3] = 255;
      } else {
        out[at] = r;
        out[at + 1] = g;
        out[at + 2] = b;
        out[at + 3] = a;
      }
    }
  }
  return { width, height, data: out };
}

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let c = 0xffffffff;
  for (let i = 0; i < buffer.length; i++) c = CRC_TABLE[(c ^ buffer[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Wraps raw RGBA pixels as a PNG buffer. */
export function encodePng(image) {
  const stride = image.width * 4;
  const raw = Buffer.alloc((stride + 1) * image.height);
  for (let y = 0; y < image.height; y++) {
    raw[y * (stride + 1)] = 0; // no filter: these images are small, simple wins
    image.data.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  const chunks = [];
  const chunk = (type, data) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    chunks.push(length, body, crc);
  };

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(image.width, 0);
  ihdr.writeUInt32BE(image.height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // truecolour with alpha
  ihdr[10] = 0; // deflate
  ihdr[11] = 0; // adaptive filtering
  ihdr[12] = 0; // no interlace

  chunk('IHDR', ihdr);
  chunk('IDAT', deflateSync(raw, { level: 9 }));
  chunk('IEND', Buffer.alloc(0));

  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), ...chunks]);
}

/** The README contact sheet: one cell per animation, left to right. */
export function buildContactSheet(sheet, index) {
  const cellW = index.cellWidth * SHEET_SCALE;
  const cellH = index.cellHeight * SHEET_SCALE;
  const columns = Math.min(SHEET_COLUMNS, index.states.length);
  const rows = Math.ceil(index.states.length / columns);
  const width = columns * cellW + (columns + 1) * SHEET_GAP;
  const height = rows * cellH + (rows + 1) * SHEET_GAP;

  const out = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    out[i * 4] = SHEET_BACKDROP[0];
    out[i * 4 + 1] = SHEET_BACKDROP[1];
    out[i * 4 + 2] = SHEET_BACKDROP[2];
    out[i * 4 + 3] = 255;
  }

  index.states.forEach((state, position) => {
    const column = position % columns;
    const row = Math.floor(position / columns);
    const originX = SHEET_GAP + column * (cellW + SHEET_GAP);
    const originY = SHEET_GAP + row * (cellH + SHEET_GAP);
    const frame = state.frames[0];
    for (let y = 0; y < cellH; y++) {
      for (let x = 0; x < cellW; x++) {
        const [r, g, b, a] = readPixel(sheet, frame.x + x, frame.y + y);
        if (a === 0) continue;
        const alpha = a / 255;
        const at = ((originY + y) * width + originX + x) * 4;
        out[at] = Math.round(r * alpha + out[at] * (1 - alpha));
        out[at + 1] = Math.round(g * alpha + out[at + 1] * (1 - alpha));
        out[at + 2] = Math.round(b * alpha + out[at + 2] * (1 - alpha));
        out[at + 3] = 255;
      }
    }
  });

  return { width, height, data: out };
}

/** Decodes the sheet and returns both derived PNG buffers. */
export function buildAssets() {
  const sheet = PNG.decode(readFileSync(join(root, 'assets', 'sage.png')));
  const index = JSON.parse(readFileSync(join(root, 'assets', 'sage-index.json'), 'utf8'));
  return {
    icon: encodePng(cropAndScale(sheet, ICON_CROP, ICON_SCALE)),
    preview: encodePng(buildContactSheet(sheet, index))
  };
}

/** Only the icon, which is what `npm run check` re-derives. */
export function buildIcon() {
  const sheet = PNG.decode(readFileSync(join(root, 'assets', 'sage.png')));
  return encodePng(cropAndScale(sheet, ICON_CROP, ICON_SCALE));
}

const invokedDirectly = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (invokedDirectly) {
  const targets = [
    [join(root, 'assets', 'icon.png'), buildIcon()],
    [join(root, 'assets', 'preview.png'), buildAssets().preview]
  ];

  if (process.argv.includes('--check')) {
    let stale = false;
    for (const [path, expected] of targets) {
      const name = path.slice(root.length + 1);
      let current = null;
      try {
        current = readFileSync(path);
      } catch (error) {
        stale = true;
      }
      if (current === null) console.error(`icons: missing ${name} — run: node tools/build-icons.mjs`);
      else if (!current.equals(expected)) console.error(`icons: ${name} is stale — run: node tools/build-icons.mjs`);
    }
    if (stale) process.exit(1);
    console.log('icons: up to date');
  } else {
    for (const [path, data] of targets) {
      writeFileSync(path, data);
      console.log(`icons: wrote ${path.slice(root.length + 1)} (${data.length} bytes)`);
    }
  }
}
