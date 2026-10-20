// Rooms inside rooms: a Hall / Lobby can be the whole home with rooms inside it, a bathroom
// can sit inside a bedroom, etc. The space left over (e.g. the L-shaped hall) is worked out here.
import type { Floor, Room, RoomKind, Side } from '../model/types';
import type { Box, Poly, Pt } from './poly';
import { polyInBox, polysIntersect, boxPoly } from './poly';

const TOL = 1;

export const box = (r: Room): Box => ({ minX: r.x, minY: r.y, maxX: r.x + r.width, maxY: r.y + r.length });
const area = (r: Room) => r.width * r.length;

export function containsRoom(p: Room, c: Room) {
  return p.id !== c.id && area(p) > area(c) && c.x >= p.x - TOL && c.y >= p.y - TOL && c.x + c.width <= p.x + p.width + TOL && c.y + c.length <= p.y + p.length + TOL;
}

/** The smallest room this room sits inside, if any. */
export function parentOf(floor: Floor, r: Room): Room | undefined {
  let best: Room | undefined;
  for (const p of floor.rooms) if (containsRoom(p, r) && (!best || area(p) < area(best))) best = p;
  return best;
}

export function depthOf(floor: Floor, r: Room): number {
  let d = 0;
  let cur = parentOf(floor, r);
  while (cur && d < 10) {
    d++;
    cur = parentOf(floor, cur);
  }
  return d;
}

export function childrenOf(floor: Floor, r: Room): Room[] {
  return floor.rooms.filter((c) => parentOf(floor, c)?.id === r.id);
}

/** All rooms inside this one (children, grandchildren…). */
export function descendantsOf(floor: Floor, r: Room): Room[] {
  return floor.rooms.filter((c) => containsRoom(r, c));
}

/** Is this side of a room pressed against the same wall of the room it sits in? */
export function flushWithParent(floor: Floor, r: Room, side: Side): boolean {
  const p = parentOf(floor, r);
  if (!p) return false;
  if (side === 'left') return Math.abs(r.x - p.x) <= TOL;
  if (side === 'right') return Math.abs(r.x + r.width - (p.x + p.width)) <= TOL;
  if (side === 'top') return Math.abs(r.y - p.y) <= TOL;
  return Math.abs(r.y + r.length - (p.y + p.length)) <= TOL;
}

/** Rooms sorted so outer rooms come first (draw order). */
export function byDepth(floor: Floor): { room: Room; depth: number }[] {
  return floor.rooms.map((room) => ({ room, depth: depthOf(floor, room) })).sort((a, b) => a.depth - b.depth);
}

/** The innermost room at a point (a bathroom inside a bedroom wins over the bedroom). */
export function spaceOfPoint(floor: Floor, p: Pt): Room | undefined {
  let best: Room | undefined;
  for (const r of floor.rooms) {
    if (p.x >= r.x && p.x <= r.x + r.width && p.y >= r.y && p.y <= r.y + r.length && (!best || area(r) < area(best))) best = r;
  }
  return best;
}

/**
 * Is this shape fully on the floor of one space? (inside a room, and not running into a
 * room that sits inside it)
 */
export function fitsInSpace(floor: Floor, poly: Poly, childBoxes: (r: Room) => Box[]): boolean {
  for (const r of floor.rooms) {
    if (!polyInBox(poly, box(r))) continue;
    if (childBoxes(r).every((b) => !polysIntersect(poly, boxPoly(b)))) return true;
  }
  return false;
}

/**
 * Split the free floor of a room (its area minus the rooms inside it, with their walls)
 * into a few rectangles. For a 12×10 hall with two 6×4 rooms stacked on the left this gives
 * 6×10 and 6×2.
 */
