import type { Floor, Item, Room, Settings, Unit } from '../model/types';
import { catalogEntry, isStairs, itemHeight, itemMount } from '../model/catalog';
import { formatLength } from '../model/units';
import { itemPoly } from './items';
import { polyBox, polyGap, polysIntersect, boxesOverlap, type Poly, type Pt } from './poly';
import { childBlocks, doorSwings, openingGeom, wallBands } from './walls';
import { fitsInSpace, spaceOfPoint } from './spaces';
import { rotatePt } from './poly';

export const DEFAULT_CEILING = 3048; // 10 ft
export const DEFAULT_SILL = 914; // 3 ft
export const DEFAULT_WINDOW_H = 1219; // 4 ft
export const FAN_DROP = 305; // fan blades hang ~1 ft below the ceiling
const TOUCH = 20; // gaps under 2 cm count as "placed against each other"

export interface Warning {
  id: string;
  level: 'red' | 'yellow';
  message: string;
  itemIds: string[];
  openingId?: string;
  focus: Pt;
}

export interface ClearLine {
  a: Pt;
  b: Pt;
  gap: number;
}

export interface WarningResult {
  list: Warning[];
  red: Set<string>;
  yellow: Set<string>;
  redOpenings: Set<string>;
  clearLines: ClearLine[];
}

export interface WarningOptions {
  floorBelow?: Floor;
  settings: Pick<Settings, 'minWalkMm' | 'fanClearanceMm'>;
  unit: Unit;
  /** Height checks (taller than ceiling, window, fan) – single-floor homes only. */
  heights: boolean;
}

/** The innermost room at a point (e.g. the bathroom inside a bedroom, or the Hall around rooms). */
export function roomOfPoint(floor: Floor, p: Pt): Room | undefined {
  return spaceOfPoint(floor, p);
}

export const DOOR_SPACE = 610; // room needed beside a car to open its door (2 ft)

export function isVehicle(it: Item) {
  return catalogEntry(it.type)?.category === 'Vehicles';
}
const isCar = (it: Item) => it.type.startsWith('car-');

export function stairOpenings(floorBelow?: Floor): { item: Item; poly: Poly }[] {
  if (!floorBelow) return [];
  return floorBelow.items.filter(isStairs).map((item) => ({ item, poly: itemPoly(item) }));
}

const centroid = (p: Poly): Pt => ({ x: p.reduce((s, q) => s + q.x, 0) / p.length, y: p.reduce((s, q) => s + q.y, 0) / p.length });

