/**
 * A minimal PNG reader: enough to verify dimensions and measure alpha bounds.
 *
 * The build tooling must run on a bare Node install, so this implements only the
 * subset a PNG needs for that job — IHDR, the colour types Pillow writes, and the
 * per-scanline filters. It is not a general-purpose image decoder, and it is not
 * shipped in the plugin package.
 */

import { inflateSync } from 'node:zlib';

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Samples per pixel for each supported PNG colour type. */
const CHANNELS = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

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

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

export const PNG = {
  /**
   * Decodes a PNG into `{ width, height, channels, data }`.
   * @param {Buffer} buffer
   */
  decode(buffer) {
    if (!buffer.subarray(0, 8).equals(SIGNATURE)) throw new Error('not a PNG file');

    let offset = 8;
    let header;
    const idat = [];
    let palette = null;
    let transparency = null;

    while (offset + 8 <= buffer.length) {
      const length = buffer.readUInt32BE(offset);
      const type = buffer.toString('latin1', offset + 4, offset + 8);
      const data = buffer.subarray(offset + 8, offset + 8 + length);
      const expected = buffer.readUInt32BE(offset + 8 + length);
      if (crc32(buffer.subarray(offset + 4, offset + 8 + length)) !== expected) {
        throw new Error(`corrupt PNG: bad CRC in ${type} chunk`);
      }

      if (type === 'IHDR') {
        header = {
          width: data.readUInt32BE(0),
          height: data.readUInt32BE(4),
          depth: data[8],
          colorType: data[9],
          interlace: data[12]
        };
      } else if (type === 'PLTE') {
        palette = Buffer.from(data);
      } else if (type === 'tRNS') {
        transparency = Buffer.from(data);
      } else if (type === 'IDAT') {
        idat.push(Buffer.from(data));
      } else if (type === 'IEND') {
        break;
      }
      offset += 12 + length;
    }

    if (!header) throw new Error('PNG has no IHDR chunk');
    if (header.depth !== 8) throw new Error(`unsupported bit depth ${header.depth}`);
    if (header.interlace !== 0) throw new Error('interlaced PNGs are not supported');
    const channels = CHANNELS[header.colorType];
    if (!channels) throw new Error(`unsupported colour type ${header.colorType}`);

    const raw = inflateSync(Buffer.concat(idat));
    const stride = header.width * channels;
    const out = Buffer.alloc(stride * header.height);

    for (let y = 0; y < header.height; y++) {
      const filter = raw[y * (stride + 1)];
      const line = raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride);
      const target = out.subarray(y * stride, (y + 1) * stride);
      const previous = y > 0 ? out.subarray((y - 1) * stride, y * stride) : null;

      for (let i = 0; i < stride; i++) {
        const rawByte = line[i];
        const left = i >= channels ? target[i - channels] : 0;
        const up = previous ? previous[i] : 0;
        const upLeft = previous && i >= channels ? previous[i - channels] : 0;
        let value;
        switch (filter) {
          case 0:
            value = rawByte;
            break;
          case 1:
            value = rawByte + left;
            break;
          case 2:
            value = rawByte + up;
            break;
          case 3:
            value = rawByte + ((left + up) >> 1);
            break;
          case 4:
            value = rawByte + paeth(left, up, upLeft);
            break;
          default:
            throw new Error(`unknown PNG filter ${filter} on row ${y}`);
        }
        target[i] = value & 0xff;
      }
    }

    return { width: header.width, height: header.height, channels, colorType: header.colorType, data: out, palette, transparency };
  },

  /**
   * Bounding box of pixels with alpha at or above `threshold`, within a region.
   *
   * Returned coordinates are relative to the region's own origin, so a caller
   * measuring one grid cell gets the artwork box inside that cell.
   *
   * @returns {{ x: number, y: number, width: number, height: number } | null}
   */
  alphaBox(image, originX, originY, width, height, threshold = 8) {
    const { channels, colorType, data, width: imageWidth } = image;
    if (colorType !== 6 && colorType !== 4) throw new Error('alpha bounds need an alpha channel');

    const alphaAt = colorType === 6 ? 3 : 1;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (let y = 0; y < height; y++) {
      const rowBase = (originY + y) * imageWidth * channels;
      for (let x = 0; x < width; x++) {
        if (data[rowBase + (originX + x) * channels + alphaAt] < threshold) continue;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }

    if (minX === Infinity) return null;
    return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
  }
};

export default PNG;
