# Asset license

## Artwork

The character is **Sage**, a pixel-art INFJ sage generated with a built-in image
generator from the INFJ Advocate reference card supplied by the project owner.
The sources, prompts and quality reports are kept in `Sage/`; `Sage/README.md`
records the pet's stable id and provenance.

`assets/sage.png` is the sprite sheet, copied unmodified from
`Sage/final/spritesheet-extended.png` (SHA-256
`58deaf03132eee98634d101661682c1faf45906186bea30e7aa0f951f32631d1`, as recorded
in `Sage/pet-record.json`). Everything else in `assets/` is derived from it:

| File | Derived how |
|---|---|
| `sage-index.json` | frame rectangles and gaze cells measured from the sheet |
| `sage.png.b64` | the same bytes, base64, for embedding in the bundle |
| `icon.png` | head crop of the resting frame, 3× nearest-neighbour |
| `preview.png` | one frame per animation, on a flat backdrop |

**The artwork is not covered by the MIT code license.** It is released under
[CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/): share and
adapt it for non-commercial use with attribution, under the same license.
Commercial use needs the copyright holder's permission.

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
