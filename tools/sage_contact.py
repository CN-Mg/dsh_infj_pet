#!/usr/bin/env python3
"""Extract a labelled contact sheet from the Sage sprite sheet for review.

Development aid only. Reads `final/spritesheet-extended.png` together with the
grid recorded in `final/validation-extended.json`, and writes one row per
animation state so the frames can be eyeballed without launching DSH.

Usage:
    python tools/sage_contact.py [--out sage-contact.png] [--scale 0.5]
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
SAGE = ROOT / "Sage"
SHEET = SAGE / "final" / "spritesheet-extended.png"
VALIDATION = SAGE / "final" / "validation-extended.json"

ROWS = [
    "idle",
    "running-right",
    "running-left",
    "waving",
    "jumping",
    "failed",
    "waiting",
    "running",
    "review",
    "look-000-to-157.5",
    "look-180-to-337.5",
]


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", default=str(ROOT / "sage-contact.png"))
    parser.add_argument("--scale", type=float, default=0.55)
    args = parser.parse_args()

    validation = json.loads(VALIDATION.read_text(encoding="utf-8"))
    columns = validation["columns"]
    rows = validation["rows"]
    cell_w = validation["width"] // columns
    cell_h = validation["height"] // rows

    sheet = Image.open(SHEET).convert("RGBA")
    print(f"sheet {sheet.width}x{sheet.height}  grid {columns}x{rows}  cell {cell_w}x{cell_h}")

    used = {}
    for cell in validation["cells"]:
        used.setdefault(cell["row"], []).append(cell)
    for row in used.values():
        row.sort(key=lambda c: c["column"])

    scale = args.scale
    tile_w = int(cell_w * scale)
    tile_h = int(cell_h * scale)
    label_w = 190
    pad = 6

    width = label_w + columns * (tile_w + pad) + pad
    height = pad + len(ROWS) * (tile_h + pad + 14)
    sheet_out = Image.new("RGBA", (width, height), (232, 240, 234, 255))
    draw = ImageDraw.Draw(sheet_out)

    for index, state in enumerate(ROWS):
        y = pad + index * (tile_h + pad + 14)
        draw.text((pad, y + tile_h // 2 - 4), f"row {index}  {state}", fill=(30, 50, 30))
        for column in range(columns):
            cell = sheet.crop(
                (column * cell_w, index * cell_h, (column + 1) * cell_w, (index + 1) * cell_h)
            )
            tile = cell.resize((tile_w, tile_h), Image.NEAREST)
            # Checkerboard so transparent pixels are obvious.
            backdrop = Image.new("RGBA", tile.size, (255, 255, 255, 255))
            for cy in range(0, tile_h, 8):
                for cx in range(0, tile_w, 8):
                    if (cx // 8 + cy // 8) % 2:
                        for px in range(cx, min(cx + 8, tile_w)):
                            for py in range(cy, min(cy + 8, tile_h)):
                                backdrop.putpixel((px, py), (222, 230, 224, 255))
            backdrop.alpha_composite(tile)
            x = label_w + column * (tile_w + pad)
            sheet_out.alpha_composite(backdrop, (x, y))
            info = next(
                (c for c in used.get(index, []) if c["column"] == column),
                None,
            )
            mark = "x" if info and info["used"] else "-"
            draw.text((x + 2, y + tile_h + 1), f"{column}:{mark}", fill=(70, 90, 70))

    sheet_out.convert("RGB").save(args.out)
    print(f"wrote {args.out} ({sheet_out.width}x{sheet_out.height})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
