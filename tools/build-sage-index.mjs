#!/usr/bin/env node
/**
 * Generates `assets/sage-index.json` — the animation lookup the bundle needs.
 *
 * The sprite sheet is a single 8x11 PNG of 192x208 cells. The browser half
 * cannot measure it, so this script reads the accompanying validation report,
 * checks that the grid and the row order are exactly what the bundle expects,
 * and emits one rectangle per frame plus the gaze-angle lookup.
 *
 * Usage:
 *   node tools/build-sage-index.mjs          # write the index
 *   node tools/build-sage-index.mjs --check  # verify the index is current
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PNG } from './png.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const sheetPath = join(root, 'assets', 'sage.png');
const indexPath = join(root, 'assets', 'sage-index.json');
// The provenance copy, checked in beside the sheet. The generation workspace it
// came from is far too large to publish, and the build only needs this report.
const validationPath = join(root, 'assets', 'provenance', 'sage-validation.json');

/** Row order, fixed by the sheet. A mismatch is a hard failure, not a guess. */
const ROWS = [
  { state: 'idle', label: { zh: '静观', en: 'Observing' }, fps: 4 },
  { state: 'run-right', label: { zh: '向右', en: 'Right' }, fps: 12 },
  { state: 'run-left', label: { zh: '向左', en: 'Left' }, fps: 12 },
  { state: 'wave', label: { zh: '招手', en: 'Greeting' }, fps: 6 },
  { state: 'jump', label: { zh: '跃起', en: 'Leaping' }, fps: 8 },
  { state: 'failed', label: { zh: '受挫', en: 'Setback' }, fps: 8 },
  { state: 'waiting', label: { zh: '共情', en: 'Empathy' }, fps: 5 },
  { state: 'working', label: { zh: '洞察', en: 'Insight' }, fps: 7 },
  { state: 'pondering', label: { zh: '沉思', en: 'Pondering' }, fps: 5 }
];

/** The two rotation rows: 16 head poses, 22.5 degrees apart, clockwise from up. */
const GAZE_ROWS = [
  { row: 9, startDegrees: 0 },
  { row: 10, startDegrees: 180 }
];

function fail(message) {
  console.error('sage-index: ' + message);
  process.exit(1);
}

const validation = JSON.parse(readFileSync(validationPath, 'utf8'));
const sheet = readFileSync(sheetPath);
const sha256 = createHash('sha256').update(sheet).digest('hex');

if (validation.sha256 && validation.sha256 !== sha256) {
  fail(
    `assets/sage.png does not match the validated sheet.\n` +
      `  validation: ${validation.sha256}\n` +
      `  asset:      ${sha256}`
  );
}
if (validation.ok !== true) fail('the validation report is not marked ok');
if (validation.errors?.length) fail(`the validation report lists errors: ${validation.errors.join('; ')}`);

const columns = validation.columns;
const rows = validation.rows;
const cellWidth = validation.width / columns;
const cellHeight = validation.height / rows;
if (!Number.isInteger(cellWidth) || !Number.isInteger(cellHeight)) {
  fail(`grid ${columns}x${rows} does not divide ${validation.width}x${validation.height} evenly`);
}
if (rows !== ROWS.length + GAZE_ROWS.length) {
  fail(`expected ${ROWS.length + GAZE_ROWS.length} rows, the report has ${rows}`);
}

/** Frames of one row, by column, with the union artwork box for that row. */
function rowFrames(row) {
  const cells = validation.cells
    .filter((cell) => cell.row === row && cell.used)
    .sort((left, right) => left.column - right.column);
  if (cells.length === 0) fail(`row ${row} has no used cells`);
  return cells;
}

/** Measures the artwork box of every frame in a row, from the decoded PNG. */
function rowArtBox(image, row, cells) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const cell of cells) {
    const box = PNG.alphaBox(image, cell.column * cellWidth, row * cellHeight, cellWidth, cellHeight);
    if (!box) continue;
    minX = Math.min(minX, box.x);
    minY = Math.min(minY, box.y);
    maxX = Math.max(maxX, box.x + box.width);
    maxY = Math.max(maxY, box.y + box.height);
  }
  if (minX === Infinity) fail(`row ${row} has no opaque pixels`);
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

const png = PNG.decode(sheet);

const states = ROWS.map((definition, row) => {
  const cells = rowFrames(row);
  const box = rowArtBox(png, row, cells);
  return {
    state: definition.state,
    label: definition.label,
    fps: definition.fps,
    row,
    frames: cells.map((cell) => ({
      column: cell.column,
      x: cell.column * cellWidth,
      y: row * cellHeight
    })),
    art: box
  };
});

