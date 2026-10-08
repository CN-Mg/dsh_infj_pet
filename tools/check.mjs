#!/usr/bin/env node
/**
 * Structural verification for the plugin package.
 *
 * This is not a substitute for loading the plugin in DSH. It catches the
 * mistakes that are cheap to make and expensive to debug in the browser:
 * a drifted artwork copy, a malformed patch or locale file, an icon that is not
 * well-formed XML, or a manifest whose declared entry points do not exist.
 */

import { readFileSync, existsSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildRegion } from './build-art.mjs';

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

/* ---- 4. artwork region is generated, not hand-edited ------------------- */

const client = read('lib/client.js');
if (client !== undefined) {
  const marker = '/* ART-REGION-START */';
  const endMarker = '/* ART-REGION-END */';
  const start = client.indexOf(marker);
  const end = client.indexOf(endMarker);
  if (start < 0 || end < 0 || end < start) {
    fail('lib/client.js lost its ART-REGION sentinels');
  } else {
    const embedded = client.slice(start + marker.length, end).trim();
    const generatedText = buildRegion().trim();
    const generatedStart = generatedText.indexOf(marker);
    const generatedEnd = generatedText.indexOf(endMarker);
    const generated = generatedText.slice(generatedStart + marker.length, generatedEnd).trim();
    if (embedded !== generated) {
      fail('lib/client.js artwork region has drifted from lib/art.js — run: node tools/build-art.mjs --write');
    } else {
      ok(`embedded artwork matches lib/art.js (${generated.split('\n').length} lines)`);
    }
  }
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

/* ---- 5. generated SVG assets are well formed -------------------------- */

const assets = ['icon.svg', 'resting.svg', 'working.svg', 'waiting.svg', 'celebrating.svg', 'sleeping.svg', 'error.svg'];
for (const name of assets) {
  const svg = read(`assets/${name}`);
  if (svg === undefined) continue;
  if (!svg.startsWith('<svg ')) fail(`assets/${name} does not start with an <svg> element`);
  if (!svg.trimEnd().endsWith('</svg>')) fail(`assets/${name} is not closed`);
  const opened = (svg.match(/<g[ >]/g) ?? []).length;
  const closed = (svg.match(/<\/g>/g) ?? []).length;
  if (opened !== closed) fail(`assets/${name} has unbalanced <g> elements (${opened} open, ${closed} closed)`);
  const polygons = (svg.match(/<polygon /g) ?? []).length;
  // The icon is the head-only crop, so it legitimately carries fewer shapes.
  const minimum = name === 'icon.svg' ? 8 : 20;
  if (polygons < minimum) fail(`assets/${name} has only ${polygons} polygons (expected at least ${minimum})`);
  if (statSync(join(root, 'assets', name)).size < 1024) fail(`assets/${name} is suspiciously small`);
}
if (problems.length === 0) ok(`${assets.length} generated SVG assets are well formed`);

/* ---- report ------------------------------------------------------------ */

for (const note of notes) console.log('  ok   ' + note);
if (problems.length > 0) {
  console.error('');
  for (const problem of problems) console.error('  FAIL ' + problem);
  console.error(`\n${problems.length} problem(s) found.`);
  process.exit(1);
}
console.log('\nAll structural checks passed.');
