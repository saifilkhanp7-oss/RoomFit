import type { Floor, Item, Room, Settings, Unit } from '../model/types';
import { catalogEntry, isStairs, isWallFixed, itemElevation, itemHeight, itemMount, itemSpan } from '../model/catalog';
import { formatLength } from '../model/units';
import { itemPoly } from './items';
import { polyBox, polyGap, polysIntersect, boxesOverlap, type Poly, type Pt } from './poly';
import { childBlocks, doorSwings, DOOR_HEIGHT, openingGeom, wallBands } from './walls';
import { fitsInSpace, spaceOfPoint } from './spaces';
import { pointInPoly, rotatePt } from './poly';

export const DEFAULT_CEILING = 3048; // 10 ft
export const DEFAULT_SILL = 914; // 3 ft
export const DEFAULT_WINDOW_H = 1219; // 4 ft
export const FAN_DROP = 305; // fan blades hang ~1 ft below the ceiling
const TOUCH = 20; // gaps under 2 cm count as "placed against each other"
const STACK_TOL = 30; // 3 cm: counts as resting on top

/** A one-tap fix offered with a warning. */
export type WarningFix = { label: string; itemId: string; action: 'stack'; supportId: string } | { label: string; itemId: string; action: 'floor' };

export interface Warning {
  id: string;
  level: 'red' | 'yellow';
  message: string;
  itemIds: string[];
  openingId?: string;
  focus: Pt;
  fix?: WarningFix;
}

export interface ClearLine {
  a: Pt;
  b: Pt;
  gap: number;
}

export interface WarningResult {
  /** Warnings to show. */
  list: Warning[];
  /** Warnings the user chose to "let it be". */
  ignored: Warning[];
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

const polyArea = (p: Poly) => Math.abs(p.reduce((s, q, i) => s + q.x * p[(i + 1) % p.length].y - p[(i + 1) % p.length].x * q.y, 0)) / 2;

const centroid = (p: Poly): Pt => ({ x: p.reduce((s, q) => s + q.x, 0) / p.length, y: p.reduce((s, q) => s + q.y, 0) / p.length });

export function computeWarnings(floor: Floor, opts: WarningOptions): WarningResult {
  const list: Warning[] = [];
  const clearByWarning = new Map<string, ClearLine>();
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

  // 1. Overlaps between floor-standing items (rugs go under, fans hang above).
  // Heights count: a suitcase on top of a cupboard, or a box under a cot, is fine.
  for (let i = 0; i < items.length; i++) {
    const a = items[i];
    if (itemMount(a) !== 'floor') continue;
    for (let j = i + 1; j < items.length; j++) {
      const b = items[j];
      if (itemMount(b) !== 'floor') continue;
      if (!boxesOverlap(boxes.get(a.id)!, boxes.get(b.id)!, 2)) continue;
      if (!polysIntersect(polys.get(a.id)!, polys.get(b.id)!)) continue;
      const stair = isStairs(a) ? a : isStairs(b) ? b : null;
      const id = `overlap:${a.id}:${b.id}`;
      if (stair) {
        const other = stair === a ? b : a;
        add({ id, level: 'red', message: `${other.label} is on the stairs`, itemIds: [a.id, b.id] });
        continue;
      }
      const A = itemSpan(a);
      const B = itemSpan(b);
      // one sits on top of / above the other
      if (B.bottom >= A.top - STACK_TOL || A.bottom >= B.top - STACK_TOL) continue;
      // one fits in the open space under the other (box under a cot, stool under a table)
      const fitsUnder = (x: typeof A, over: typeof A) => over.solidBottom > over.bottom + STACK_TOL && x.bottom >= over.bottom - STACK_TOL && x.top <= over.solidBottom + STACK_TOL;
      if (fitsUnder(B, A) || fitsUnder(A, B)) continue;

      // smaller one could go on top of the bigger one
      const [small, big] = polyArea(polys.get(a.id)!) <= polyArea(polys.get(b.id)!) ? [a, b] : [b, a];
      const fix: WarningFix = { label: `Put ${small.label} on top of ${big.label}`, itemId: small.id, action: 'stack', supportId: big.id };
      // tried to go under something but is too tall
      const tooTall = (x: Item, X: typeof A, over: Item, O: typeof A) =>
        O.solidBottom > O.bottom + STACK_TOL && X.bottom < O.solidBottom && X.top > O.solidBottom
          ? `${x.label} (${fmt(X.top - X.bottom)} tall) doesn't fit under ${over.label} (${fmt(O.solidBottom - O.bottom)} space)`
          : null;
      const msg = tooTall(b, B, a, A) ?? tooTall(a, A, b, B) ?? `${a.label} overlaps ${b.label}${roomName(a)}`;
      add({ id, level: 'red', message: msg, itemIds: [a.id, b.id], fix });
    }
  }

  // 1b. Things in the air: off the floor with nothing under them (unless fixed to the wall)
  for (const it of items) {
    if (itemMount(it) !== 'floor' || isWallFixed(it)) continue;
    const elev = itemElevation(it);
    if (elev <= STACK_TOL) continue;
    const c = { x: it.x, y: it.y };
    let best: Item | undefined;
    const supported = items.some((o) => {
      if (o.id === it.id || itemMount(o) !== 'floor' || !pointInPoly(c, polys.get(o.id)!)) return false;
      const s = itemSpan(o);
      if (s.top < elev + STACK_TOL && (!best || s.top > itemSpan(best).top)) best = o;
      return Math.abs(s.top - elev) <= STACK_TOL;
    });
    if (supported) continue;
    const support = best as Item | undefined;
    add({
      id: `float:${it.id}`,
      level: 'yellow',
      message: `${it.label} is in the air (${fmt(elev)} above the floor, nothing under it)`,
      itemIds: [it.id],
      fix: support
        ? { label: `Put it on top of ${support.label}`, itemId: it.id, action: 'stack', supportId: support.id }
        : { label: 'Put it on the floor', itemId: it.id, action: 'floor' },
    });
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
      if (itemMount(it) !== 'floor' || itemElevation(it) >= DOOR_HEIGHT) continue; // high up (e.g. a loft) is fine
      const p = polys.get(it.id)!;
      if (swings.some((s) => polysIntersect(p, s.poly, 5))) {
        add({ id: `swing:${op.id}:${it.id}`, level: 'red', message: `${it.label} blocks the door${roomName(it)}`, itemIds: [it.id], openingId: op.id });
      }
    }
  }

