#!/usr/bin/env python3
"""
Counterpunch — Icon Editor plugin assets.

Renders:
  - icon.png   (128 x 128)   plugin icon
  - cover.png  (1920 x 960)  Figma Community cover

Both are drawn at 3x and downsampled with Lanczos, so every hairline and
every ring wall lands crisp. A faint grain is laid over the ground at the
end so the ink reads as ink in stock rather than as flat fill.

The cover is a specimen sheet: one ring repeated across the plugin's own
weight axis, from -2 to +2. The counter closes as the wall thickens, which
is the whole truth of the tool stated as a figure rather than a sentence.
"""

from __future__ import annotations

import os
import random
from PIL import Image, ImageDraw, ImageFont

# --------------------------------------------------------------------------- #
# palette — one ground, two inks, one flame used only as a point
# --------------------------------------------------------------------------- #
GROUND    = (237, 234, 227)
INK       = (24, 23, 21)
INK_MID   = (124, 119, 110)
HAIRLINE  = (202, 197, 187)
GHOST     = (225, 221, 213)
ACCENT    = (188, 72, 40)

SS = 3  # supersample factor

# Vendored alongside this script (both OFL) so the render is reproducible for
# anyone who clones the repo, rather than depending on a local font library.
FONTS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fonts")

DISPLAY = "SUSE[wght].ttf"
MONO    = "GeistMono[wght].ttf"


def font(name: str, size: int, weight: str = "Regular") -> ImageFont.FreeTypeFont:
    """Load a variable font at one of its named weights."""
    f = ImageFont.truetype(os.path.join(FONTS_DIR, name), size * SS)
    try:
        f.set_variation_by_name(weight)
    except Exception:
        pass  # Static build, or FreeType without variation support.
    return f


def grain(img: Image.Image, amount: int = 3, seed: int = 11) -> Image.Image:
    """Lay a faint fibre over the ground so ink sits in the stock."""
    random.seed(seed)
    out = img.copy()
    px = out.load()
    for y in range(out.height):
        for x in range(out.width):
            r, g, b = px[x, y][:3]
            d = random.randint(-amount, amount)
            px[x, y] = (
                max(0, min(255, r + d)),
                max(0, min(255, g + d)),
                max(0, min(255, b + d)),
            )
    return out


def ring(draw: ImageDraw.ImageDraw, cx: float, cy: float, radius: float,
         wall: float, colour) -> None:
    """
    Draw a ring whose wall is centred on `radius`.

    This mirrors CENTER stroke alignment: the wall grows equally inward and
    outward, so the centreline stays put while the counter closes.
    """
    outer = radius + wall / 2.0
    draw.ellipse(
        [(cx - outer) * SS, (cy - outer) * SS, (cx + outer) * SS, (cy + outer) * SS],
        outline=colour,
        width=max(1, int(round(wall * SS))),
    )


def text(draw, xy, string, fnt, colour, anchor="la", spacing_px=0.0):
    """Draw text, optionally letterspaced, at 1x coordinates."""
    x, y = xy[0] * SS, xy[1] * SS
    if spacing_px == 0:
        draw.text((x, y), string, font=fnt, fill=colour, anchor=anchor)
        return
    # Manual tracking: measure, then place each glyph.
    gap = spacing_px * SS
    widths = [draw.textlength(ch, font=fnt) for ch in string]
    total = sum(widths) + gap * (len(string) - 1)
    if anchor[0] == "m":
        x -= total / 2
    elif anchor[0] == "r":
        x -= total
    for ch, w in zip(string, widths):
        draw.text((x, y), ch, font=fnt, fill=colour, anchor="l" + anchor[1])
        x += w + gap


def rule(draw, x0, y0, x1, y1, colour, width=1.0):
    draw.line([x0 * SS, y0 * SS, x1 * SS, y1 * SS],
              fill=colour, width=max(1, int(round(width * SS))))


