import type { Floor, Opening, Room, Side } from '../model/types';
import { distPointSeg, rectPoly, type Box, type Poly, type Pt } from './poly';
import { childrenOf, flushWithParent, parentOf } from './spaces';

/** Rooms closer than this (wall gap) count as sharing a wall. */
export const MAX_SHARED_GAP = 600;
export const DEFAULT_INNER_WALL = 114; // 4.5"
export const DOOR_HEIGHT = 2100;

export const SIDES: Side[] = ['top', 'right', 'bottom', 'left'];

export function innerBox(r: Room): Box {
  return { minX: r.x, minY: r.y, maxX: r.x + r.width, maxY: r.y + r.length };
}

export function outerBox(r: Room, t: number): Box {
  return { minX: r.x - t, minY: r.y - t, maxX: r.x + r.width + t, maxY: r.y + r.length + t };
}

export function innerWallOf(floor: Floor) {
  return floor.innerWallMm ?? DEFAULT_INNER_WALL;
}

export interface Neighbor {
  room: Room;
  side: Side; // side of the first room
  gap: number; // wall thickness between them
  from: number; // overlap range along the side (floor coords)
  to: number;
}

/** Rooms sharing a wall with `r`. */
export function neighbors(floor: Floor, r: Room): Neighbor[] {
  const out: Neighbor[] = [];
  for (const o of floor.rooms) {
    if (o.id === r.id) continue;
    const yFrom = Math.max(r.y, o.y);
    const yTo = Math.min(r.y + r.length, o.y + o.length);
    const xFrom = Math.max(r.x, o.x);
    const xTo = Math.min(r.x + r.width, o.x + o.width);
    if (yTo - yFrom > 1) {
      const gR = o.x - (r.x + r.width);
      if (gR >= -1 && gR <= MAX_SHARED_GAP) out.push({ room: o, side: 'right', gap: Math.max(0, gR), from: yFrom, to: yTo });
      const gL = r.x - (o.x + o.width);
      if (gL >= -1 && gL <= MAX_SHARED_GAP) out.push({ room: o, side: 'left', gap: Math.max(0, gL), from: yFrom, to: yTo });
    }
    if (xTo - xFrom > 1) {
      const gB = o.y - (r.y + r.length);
      if (gB >= -1 && gB <= MAX_SHARED_GAP) out.push({ room: o, side: 'bottom', gap: Math.max(0, gB), from: xFrom, to: xTo });
      const gT = r.y - (o.y + o.length);
      if (gT >= -1 && gT <= MAX_SHARED_GAP) out.push({ room: o, side: 'top', gap: Math.max(0, gT), from: xFrom, to: xTo });
    }
  }
  return out;
}

/** Wall-coloured boxes filling the gap between rooms that share a wall. */
export function sharedWallBoxes(floor: Floor): Box[] {
  const boxes: Box[] = [];
  for (const r of floor.rooms) {
    for (const n of neighbors(floor, r)) {
      if (n.side === 'right') boxes.push({ minX: r.x + r.width, maxX: n.room.x, minY: n.from, maxY: n.to });
      if (n.side === 'bottom') boxes.push({ minX: n.from, maxX: n.to, minY: r.y + r.length, maxY: n.room.y });
    }
  }
  return boxes;
}

export interface SideLine {
  a: Pt; // start (left end for top/bottom, top end for left/right)
  b: Pt;
  length: number;
  inward: Pt; // unit normal pointing into the room
}

export function sideLine(r: Room, side: Side): SideLine {
  switch (side) {
    case 'top':
      return { a: { x: r.x, y: r.y }, b: { x: r.x + r.width, y: r.y }, length: r.width, inward: { x: 0, y: 1 } };
    case 'bottom':
      return {
        a: { x: r.x, y: r.y + r.length },
        b: { x: r.x + r.width, y: r.y + r.length },
        length: r.width,
        inward: { x: 0, y: -1 },
      };
    case 'left':
      return { a: { x: r.x, y: r.y }, b: { x: r.x, y: r.y + r.length }, length: r.length, inward: { x: 1, y: 0 } };
    case 'right':
      return {
        a: { x: r.x + r.width, y: r.y },
        b: { x: r.x + r.width, y: r.y + r.length },
        length: r.length,
        inward: { x: -1, y: 0 },
      };
  }
}

/**
 * Thickness of the wall on one side of a room over a range:
 * - the gap to a room next to it (shared wall), or
 * - for a room inside another room (e.g. inside the Hall): the outer wall when it is pressed
 *   against the outside, otherwise an inside wall, or
 * - the outer wall.
 */
export function wallThickness(floor: Floor, r: Room, side: Side, from?: number, to?: number, depth = 0): number {
  const ns = neighbors(floor, r).filter((n) => n.side === side && (from === undefined || (n.to > from! && n.from < to!)));
  if (ns.length) return Math.min(...ns.map((n) => n.gap));
  const parent = depth < 8 ? parentOf(floor, r) : undefined;
  if (parent) {
    if (flushWithParent(floor, r, side)) return wallThickness(floor, parent, side, from, to, depth + 1);
    return innerWallOf(floor);
  }
  return floor.outerWallMm;
}

export interface OpeningGeom {
  p1: Pt; // inner face, start
  p2: Pt; // inner face, end
  inward: Pt;
  thickness: number;
  cut: Poly; // area of the wall the opening goes through
  offset: number; // clamped offset
}