  // 5. Walking space between items
  const walkers = items.filter((it) => itemMount(it) === 'floor' && itemElevation(it) <= STACK_TOL && !catalogEntry(it.type)?.noClearance && !isStairs(it));
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
      clearByWarning.set(`clear:${a.id}:${b.id}`, { a: g.pa, b: g.pb, gap: g.d });
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
        items.some((o) => o.id !== car.id && itemMount(o) === 'floor' && itemElevation(o) < 1000 && polysIntersect(sp, polys.get(o.id)!, 5));
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

      const span = itemSpan(it);
      if (mount === 'floor' && h !== undefined && span.top >= ceiling) {
        const what = span.bottom > STACK_TOL ? `${it.label} (top at ${fmt(span.top)})` : `${it.label} (${fmt(h)})`;
        add({ id: `tall:${it.id}`, level: 'red', message: `${what} is taller than the ceiling (${fmt(ceiling)})`, itemIds: [it.id] });
      }

      if (mount === 'floor' && h !== undefined) {
        for (const op of floor.openings) {
          if (op.kind !== 'window' || op.roomId !== room.id) continue;
          const sill = op.sillMm ?? DEFAULT_SILL;
          const winTop = sill + (op.heightMm ?? DEFAULT_WINDOW_H);
          if (span.top <= sill || span.bottom >= winTop) continue;
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
          if (itemHeight(other) === undefined) continue;
          if (!polysIntersect(polys.get(other.id)!, polys.get(it.id)!)) continue;
          const gap = fanH - itemSpan(other).top;
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

  // "Let it be": warnings the user accepted are kept aside and don't colour the plan.
  const ok = new Set(floor.okWarnings ?? []);
  const active = list.filter((w) => !ok.has(w.id));
  const ignored = list.filter((w) => ok.has(w.id));
  const red = new Set<string>();
  const yellow = new Set<string>();
  const redOpenings = new Set<string>();
  const clearLines: ClearLine[] = [];
  for (const w of active) {
    for (const id of w.itemIds) (w.level === 'red' ? red : yellow).add(id);
    if (w.openingId && w.id.startsWith('swing:')) redOpenings.add(w.openingId);
    const cl = clearByWarning.get(w.id);
    if (cl) clearLines.push(cl);
  }
  // sort: red first
  active.sort((a, b) => (a.level === b.level ? 0 : a.level === 'red' ? -1 : 1));
  return { list: active, ignored, red, yellow, redOpenings, clearLines };
}
