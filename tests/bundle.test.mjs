import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildBundle } from '../tools/build-bundle.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

test('lib/client.js is exactly what the sources in lib/src produce', () => {
  const committed = readFileSync(join(root, 'lib', 'client.js'), 'utf8');
  const rebuilt = buildBundle();
  if (committed !== rebuilt) {
    assert.fail(
      'lib/client.js has drifted from lib/src — run: npm run bundle\n' +
        `         committed: ${committed.length} chars\n` +
        `         rebuilt:   ${rebuilt.length} chars`
    );
  }
  assert.equal(committed.length, rebuilt.length);
});

test('every region in the order file exists and is loadable', () => {
  const order = JSON.parse(readFileSync(join(root, 'lib', 'src', 'order.json'), 'utf8'));
  assert.ok(order.length >= 10, `expected the bundle to be split into regions, found ${order.length}`);
  assert.equal(order[0], 'header');
  assert.equal(order.at(-1), 'plugin');
  for (const name of order) {
    assert.ok(existsSync(join(root, 'lib', 'src', `${name}.mjs`)), `missing region ${name}`);
  }
});

test('the sheet lives in assets once, not in the sources', () => {
  const b64 = readFileSync(join(root, 'assets', 'sage.png.b64'), 'utf8').replace(/\s+/g, '');
  const artwork = readFileSync(join(root, 'lib', 'src', 'artwork.mjs'), 'utf8');
  assert.ok(artwork.includes('__SHEET_BASE64__'), 'the artwork region should carry a sheet placeholder');
  assert.ok(artwork.includes('__SPRITE_DATA__'), 'the artwork region should carry a data placeholder');
  assert.ok(!artwork.includes(b64), 'the sheet payload must not be duplicated into the sources');
  assert.ok(artwork.length < 20_000, `artwork.mjs should stay small, it is ${artwork.length} chars`);
});

test('the generated bundle embeds the sheet exactly once', () => {
  const committed = readFileSync(join(root, 'lib', 'client.js'), 'utf8');
  assert.equal(committed.split('data:image/png;base64,').length - 1, 1);
  assert.ok(!committed.includes('__SHEET_BASE64__'), 'no placeholder may survive into the bundle');
  assert.ok(!committed.includes('__SPRITE_DATA__'), 'no placeholder may survive into the bundle');
});
