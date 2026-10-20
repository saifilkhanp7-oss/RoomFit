// "My things, any home": put a list of your own furniture into the rooms of a plan.
// Each room's free floor is a list of rectangles (MaxRects); things go in biggest first,
// against the walls, keeping clear of door swings, stairs, inner walls and rooms inside rooms.
import type { Floor, Room } from '../model/types';
import { kindOf } from './spaces';
import { childBlocks, doorSwings, openingGeom } from './walls';
import { stairOpenings } from './warnings';
import { isStairs, itemMount } from '../model/catalog';
import { itemPoly } from './items';
import { partitionPoly } from './partitions';
import type { Pt } from './poly';

export interface PackThing {
  key: string;
  label: string;
  width: number;
  depth: number;
  vehicle?: boolean;
}

export interface Placed {
  thing: PackThing;
  floorIndex: number;
  room: Room;
  x: number; // centre
  y: number;
  rotation: 0 | 90;
}

export interface PackResult {
  placed: Placed[];
  missing: PackThing[];
  /** Share of the free floor the things take (over ~55% leaves little space to walk). */
  filled: number;
}

interface R {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}
const GAP = 50; // a little space between things

const boxOf = (p: Pt[]): R =>
  p.reduce((a, q) => ({ minX: Math.min(a.minX, q.x), minY: Math.min(a.minY, q.y), maxX: Math.max(a.maxX, q.x), maxY: Math.max(a.maxY, q.y) }), {
    minX: Infinity,
    minY: Infinity,
    maxX: -Infinity,
    maxY: -Infinity,
  });
const overlaps = (a: R, b: R) => a.minX < b.maxX && b.minX < a.maxX && a.minY < b.maxY && b.minY < a.maxY;
const inside = (a: R, b: R) => a.minX >= b.minX && a.maxX <= b.maxX && a.minY >= b.minY && a.maxY <= b.maxY;

/** Cut a blocked box out of the free rectangles. */
function cut(free: R[], o: R): R[] {
  const out: R[] = [];
  for (const f of free) {
    if (!overlaps(f, o)) {
      out.push(f);
      continue;
    }
    if (o.minX > f.minX) out.push({ ...f, maxX: o.minX });
    if (o.maxX < f.maxX) out.push({ ...f, minX: o.maxX });
    if (o.minY > f.minY) out.push({ ...f, maxY: o.minY });
    if (o.maxY < f.maxY) out.push({ ...f, minY: o.maxY });
  }
  const big = out.filter((r) => r.maxX - r.minX > 100 && r.maxY - r.minY > 100);
  return big.filter((r, i) => !big.some((q, j) => j !== i && inside(r, q) && (j < i || !inside(q, r))));
}

interface Space {
  floorIndex: number;
  room: Room;
  free: R[];
  vehicles: boolean;
}

function spacesOf(floors: Floor[], keepItems: boolean): Space[] {
  const out: Space[] = [];
  floors.forEach((f, fi) => {
    const swings = f.openings.flatMap((o) => {
      const room = f.rooms.find((r) => r.id === o.roomId);
      if (!room) return [];
      const g = openingGeom(f, room, o);
      return [boxOf(g.cut), ...doorSwings(g, o).map((s) => boxOf(s.poly))];
    });
    const blocks: R[] = [
      ...swings,
      ...stairOpenings(floors[fi - 1]).map((s) => boxOf(s.poly)),
      ...f.items.filter(isStairs).map((s) => boxOf(itemPoly(s))),
      ...(f.partitions ?? []).filter((p) => p.bottomMm < 1500).map((p) => boxOf(partitionPoly(p))),
      ...(keepItems ? f.items.filter((it) => itemMount(it) === 'floor' && !isStairs(it)).map((it) => boxOf(itemPoly(it))) : []),
    ];
    for (const r of f.rooms) {
      const k = kindOf(r);
      if (k === 'bathroom' || k === 'balcony') continue;
      let free: R[] = [{ minX: r.x, minY: r.y, maxX: r.x + r.width, maxY: r.y + r.length }];
      for (const b of [...childBlocks(f, r), ...blocks]) free = cut(free, b);
      out.push({ floorIndex: fi, room: r, free, vehicles: k === 'parking' });
    }
  });
  return out;
}

/** Put the things into the plan's rooms. Vehicles only go into parking, everything else not. */
export function packThings(floors: Floor[], things: PackThing[], opts: { keepItems?: boolean; floorIndex?: number } = {}): PackResult {
  let spaces = spacesOf(floors, !!opts.keepItems);
  if (opts.floorIndex !== undefined) spaces = spaces.filter((s) => s.floorIndex === opts.floorIndex);
  const freeArea = spaces.reduce((a, s) => a + s.free.reduce((b, r) => b + (r.maxX - r.minX) * (r.maxY - r.minY), 0), 0);
  const order = [...things].sort((a, b) => b.width * b.depth - a.width * a.depth);
  const placed: Placed[] = [];
  const missing: PackThing[] = [];
  for (const t of order) {
    let best: { s: Space; r: R; rot: 0 | 90; score: number } | null = null;
    for (const s of spaces) {
      if (!!t.vehicle !== s.vehicles) continue;
      for (const rot of [0, 90] as const) {
        const w = rot ? t.depth : t.width;
        const d = rot ? t.width : t.depth;
        for (const r of s.free) {
          const fw = r.maxX - r.minX;
          const fd = r.maxY - r.minY;
          if (w > fw || d > fd) continue;
          const score = Math.min(fw - w, fd - d);
          if (!best || score < best.score) best = { s, r, rot, score };
        }
      }
    }
    if (!best) {
      missing.push(t);
      continue;
    }
    const w = best.rot ? t.depth : t.width;
    const d = best.rot ? t.width : t.depth;
    const box = { minX: best.r.minX, minY: best.r.minY, maxX: best.r.minX + w, maxY: best.r.minY + d };
    placed.push({ thing: t, floorIndex: best.s.floorIndex, room: best.s.room, x: Math.round(box.minX + w / 2), y: Math.round(box.minY + d / 2), rotation: best.rot });
    best.s.free = cut(best.s.free, { minX: box.minX - GAP, minY: box.minY - GAP, maxX: box.maxX + GAP, maxY: box.maxY + GAP });
  }
  const used = placed.reduce((a, p) => a + p.thing.width * p.thing.depth, 0);
  return { placed, missing, filled: freeArea > 0 ? used / freeArea : 1 };
}
