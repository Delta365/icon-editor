// Minimal typings for the slice of clipper-lib we use. The package ships none,
// and declaring only what we touch keeps the offsetting code type-checked
// instead of silently `any`.

declare module "clipper-lib" {
  interface IntPoint {
    X: number;
    Y: number;
  }

  type Path = IntPoint[];

  const ClipperLib: {
    PolyFillType: {
      pftEvenOdd: number;
      pftNonZero: number;
    };
    JoinType: {
      jtSquare: number;
      jtRound: number;
      jtMiter: number;
    };
    EndType: {
      etClosedPolygon: number;
      etClosedLine: number;
      etOpenbutt: number;
      etOpenSquare: number;
      etOpenRound: number;
    };
    Clipper: {
      SimplifyPolygons(polygons: Path[], fillType: number): Path[];
    };
    ClipperOffset: new (miterLimit?: number, arcTolerance?: number) => {
      AddPath(path: Path, joinType: number, endType: number): void;
      AddPaths(paths: Path[], joinType: number, endType: number): void;
      Execute(solution: Path[], delta: number): void;
    };
  };

  export default ClipperLib;
}
