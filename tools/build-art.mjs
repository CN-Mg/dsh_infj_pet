#!/usr/bin/env node
/**
 * Generates the embedded artwork region and the packaged SVG assets.
 *
 * Usage:
 *   node tools/build-art.mjs           # print the region that belongs in lib/client.js
 *   node tools/build-art.mjs --write    # rewrite the region in lib/client.js and assets/
 *
 * `lib/art.js` is the single source of truth. `lib/client.js` cannot import it
 * (the browser bundle must stay self-contained), so the region between the
 * ART-REGION sentinels is copied verbatim. `tools/check.mjs` fails when the two
 * copies disagree, which makes this script the only way to edit the drawing.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { renderSageSvg, ART_VIEWBOX } from '../lib/art.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const artPath = join(root, 'lib', 'art.js');
const clientPath = join(root, 'lib', 'client.js');
const assetsDir = join(root, 'assets');

const START = '/* ART-REGION-START */';
const END = '/* ART-REGION-END */';

/**
 * Reads the marked region out of lib/art.js and wraps it as a self-contained
 * IIFE that exposes exactly what the bundle needs. The sentinels are part of
 * the returned text so the result can be written straight into lib/client.js
 * and compared against the copy already embedded there.
 */
export function buildRegion() {
  const source = readFileSync(artPath, 'utf8');
  const start = source.indexOf(START);
  const end = source.indexOf(END);
  if (start < 0 || end < 0) throw new Error('lib/art.js is missing its ART-REGION sentinels');
  const inner = source.slice(start + START.length, end).trimEnd();
  return [
    START,
    '// --- generated from lib/art.js by tools/build-art.mjs: do not edit here ---',
    '// ART_VIEWBOX and BOTTOM_INSET are defined above; the region captures them.',
    'var ART = (function () {',
    inner,
    '  return { viewBox: ART_VIEWBOX, bottomInset: BOTTOM_INSET, nodes: sageNodes };',
    '})();',
    END
  ].join('\n');
}

/**
 * Rewrites the region inside lib/client.js between its own sentinels.
 *
 * The sentinel count is checked rather than assumed: a duplicated end marker
 * would silently swallow the code between the copies on the next run, which is
 * exactly the kind of damage this generator must not be able to cause.
 */
export function writeRegionInto(source, region) {
  const starts = source.split(START).length - 1;
  const ends = source.split(END).length - 1;
  if (starts !== 1 || ends !== 1) {
    throw new Error(`lib/client.js must contain exactly one of each ART-REGION sentinel (found ${starts} start, ${ends} end)`);
  }
  const start = source.indexOf(START);
  const end = source.indexOf(END);
  if (end < start) throw new Error('lib/client.js has its ART-REGION sentinels out of order');
  // `region` already carries both sentinels, so the surrounding text must stop
  // before the opening one.
  return source.slice(0, start) + region + '\n' + source.slice(end + END.length);
}

/** The packaged assets: the plugin icon plus one still per character state. */
export function buildAssets() {
  const files = [];
  files.push([
    join(assetsDir, 'icon.svg'),
    renderSageSvg({ headOnly: true, size: ART_VIEWBOX, background: '#EAF3E5' })
  ]);
  for (const state of ['resting', 'working', 'waiting', 'celebrating', 'sleeping', 'error']) {
    const svg = renderSageSvg({ size: ART_VIEWBOX }).replace(
      'role="img"',
      'role="img" data-state="' + state + '"'
    );
    files.push([join(assetsDir, state + '.svg'), svg]);
  }
  return files;
}

const invokedDirectly = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (invokedDirectly) {
  const region = buildRegion();
  if (process.argv.includes('--write')) {
    const current = readFileSync(clientPath, 'utf8');
    const next = writeRegionInto(current, region);
    writeFileSync(clientPath, next);
    console.log('updated lib/client.js artwork region');

    mkdirSync(assetsDir, { recursive: true });
    for (const [path, content] of buildAssets()) {
      writeFileSync(path, content + '\n');
      console.log('wrote ' + path.slice(root.length + 1));
    }
  } else {
    process.stdout.write(region + '\n');
  }
}
