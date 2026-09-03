// Geometric path offsetting — used to make filled vectors thinner.
//
// Growing a filled shape is done with a fill-matched stroke, which is lossless.
// Shrinking has no equivalent: paint can only be added, never removed, so the
// path itself has to be rewritten. That means flattening curves to polylines,
// offsetting, and writing the result back.
//
// Every offset is re-derived from the pristine original rather than from the
// last result, so repeated dragging cannot accumulate drift.

import ClipperLib from "clipper-lib";

/** Clipper works in integers; 1 px becomes this many units. */
const SCALE = 1000;

/** Upper bound on segments per curve. Icons are small; this is generous. */
const MAX_SEGMENTS = 48;

interface Point {
  X: number;
  Y: number;
}

type Polygon = Point[];

class UnsupportedPath extends Error {}

/* -------------------------------------------------------------------------- */
/* Path parsing and flattening                                                 */
/* -------------------------------------------------------------------------- */

function tokenize(d: string): string[] {
  const matches = d.match(/[a-zA-Z]|-?\d*\.?\d+(?:e[-+]?\d+)?/gi);
  return matches === null ? [] : matches;
}

/** Segment count scaled to the curve's control-polygon length. */
function segmentsFor(length: number): number {
  return Math.max(4, Math.min(MAX_SEGMENTS, Math.ceil(length * 2)));
}

function distance(ax: number, ay: number, bx: number, by: number): number {
  return Math.sqrt((bx - ax) * (bx - ax) + (by - ay) * (by - ay));
}

function flattenCubic(
  out: Polygon,
  x0: number, y0: number,
  x1: number, y1: number,
  x2: number, y2: number,
  x3: number, y3: number
): void {
  const hull =
    distance(x0, y0, x1, y1) + distance(x1, y1, x2, y2) + distance(x2, y2, x3, y3);
  const steps = segmentsFor(hull);
  for (let i = 1; i <= steps; i += 1) {
    const t = i / steps;
    const u = 1 - t;
    const a = u * u * u;
    const b = 3 * u * u * t;
    const c = 3 * u * t * t;
    const e = t * t * t;
    out.push({
      X: Math.round((a * x0 + b * x1 + c * x2 + e * x3) * SCALE),
      Y: Math.round((a * y0 + b * y1 + c * y2 + e * y3) * SCALE),
    });
  }
}

function flattenQuadratic(
  out: Polygon,
  x0: number, y0: number,
  x1: number, y1: number,
  x2: number, y2: number
): void {
  const hull = distance(x0, y0, x1, y1) + distance(x1, y1, x2, y2);
  const steps = segmentsFor(hull);
  for (let i = 1; i <= steps; i += 1) {
    const t = i / steps;
    const u = 1 - t;
    out.push({
      X: Math.round((u * u * x0 + 2 * u * t * x1 + t * t * x2) * SCALE),
      Y: Math.round((u * u * y0 + 2 * u * t * y1 + t * t * y2) * SCALE),
    });
  }
}

/**
 * Turn SVG path data into integer polygons.
 *
 * Figma emits only M/L/H/V/C/Q/Z in vectorPaths, but the smooth variants and
 * relative forms are handled anyway. Arcs are not: they would need a separate
 * conversion, and hitting one means we decline the whole shape rather than
 * silently mangling it.
 */
