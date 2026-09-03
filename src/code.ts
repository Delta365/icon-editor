// Icon Editor — main thread.
//
// One relative weight axis, from -2 to +2 px, applied to whatever is selected:
//
//   stroked shape        strokeWeight = base + delta
//   filled shape, delta > 0   grown with a fill-matched stroke (lossless)
//   filled shape, delta < 0   path rewritten by geometric offset
//
// Paint can be added but never removed, so thinning a filled shape is the one
// case that has to rewrite geometry. Everything is re-derived from a stored
// pristine original, so dragging back to 0 restores the shape exactly and
// repeated adjustments never accumulate drift.

import { offsetPathData } from "./offset";

type ShapeNode = SceneNode & MinimalStrokesMixin & GeometryMixin;

/** Node types we treat as vectors. Frames/groups are traversed, never edited. */
const SHAPE_TYPES: ReadonlySet<string> = new Set([
  "VECTOR",
  "BOOLEAN_OPERATION",
  "STAR",
  "POLYGON",
  "ELLIPSE",
  "RECTANGLE",
  "LINE",
]);

const MAX_DELTA = 2;

// Shared plugin data is namespaced by our own string rather than the manifest
// id, so these survive Figma minting a new id at publish.
const NS = "iconEditor";
const DELTA_KEY = "delta";
const BASE_KEY = "baseWeight";
const PATH_KEY = "originalPaths";

/**
 * A stroke reads as "growth we applied" only in units of apparent thickness.
 * A CENTER-aligned stroke of w widens a ribbon by w, but a geometric offset of
 * d widens it by 2d — it moves both edges. Halving keeps the two mechanisms
 * agreeing, so -0.5 removes exactly what +0.5 adds.
 */
const OFFSET_RATIO = 0.5;

interface Reference {
  kind: "stroked" | "filled";
  value: number;
  name: string;
}

interface Scan {
  stroked: ShapeNode[];
  filled: ShapeNode[];
}

let scan: Scan = { stroked: [], filled: [] };
let reference: Reference | null = null;
/** Shapes the last apply could not thin, surfaced in the panel. */
let refused = 0;

/* -------------------------------------------------------------------------- */
/* Node data                                                                   */
/* -------------------------------------------------------------------------- */

function readData(node: ShapeNode, key: string): string {
  try {
    return node.getSharedPluginData(NS, key);
  } catch {
    return "";
  }
}

function writeData(node: ShapeNode, key: string, value: string): void {
  try {
    node.setSharedPluginData(NS, key, value);
  } catch {
    // Nothing durable to fall back on; the paint signature still identifies
    // grown shapes, and an un-restorable shape is better than a thrown scan.
  }
}

function readNumber(node: ShapeNode, key: string): number | null {
  const raw = readData(node, key);
  if (!raw) return null;
  const value = Number(raw);
  return Number.isNaN(value) ? null : value;
}

/* -------------------------------------------------------------------------- */
/* Classification                                                              */
/* -------------------------------------------------------------------------- */

function isShape(node: SceneNode): node is ShapeNode {
  return SHAPE_TYPES.has(node.type);
}

function paintsOf(value: unknown): Paint[] | null {
  return Array.isArray(value) ? (value as Paint[]) : null;
}

function hasFill(node: ShapeNode): boolean {
  const fills = paintsOf(node.fills);
  return fills !== null && fills.length > 0;
}

function sameColour(a: Paint, b: Paint): boolean {
  if (a.type !== b.type) return false;
  if (a.type !== "SOLID" || b.type !== "SOLID") return true;
  const close = (x: number, y: number) => Math.abs(x - y) < 0.001;
  return (
    close(a.color.r, b.color.r) &&
    close(a.color.g, b.color.g) &&
    close(a.color.b, b.color.b) &&
    close(a.opacity === undefined ? 1 : a.opacity, b.opacity === undefined ? 1 : b.opacity)
  );
}

/** A shape whose strokes exactly repaint its fills carries our growth. */
function looksGrown(node: ShapeNode): boolean {
  const fills = paintsOf(node.fills);
  const strokes = paintsOf(node.strokes);
  if (!fills || !strokes) return false;
  if (fills.length === 0 || strokes.length !== fills.length) return false;
  return fills.every((fill, index) => sameColour(fill, strokes[index]));
}

/** True when this shape's stroke is its own, not growth we painted on. */
function hasNativeStroke(node: ShapeNode): boolean {
  const strokes = paintsOf(node.strokes);
  if (!strokes || strokes.length === 0) return false;
  if (readNumber(node, DELTA_KEY) !== null) return false;
  return !looksGrown(node);
}

