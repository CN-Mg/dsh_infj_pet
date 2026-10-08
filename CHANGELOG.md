# Changelog

All notable changes to this plugin are documented here. This project follows
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## Unreleased

**Artwork replaced**

- The character is now **Sage**, the pixel-art INFJ pet produced with the
  built-in image generator (`Sage/`). The hand-drawn SVG sage is gone.
- Nine animations and sixteen head poses come from one 1536×2288 sprite sheet,
  embedded in the bundle so the plugin makes no network request at all.
- The sheet's SHA-256 is checked against the value recorded in its validation
  report, so the plugin cannot ship artwork that differs from what was validated.

**New behaviour**

- **Keeps pace** — after twenty seconds of uninterrupted work the sage switches
  from thinking to a walking loop, then celebrates or slumps when the run ends.
- **Idle glances** — while resting, it looks around using the drawn head poses.
- Display sizes are now exact integer multiples of the sprite pixels (1×, 2×, 3×),
  which is what keeps pixel art crisp; the old fractional sizes are gone.

**Build**

- `lib/client.js` is generated from readable regions in `lib/src/`, so gaps
  between source and bundle show up in review rather than in a diff of a 2 MB
  file.
- `tools/png.mjs` decodes the sheet without any dependency, and the broken
  `--sprite` build path was removed.
- `npm run check` now verifies the sheet hash, the frame boundaries, the gaze
  coverage, the generated icon, and that the bundle matches its sources.
- `npm run build` regenerates the index, icon, contact sheet, bundle and offline
  preview in one pass.

## 1.0.0

First release of the plugin.

**The companion**

- Six semantic states — 静观 resting, 洞察 working, 共情 waiting, 笃定
  celebrating, 充电 sleeping, 受挫 error — each mapped to one facet of the INFJ
  description on the reference card.
- Per-pose animation, disabled by `prefers-reduced-motion` or by the motion
  setting.

**Interaction**

- Click to hear a line in character; drag to reposition with edge snapping and a
  remembered position.
- Right-click settings: session scope, size, nap delay, palette, motion,
  auto-tips, reset position, tuck away, and a trait explainer.
- Bilingual (English / 简体中文), following the DSH language until you choose one.
- Tuck away collapses the sage to a corner restore button.

**Behaviour guarantees**

- Celebration requires an observed rising edge of work, so an idle Host, a
  reconnect, or a vanished session never produces a false win.
- Subagent sessions are counted separately and never inflate your own workload.
- A missing slot registry or store hook degrades to a static companion instead of
  throwing into the session.

**Packaging**

- Zero runtime dependencies; the client bundle is committed, so a Git install
  needs no build step.
- Structural checks and a behavioural test suite ship with the package.