function pathToPolygons(d: string): Polygon[] {
  const tokens = tokenize(d);
  const polygons: Polygon[] = [];
  let current: Polygon = [];

  let x = 0, y = 0;        // current point
  let startX = 0, startY = 0;
  let lastCx = 0, lastCy = 0; // last control point, for S/T
  let previous = "";
  let command = "";
  let index = 0;

  const number = (): number => {
    const value = Number(tokens[index]);
    index += 1;
    if (Number.isNaN(value)) throw new UnsupportedPath("bad number");
    return value;
  };

  const moveTo = (nx: number, ny: number): void => {
    if (current.length > 1) polygons.push(current);
    current = [{ X: Math.round(nx * SCALE), Y: Math.round(ny * SCALE) }];
    x = startX = nx;
    y = startY = ny;
  };

  const lineTo = (nx: number, ny: number): void => {
    current.push({ X: Math.round(nx * SCALE), Y: Math.round(ny * SCALE) });
    x = nx;
    y = ny;
  };

  while (index < tokens.length) {
    const token = tokens[index];
    if (/[a-zA-Z]/.test(token)) {
      command = token;
      index += 1;
    } else if (command === "M") {
      command = "L"; // repeated pairs after M are implicit line-tos
    } else if (command === "m") {
      command = "l";
    }

    const relative = command === command.toLowerCase();
    const upper = command.toUpperCase();

    switch (upper) {
      case "M": {
        const nx = number(), ny = number();
        moveTo(relative ? x + nx : nx, relative ? y + ny : ny);
        break;
      }
      case "L": {
        const nx = number(), ny = number();
        lineTo(relative ? x + nx : nx, relative ? y + ny : ny);
        break;
      }
      case "H": {
        const nx = number();
        lineTo(relative ? x + nx : nx, y);
        break;
      }
      case "V": {
        const ny = number();
        lineTo(x, relative ? y + ny : ny);
        break;
      }
      case "C": {
        let x1 = number(), y1 = number();
        let x2 = number(), y2 = number();
        let x3 = number(), y3 = number();
        if (relative) {
          x1 += x; y1 += y; x2 += x; y2 += y; x3 += x; y3 += y;
        }
        flattenCubic(current, x, y, x1, y1, x2, y2, x3, y3);
        lastCx = x2; lastCy = y2;
        x = x3; y = y3;
        break;
      }
      case "S": {
        let x2 = number(), y2 = number();
        let x3 = number(), y3 = number();
        if (relative) { x2 += x; y2 += y; x3 += x; y3 += y; }
        const smooth = /[CS]/.test(previous.toUpperCase());
        const x1 = smooth ? 2 * x - lastCx : x;
        const y1 = smooth ? 2 * y - lastCy : y;
        flattenCubic(current, x, y, x1, y1, x2, y2, x3, y3);
        lastCx = x2; lastCy = y2;
        x = x3; y = y3;
        break;
      }
      case "Q": {
        let x1 = number(), y1 = number();
        let x2 = number(), y2 = number();
        if (relative) { x1 += x; y1 += y; x2 += x; y2 += y; }
        flattenQuadratic(current, x, y, x1, y1, x2, y2);
        lastCx = x1; lastCy = y1;
        x = x2; y = y2;
        break;
      }
      case "T": {
        let x2 = number(), y2 = number();
        if (relative) { x2 += x; y2 += y; }
        const smooth = /[QT]/.test(previous.toUpperCase());
        const x1 = smooth ? 2 * x - lastCx : x;
        const y1 = smooth ? 2 * y - lastCy : y;
        flattenQuadratic(current, x, y, x1, y1, x2, y2);
        lastCx = x1; lastCy = y1;
        x = x2; y = y2;
        break;
      }
      case "Z": {
        if (current.length > 1) polygons.push(current);
        current = [];
        x = startX;
        y = startY;
        break;
      }
      default:
        // Arcs and anything else we do not model.
        throw new UnsupportedPath(`unsupported command ${command}`);
    }

    previous = command;
  }

  if (current.length > 1) polygons.push(current);
  return polygons;
}

function polygonsToPath(polygons: Polygon[]): string {
  const parts: string[] = [];
  for (const polygon of polygons) {
    if (polygon.length < 3) continue;
    const points = polygon.map((p) => `${p.X / SCALE} ${p.Y / SCALE}`);
    parts.push(`M ${points[0]} L ${points.slice(1).join(" L ")} Z`);
  }
  return parts.join(" ");
}

/* -------------------------------------------------------------------------- */
/* Offsetting                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Offset every subpath of `data` by `delta` px — negative shrinks.
 *
 * Returns null when the path cannot be handled (an arc, say) or when the shape
 * erodes to nothing, so the caller can leave that node untouched rather than
 * replacing it with an empty path.
 */
export function offsetPathData(
  data: string,
  delta: number,
  evenOdd: boolean
): string | null {
  let polygons: Polygon[];
  try {
    polygons = pathToPolygons(data);
  } catch {
    return null;
  }
  if (polygons.length === 0) return null;

  const fillType = evenOdd
    ? ClipperLib.PolyFillType.pftEvenOdd
    : ClipperLib.PolyFillType.pftNonZero;

  // Normalise orientation first: Clipper decides what is a hole from winding,
  // so an un-simplified path with inconsistent subpath direction would erode
  // its holes in the wrong direction.
  const simplified = ClipperLib.Clipper.SimplifyPolygons(polygons, fillType);
  if (!simplified || simplified.length === 0) return null;

  const offsetter = new ClipperLib.ClipperOffset(2, 0.25);
  offsetter.AddPaths(
    simplified,
    ClipperLib.JoinType.jtMiter,
    ClipperLib.EndType.etClosedPolygon
  );

  const solution: Polygon[] = [];
  offsetter.Execute(solution, delta * SCALE);
  if (!solution || solution.length === 0) return null;

  const path = polygonsToPath(solution);
  return path === "" ? null : path;
}
