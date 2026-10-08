# Sage

Created and verified in Pets. Stable ID: pet_6ac7958fa51c8191bc6827eb0881645b.

User request: create an animated pet based on the attached INFJ Advocate cartoon reference. The name Sage was inferred. The original angular green-robed elder identity, swept white hair, long white beard and dot eyes were preserved. Thin wand omitted for readable animation.

Final transparent v2 sheet: `final/spritesheet-extended.png`, 1536x2288, 73 populated frames. Nine animation states and sixteen gaze directions. The pet has been added to the collection and can be selected in Pets.

Artwork generated with built-in imagegen. Production prompts and revisions are in `prompts/`, inputs and identity references in `references/`, source strips in `decoded/`, and checks plus motion previews in `qa/`. Artifacts are stored locally because ChatGPT Library tools were unavailable. No temporary upload sessions or expiring download links are persisted as pet identity.

The bundled structural and quality gates, Pets preflight, three isolated cardinal reviews and independent final visual review pass. Subtle intermediate tilts and minor wrap head-pose differences remain documented warnings; repaired torso widths and ground registration are steady. Jump peak lift is 44px and landing differs from idle baseline by 1px.

Final byte SHA256: `58deaf03132eee98634d101661682c1faf45906186bea30e7aa0f951f32631d1`.

- [x] Getting Sage ready.
- [x] Imagining Sage's main look.
- [x] Picturing Sage's poses.
- [x] Hatching Sage.

---

## What is published, and what is not

The full generation workspace that produced this sheet is about 130 MB: source
strips, per-frame decodes, QA renders, motion previews, and a vendored ffmpeg
used by the preview tooling. None of that is needed to build or run the plugin,
so it is not published here.

Checked in instead, under ssets/provenance/:

| File | Why it is kept |
|---|---|
| `sage-validation.json` | the sheet's structural report: grid, per-cell pixel counts, SHA-256 |
| `sage-pet-record.json` | the pet's stable id, description and declared sheet hash |
| `sage-README.md` | the generation summary as originally written |
| `sage-base-prompt.md` | the production prompt for the character's main look |

`tools/build-sage-index.mjs` reads that report and refuses to build when
`assets/sage.png` does not hash to the value recorded in it, so the published
artwork is provably the artwork that was validated.

The workspace itself stays on the machine that generated it. If you need to
reproduce it, the prompts under the original `Sage/prompts/` are the starting
point; they are not part of this repository.