# --------------------------------------------------------------------------- #
# cover — 1920 x 960 specimen sheet
# --------------------------------------------------------------------------- #
def render_cover(path: str) -> None:
    W, H = 1920, 960
    img = Image.new("RGB", (W * SS, H * SS), GROUND)
    d = ImageDraw.Draw(img)

    ML, MR = 116, 116
    inner = W - ML - MR

    # SUSE Light: enough presence to anchor the sheet, not enough to compete
    # with the heavy end of the series.
    f_title = font(DISPLAY, 92, "Light")
    f_sub   = font(MONO, 13, "Regular")
    f_tick  = font(MONO, 13, "Regular")
    f_note  = font(MONO, 12, "Regular")

    # --- title block, upper left ------------------------------------------- #
    title = "Icon Editor"
    text(d, (ML, 104), title, f_title, INK, anchor="la")

    # The rule is cut to the measure of the word above it rather than to a
    # round number, so the block reads as one object.
    title_w = d.textlength(title, font=f_title) / SS
    rule(d, ML, 232, ML + title_w, 232, INK, 1.4)

    text(d, (ML, 252), "A CONTINUOUS WEIGHT AXIS FOR VECTOR FORM",
         f_sub, INK_MID, anchor="la", spacing_px=1.6)

    # --- instrumentation, upper right -------------------------------------- #
    text(d, (W - MR, 112), "FIG. 01 — WEIGHT SPECIMEN",
         f_sub, INK_MID, anchor="ra", spacing_px=1.6)
    text(d, (W - MR, 136), "SINGLE FORM · NINE VALUES",
         f_sub, INK_MID, anchor="ra", spacing_px=1.6)
    rule(d, W - MR - 232, 166, W - MR, 166, HAIRLINE, 1.0)

    # --- the series --------------------------------------------------------- #
    steps = [-2.0, -1.5, -1.0, -0.5, 0.0, 0.5, 1.0, 1.5, 2.0]
    base_wall, per_unit, radius = 12.0, 5.0, 72.0
    cy = 500.0
    slot = inner / len(steps)

    axis_y = 694.0
    for i, delta in enumerate(steps):
        cx = ML + slot * (i + 0.5)
        ring(d, cx, cy, radius, base_wall + delta * per_unit, INK)

        label = f"{delta:+.1f}" if delta else "0"
        text(d, (cx, 634), label, f_tick,
             INK if delta == 0 else INK_MID, anchor="ma")

        # major division
        rule(d, cx, axis_y - 7, cx, axis_y, HAIRLINE, 1.0)

        # minor divisions — four to each interval, so the rule reads as a
        # calibrated scale rather than as a line with marks on it
        if i < len(steps) - 1:
            for m in range(1, 5):
                mx = cx + slot * m / 5.0
                rule(d, mx, axis_y - 3, mx, axis_y, HAIRLINE, 1.0)

    rule(d, ML, axis_y, W - MR, axis_y, HAIRLINE, 1.0)

    # the single flame: origin of the axis, a few square millimetres of it
    origin_x = ML + slot * 4.5
    rule(d, origin_x, axis_y - 12, origin_x, axis_y + 7, ACCENT, 1.6)

    # --- footing ------------------------------------------------------------ #
    text(d, (ML, 884), "THE COUNTER CLOSES AS THE WALL THICKENS",
         f_note, INK_MID, anchor="ls", spacing_px=1.5)
    text(d, (W - MR, 884), "MIT · DELTA365",
         f_note, INK_MID, anchor="rs", spacing_px=1.5)

    # --- registration ticks -------------------------------------------------- #
    for x, y, dx, dy in (
        (ML, 64, 1, 0), (ML, 64, 0, 1),
        (W - MR, 64, -1, 0), (W - MR, 64, 0, 1),
        (ML, H - 64, 1, 0), (ML, H - 64, 0, -1),
        (W - MR, H - 64, -1, 0), (W - MR, H - 64, 0, -1),
    ):
        rule(d, x, y, x + dx * 16, y + dy * 16, HAIRLINE, 1.0)

    img = img.resize((W, H), Image.LANCZOS)
    grain(img, amount=3, seed=11).save(path)
    print(f"wrote {path}  {W}x{H}")


# --------------------------------------------------------------------------- #
# icon — 128 x 128
# --------------------------------------------------------------------------- #
def render_icon(path: str) -> None:
    S = 128
    img = Image.new("RGB", (S * SS, S * SS), GROUND)
    d = ImageDraw.Draw(img)

    # Three walls of the same form at rising weight: the axis, compressed to
    # a mark that still reads at 32 px.
    #
    # The walls grow but the counters between them stay fixed, which is the
    # discipline stated at icon scale. Laying them out from the counters
    # rather than from wall centres is what keeps the group true: equal gaps,
    # and a span that is optically centred instead of nearly centred.
    walls = (5.0, 11.0, 19.0)
    counter = 15.0
    height = 62.0

    span = sum(walls) + counter * (len(walls) - 1)
    x = (S - span) / 2.0
    cy = S / 2.0

    for wall in walls:
        d.rounded_rectangle(
            [x * SS, (cy - height / 2) * SS,
             (x + wall) * SS, (cy + height / 2) * SS],
            radius=(wall / 2) * SS,
            fill=INK,
        )
        x += wall + counter

    img = img.resize((S, S), Image.LANCZOS)
    grain(img, amount=2, seed=7).save(path)
    print(f"wrote {path}  {S}x{S}")


if __name__ == "__main__":
    here = os.path.dirname(os.path.abspath(__file__))
    render_cover(os.path.join(here, "cover.png"))
    render_icon(os.path.join(here, "icon.png"))
