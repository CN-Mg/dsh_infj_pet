# Asset license

## Artwork

The character is **Sage**, a pixel-art INFJ sage generated with a built-in image
generator from the INFJ Advocate reference card supplied by the project owner.
The sources, prompts and quality reports are kept in `Sage/`; `Sage/README.md`
records the pet's stable id and provenance.

`assets/sage.png` is the sprite sheet, copied unmodified from
`Sage/updates/reading/final/spritesheet-reading.png` (SHA-256
`c62020fa4b634d037e72d9fbad270494e96622603978431c3f7fdadde4a3ecdb`). It is the
original sheet with one revision: row 4, the engine's `jumping` slot, was redrawn
as the sage standing with an open book. A pixel comparison confirms the other ten
rows are byte-identical to the original.

Everything else in `assets/` is derived from it:

| File | Derived how |
|---|---|
| `sage-index.json` | frame rectangles and gaze cells measured from the sheet |
| `sage.png.b64` | the same bytes, base64, for embedding in the bundle |
| `icon.png` | head crop of the resting frame, 3× nearest-neighbour |
| `preview.png` | one frame per animation, on a flat backdrop |
| `provenance/` | the sheet's validation report, change audit and generation notes |

**The artwork is not covered by the MIT code license.** It is released under
[CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/): share and
adapt it for non-commercial use with attribution, under the same license.
Commercial use needs the copyright holder's permission.

## Quoted text

Some reading lines are short quotations from **史铁生 (Shi Tiesheng)**, each
attributed in the interface under the line it belongs to. They are brief,
individually attributed, and used in a non-commercial companion; the project
claims no rights in them, and no passage is reproduced beyond those short lines.
See the quotation table in the README for the exact lines and their sources.

Attribution form:

> Sage artwork — dsh-plugin-infj-pet — CC BY-NC-SA 4.0

## Fonts

No font is bundled. Every text surface uses the operating system's UI font stack
(`system-ui` and the platform CJK faces), so nothing is downloaded at runtime and
no font license travels with this package.

## Personality-type notice

INFJ and the Advocate / Counselor labels are popular-psychology vocabulary, not a
clinical instrument. This plugin is a decorative companion inspired by the
described traits; it does not assess, score, or diagnose anyone, and it is not
affiliated with or endorsed by any personality-assessment publisher.
