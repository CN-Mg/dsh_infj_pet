#!/usr/bin/env python3
"""Rasterize the packaged SVG poses so the artwork can be reviewed as an image.

This is a development aid, not part of the plugin. It understands exactly the
subset of SVG that `lib/art.js` emits — polygons, paths with M/L/H/V/Q/Z,
ellipses, solid fills, opacity, and translate/scale transforms — which is enough
to confirm the drawing composes correctly. It is deliberately independent of the
bundle: it reads the shipped `assets/*.svg`, so it grades what users get.

Usage:
    python tools/render_preview.py [--out preview.png] [--scale 2]
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
SUPERSAMPLE = 2

NUMBER = r"[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?"
TOKEN_RE = re.compile(NUMBER)
COMMAND_RE = re.compile(r"([MmLlHhVvQqCcZz])")
ATTR_RE = re.compile(r'([a-zA-Z-]+)="([^"]*)"')
TRANSFORM_RE = re.compile(r"(translate|scale|matrix)\s*\(([^)]*)\)")


def parse_color(value: str):
    """Returns (r, g, b, a) or None for a non-painting value."""
    if value is None:
        return None
    text = value.strip()
    if text in ("none", "transparent", ""):
        return None
    if text.startswith("#"):
        digits = text[1:]
        if len(digits) == 3:
            digits = "".join(ch * 2 for ch in digits)
        if len(digits) == 6:
            return (int(digits[0:2], 16), int(digits[2:4], 16), int(digits[4:6], 16), 255)
        if len(digits) == 8:
            return (
                int(digits[0:2], 16),
                int(digits[2:4], 16),
                int(digits[4:6], 16),
                int(digits[6:8], 16),
            )
        raise ValueError(f"unsupported hex colour: {text}")
    match = re.match(r"rgba?\(([^)]*)\)", text)
    if match:
        parts = [p.strip() for p in match.group(1).split(",")]
        r, g, b = (int(float(parts[i])) for i in range(3))
        a = 255
        if len(parts) > 3:
            alpha = float(parts[3])
            a = int(round(alpha * 255)) if alpha <= 1 else int(round(alpha))
        return (r, g, b, a)
    raise ValueError(f"unsupported colour: {text}")


def parse_transforms(value: str):
    """Returns a list of (a, b, c, d, e, f) matrices."""
    out = []
    for name, raw in TRANSFORM_RE.findall(value or ""):
        args = [float(n) for n in TOKEN_RE.findall(raw)]
        if name == "translate":
            tx = args[0] if args else 0.0
            ty = args[1] if len(args) > 1 else 0.0
            out.append((1.0, 0.0, 0.0, 1.0, tx, ty))
        elif name == "scale":
            sx = args[0] if args else 1.0
            sy = args[1] if len(args) > 1 else sx
            out.append((sx, 0.0, 0.0, sy, 0.0, 0.0))
        elif name == "matrix":
            if len(args) != 6:
                raise ValueError("matrix() needs six numbers")
            out.append(tuple(args))
    return out


def multiply(m, n):
    a1, b1, c1, d1, e1, f1 = m
    a2, b2, c2, d2, e2, f2 = n
    return (
        a1 * a2 + c1 * b2,
        b1 * a2 + d1 * b2,
        a1 * c2 + c1 * d2,
        b1 * c2 + d1 * d2,
        a1 * e2 + c1 * f2 + e1,
        b1 * e2 + d1 * f2 + f1,
    )


def apply(matrix, point):
    x, y = point
    a, b, c, d, e, f = matrix
    return (a * x + c * y + e, b * x + d * y + f)


def flatten_path(d: str, steps: int = 14):
    """Flattens one path's `d` into subpaths of absolute points.

    The command stream is read through a cursor rather than consumed, so a
    command that changes the current command (only `M` does) cannot clobber the
    numbers the next iteration still needs.
    """
    tokens = [t for t in COMMAND_RE.split(d) if t.strip()]
    subpaths = []
    current = []
    cursor = (0.0, 0.0)
    start = (0.0, 0.0)
    command = None
    at = 0

    while at < len(tokens):
        chunk = tokens[at]
        if COMMAND_RE.fullmatch(chunk):
            command = chunk
            at += 1
            continue
        if command is None:
            raise ValueError("path data starts with numbers instead of a command")

        values = [float(n) for n in TOKEN_RE.findall(chunk)]
        at += 1
        upper = command.upper()
        relative = command.islower()
        need = {"M": 2, "L": 2, "H": 1, "V": 1, "Q": 4, "C": 6, "Z": 0}[upper]
        if need and len(values) < need:
            raise ValueError(f"{command} needs {need} numbers, got {len(values)}")

        if upper == "M":
            x, y = values[0], values[1]
            if relative:
                x, y = cursor[0] + x, cursor[1] + y
            if current:
                subpaths.append(current)
            current = [(x, y)]
            cursor = start = (x, y)
            # Subsequent coordinate pairs after a moveto are implicit linetos.
            command = "l" if relative else "L"
        elif upper == "L":
            x, y = values[0], values[1]
            if relative:
                x, y = cursor[0] + x, cursor[1] + y
            current.append((x, y))
            cursor = (x, y)
        elif upper == "H":
            x = values[0] + (cursor[0] if relative else 0.0)
            current.append((x, cursor[1]))
            cursor = (x, cursor[1])
        elif upper == "V":
            y = values[0] + (cursor[1] if relative else 0.0)
            current.append((cursor[0], y))
            cursor = (cursor[0], y)
        elif upper == "Q":
            cx, cy, x, y = values[:4]
            if relative:
                cx, cy = cursor[0] + cx, cursor[1] + cy
                x, y = cursor[0] + x, cursor[1] + y
            for step in range(1, steps + 1):
                t = step / steps
                mt = 1 - t
                current.append(
                    (
                        mt * mt * cursor[0] + 2 * mt * t * cx + t * t * x,
                        mt * mt * cursor[1] + 2 * mt * t * cy + t * t * y,
                    )
                )
            cursor = (x, y)
        elif upper == "C":
            c1x, c1y, c2x, c2y, x, y = values[:6]
            if relative:
                c1x, c1y = cursor[0] + c1x, cursor[1] + c1y
                c2x, c2y = cursor[0] + c2x, cursor[1] + c2y
                x, y = cursor[0] + x, cursor[1] + y
            for step in range(1, steps + 1):
                t = step / steps
                mt = 1 - t
                current.append(
                    (
                        mt**3 * cursor[0] + 3 * mt * mt * t * c1x + 3 * mt * t * t * c2x + t**3 * x,
                        mt**3 * cursor[1] + 3 * mt * mt * t * c1y + 3 * mt * t * t * c2y + t**3 * y,
                    )
                )
            cursor = (x, y)
        elif upper == "Z":
            if current:
                current.append(start)
                subpaths.append(current)
                current = []
            cursor = start

    if current:
        subpaths.append(current)
    return subpaths


def ellipse_points(cx, cy, rx, ry, steps=64):
    import math

    return [
        (cx + rx * math.cos(2 * math.pi * i / steps), cy + ry * math.sin(2 * math.pi * i / steps))
        for i in range(steps)
    ]


class SvgImage:
    """Minimal SVG element walker that draws into a supersampled RGBA canvas."""

    def __init__(self, markup: str, width: int, height: int, view_box, scale: int):
        self.markup = markup
        self.width = width
        self.height = height
        self.view_box = view_box
        self.scale = scale
        self.image = Image.new("RGBA", (width * scale, height * scale), (0, 0, 0, 0))
        self.layer = Image.new("RGBA", self.image.size, (0, 0, 0, 0))
        self.draw = ImageDraw.Draw(self.layer)

    def to_device(self, point, matrix):
        x, y = apply(matrix, point)
        vx, vy, vw, vh = self.view_box
        sx = self.width / vw
        sy = self.height / vh
        return ((x - vx) * sx * self.scale, (y - vy) * sy * self.scale)

    def render(self):
        body = self.markup[self.markup.index(">") + 1 : self.markup.rindex("</svg>")]
        self._walk(body, (1.0, 0.0, 0.0, 1.0, 0.0, 0.0))
        return self.image

    def _walk(self, markup: str, matrix):
        pos = 0
        while pos < len(markup):
            open_at = markup.find("<", pos)
            if open_at < 0:
                break
            close_at = markup.find(">", open_at)
            if close_at < 0:
                break
            tag_text = markup[open_at + 1 : close_at]
            if tag_text.endswith("/"):
                tag_text = tag_text[:-1]
            name = tag_text.split()[0]
            attrs = dict(ATTR_RE.findall(tag_text))
            self_closing = markup[close_at - 1] == "/"

            local = matrix
            for t in parse_transforms(attrs.get("transform", "")):
                local = multiply(local, t)

            if name == "g":
                if not self_closing:
                    depth = 1
                    cursor = close_at + 1
                    while depth > 0 and cursor < len(markup):
                        nxt_open = markup.find("<", cursor)
                        if nxt_open < 0:
                            break
                        nxt_close = markup.find(">", nxt_open)
                        inner = markup[nxt_open + 1 : nxt_close]
                        if inner.startswith("/g"):
                            depth -= 1
                        elif inner.startswith("g") and not inner.endswith("/"):
                            depth += 1
                        cursor = nxt_close + 1
                    self._walk(markup[close_at + 1 : cursor - 4], local)
                    pos = cursor
                    continue
            elif name == "polygon":
                points = TOKEN_RE.findall(attrs.get("points", ""))
                pairs = [(float(points[i]), float(points[i + 1])) for i in range(0, len(points) - 1, 2)]
                self._fill([pairs], attrs, local)
            elif name == "ellipse":
                cx = float(attrs.get("cx", 0))
                cy = float(attrs.get("cy", 0))
                rx = float(attrs.get("rx", 0))
                ry = float(attrs.get("ry", 0))
                self._fill([ellipse_points(cx, cy, rx, ry)], attrs, local)
            elif name == "path":
                self._fill(flatten_path(attrs.get("d", "")), attrs, local)
            elif name in ("rect", "svg"):
                pass
            pos = close_at + 1

    def _fill(self, subpaths, attrs, matrix):
        fill = parse_color(attrs.get("fill"))
        if fill is None:
            return
        opacity = float(attrs.get("opacity", 1.0))
        alpha = int(round(fill[3] * opacity))
        if alpha <= 0:
            return
        for points in subpaths:
            device = [self.to_device(p, matrix) for p in points]
            if len(device) < 3:
                continue
            self.draw.polygon(device, fill=(fill[0], fill[1], fill[2], alpha))
        # Composite this element onto the accumulated image so overlaps resolve
        # in document order, the way SVG paints.
        self.image = Image.alpha_composite(self.image, self.layer)
        self.layer = Image.new("RGBA", self.image.size, (0, 0, 0, 0))
        self.draw = ImageDraw.Draw(self.layer)


def render_svg(path: Path, size: int, scale: int, background=None):
    markup = path.read_text(encoding="utf-8")
    view_box = [float(n) for n in TOKEN_RE.findall(re.search(r'viewBox="([^"]*)"', markup).group(1))]
    element = SvgImage(markup, size, size, view_box, scale)
    image = element.render()
    if background is not None:
        base = Image.new("RGBA", image.size, background)
        image = Image.alpha_composite(base, image)
    return image.resize((size, size), Image.LANCZOS)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", default=str(ROOT / "preview.png"))
    parser.add_argument("--scale", type=int, default=2)
    args = parser.parse_args()

    poses = ["resting", "working", "waiting", "celebrating", "sleeping", "error"]
    cell = 260
    padding = 18
    columns = 3
    rows = 2
    sheet = Image.new(
        "RGBA",
        (columns * cell + padding * (columns + 1), rows * cell + padding * (rows + 1)),
        (234, 243, 229, 255),
    )

    for index, pose in enumerate(poses):
        asset = ROOT / "assets" / f"{pose}.svg"
        if not asset.exists():
            print(f"missing asset: {asset}", file=sys.stderr)
            return 1
        tile = render_svg(asset, cell, args.scale)
        column = index % columns
        row = index // columns
        sheet.alpha_composite(
            tile,
            (padding + column * (cell + padding), padding + row * (cell + padding)),
        )

    sheet.convert("RGB").save(args.out)
    print(f"wrote {args.out} ({sheet.width}x{sheet.height})")

    icon = ROOT / "assets" / "icon.svg"
    if icon.exists():
        head = render_svg(icon, 320, args.scale, background=(234, 243, 229, 255))
        head_path = Path(args.out).with_name(Path(args.out).stem + "-icon.png")
        head.convert("RGB").save(head_path)
        print(f"wrote {head_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
