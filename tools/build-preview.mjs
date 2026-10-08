#!/usr/bin/env node
/**
 * Builds a self-contained `preview.html` from the sprite sheet and its index.
 *
 * The preview is a development and documentation aid: it opens straight from
 * disk with no server, no DSH connection, and no model call. It slices frames
 * with the same arithmetic the plugin uses, so a wrong frame offset shows up
 * here rather than only in the app.
 *
 * The sheet is embedded once, in a CSS custom property, and every sprite reads
 * it from there — repeating the data URI per element produced a 50 MB file.
 *
 * Usage: node tools/build-preview.mjs
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const index = JSON.parse(readFileSync(join(root, 'assets', 'sage-index.json'), 'utf8'));
const sheet = readFileSync(join(root, 'assets', 'sage.png')).toString('base64');

/** What each animation is used for, so the page explains itself. */
const NOTES = {
  idle: 'Resting. Also holds one still frame while asleep.',
  'run-right': 'A long uninterrupted run: the sage walks alongside it.',
  'run-left': 'In the sheet but unused — the sage keeps to its corner.',
  wave: 'Greeting, kept for a future poke reaction.',
  jump: 'Celebrating: played once when watched work completes.',
  failed: 'Error — a turn ended badly.',
  waiting: 'Waiting — a session needs your answer.',
  working: 'Working — at least one session is busy.',
  pondering: 'Thinking; the walking loop replaces it after a while.'
};

const SCALE = 2;
const sheetW = index.sheetWidth * SCALE;
const sheetH = index.sheetHeight * SCALE;

const animations = index.states
  .map((state) => {
    const count = state.frames.length;
    const steps = state.frames
      .map((frame, position) => {
        const percent = Math.round((position * 100) / count);
        return `${percent}%{background-position:${-frame.x * SCALE}px ${-frame.y * SCALE}px}`;
      })
      .join('');
    return `  @keyframes infj-${state.state}{${steps}}
  .anim-${state.state}{animation:infj-${state.state} ${(count / state.fps).toFixed(2)}s steps(${count}) infinite}`;
  })
  .join('\n');

const cards = index.states
  .map((state) => {
    const count = state.frames.length;
    return `      <figure class="card">
        <div class="stage">
          <div class="sprite anim-${state.state}" style="
            width:${(state.art.width + 12) * SCALE}px;
            height:${(state.art.height + 8) * SCALE}px;
            background-position:${-state.frames[0].x * SCALE}px ${-state.frames[0].y * SCALE}px;
            margin-bottom:${(index.stage.ground - (state.art.y + state.art.height) + 8) * SCALE}px"></div>
        </div>
        <figcaption>
          <strong>${state.state}</strong>
          <span>${count} frame${count === 1 ? '' : 's'} @ ${state.fps} fps &middot; sheet row ${state.row}</span>
          <em>${NOTES[state.state] ?? ''}</em>
          <code>art ${state.art.width}&times;${state.art.height} at (${state.art.x},${state.art.y})</code>
        </figcaption>
      </figure>`;
  })
  .join('\n');

const gazes = index.directions
  .map(
    (direction) => `      <figure class="gaze">
        <div class="sprite" style="--x:${direction.x}px; --y:${direction.y}px;
          width:${Math.round(index.cellWidth * 0.7)}px;
          height:${Math.round(index.cellHeight * 0.7)}px"></div>
        <figcaption>${direction.degrees}&deg;</figcaption>
      </figure>`
  )
  .join('\n');

const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>INFJ Sage — sprite preview</title>
<style>
  :root {
    /* The sheet is embedded exactly once, here. */
    --infj-sheet: url('data:image/png;base64,${sheet}');
    --infj-sheet-w: ${sheetW}px;
    --infj-sheet-h: ${sheetH}px;
  }
  body {
    margin: 0; padding: 32px; background: #EAF3E5; color: #1F3320;
    font: 14px/1.6 system-ui, -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
  }
  h1 { font-size: 22px; margin: 0 0 4px; }
  h2 { font-size: 15px; margin: 34px 0 12px; color: #3C5539; }
  p.lead { margin: 0 0 8px; color: #4E6B4A; max-width: 900px; }
  code { font-size: 12px; color: #3E8F6B; }
  .grid { display: flex; flex-wrap: wrap; gap: 18px; }
  .card {
    margin: 0; padding: 14px 16px 16px; width: 208px; border-radius: 18px;
    background: rgba(255,255,255,0.74); border: 1px solid rgba(80,120,60,0.18);
  }
  .stage { display: flex; justify-content: center; align-items: flex-end; min-height: 306px; }
  figcaption { margin-top: 8px; font-size: 12px; color: #3C5539; }
  figcaption strong { font-size: 13px; display: block; }
  figcaption span { display: block; color: #5C7358; }
  figcaption em { display: block; color: #6B8467; font-style: normal; font-size: 11px; margin: 4px 0 6px; }
  figcaption code { font-size: 10.5px; }
  /* Nearest-neighbour is the rule the plugin ships. */
  .sprite {
    --infj-scale: ${SCALE};
    background-image: var(--infj-sheet);
    background-repeat: no-repeat;
    /* Every sprite derives both its sheet size and its offsets from one factor,
       so a sprite can only ever be a whole-number slice of the sheet. */
    background-size: calc(${index.sheetWidth}px * var(--infj-scale)) calc(${index.sheetHeight}px * var(--infj-scale));
    image-rendering: pixelated; image-rendering: crisp-edges;
    filter: drop-shadow(0 5px 9px rgba(20,40,20,0.18));
  }
  .gazes { display: flex; flex-wrap: wrap; gap: 8px; }
  .gaze {
    margin: 0; padding: 5px; border-radius: 12px; background: rgba(255,255,255,0.6);
    border: 1px solid rgba(80,120,60,0.14); text-align: center;
  }
  .gaze .sprite {
    --infj-scale: 0.7;
    background-position: calc(var(--x) * -0.7) calc(var(--y) * -0.7);
  }
  .gaze figcaption { margin-top: 2px; font-size: 11px; color: #5C7358; }
  footer { margin-top: 30px; color: #5C7358; font-size: 12px; }
  @media (prefers-reduced-motion: reduce) { .sprite { animation: none !important; } }
${animations}
</style>
</head>
<body>
  <h1>INFJ Sage — 精灵图预览 / sprite preview</h1>
  <p class="lead">Every animation in <code>assets/sage.png</code>, sliced exactly the way the plugin slices it.
  Sheet ${index.sheetWidth}&times;${index.sheetHeight}, ${index.columns}&times;${index.rows} cells of
  ${index.cellWidth}&times;${index.cellHeight}, drawn at ${SCALE}&times;. The sheet is embedded once as a CSS variable.</p>

  <div class="grid">
${cards}
  </div>

  <h2>Gaze — ${index.directions.length} head poses</h2>
  <p class="lead">Clockwise from straight up, 22.5&deg; apart. The sage uses these for idle glances.</p>
  <div class="gazes">
${gazes}
  </div>

  <footer>Offline preview generated by tools/build-preview.mjs — no DSH connection, no model calls.</footer>
</body>
</html>
`;

writeFileSync(join(root, 'preview.html'), html);
console.log(
  `wrote preview.html (${(html.length / 1024).toFixed(0)} KB, ${index.states.length} animations, ${index.directions.length} gaze poses)`
);
