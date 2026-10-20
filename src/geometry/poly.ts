// Convex polygon helpers (all shapes in RoomFit are convex: rotated rectangles,
// circles approximated as polygons, and door-swing quarter circles).

export interface Pt {
  x: number;
  y: number;
}
export type Poly = Pt[];
export interface Box {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export function rectPoly(x: number, y: number, w: number, h: number): Poly {
  return [
    { x, y },
    { x: x + w, y },
    { x: x + w, y: y + h },
    { x, y: y + h },
  ];
}

export function boxPoly(b: Box): Poly {
  return rectPoly(b.minX, b.minY, b.maxX - b.minX, b.maxY - b.minY);
}

export function polyBox(p: Poly): Box {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const q of p) {
    if (q.x < minX) minX = q.x;
    if (q.y < minY) minY = q.y;
    if (q.x > maxX) maxX = q.x;
    if (q.y > maxY) maxY = q.y;
  }
  return { minX, minY, maxX, maxY };
}

export function boxesOverlap(a: Box, b: Box, eps = 0) {
  return a.minX < b.maxX - eps && b.minX < a.maxX - eps && a.minY < b.maxY - eps && b.minY < a.maxY - eps;
}

function project(p: Poly, nx: number, ny: number) {
  let min = Infinity,
    max = -Infinity;
  for (const q of p) {
    const d = q.x * nx + q.y * ny;
    if (d < min) min = d;
    if (d > max) max = d;
  }
  return [min, max];
}

/**
 * True when two convex polygons overlap by more than `eps` mm.
 * Shapes that only touch (e.g. a bed pushed flush against a cupboard) do not count.
 */
export function polysIntersect(a: Poly, b: Poly, eps = 2): boolean {
  if (!boxesOverlap(polyBox(a), polyBox(b), eps)) return false;
  for (const poly of [a, b]) {
    for (let i = 0; i < poly.length; i++) {
      const p1 = poly[i];
      const p2 = poly[(i + 1) % poly.length];
      let nx = p2.y - p1.y;
      let ny = p1.x - p2.x;
      const len = Math.hypot(nx, ny);
      if (len < 1e-9) continue;
      nx /= len;
      ny /= len;
      const [minA, maxA] = project(a, nx, ny);
      const [minB, maxB] = project(b, nx, ny);
      if (Math.min(maxA, maxB) - Math.max(minA, minB) <= eps) return false;
    }
  }
  return true;
}

export function pointInPoly(pt: Pt, poly: Poly): boolean {
  let sign = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const cross = (b.x - a.x) * (pt.y - a.y) - (b.y - a.y) * (pt.x - a.x);
    if (Math.abs(cross) < 1e-9) continue;
    const s = cross > 0 ? 1 : -1;
    if (sign === 0) sign = s;
    else if (s !== sign) return false;
  }
  return true;
}

/** All points of `p` inside the box (with tolerance in mm). */
export function polyInBox(p: Poly, b: Box, tol = 2): boolean {
  return p.every((q) => q.x >= b.minX - tol && q.x <= b.maxX + tol && q.y >= b.minY - tol && q.y <= b.maxY + tol);
}

export function distPointSeg(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  let t = len2 ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

export function closestOnSeg(p: Pt, a: Pt, b: Pt): Pt {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  let t = len2 ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  return { x: a.x + t * dx, y: a.y + t * dy };
}

/** Shortest gap between two convex polygons, plus the two closest points (0 when they overlap). */
export function polyGap(a: Poly, b: Poly): { d: number; pa: Pt; pb: Pt } {
  if (polysIntersect(a, b, 0)) return { d: 0, pa: a[0], pb: a[0] };
  let best = { d: Infinity, pa: a[0], pb: b[0] };
  const test = (from: Poly, to: Poly, swap: boolean) => {
    for (const p of from) {
      for (let i = 0; i < to.length; i++) {
        const q = closestOnSeg(p, to[i], to[(i + 1) % to.length]);
        const d = Math.hypot(p.x - q.x, p.y - q.y);
        if (d < best.d) best = swap ? { d, pa: q, pb: p } : { d, pa: p, pb: q };
      }
    }
  };
  test(a, b, false);
  test(b, a, true);
  return best;
}

export function rotatePt(p: Pt, deg: number, c: Pt = { x: 0, y: 0 }): Pt {
  const r = (deg * Math.PI) / 180;
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  const x = p.x - c.x;
  const y = p.y - c.y;
  // y-down screen coordinates → positive angle turns clockwise on screen
  return { x: c.x + x * cos - y * sin, y: c.y + x * sin + y * cos };
}
