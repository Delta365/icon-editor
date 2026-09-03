# Icon Editor

[![build](https://github.com/Delta365/icon-editor/actions/workflows/build.yml/badge.svg)](https://github.com/Delta365/icon-editor/actions/workflows/build.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

A standalone Figma plugin for editing vector weight. It does one thing: change how thick your
vectors are — including the filled ones, where thickness is baked into the geometry.

Most icon tools can only retune line-style icons, because those carry a real stroke you can set.
Icon Editor also handles **filled** icons, where the thickness is baked into the path itself — and
it goes both ways, thickening *and* thinning, on one relative axis.

## Features

**Weight.** One relative axis from −2 to +2 px. Select any number of vectors and drag; every one
changes its apparent thickness by that amount. The slider rests at 0 in the centre, so both
thickening and thinning are a drag away. The panel shows `Mixed` when the selection disagrees, and
dragging unifies them.

The axis is *relative*, not absolute — it reports a change, not a size. That is what lets a single
control drive vectors with different starting weights at once.

**Match weight.** Pick a reference vector (A), then select any number of other vectors (B) and hit
*Apply to selection* to push A's weight onto all of them. The reference stays pinned while you
change the selection, which is what makes the A → B flow work.

A reference remembers whether it came from a stroked or a filled vector and only matches its own
kind. The chip labels which kind it holds, and *Apply* stays disabled until the selection contains
vectors of that kind.

## How the two directions work

Paint can be added to a shape but never removed, so the two halves of the axis are implemented
differently:

| Direction | Mechanism | Curves | Applies to |
| --- | --- | --- | --- |
| Stroked vector, either way | `strokeWeight = base + delta` | n/a | Any stroked shape |
| Filled, positive | Fill-matched stroke, CENTER aligned | Preserved exactly | Any filled shape |
| Filled, negative | Path rewritten by geometric offset | Flattened to polylines | Editable vector paths only |

A CENTER-aligned stroke of `w` widens a wall by `w`, but a geometric offset of `d` widens it by `2d`
— it moves both edges. The plugin offsets by `delta / 2` so the axis is symmetric: −0.5 removes
exactly what +0.5 adds. See [`docs/weight-behaviour.html`](docs/weight-behaviour.html) for the sweep.

### What this costs, and what it does not

- **Nothing is destroyed.** The pristine path is stored before the first rewrite, and every
  adjustment re-derives from it rather than from the last result. Returning to 0 restores the
  original path byte-for-byte, and repeated dragging cannot accumulate drift.
- **The shape does not move.** Figma derives a node's bounding box from its path data, so rewriting
  the geometry would otherwise shift a thinned shape down and to the right by half of what it lost.
  The plugin pins the centre across every rewrite. Growing is centre-stable already, since a
  CENTER-aligned stroke expands all sides equally.

  The reported X/Y still change by half the size change, because the box itself is genuinely
  smaller — a shape thinned by 1 px reports X 0.5 px higher. The shape has not moved; the box has
  tightened around it. The centre is what stays fixed.
- **Thinning flattens curves.** Offsetting needs polygons, so béziers become polylines while a
  negative weight is applied. Growing does not — it never touches the path. If you export while
  thinned, you export polylines.
- **Thinning needs a real vector path.** Parametric shapes (rectangles, ellipses, stars, polygons)
  and boolean operations have no rewritable path, so they can grow but not shrink. The plugin counts
  them and says so rather than silently doing nothing.
- **Over-thinning is refused.** If a shape would erode to nothing, it is left alone and reported.

This is also why Google Fonts can offer an unbounded weight axis for Material Symbols and we cannot
do the same trick: that axis is a **variable font with hand-drawn masters** at each weight. A
designer drew the thin and the bold; nothing computes it.

## Scope notes

- Only true shape layers are edited: `VECTOR`, `BOOLEAN_OPERATION`, `STAR`, `POLYGON`, `ELLIPSE`,
  `RECTANGLE`, `LINE`. Frames and groups are traversed but never modified, so container borders are
  left alone.
- Boolean operations are edited as a single shape; the plugin does not descend into their children,
  since a boolean renders with its own stroke.
- Matching is **literal** — a +0.5 reference makes the target +0.5, regardless of frame size.
- Picking a reference from a selection that mixes stroked and filled vectors is refused rather than
  guessed at; select one kind.
- **Recolouring is not tracked.** A grown shape's stroke is a copy of the fill at the moment you
  grew it. If you later change the fill, the stroke keeps the old colour and shows as a halo. Nudge
  the slider to resync it.
- State lives in *shared* plugin data under the `iconEditor` namespace, which is keyed by that
  string rather than the manifest id — so it survives Figma minting a new id at publish.

## Development

```bash
npm install
npm run build
```

`npm run watch` rebuilds on change, and `npm run typecheck` runs TypeScript with no emit.

The build bundles `src/code.ts` into `dist/code.js` (the Figma sandbox) and inlines `src/ui.ts` plus
`src/ui.css` into `dist/ui.html` (the panel iframe). `src/offset.ts` holds the path parsing,
flattening and offsetting; it is the only part that depends on `clipper-lib`.

To load it: Figma → Plugins → Development → Import plugin from manifest, and choose `manifest.json`.

### About the manifest `id`

The `id` in `manifest.json` is a placeholder. It has to be present and valid — the plugin-data APIs
throw without one — but Figma mints the canonical id when you create or publish the plugin through
its own UI. Replace the placeholder with that value when you get it. Stored state uses shared plugin
data precisely so that swap does not orphan anything.
