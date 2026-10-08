#!/usr/bin/env node
/**
 * Structural verification for the plugin package.
 *
 * This is not a substitute for loading the plugin in DSH. It catches the
 * mistakes that are cheap to make and expensive to debug in the browser: a
 * sprite sheet that drifted from its index or from the copy embedded in the
 * bundle, a malformed patch or locale file, or a manifest whose declared entry
 * points do not exist.
 */

import { readFileSync, existsSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildIcon } from './build-icons.mjs';
import { buildBundle } from './build-bundle.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const problems = [];
const notes = [];

function fail(message) {
  problems.push(message);
}

function ok(message) {
  notes.push(message);
}

function read(relative) {
  const path = join(root, relative);
  if (!existsSync(path)) {
    fail(`missing file: ${relative}`);
    return undefined;
  }
  return readFileSync(path, 'utf8');
}

function readJson(relative) {
  const text = read(relative);
  if (text === undefined) return undefined;
  try {
    return JSON.parse(text);
  } catch (error) {
    fail(`${relative} is not valid JSON: ${error.message}`);
    return undefined;
  }
}

/* ---- 1. manifest ------------------------------------------------------- */

const manifest = readJson('package.json');
if (manifest) {
  if (manifest.name !== 'dsh-plugin-infj-pet') fail(`unexpected package name: ${manifest.name}`);
  if (manifest.type !== 'module') fail('package must be an ES module (type: module)');
  if (!manifest.dsh?.bundle?.patch) fail('package.json is missing dsh.bundle.patch');
  if (!manifest.dsh?.client?.platform) fail('package.json is missing dsh.client.platform');
  if (!Array.isArray(manifest.dsh?.client?.inject)) fail('package.json is missing dsh.client.inject');
  for (const [subpath, target] of Object.entries(manifest.exports ?? {})) {
    const relative = target.replace(/^\.\//, '');
    if (!existsSync(join(root, relative))) fail(`exports["${subpath}"] points at a missing file: ${relative}`);
  }
  for (const entry of ['lib', 'assets', 'locale', 'cordis.patch.yml', 'README.md', 'LICENSE']) {
    if (!manifest.files?.includes(entry)) fail(`package.json "files" omits ${entry}`);
  }
  if (manifest.dependencies && Object.keys(manifest.dependencies).length > 0) {
    fail('the plugin must ship zero runtime dependencies');
  }
  ok(`manifest ok (${manifest.name}@${manifest.version})`);
}

/* ---- 2. patch file ----------------------------------------------------- */

const patch = read('cordis.patch.yml');
if (patch !== undefined) {
  if (!/^\s*-\s*insert:/m.test(patch)) fail('cordis.patch.yml has no insert row');
  if (!/id:\s*infj-pet\b/.test(patch)) fail('cordis.patch.yml does not declare the infj-pet row');
  if (!/name:\s*dsh-plugin-infj-pet\b/.test(patch)) fail('cordis.patch.yml names the wrong module');
  if (/^\s*-\s*(replace|remove):/m.test(patch)) fail('cordis.patch.yml must only insert, never replace official rows');
  ok('cordis.patch.yml inserts one row and replaces nothing');
}

/* ---- 3. locales -------------------------------------------------------- */

const locales = ['en', 'zh'].map((code) => {
  const data = readJson(`locale/${code}.json`);
  if (data && (!data.meta?.title || !data.meta?.description)) fail(`locale/${code}.json needs meta.title and meta.description`);
  return data;
});
if (locales.every(Boolean)) ok('both locales carry a title and a description');

/* ---- 4. bundle shape --------------------------------------------------- */

const client = read('lib/client.js');
if (client !== undefined) {
  if (!client.includes('window.__ModuleLoader__.load({')) {
    fail('lib/client.js must register with the client module loader');
  }
  if (!/id:\s*'dsh-plugin-infj-pet'/.test(client)) fail("the bundle must register id 'dsh-plugin-infj-pet'");
  if (!client.includes("require('react')")) fail("the bundle must require 'react'");
  if (/require\(\s*'react-dom'\s*\)/.test(client)) {
    fail("require('react-dom') must not appear: only the '/client' subpath is used, and only lazily");
  }
  if (!client.includes("require('react-dom/client')")) {
    fail("the direct-mount fallback must require 'react-dom/client'");
  }
  ok('bundle entry, id, and module requests look right');
}

/* ---- 4. sprite assets, and the sheet actually embedded in the bundle --- */

const sheetPath = join(root, 'assets', 'sage.png');
const index = readJson('assets/sage-index.json');
if (index) {
  if (!existsSync(sheetPath)) {
    fail('assets/sage.png is missing');
  } else {
    const sheet = readFileSync(sheetPath);
    const digest = createHash('sha256').update(sheet).digest('hex');
    if (digest !== index.sha256) {
      fail(`assets/sage.png does not match assets/sage-index.json\n         index: ${index.sha256}\n         asset: ${digest}`);
    }
    if (index.sheetWidth / index.columns !== index.cellWidth) fail('the index cell width disagrees with the sheet');
    if (index.sheetHeight / index.rows !== index.cellHeight) fail('the index cell height disagrees with the sheet');
    if (index.directions.length !== 16) fail(`the index should carry 16 gaze directions, it has ${index.directions.length}`);

    // Every frame must address a whole cell, or the renderer draws a seam.
    for (const state of index.states) {
      if (state.frames.length === 0) fail(`state ${state.state} has no frames`);
      for (const frame of state.frames) {
        if (frame.x % index.cellWidth !== 0) fail(`state ${state.state} frame x=${frame.x} is not on a cell boundary`);
        if (frame.y % index.cellHeight !== 0) fail(`state ${state.state} frame y=${frame.y} is not on a cell boundary`);
        if (frame.x + index.cellWidth > index.sheetWidth) fail(`state ${state.state} frame x=${frame.x} runs off the sheet`);
        if (frame.y + index.cellHeight > index.sheetHeight) fail(`state ${state.state} frame y=${frame.y} runs off the sheet`);
      }
    }
    if (index.stage.ground > index.cellHeight) fail('the index ground line falls outside a cell');

    // The generated icon must match the sheet it came from.
    try {
      const expectedIcon = buildIcon();
      const onDisk = readFileSync(join(root, 'assets', 'icon.png'));
      if (!onDisk.equals(expectedIcon)) {
        fail('assets/icon.png is stale — run: node tools/build-icons.mjs');
      } else {
        ok('packaged icon matches the sprite sheet');
      }
    } catch (error) {
      fail(`assets/icon.png is missing or unreadable (${error.message}) — run: node tools/build-icons.mjs`);
    }

    // The bundle embeds the sheet as base64; that copy must be the same bytes.
    if (client !== undefined) {
      const b64Path = join(root, 'assets', 'sage.png.b64');
      if (!existsSync(b64Path)) {
        fail('assets/sage.png.b64 is missing — run: node tools/build-sage-index.mjs');
      } else {
        const expected = sheet.toString('base64');
        const onDisk = readFileSync(b64Path, 'utf8').replace(/\s+/g, '');
        if (onDisk !== expected) {
          fail('assets/sage.png.b64 is stale — run: node tools/build-sage-index.mjs');
        } else if (!client.includes(expected)) {
          fail('lib/client.js does not embed the current sheet — run: node tools/build-bundle.mjs');
        } else {
          ok(`sprite sheet verified (${index.columns}x${index.rows} cells of ${index.cellWidth}x${index.cellHeight}, ${index.states.length} states, ${index.directions.length} directions)`);
        }
      }
    }
  }
}

/* ---- 5. the packable payload stays sane -------------------------------- */

if (client !== undefined) {
  const bytes = Buffer.byteLength(client, 'utf8');
  // The embedded sheet dominates the bundle; this catches a stray duplication of
  // it, which would otherwise double the payload silently.
  const marker = 'data:image/png;base64,';
  const found = client.split(marker).length - 1;
  if (found !== 1) fail(`the sheet data URI should appear exactly once in the bundle, it appears ${found} times`);
  if (bytes > 4 * 1024 * 1024) fail(`lib/client.js is ${bytes} bytes, which is larger than expected`);
  for (const placeholder of ['__SHEET_BASE64__', '__SPRITE_DATA__']) {
    if (client.includes(placeholder)) fail(`a build placeholder survived into the bundle: ${placeholder}`);
  }
  ok(`bundle is ${(bytes / 1024 / 1024).toFixed(2)} MB with one embedded sheet`);
}

/* ---- 6. lib/client.js is generated from lib/src ------------------------ */

if (client !== undefined) {
  try {
    if (buildBundle() !== client) {
      fail('lib/client.js has drifted from lib/src — run: npm run bundle');
    } else {
      ok('generated bundle matches its sources in lib/src');
    }
  } catch (error) {
    fail(`lib/src could not be assembled: ${error.message}`);
  }
}

/* ---- report ------------------------------------------------------------ */

for (const note of notes) console.log('  ok   ' + note);
if (problems.length > 0) {
  console.error('');
  for (const problem of problems) console.error('  FAIL ' + problem);
  console.error(`\n${problems.length} problem(s) found.`);
  process.exit(1);
}
console.log('\nAll structural checks passed.');
