import type { Floor, Room } from '../model/types';
import { parentOf } from './spaces';
import type { Pt } from './poly';

export const DEFAULT_CEILING_MM = 3048; // 10 ft, same as the warnings default
export const SLAB = 150; // floor slab thickness between storeys

export const isBasementName = (name: string) => /basement|underground|parking level|cellar/i.test(name);

/** Ceiling of a room, taken from the room it sits in when not set (a bathroom inside a bedroom). */
export function roomCeiling(floor: Floor, r: Room): number {
  let cur: Room | undefined = r;
  for (let i = 0; cur && i < 10; i++) {
    if (cur.ceilingMm) return cur.ceilingMm;
    cur = parentOf(floor, cur);
  }
  return DEFAULT_CEILING_MM;
}

/** Height from this floor to the floor above: set by the user, or the highest ceiling + the slab. */
export function floorHeight(floor: Floor): number {
  if (floor.floorHeightMm) return floor.floorHeightMm;
  const top = floor.rooms.length ? Math.max(...floor.rooms.map((r) => roomCeiling(floor, r))) : DEFAULT_CEILING_MM;
  return top + SLAB;
}

/** Index of the ground floor: the first floor that isn't a basement (floors go bottom → top). */
export function groundIndex(floors: Floor[]): number {
  const i = floors.findIndex((f) => !isBasementName(f.name));
  return i < 0 ? floors.length - 1 : i;
}

/** Level of each floor's surface in mm (ground = 0, basements below 0). */
export function floorLevels(floors: Floor[]): number[] {
  const g = groundIndex(floors);
  const out = new Array<number>(floors.length).fill(0);
  for (let i = g + 1; i < floors.length; i++) out[i] = out[i - 1] + floorHeight(floors[i - 1]);
  for (let i = g - 1; i >= 0; i--) out[i] = out[i + 1] - floorHeight(floors[i]);
  return out;
}

/** Clip a polygon to an axis-aligned rectangle (Sutherland–Hodgman). */
export function clipToRect(poly: Pt[], r: { minX: number; minY: number; maxX: number; maxY: number }): Pt[] {
  type Edge = { inside: (p: Pt) => boolean; cut: (a: Pt, b: Pt) => Pt };
  const lerp = (a: Pt, b: Pt, t: number): Pt => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  const edges: Edge[] = [
    { inside: (p) => p.x >= r.minX, cut: (a, b) => lerp(a, b, (r.minX - a.x) / (b.x - a.x)) },
    { inside: (p) => p.x <= r.maxX, cut: (a, b) => lerp(a, b, (r.maxX - a.x) / (b.x - a.x)) },
    { inside: (p) => p.y >= r.minY, cut: (a, b) => lerp(a, b, (r.minY - a.y) / (b.y - a.y)) },
    { inside: (p) => p.y <= r.maxY, cut: (a, b) => lerp(a, b, (r.maxY - a.y) / (b.y - a.y)) },
  ];
  let out = poly;
  for (const e of edges) {
    const input = out;
    out = [];
    for (let i = 0; i < input.length; i++) {
      const cur = input[i];
      const prev = input[(i + input.length - 1) % input.length];
      const ci = e.inside(cur);
      const pi = e.inside(prev);
      if (ci) {
        if (!pi) out.push(e.cut(prev, cur));
        out.push(cur);
      } else if (pi) out.push(e.cut(prev, cur));
    }
    if (!out.length) return [];
  }
  return out;
}