export function openingGeom(floor: Floor, room: Room, op: Opening): OpeningGeom {
  const line = sideLine(room, op.side);
  const width = Math.min(op.widthMm, line.length);
  const offset = Math.max(0, Math.min(op.offsetMm, line.length - width));
  const dir = { x: (line.b.x - line.a.x) / line.length, y: (line.b.y - line.a.y) / line.length };
  const p1 = { x: line.a.x + dir.x * offset, y: line.a.y + dir.y * offset };
  const p2 = { x: p1.x + dir.x * width, y: p1.y + dir.y * width };
  const alongFrom = op.side === 'top' || op.side === 'bottom' ? p1.x : p1.y;
  const thickness = wallThickness(floor, room, op.side, alongFrom, alongFrom + width);
  const out = { x: -line.inward.x * thickness, y: -line.inward.y * thickness };
  return {
    p1,
    p2,
    inward: line.inward,
    thickness,
    offset,
    cut: [p1, p2, { x: p2.x + out.x, y: p2.y + out.y }, { x: p1.x + out.x, y: p1.y + out.y }],
  };
}

export interface Swing {
  hinge: Pt;
  radius: number;
  a0: number; // radians, closed position (along the wall)
  a1: number; // radians, fully open (along the normal)
  poly: Poly; // quarter circle as polygon (for warnings)
}

/** Door swing area(s). Empty for sliding doors and plain openings. */
export function doorSwings(g: OpeningGeom, op: Opening): Swing[] {
  if (op.kind !== 'door') return [];
  const type = op.doorType ?? 'swing';
  if (type === 'sliding' || type === 'opening' || type === 'shutter') return [];
  const into = op.opensInto ?? 'this';
  const n = into === 'this' ? g.inward : { x: -g.inward.x, y: -g.inward.y };
  // A door opening away from the room is hinged on the far face of the wall.
  const shift = into === 'this' ? { x: 0, y: 0 } : { x: n.x * g.thickness, y: n.y * g.thickness };
  const p1 = { x: g.p1.x + shift.x, y: g.p1.y + shift.y };
  const p2 = { x: g.p2.x + shift.x, y: g.p2.y + shift.y };
  const width = Math.hypot(p2.x - p1.x, p2.y - p1.y);
  const make = (hinge: Pt, toward: Pt, r: number): Swing => {
    const a0 = Math.atan2(toward.y - hinge.y, toward.x - hinge.x);
    const a1raw = Math.atan2(n.y, n.x);
    // sweep the short way (90°)
    let d = a1raw - a0;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    const a1 = a0 + d;
    const poly: Poly = [hinge];
    const steps = 10;
    for (let i = 0; i <= steps; i++) {
      const a = a0 + (d * i) / steps;
      poly.push({ x: hinge.x + Math.cos(a) * r, y: hinge.y + Math.sin(a) * r });
    }
    return { hinge, radius: r, a0, a1, poly };
  };
  if (type === 'double') {
    const mid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
    return [make(p1, mid, width / 2), make(p2, mid, width / 2)];
  }
  return (op.hinge ?? 'start') === 'start' ? [make(p1, p2, width)] : [make(p2, p1, width)];
}

/** Wall bands around each room (used to tell "in the wall" from "outside the room"). */
export function wallBands(floor: Floor): Poly[] {
  const bands: Poly[] = [];
  for (const r of floor.rooms) {
    const t = {
      top: wallThickness(floor, r, 'top'),
      bottom: wallThickness(floor, r, 'bottom'),
      left: wallThickness(floor, r, 'left'),
      right: wallThickness(floor, r, 'right'),
    };
    if (t.top) bands.push(rectPoly(r.x - t.left, r.y - t.top, r.width + t.left + t.right, t.top));
    if (t.bottom) bands.push(rectPoly(r.x - t.left, r.y + r.length, r.width + t.left + t.right, t.bottom));
    if (t.left) bands.push(rectPoly(r.x - t.left, r.y, t.left, r.length));
    if (t.right) bands.push(rectPoly(r.x + r.width, r.y, t.right, r.length));
  }
  for (const b of sharedWallBoxes(floor)) bands.push(rectPoly(b.minX, b.minY, b.maxX - b.minX, b.maxY - b.minY));
  return bands;
}

export interface WallHit {
  room: Room;
  side: Side;
  along: number; // distance from the side's start corner
}

/** Find the wall closest to a point (for placing doors/windows). */
export function hitWall(floor: Floor, p: Pt, tol: number): WallHit | null {
  let best: (WallHit & { d: number }) | null = null;
  for (const r of floor.rooms) {
    for (const side of SIDES) {
      const line = sideLine(r, side);
      const t = wallThickness(floor, r, side);
      // signed distance: positive = inside the room
      const sd = (p.x - line.a.x) * line.inward.x + (p.y - line.a.y) * line.inward.y;
      if (sd > tol || sd < -(t + tol)) continue;
      const along =
        side === 'top' || side === 'bottom' ? p.x - line.a.x : p.y - line.a.y;
      if (along < -tol || along > line.length + tol) continue;
      const d = distPointSeg(p, line.a, line.b);
      // prefer the room whose inside the point is closest to
      const score = (sd >= 0 ? d : d * 0.5) + r.width * r.length * 1e-12;
      if (!best || score < best.d) best = { room: r, side, along: Math.max(0, Math.min(line.length, along)), d: score };
    }
  }
  return best ? { room: best.room, side: best.side, along: best.along } : null;
}

/** A room's box including its walls (per side). */
export function roomOuterBox(floor: Floor, r: Room): Box {
  return {
    minX: r.x - wallThickness(floor, r, 'left'),
    maxX: r.x + r.width + wallThickness(floor, r, 'right'),
    minY: r.y - wallThickness(floor, r, 'top'),
    maxY: r.y + r.length + wallThickness(floor, r, 'bottom'),
  };
}

/** The rooms (with their walls) that sit inside this room and take up its floor. */
export function childBlocks(floor: Floor, r: Room): Box[] {
  return childrenOf(floor, r).map((c) => roomOuterBox(floor, c));
}