function scanNodes(nodes: readonly SceneNode[], out: Scan): Scan {
  for (const node of nodes) {
    if (isShape(node)) {
      if (hasNativeStroke(node)) out.stroked.push(node);
      else if (hasFill(node)) out.filled.push(node);
    }
    if ("children" in node && node.type !== "BOOLEAN_OPERATION") {
      scanNodes(node.children, out);
    }
  }
  return out;
}

function rescan(): void {
  scan = scanNodes(figma.currentPage.selection, { stroked: [], filled: [] });
  // The warning describes the last apply; a new selection has not had one.
  refused = 0;
}

/** The delta currently applied to a shape. */
function deltaOf(node: ShapeNode): number {
  const stored = readNumber(node, DELTA_KEY);
  if (stored !== null) return stored;
  // Grown under a build that could not write data — read it off the paint.
  if (looksGrown(node)) {
    const weight = node.strokeWeight;
    if (typeof weight === "number") return weight;
  }
  return 0;
}

interface Aggregate {
  value: number | "mixed" | null;
  anchor: number | null;
}

function aggregate(values: number[]): Aggregate {
  if (values.length === 0) return { value: null, anchor: null };
  const anchor = Math.min.apply(null, values);
  const uniform = values.every((value) => value === values[0]);
  return { value: uniform ? values[0] : "mixed", anchor };
}

function currentDelta(): Aggregate {
  const editable = scan.stroked.concat(scan.filled);
  return aggregate(editable.map(deltaOf));
}

/* -------------------------------------------------------------------------- */
/* Applying                                                                    */
/* -------------------------------------------------------------------------- */

function clamp(value: number): number {
  return Math.min(MAX_DELTA, Math.max(-MAX_DELTA, value));
}

/** Remove painted growth, leaving the shape's own fills untouched. */
function clearGrowth(node: ShapeNode): void {
  if (looksGrown(node) || readNumber(node, DELTA_KEY) !== null) {
    node.strokes = [];
  }
}

function paintGrowth(node: ShapeNode, amount: number): boolean {
  const fills = paintsOf(node.fills);
  if (!fills || fills.length === 0) return false;
  node.strokes = fills.map((paint) => Object.assign({}, paint));
  node.strokeAlign = "CENTER";
  node.strokeWeight = amount;
  return true;
}

function isVector(node: ShapeNode): node is VectorNode {
  return node.type === "VECTOR";
}

/**
 * Run a geometry rewrite without letting the shape wander.
 *
 * Figma derives a node's bounding box from its path data, so replacing the
 * paths moves the box — a thinned shape would drift down and right by half of
 * what it lost. Growing does not have this problem: a CENTER-aligned stroke
 * expands every side equally and the centre stays put. Pinning the centre
 * across the rewrite makes thinning behave the same way.
 *
 * The centre is read immediately before the change rather than stored, so a
 * shape the user has since dragged is left where they put it.
 */
function preservingCentre(node: ShapeNode, rewrite: () => void): void {
  let centreX = 0;
  let centreY = 0;
  let pinned = false;

  try {
    centreX = node.x + node.width / 2;
    centreY = node.y + node.height / 2;
    pinned = true;
  } catch {
    // No readable box (inside auto-layout, say); just do the rewrite.
  }

  rewrite();

  if (!pinned) return;
  try {
    node.x = centreX - node.width / 2;
    node.y = centreY - node.height / 2;
  } catch {
    // Position is controlled by a parent layout; nothing to correct.
  }
}

/** Capture the pristine paths once, before the first rewrite. */
function originalPaths(node: VectorNode): VectorPaths | null {
  const stored = readData(node, PATH_KEY);
  if (stored) {
    try {
      return JSON.parse(stored) as VectorPaths;
    } catch {
      return null;
    }
  }
  const current = node.vectorPaths;
  writeData(node, PATH_KEY, JSON.stringify(current));
  return current;
}

function restorePaths(node: ShapeNode): void {
  if (!isVector(node)) return;
  const stored = readData(node, PATH_KEY);
  if (!stored) return;
  let paths: VectorPaths;
  try {
    paths = JSON.parse(stored) as VectorPaths;
  } catch {
    return; // Leave the shape as-is rather than writing something malformed.
  }
  preservingCentre(node, () => {
    node.vectorPaths = paths;
  });
}