export function freeRects(r: Room, blocks: Box[]): Box[] {
  const outer = box(r);
  const clipped = blocks
    .map((b) => ({ minX: Math.max(b.minX, outer.minX), minY: Math.max(b.minY, outer.minY), maxX: Math.min(b.maxX, outer.maxX), maxY: Math.min(b.maxY, outer.maxY) }))
    .filter((b) => b.maxX - b.minX > TOL && b.maxY - b.minY > TOL);
  if (!clipped.length) return [outer];
  const xs = [...new Set([outer.minX, outer.maxX, ...clipped.flatMap((b) => [b.minX, b.maxX])])].sort((a, b) => a - b);
  const ys = [...new Set([outer.minY, outer.maxY, ...clipped.flatMap((b) => [b.minY, b.maxY])])].sort((a, b) => a - b);
  const free = (i: number, j: number) => {
    const cx = (xs[i] + xs[i + 1]) / 2;
    const cy = (ys[j] + ys[j + 1]) / 2;
    return !clipped.some((b) => cx > b.minX && cx < b.maxX && cy > b.minY && cy < b.maxY);
  };
  const nx = xs.length - 1;
  const ny = ys.length - 1;

  // columns first (tall strips), then join strips with the same height side by side
  const byColumns = (): Box[] => {
    const strips: Box[] = [];
    for (let i = 0; i < nx; i++) {
      let start = -1;
      for (let j = 0; j <= ny; j++) {
        const f = j < ny && free(i, j);
        if (f && start < 0) start = j;
        if (!f && start >= 0) {
          strips.push({ minX: xs[i], maxX: xs[i + 1], minY: ys[start], maxY: ys[j] });
          start = -1;
        }
      }
    }
    return mergeAlong(strips, 'x');
  };
  const byRows = (): Box[] => {
    const strips: Box[] = [];
    for (let j = 0; j < ny; j++) {
      let start = -1;
      for (let i = 0; i <= nx; i++) {
        const f = i < nx && free(i, j);
        if (f && start < 0) start = i;
        if (!f && start >= 0) {
          strips.push({ minX: xs[start], maxX: xs[i], minY: ys[j], maxY: ys[j + 1] });
          start = -1;
        }
      }
    }
    return mergeAlong(strips, 'y');
  };
  const a = byColumns().filter(big);
  const b = byRows().filter(big);
  return b.length < a.length ? b : a;
}

const big = (b: Box) => b.maxX - b.minX > 50 && b.maxY - b.minY > 50;

function mergeAlong(strips: Box[], axis: 'x' | 'y'): Box[] {
  const out = [...strips];
  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 0; i < out.length && !changed; i++) {
      for (let k = 0; k < out.length && !changed; k++) {
        if (i === k) continue;
        const A = out[i];
        const B = out[k];
        const same = axis === 'x' ? Math.abs(A.minY - B.minY) < TOL && Math.abs(A.maxY - B.maxY) < TOL : Math.abs(A.minX - B.minX) < TOL && Math.abs(A.maxX - B.maxX) < TOL;
        const touch = axis === 'x' ? Math.abs(A.maxX - B.minX) < TOL : Math.abs(A.maxY - B.minY) < TOL;
        if (same && touch) {
          out[i] = axis === 'x' ? { ...A, maxX: B.maxX } : { ...A, maxY: B.maxY };
          out.splice(k, 1);
          changed = true;
        }
      }
    }
  }
  return out;
}

export const rectArea = (b: Box) => (b.maxX - b.minX) * (b.maxY - b.minY);

// ---------- room kinds ----------

export const ROOM_KINDS: { kind: RoomKind; label: string; name: string }[] = [
  { kind: 'room', label: 'Room', name: 'Room' },
  { kind: 'hall', label: 'Hall / Lobby', name: 'Hall' },
  { kind: 'bathroom', label: 'Bathroom', name: 'Bathroom' },
  { kind: 'kitchen', label: 'Kitchen', name: 'Kitchen' },
  { kind: 'balcony', label: 'Balcony', name: 'Balcony' },
  { kind: 'parking', label: 'Parking / Garage', name: 'Parking' },
  { kind: 'store', label: 'Store room', name: 'Store' },
];

export const kindOf = (r: Room): RoomKind => r.kind ?? 'room';
