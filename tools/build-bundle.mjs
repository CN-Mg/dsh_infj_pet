#!/usr/bin/env node
/**
 * Assembles `lib/client.js` from the reviewed regions in `lib/src/`.
 *
 * The browser half must be one self-contained lazy-CJS bundle, so it cannot use
 * ES imports at runtime. Instead the bundle is generated: each region is a plain
 * text module under `lib/src/`, and this script concatenates them in a fixed
 * order, inlining the sprite sheet and the frame data.
 *
 * `lib/client.js` is generated output. Edit `lib/src/*.mjs`, then run:
 *   npm run bundle
 * `tests/bundle.test.mjs` rebuilds the bundle and fails when the committed file
 * disagrees, so the two can never drift.
 *
 * Usage:
 *   node tools/build-bundle.mjs          # write lib/client.js
 *   node tools/build-bundle.mjs --check  # fail if lib/client.js is stale
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Region order. `artwork` is generated here rather than read from disk. */
const ORDER = JSON.parse(readFileSync(join(root, 'lib', 'src', 'order.json'), 'utf8'));

function readRegion(name) {
  const source = readFileSync(join(root, 'lib', 'src', `${name}.mjs`), 'utf8');
  const match = source.match(/^export default (.*);$/m);
  if (!match) throw new Error(`lib/src/${name}.mjs has no single-line default export`);
  return JSON.parse(match[1]);
}

/** The sheet, stripped of line breaks so it can live inside one JS string. */
function sheetBase64() {
  const text = readFileSync(join(root, 'assets', 'sage.png.b64'), 'utf8').replace(/\s+/g, '');
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(text)) {
    throw new Error('assets/sage.png.b64 is not clean base64 — run: node tools/build-sage-index.mjs');
  }
  return text;
}

/** The frame data the renderer needs, trimmed of anything only the tools use. */
function spriteData() {
  const index = JSON.parse(readFileSync(join(root, 'assets', 'sage-index.json'), 'utf8'));
  return {
    sheet: { width: index.sheetWidth, height: index.sheetHeight },
    cell: { width: index.cellWidth, height: index.cellHeight },
    stage: index.stage,
    states: index.states.map((state) => ({
      name: state.state,
      fps: state.fps,
      frames: state.frames.map((frame) => [frame.x, frame.y])
    })),
    directions: index.directions.map((direction) => [direction.degrees, direction.x, direction.y])
  };
}

export function buildBundle() {
  const b64 = sheetBase64();
  const data = JSON.stringify(spriteData());
  const regions = new Map();
  for (const name of ORDER) {
    regions.set(name, name === 'artwork' ? null : readRegion(name));
  }

  // The artwork region is a template: it carries placeholders so the 2 MB
  // payload lives in assets/ exactly once instead of in this script as well.
  const template = readRegion('artwork');
  const artwork = template
    .replace('__SHEET_BASE64__', b64)
    .replace('__SPRITE_DATA__', data);

  return ORDER.map((name) => (name === 'artwork' ? artwork : regions.get(name))).join('');
}

const invokedDirectly = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (invokedDirectly) {
  const bundle = buildBundle();
  const path = join(root, 'lib', 'client.js');

  if (process.argv.includes('--check')) {
    const current = readFileSync(path, 'utf8');
    if (current !== bundle) {
      console.error('bundle: lib/client.js is stale — run: npm run bundle');
      process.exit(1);
    }
    console.log(`bundle: up to date (${(bundle.length / 1024 / 1024).toFixed(2)} MB)`);
  } else {
    writeFileSync(path, bundle);
    console.log(
      `bundle: wrote lib/client.js (${(bundle.length / 1024 / 1024).toFixed(2)} MB from ${ORDER.length} regions)`
    );
  }
}