/** Rewrite a vector's geometry to be thinner. Returns false if it cannot. */
function erode(node: ShapeNode, delta: number): boolean {
  if (!isVector(node)) return false;

  const original = originalPaths(node);
  if (!original || original.length === 0) return false;

  const rewritten: VectorPath[] = [];
  for (const path of original) {
    const evenOdd = path.windingRule === "EVENODD";
    const data = offsetPathData(path.data, delta * OFFSET_RATIO, evenOdd);
    if (data === null) return false;
    rewritten.push({ windingRule: path.windingRule, data });
  }

  try {
    preservingCentre(node, () => {
      node.vectorPaths = rewritten;
    });
    return true;
  } catch {
    return false;
  }
}

function applyToNode(node: ShapeNode, delta: number): boolean {
  if (node.removed) return false;

  try {
    if (hasNativeStroke(node) || readNumber(node, BASE_KEY) !== null) {
      let base = readNumber(node, BASE_KEY);
      if (base === null) {
        const weight = node.strokeWeight;
        base = typeof weight === "number" ? weight : 0;
        writeData(node, BASE_KEY, String(base));
      }
      node.strokeWeight = Math.max(0, base + delta);
      writeData(node, DELTA_KEY, String(delta));
      return true;
    }

    // Filled shape.
    if (delta === 0) {
      clearGrowth(node);
      restorePaths(node);
      writeData(node, DELTA_KEY, "");
      return true;
    }

    if (delta > 0) {
      restorePaths(node);
      if (!paintGrowth(node, delta)) return false;
      writeData(node, DELTA_KEY, String(delta));
      return true;
    }

    clearGrowth(node);
    if (!erode(node, delta)) {
      restorePaths(node);
      return false;
    }
    writeData(node, DELTA_KEY, String(delta));
    return true;
  } catch {
    return false;
  }
}

function applyDelta(value: number): number {
  const delta = clamp(value);
  const targets = scan.stroked.concat(scan.filled);
  let applied = 0;
  refused = 0;
  for (const node of targets) {
    if (applyToNode(node, delta)) applied += 1;
    else refused += 1;
  }
  return applied;
}

/* -------------------------------------------------------------------------- */
/* Plumbing                                                                    */
/* -------------------------------------------------------------------------- */

function commitUndo(): void {
  const api = figma as unknown as { commitUndo?: () => void };
  if (typeof api.commitUndo === "function") api.commitUndo();
}

function formatDelta(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return rounded > 0 ? `+${rounded}` : String(rounded);
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

function postState(): void {
  const { value, anchor } = currentDelta();
  figma.ui.postMessage({
    type: "state",
    stroked: scan.stroked.length,
    filled: scan.filled.length,
    delta: value,
    anchor,
    refused,
    reference,
  });
}

type UiMessage =
  | { type: "ready" }
  | { type: "set-delta"; value: number; commit: boolean }
  | { type: "pick-reference" }
  | { type: "apply-reference" }
  | { type: "clear-reference" };

figma.ui.onmessage = (msg: UiMessage): void => {
  switch (msg.type) {
    case "ready": {
      rescan();
      postState();
      break;
    }

    case "set-delta": {
      if (typeof msg.value !== "number" || Number.isNaN(msg.value)) break;
      applyDelta(msg.value);
      if (msg.commit) {
        commitUndo();
        postState();
      }
      break;
    }

    case "pick-reference": {
      if (scan.stroked.length > 0 && scan.filled.length > 0) {
        figma.notify("That selection mixes stroked and filled vectors — pick just one.");
        break;
      }
      const filled = scan.filled.length > 0;
      const source = filled ? scan.filled : scan.stroked;
      const { value } = currentDelta();

      if (value === null) {
        figma.notify("Select a vector to use as the reference.");
        break;
      }
      if (value === "mixed") {
        figma.notify("Those layers differ — pick a single reference.");
        break;
      }

      reference = { kind: filled ? "filled" : "stroked", value, name: source[0].name };
      postState();
      break;
    }

    case "apply-reference": {
      if (!reference) break;
      const toFilled = reference.kind === "filled";
      const targets = toFilled ? scan.filled : scan.stroked;
      if (targets.length === 0) {
        figma.notify(
          toFilled ? "Select filled vectors to match." : "Select stroked vectors to match."
        );
        break;
      }
      const applied = applyDelta(reference.value);
      commitUndo();
      postState();
      figma.notify(`Matched ${plural(applied, "layer")} to ${formatDelta(reference.value)} px`);
      break;
    }

    case "clear-reference": {
      reference = null;
      postState();
      break;
    }
  }
};

figma.on("selectionchange", () => {
  rescan();
  postState();
});

figma.showUI(__html__, {
  width: 300,
  height: 372,
  themeColors: true,
  title: "Icon Editor",
});