export function computeWarnings(floor: Floor, opts: WarningOptions): WarningResult {
  const list: Warning[] = [];
  const clearLines: ClearLine[] = [];
  const redOpenings = new Set<string>();
  const items = floor.items;
  const polys = new Map(items.map((it) => [it.id, itemPoly(it)]));
  const boxes = new Map(items.map((it) => [it.id, polyBox(polys.get(it.id)!)]));
  const fmt = (mm: number) => formatLength(mm, opts.unit);
  const roomName = (it: Item) => {
    const r = roomOfPoint(floor, it);
    return r ? ` (${r.name})` : '';
  };

  const add = (w: Omit<Warning, 'focus'> & { focus?: Pt }) => {
    list.push({ ...w, focus: w.focus ?? centroid(polys.get(w.itemIds[0])!) });
  };

  // 1. Overlaps between floor-standing items (rugs go under, fans hang above)
  for (let i = 0; i < items.length; i++) {
    const a = items[i];
    if (itemMount(a) !== 'floor') continue;
    for (let j = i + 1; j < items.length; j++) {
      const b = items[j];
      if (itemMount(b) !== 'floor') continue;
      if (!boxesOverlap(boxes.get(a.id)!, boxes.get(b.id)!, 2)) continue;
      if (polysIntersect(polys.get(a.id)!, polys.get(b.id)!)) {
        const stair = isStairs(a) ? a : isStairs(b) ? b : null;
        const other = stair === a ? b : a;
        add({
          id: `overlap:${a.id}:${b.id}`,
          level: 'red',
          message: stair ? `${other.label} is on the stairs` : `${a.label} overlaps ${b.label}${roomName(a)}`,
          itemIds: [a.id, b.id],
        });
      }
    }
  }

  // 2. Outside the room / inside a wall
  const bands = wallBands(floor);
  for (const it of items) {
    const p = polys.get(it.id)!;
    if (fitsInSpace(floor, p, (r) => childBlocks(floor, r))) continue;
    const inWall = bands.some((b) => polysIntersect(p, b));
    add({
      id: `outside:${it.id}`,
      level: 'red',
      message: inWall ? `${it.label} goes into the wall` : `${it.label} is outside the room`,
      itemIds: [it.id],
    });
  }

  // 3. On a stair opening from the floor below
  for (const so of stairOpenings(opts.floorBelow)) {
    for (const it of items) {
      if (itemMount(it) === 'ceiling') continue;
      if (polysIntersect(polys.get(it.id)!, so.poly)) {
        add({ id: `stairhole:${it.id}:${so.item.id}`, level: 'red', message: `${it.label} is on the stair opening`, itemIds: [it.id] });
      }
    }
  }

  // 4. Door swing areas
  for (const op of floor.openings) {
    if (op.kind !== 'door') continue;
    const room = floor.rooms.find((r) => r.id === op.roomId);
    if (!room) continue;
    const swings = doorSwings(openingGeom(floor, room, op), op);
    for (const it of items) {
      if (itemMount(it) !== 'floor') continue;
      const p = polys.get(it.id)!;
      if (swings.some((s) => polysIntersect(p, s.poly, 5))) {
        redOpenings.add(op.id);
        add({ id: `swing:${op.id}:${it.id}`, level: 'red', message: `${it.label} blocks the door${roomName(it)}`, itemIds: [it.id], openingId: op.id });
      }
    }
  }

  // 5. Walking space between items
  const walkers = items.filter((it) => itemMount(it) === 'floor' && !catalogEntry(it.type)?.noClearance && !isStairs(it));
  for (let i = 0; i < walkers.length; i++) {
    const a = walkers[i];
    const ba = boxes.get(a.id)!;
    for (let j = i + 1; j < walkers.length; j++) {
      const b = walkers[j];
      const bb = boxes.get(b.id)!;
      const m = opts.settings.minWalkMm;
      if (bb.minX > ba.maxX + m || ba.minX > bb.maxX + m || bb.minY > ba.maxY + m || ba.minY > bb.maxY + m) continue;
      const g = polyGap(polys.get(a.id)!, polys.get(b.id)!);
      if (g.d <= TOUCH || g.d >= m) continue;
      // must be in the same room (a wall between them is not a walkway)
      const ra = roomOfPoint(floor, centroid(polys.get(a.id)!));
      const rb = roomOfPoint(floor, centroid(polys.get(b.id)!));
      if (!ra || ra !== rb) continue;
      clearLines.push({ a: g.pa, b: g.pb, gap: g.d });
      add({
        id: `clear:${a.id}:${b.id}`,
        level: 'yellow',
        message: `Only ${fmt(g.d)} to walk between ${a.label} and ${b.label}`,
        itemIds: [a.id, b.id],
        focus: { x: (g.pa.x + g.pb.x) / 2, y: (g.pa.y + g.pb.y) / 2 },
      });
    }
  }

  // 6. Vehicles: room to open the car doors, and a gate wide enough to drive in
  for (const car of items.filter(isVehicle)) {
    const poly = polys.get(car.id)!;
    const space = roomOfPoint(floor, centroid(poly));
    if (!space) continue;
    if (isCar(car)) {
      const hw = car.width / 2;
      const len = car.depth * 0.45;
      const strip = (sign: 1 | -1): Poly =>
        [
          { x: sign * hw, y: -len / 2 },
          { x: sign * (hw + DOOR_SPACE), y: -len / 2 },
          { x: sign * (hw + DOOR_SPACE), y: len / 2 },
          { x: sign * hw, y: len / 2 },
        ].map((q) => {
          const r = rotatePt(q, car.rotation);
          return { x: r.x + car.x, y: r.y + car.y };
        });
      const blocked = (sp: Poly) =>
        !fitsInSpace(floor, sp, (r) => childBlocks(floor, r)) ||
        items.some((o) => o.id !== car.id && itemMount(o) === 'floor' && polysIntersect(sp, polys.get(o.id)!, 5));
      if (blocked(strip(1)) && blocked(strip(-1))) {
        add({ id: `cardoor:${car.id}`, level: 'yellow', message: `No space to open the ${car.label} doors (needs ${fmt(DOOR_SPACE)} on one side)`, itemIds: [car.id] });
      }
    }
    const gates = floor.openings.filter((o) => o.kind === 'door' && o.roomId === space.id);
    if (gates.length) {
      const need = Math.min(car.width, car.depth) + (isCar(car) ? 300 : 150);
      const widest = Math.max(...gates.map((o) => o.widthMm));
      if (widest < need) {
        add({ id: `gate:${car.id}`, level: 'yellow', message: `The ${space.name} door/gate is too narrow for the ${car.label} (needs ${fmt(need)})`, itemIds: [car.id] });
      }
    }
  }

  // 7. Height checks (single floor)
  if (opts.heights) {
    for (const it of items) {
      const room = roomOfPoint(floor, centroid(polys.get(it.id)!));
      if (!room) continue;
      const ceiling = room.ceilingMm ?? DEFAULT_CEILING;
      const h = itemHeight(it);
      const mount = itemMount(it);

      if (mount === 'floor' && h !== undefined && h >= ceiling) {
        add({ id: `tall:${it.id}`, level: 'red', message: `${it.label} (${fmt(h)}) is taller than the ceiling (${fmt(ceiling)})`, itemIds: [it.id] });
      }

      if (mount === 'floor' && h !== undefined) {
        for (const op of floor.openings) {
          if (op.kind !== 'window' || op.roomId !== room.id) continue;
          const sill = op.sillMm ?? DEFAULT_SILL;
          if (h <= sill) continue;
          const g = openingGeom(floor, room, op);
          if (polyGap(polys.get(it.id)!, [g.p1, g.p2]).d <= 300) {
            add({ id: `window:${it.id}:${op.id}`, level: 'yellow', message: `${it.label} covers part of the window${roomName(it)}`, itemIds: [it.id], openingId: op.id });
          }
        }
      }

      if (mount === 'ceiling') {
        const fanH = it.heightMm ?? ceiling - FAN_DROP;
        for (const other of items) {
          if (other.id === it.id || itemMount(other) !== 'floor') continue;
          const oh = itemHeight(other);
          if (oh === undefined) continue;
          if (!polysIntersect(polys.get(other.id)!, polys.get(it.id)!)) continue;
          const gap = fanH - oh;
          if (gap < opts.settings.fanClearanceMm) {
            add({
              id: `fan:${it.id}:${other.id}`,
              level: gap <= 0 ? 'red' : 'yellow',
              message: `${other.label} is too close to the ${it.label.toLowerCase()} (${gap <= 0 ? 'touches it' : fmt(gap) + ' gap'})`,
              itemIds: [other.id, it.id],
            });
          }
        }
      }
    }
  }

  const red = new Set<string>();
  const yellow = new Set<string>();
  for (const w of list) for (const id of w.itemIds) (w.level === 'red' ? red : yellow).add(id);
  // sort: red first
  list.sort((a, b) => (a.level === b.level ? 0 : a.level === 'red' ? -1 : 1));
  return { list, red, yellow, redOpenings, clearLines };
}
