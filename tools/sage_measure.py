#!/usr/bin/env python3
"""Measure the Sage sprite sheet: per-cell artwork bounds and anchor checks.

Development aid for wiring the sheet into the plugin. It answers the two
questions the renderer needs answered:

  1. How big is the artwork inside a 192x208 cell, and where does it sit? The
     answer decides the display box and the ground line.
  2. Which column of the look rows corresponds to which gaze angle? The answer
     decides the gaze index, and it is cross-checked against the four approved
     cardinal anchors rather than assumed.

Usage:
    python tools/sage_measure.py [--magnify idle:0 running-right:0]
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SAGE = ROOT / "Sage"
SHEET = SAGE / "final" / "spritesheet-extended.png"
VALIDATION = SAGE / "final" / "validation-extended.json"
ANCHORS = SAGE / "decoded" / "look-anchors"


def load():
    validation = json.loads(VALIDATION.read_text(encoding="utf-8"))
    sheet = Image.open(SHEET).convert("RGBA")
    cell_w = validation["width"] // validation["columns"]
    cell_h = validation["height"] // validation["rows"]
    return validation, sheet, cell_w, cell_h


def cell(sheet, row, column, cell_w, cell_h):
    return sheet.crop((column * cell_w, row * cell_h, (column + 1) * cell_w, (row + 1) * cell_h))


def bounds(image, alpha_threshold=8):
    alpha = image.getchannel("A").point(lambda value: 255 if value >= alpha_threshold else 0)
    box = alpha.getbbox()
    return box


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--magnify", action="append", default=[])
    args = parser.parse_args()

    validation, sheet, cell_w, cell_h = load()
    print(f"sheet {sheet.width}x{sheet.height}, cell {cell_w}x{cell_h}")

    rows = {}
    for entry in validation["cells"]:
        rows.setdefault(entry["row"], []).append(entry)
    for row in rows.values():
        row.sort(key=lambda e: e["column"])

    # --- 1. artwork bounds across the animation rows -------------------------
    global_box = None
    print("\nper-row artwork bounds (union of used cells):")
    for index in range(len(rows)):
        entries = [e for e in rows[index] if e["used"]]
        box = None
        widths, heights, grounds = [], [], []
        for entry in entries:
            image = cell(sheet, index, entry["column"], cell_w, cell_h)
            found = bounds(image)
            if found is None:
                continue
            if box is None:
                box = list(found)
            else:
                box[0] = min(box[0], found[0])
                box[1] = min(box[1], found[1])
                box[2] = max(box[2], found[2])
                box[3] = max(box[3], found[3])
            widths.append(found[2] - found[0])
            heights.append(found[3] - found[1])
            grounds.append(found[3])
        if box is None:
            continue
        state = entries[0]["state"]
        print(
            f"  row {index:2} {state:20} union={tuple(box)}  "
            f"w[{min(widths)}..{max(widths)}] h[{min(heights)}..{max(heights)}] "
            f"ground[{min(grounds)}..{max(grounds)}]"
        )
        if global_box is None:
            global_box = list(box)
        else:
            global_box[0] = min(global_box[0], box[0])
            global_box[1] = min(global_box[1], box[1])
            global_box[2] = max(global_box[2], box[2])
            global_box[3] = max(global_box[3], box[3])

    print(f"\nunion across all rows: {tuple(global_box)} "
          f"({global_box[2] - global_box[0]}x{global_box[3] - global_box[1]})")

    # --- 2. look rows: match each column against the cardinal anchors ---------
    if ANCHORS.is_dir():
        print("\nlook-row column identification (nearest approved anchor per column):")
        anchor_images = {}
        for name in ("000", "090", "180", "270"):
            path = ANCHORS / f"{name}.png"
            if path.is_file():
                anchor_images[name] = Image.open(path).convert("RGBA")

        def signature(image):
            """Artwork-only signature: cropped, centred and normalised to a grid."""
            found = bounds(image)
            art = image.crop(found) if found else image
            target = 48
            scale = min(target / art.width, target / art.height)
            size = (max(1, round(art.width * scale)), max(1, round(art.height * scale)))
            small = art.resize(size, Image.LANCZOS)
            canvas = Image.new("RGBA", (target, target), (0, 0, 0, 0))
            canvas.paste(small, ((target - size[0]) // 2, (target - size[1]) // 2))
            px = canvas.load()
            return [
                (px[x, y][0] >> 5, px[x, y][1] >> 5, px[x, y][2] >> 5, px[x, y][3] >> 5)
                for y in range(target)
                for x in range(target)
            ]

        anchor_signatures = {name: signature(image) for name, image in anchor_images.items()}
        look = {}
        for row_index, start in ((9, 0.0), (10, 180.0)):
            for entry in rows.get(row_index, []):
                if not entry["used"]:
                    continue
                image = cell(sheet, row_index, entry["column"], cell_w, cell_h)
                sig = signature(image)
                scored = []
                for name, anchor_sig in anchor_signatures.items():
                    same = sum(1 for a, b in zip(sig, anchor_sig) if a == b)
                    scored.append((same / len(sig), name))
                scored.sort(reverse=True)
                angle = start + entry["column"] * 22.5
                look[(row_index, entry["column"])] = angle
                label = ",".join(f"{name}:{score:.2f}" for score, name in scored[:2])
                print(f"  row {row_index} col {entry['column']} -> {angle:6.1f} deg   best {label}")

        print("\ncardinal check (each anchor should peak at its own angle):")
        for name, expected in (("000", 0.0), ("090", 90.0), ("180", 180.0), ("270", 270.0)):
            if name not in anchor_signatures:
                continue
            best = None
            for (row_index, column), angle in look.items():
                image = cell(sheet, row_index, column, cell_w, cell_h)
                sig = signature(image)
                same = sum(1 for a, b in zip(sig, anchor_signatures[name]) if a == b) / len(sig)
                if best is None or same > best[0]:
                    best = (same, angle)
            verdict = "OK" if best and abs(best[1] - expected) < 11.25 else "MISMATCH"
            print(f"  anchor {name} (expect {expected:6.1f}) best match {best[1]:6.1f} @ {best[0]:.2f}  {verdict}")

    # --- 3. optional magnified crops ----------------------------------------
    for spec in args.magnify:
        state, _, column = spec.partition(":")
        index = next(i for i in range(len(rows)) if rows[i] and rows[i][0]["state"] == state)
        image = cell(sheet, index, int(column or 0), cell_w, cell_h)
        out = ROOT / f"sage-zoom-{state}-{column or 0}.png"
        image.resize((cell_w * 3, cell_h * 3), Image.NEAREST).save(out)
        box = bounds(image)
        crop = image.crop(box) if box else image
        crop.resize((crop.width * 3, crop.height * 3), Image.NEAREST).save(
            ROOT / f"sage-crop-{state}-{column or 0}.png"
        )
        print(f"\nwrote {out.name} and sage-crop-{state}-{column or 0}.png (art {box})")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
