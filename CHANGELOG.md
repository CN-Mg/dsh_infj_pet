# Changelog

All notable changes to this plugin are documented here. This project follows
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## 1.0.0

First release.

**The companion**

- Six poses — 静观 resting, 洞察 working, 共情 waiting, 笃定 celebrating, 充电
  sleeping, 受挫 error — each mapped to one facet of the INFJ description on the
  reference card.
- A low-poly sage drawn as flat SVG: green robe, teal sash, white hair, headband,
  long beard, and a forked staff.
- Per-pose CSS animation (head tilt, beard sway, staff swing, blink) that is
  disabled by `prefers-reduced-motion` or by the motion setting.

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
- `npm run check` enforces manifest, patch, locale, asset, and artwork-drift
  invariants; `npm test` covers behaviour with a small React harness.
