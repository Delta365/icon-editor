# Publishing to the Figma Community

Everything needed for the listing is in this repo. Work down this file; the
copy blocks are written to be pasted verbatim.

## 1. Before you open the publish dialog

- [ ] `npm run build` — the Community submission ships `dist/`, and `dist/` is
      gitignored, so it must exist locally at publish time.
- [ ] Open the plugin once in Figma and exercise both directions on a real icon.
- [ ] **Swap the manifest `id`.** `manifest.json` currently carries a
      placeholder. Figma mints the real id when you first create the plugin
      through *Plugins → Development → New plugin* (or on first publish), and
      the manifest must carry that value. Stored state uses *shared* plugin data
      under the `iconEditor` namespace precisely so this swap orphans nothing.
- [ ] Commit the real id.

## 2. Assets

| Field | File | Size |
| --- | --- | --- |
| Plugin icon | `assets/icon.png` | 128 × 128 |
| Cover art | `assets/cover.png` | 1920 × 960 |

Both are generated — run `python3 assets/render.py` to rebuild them. The
aesthetic is documented in `assets/philosophy.md`.

## 3. Listing copy

### Name

```
Icon Editor
```

### Description

```
Change how thick your icons are — in both directions.

Icon Editor gives any vector on the canvas a single weight axis, from −2 to
+2 px. Select one icon or a hundred, drag, and they all change together.

Most tools can only retune line-style icons, because those carry a real stroke
you can set. Icon Editor also handles filled icons — solid glyphs where the
thickness is baked into the path itself — and it thins them as well as
thickens them.

HOW IT WORKS
1. Select any vectors. The plugin finds them inside frames, groups and
   components.
2. Drag the Weight slider. 0 sits in the centre: left thins, right thickens.
3. Or pick a reference vector and push its weight onto everything else with
   Match weight.

BUILT TO BE SAFE
• The original path is stored before anything is rewritten. Return to 0 and
  you get it back exactly.
• Every value is re-derived from that original, so dragging back and forth
  never accumulates drift.
• Shapes stay put — the centre is pinned, so nothing wanders as it thins.

HONEST ABOUT ITS LIMITS
• Thinning rewrites geometry, so curves are flattened to polylines while a
  negative weight is applied. Thickening never touches the path.
• Thinning needs a real vector path. Rectangles, ellipses and boolean
  operations can thicken but not thin — the plugin says so rather than
  silently doing nothing.

Free and open source under MIT.
Source, issues and roadmap: https://github.com/Delta365/icon-editor
```

### Tags

Figma allows up to 12. These are ordered by how likely someone is to type them.

```
icons
icon
vector
weight
stroke
thickness
design system
svg
outline
consistency
batch edit
utilities
```

### Category

Primary **Design tools**, secondary **Icons** if a second slot is offered.

### Support contact

Point at the issue tracker so reports arrive with the template attached:

```
https://github.com/Delta365/icon-editor/issues
```

## 4. Optional: a playground file

Figma lets you attach a file people can try the plugin in. A single frame with
a few icons in it does the job — include both a line-style set and a filled set
so the two mechanisms are both reachable. Worth doing: filled icons are the
differentiator, and most people will not have one to hand.

## 5. After it goes live

- [ ] Add the Community badge to `README.md`, matching the map generator's:
      `[![Figma Community](https://img.shields.io/badge/Figma-Community-blue?logo=figma&logoColor=white)](PLUGIN_URL)`
- [ ] Fill the repo's GitHub *website* field with the Community URL.
