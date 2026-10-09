# Changelog

All notable changes to this plugin are documented here. This project follows
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## 1.0.7

- The sage rests in the **top-left** corner. It floats above the shell, so it
  overlaps the sidebar rather than being hidden behind it.
- A changed default position now reaches people who have dragged the sage before.
  A remembered position beats the default, which is right while someone is
  arranging their own desktop — but it also meant a corrected default was never
  seen. The saved record now carries the layout it belongs to, and a position
  saved under an older layout is ignored once.
- Two drag tests were anchored to the old bottom-right start and are rewritten to
  derive from the viewport, so a future default change will not need them edited.

## 1.0.6

- The resting position sits further from the right edge. Removing the box's
  internal slack in 1.0.5 left the sage flush against the window edge, which read
  as too far right; the corner inset is now wider than the bottom's.
- The speech bubble is a quarter shorter — 1.875× the character's width instead
  of 2.5×, so about 219 px small, 439 px medium and 658 px large. The 1.0.5
  widening overshot; this keeps the comfortable wrap without the long measure.
- The README is the project owner's revision.

## 1.0.5

**The character and its speech bubble line up**

- The box that carries the character was not the size of the character: it
  reserved a ground gap as height while the sprite pushed itself up by the same
  amount as a bottom margin. The visible pixels therefore sat above the box's
  bottom edge, so the sage looked off-centre while the bubble, anchored to the
  box, sat opposite it. The box is now exactly the artwork, and the ground
  clearance is padding on the container — the drawing and the box agree, so the
  speech is centred on the character at every size.
- The five pixels of horizontal margin that widened the box have gone for the
  same reason.

**The bubble is sized to the character**

- The bubble was a fixed 250 px at every scale, which crowded a large sage and
  wasted space on a small one. It is now two and a half times the character's own
  width: about 292 px small, 585 px medium, 878 px large, still clamped to the
  viewport so it cannot overflow a narrow window.

**Citations name the book**

- Quotations are attributed by title only — 《务虚笔记》, 《我与地坛》,
  《病隙碎笔》, 《命若琴弦》 — because the title is what a reader needs in order
  to find the passage. The author's name no longer appears in the interface; it
  remains in the licence notice, where attribution belongs.
- The reading line supplied by the project owner is now attributed to
  《务虚笔记》, which resolves the source that 1.0.2 had recorded as unidentified.
  The edition is still unpinned and the README says so rather than implying more
  certainty than exists.

## 1.0.4

**Fix: the plugin never activated**

`1.0.3` shipped a Host half that could not start. In Cordis an `inject` entry
names a service the plugin waits for, and the entry stays pending until that name
is provided — an object form does not mean "optional". The Host half declared
`{ optional: ['agents'] }`, which asks for a service literally called `optional`.
Nothing provides it, so the entry stayed pending forever and the whole plugin,
browser half included, never loaded. DSH reported it as:

```
1 entry did not activate infj-pet (dsh-plugin-infj-pet):
pending (waiting for service: optional)
```

The `inject` declaration is gone. The optional agents registry is read with
`ctx.get('agents')` instead, which returns `undefined` when it is absent and
costs only the coarse `isSubagent` hint on a recorded boundary.

Guards added so this cannot come back:

- a test asserts `inject` is `undefined`, with the reason in the failure path
- a test asserts the Host half still activates and records a boundary when no
  agents registry is present
- the fake Cordis context no longer needs `agents`, because the plugin must not
  ask for it

**A note on why this was missed.** Forty-six of the forty-seven tests exercised
the browser half, which was never the part failing. The Host half was tested
against a fake context — and a fake context does not enforce the `inject` gate,
because that gate is framework behaviour. A complete stub hid a framework-level
failure; the new assertions target exactly that blind spot.

## 1.0.3

**The sage no longer paces about**