/**
 * The stage: where a 1x character sits inside one cell. `ground` is the lowest
 * opaque row across every animation frame, which is the line the feet stand on
 * and therefore the line the pet should be pinned to on screen.
 */
let stageMinX = Infinity;
let stageMinY = Infinity;
let stageMaxX = -Infinity;
let stageMaxY = -Infinity;
let ground = 0;
for (let row = 0; row < ROWS.length; row++) {
  for (const cell of validation.cells.filter((entry) => entry.row === row && entry.used)) {
    const box = PNG.alphaBox(png, cell.column * cellWidth, row * cellHeight, cellWidth, cellHeight);
    if (!box) continue;
    stageMinX = Math.min(stageMinX, box.x);
    stageMinY = Math.min(stageMinY, box.y);
    stageMaxX = Math.max(stageMaxX, box.x + box.width);
    stageMaxY = Math.max(stageMaxY, box.y + box.height);
    ground = Math.max(ground, box.y + box.height);
  }
}
if (stageMinX === Infinity) fail('no opaque pixels found in any animation frame');

const directions = [];
for (const { row, startDegrees } of GAZE_ROWS) {
  const cells = rowFrames(row);
  if (cells.length !== columns) fail(`rotation row ${row} should be fully populated, found ${cells.length}`);
  cells.forEach((cell, index) => {
    directions.push({
      degrees: startDegrees + index * 22.5,
      x: cell.column * cellWidth,
      y: row * cellHeight
    });
  });
}
directions.sort((left, right) => left.degrees - right.degrees);
if (directions.length !== 16) fail(`expected 16 gaze directions, built ${directions.length}`);

const index = {
  // Provenance rather than decoration: `npm run check` re-verifies these.
  sheet: 'sage.png',
  sha256,
  sheetWidth: validation.width,
  sheetHeight: validation.height,
  columns,
  rows,
  cellWidth,
  cellHeight,
  /** Where a 1x character sits inside one cell, for centring and the ground line. */
  stage: {
    width: cellWidth,
    height: cellHeight,
    art: { x: stageMinX, y: stageMinY, width: stageMaxX - stageMinX, height: stageMaxY - stageMinY },
    ground
  },
  states,
  directions
};

const serialised = JSON.stringify(index, null, 2) + '\n';

/**
 * The base64 body the browser bundle embeds.
 *
 * Kept in its own file so the ~2 MB payload is not written twice into
 * lib/client.js, and stripped of line breaks so the bundle can carry it as one
 * JSON string literal.
 */
const b64Path = join(root, 'assets', 'sage.png.b64');
const b64Body = sheet.toString('base64');

if (process.argv.includes('--check')) {
  let current;
  try {
    current = readFileSync(indexPath, 'utf8');
  } catch (error) {
    fail('assets/sage-index.json is missing — run: node tools/build-sage-index.mjs');
  }
  if (current !== serialised) {
    fail('assets/sage-index.json is stale — run: node tools/build-sage-index.mjs');
  }
  let currentB64;
  try {
    currentB64 = readFileSync(b64Path, 'utf8');
  } catch (error) {
    fail('assets/sage.png.b64 is missing — run: node tools/build-sage-index.mjs');
  }
  if (currentB64.replace(/\s+/g, '') !== b64Body) {
    fail('assets/sage.png.b64 is stale — run: node tools/build-sage-index.mjs');
  }
  const embedded = readFileSync(join(root, 'lib', 'client.js'), 'utf8');
  if (!embedded.includes(b64Body)) {
    fail('lib/client.js does not embed the current sheet — run: node tools/build-bundle.mjs');
  }
  console.log(`sage-index: up to date (${states.length} states, ${directions.length} directions)`);
} else {
  writeFileSync(indexPath, serialised);
  // Chunked so the file stays diff-friendly and editors can open it.
  const wrapped = b64Body.replace(/(.{120})/g, '$1\n');
  writeFileSync(b64Path, wrapped + '\n');
  const frames = states.reduce((total, state) => total + state.frames.length, 0);
  console.log(
    `sage-index: wrote ${states.length} states, ${frames} frames, ${directions.length} directions ` +
      `(cell ${cellWidth}x${cellHeight}, sheet ${validation.width}x${validation.height})`
  );
  console.log(`sage-index: wrote assets/sage.png.b64 (${b64Body.length} base64 chars)`);
}