- Working is a reading now. While any session is busy the sage sits with its open
  book and turns the pages; it does not switch to a walking loop after a while,
  and the twenty-second timer that used to trigger one is gone from the machine
  entirely.
- Running belongs to being carried. Drag the sage and it runs in the direction
  you take it, facing left or right, and it turns around at the screen edge so it
  never appears to run out of the window it is pinned to. Letting go stops it at
  once.
- `run-left` finally has a job: it is the inward-facing run when the sage is
  pinned against a wall.

**Drag robustness**

Six bugs surfaced in the drag path while testing this, all of them fixed:

- A drag origin that came back `null` from an unmeasured node poisoned every
  distance after it; the origin is now validated and latched from the first real
  position.
- The drag anchor did not advance, so a reversal was measured from the original
  grab and could not be expressed until the pointer returned past it.
- The screen-edge turnaround tested the clamped result instead of the requested
  distance, so pulling away from a wall flipped the facing the wrong way.
- A pointer press now clears a stale facing, and letting go always stops the run.

## 1.0.2

**The reading revision**

- The leap is gone. When a watched turn finishes, the sage now sits down with an
  open book: steady stance, eye movement, a short blink and a page turn. The
  `celebrating` state is renamed `reading` throughout — the state, its timing
  setting and its internal flag — because that is what actually happens now.
- The animation is a sheet revision, not new code: row 4, the engine's `jumping`
  slot, was redrawn. A pixel comparison in the build verifies the other ten rows
  are unchanged, and the new sheet's SHA-256 is checked against the value
  recorded in its change audit.

**Quoted lines**

- Reading lines are now quotations, attributed in the interface beneath the text
  they belong to, in a smaller and quieter line. A quoted line is never
  presented as the sage's own.
- Only lines that could be checked against a published source are presented as
  quotations; one supplied line is recorded as unpublished rather than silently
  attributed. See the quotation table in the README.
- The bubble grew a source row and the stylesheet a quoted-line variant, so a
  longer line wraps left-aligned instead of sitting centred like a quip.

## 1.0.1

First published release. `1.0.0` was consumed by npm's staged-publish pipeline —
the upload was accepted but never finalised, and the registry then refused to
reuse the version — so the release moved to 1.0.1 with no code change.

**Artwork**

- The character is **Sage**, a pixel-art INFJ pet generated with the built-in
  image generator. One 1536×2288 sprite sheet, an 8×11 grid of 192×208 cells:
  nine animations and sixteen head poses, embedded in the bundle so the plugin
  makes no network request at all.
- The sheet's SHA-256 is checked against the value recorded in its validation
  report, so the plugin cannot ship artwork that differs from what was validated.

**Behaviour**

- **Keeps pace** — after twenty seconds of uninterrupted work the sage switches
  from thinking to a walking loop, then leaps or slumps when the run ends.
- **Idle glances** — while resting, it looks around using the drawn head poses.
- Six semantic states — 静观 resting, 洞察 working, 共情 waiting, 笃定
  celebrating, 充电 sleeping, 受挫 error — each mapped to one facet of the INFJ
  description on the reference card.
- Display sizes are exact integer multiples of the sprite pixels (1×, 2×, 3×),
  which is what keeps pixel art crisp.
- Animation follows `prefers-reduced-motion` and the motion setting.

**Interaction**

- Click to hear a line in character; drag to reposition with edge snapping and a
  remembered position.
- Right-click settings: session scope, size, nap delay, palette, motion, idle
  glances, auto-tips, reset position, tuck away, and a trait explainer.
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
- 19 files, 3.4 MB packed, 4.0 MB unpacked. `lib/src/` and `assets/sage.png.b64`
  are build inputs and stay out of the tarball; the bundle already embeds the
  sheet.
- `prepublishOnly` runs the structural checks and the test suite, so a broken
  build cannot be published.
- `lib/client.js` is generated from readable regions in `lib/src/`, and both the
  checker and the test suite rebuild it, so the shipped bundle can never drift
  from its sources.
