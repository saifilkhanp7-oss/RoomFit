// "Will it get in?": can a piece of furniture be carried from the main door (or up the stairs)
// to where it is on the plan? The item is moved as a rectangle (its plan footprint while carried)
// through a grid of positions and turns, avoiding walls, door heads and inner walls.
import type { Floor, Item } from '../model/types';
import type { Pt } from './poly';
import { itemHeight, itemMount, isStairs, DEFAULT_ITEM_HEIGHT } from '../model/catalog';
import { buildWalls } from './wallPieces';
import { openingGeom } from './walls';
import { spaceOfPoint } from './spaces';
import { floorBounds } from './view';
import { partitionPoly, partitionSpan } from './partitions';
import { itemPoly } from './items';

export interface CarryWay {
  how: 'as it stands' | 'on its side' | 'lying flat';
  long: number; // along the way
  wide: number; // across the way
  high: number; // height while carried
}

export interface RouteResult {
  ok: boolean;
  /** Plain-words answer. */
  message: string;
  /** Outlines along the way (last = where it gets to). */
  steps: Pt[][];
  way?: CarryWay;
}

const ANGLES = 12; // every 15°

/** The ways it can be carried: as it stands, on its side, lying flat. */
export function carryWays(item: Item): CarryWay[] {
  const h = itemHeight(item) ?? DEFAULT_ITEM_HEIGHT;
  const [s1, s2, s3] = [item.width, item.depth, h].sort((a, b) => a - b);
  const out: CarryWay[] = [{ how: 'as it stands', long: Math.max(item.width, item.depth), wide: Math.min(item.width, item.depth), high: h }];
  const add = (w: CarryWay) => {
    if (!out.some((o) => Math.abs(o.long - w.long) < 1 && Math.abs(o.wide - w.wide) < 1 && Math.abs(o.high - w.high) < 1)) out.push(w);
  };
  add({ how: 'on its side', long: s3, wide: s1, high: s2 });
  add({ how: 'lying flat', long: s3, wide: s2, high: s1 });
  return out;
}

/** Longest thing of width w that turns a right-angle corner between passages a and b wide. */
export function cornerMaxLength(a: number, b: number, w: number): number {
  let best = Infinity;
  for (let i = 1; i < 180; i++) {
    const t = (i / 180) * (Math.PI / 2);
    const s = Math.sin(t);
    const c = Math.cos(t);
    best = Math.min(best, a / s + b / c - w / (s * c));
  }
  return Math.max(0, best);
}

interface Box {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}
type Obstacle = { box: Box; poly?: Pt[] };

function polyBoxOf(p: Pt[]): Box {
  return p.reduce((a, q) => ({ minX: Math.min(a.minX, q.x), minY: Math.min(a.minY, q.y), maxX: Math.max(a.maxX, q.x), maxY: Math.max(a.maxY, q.y) }), {
    minX: Infinity,
    minY: Infinity,
    maxX: -Infinity,
    maxY: -Infinity,
  });
}

/** Separating-axis test: rectangle (corners) vs convex polygon. */
function sat(a: Pt[], b: Pt[]): boolean {
  for (const poly of [a, b]) {
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i];
      const q = poly[(i + 1) % poly.length];
      const nx = q.y - p.y;
      const ny = p.x - q.x;
      let aMin = Infinity,
        aMax = -Infinity,
        bMin = Infinity,
        bMax = -Infinity;
      for (const v of a) {
        const d = v.x * nx + v.y * ny;
        aMin = Math.min(aMin, d);
        aMax = Math.max(aMax, d);
      }
      for (const v of b) {
        const d = v.x * nx + v.y * ny;
        bMin = Math.min(bMin, d);
        bMax = Math.max(bMax, d);
      }
      if (aMax <= bMin + 1e-6 || bMax <= aMin + 1e-6) return false;
    }
  }
  return true;
}

function rect(cx: number, cy: number, ang: number, hl: number, hw: number): Pt[] {
  const c = Math.cos(ang);
  const s = Math.sin(ang);
  return [
    { x: cx - c * hl + s * hw, y: cy - s * hl - c * hw },
    { x: cx + c * hl + s * hw, y: cy + s * hl - c * hw },
    { x: cx + c * hl - s * hw, y: cy + s * hl + c * hw },
    { x: cx - c * hl - s * hw, y: cy - s * hl + c * hw },
  ];
}

interface Start {
  p: Pt;
  dir: number; // radians: the way in
  via: string;
}

/** Doors on the outside of the home: just outside them there is no room. */
export function outsideDoors(floor: Floor): { p: Pt; dir: number; width: number; name: string }[] {
  const out: { p: Pt; dir: number; width: number; name: string }[] = [];
  for (const o of floor.openings) {
    if (o.kind !== 'door') continue;
    const room = floor.rooms.find((r) => r.id === o.roomId);
    if (!room) continue;
    const g = openingGeom(floor, room, o);
    const mid = { x: (g.p1.x + g.p2.x) / 2, y: (g.p1.y + g.p2.y) / 2 };
    const outside = { x: mid.x - g.inward.x * (g.thickness + 80), y: mid.y - g.inward.y * (g.thickness + 80) };
    if (spaceOfPoint(floor, outside)) continue;
    out.push({ p: { x: mid.x - g.inward.x * g.thickness, y: mid.y - g.inward.y * g.thickness }, dir: Math.atan2(g.inward.y, g.inward.x), width: o.widthMm, name: `${room.name} door` });
  }
  return out;
}

/** Top of the stairs from the floor below: where you step off, and the way you face. */
function stairExits(below: Floor): { p: Pt; dir: number; stairs: Item }[] {
  return below.items.filter(isStairs).map((s) => {
    const w = s.width,
      d = s.depth;
    const style = s.stairs?.style ?? 'straight';
    const f = Math.min(s.stairs?.flightWidthMm ?? Math.min(w, 1000), w / (style === 'U' ? 2 : 1), d);
    const mirror = (s.stairs?.turn ?? 'right') === 'left' ? -1 : 1;
    // local exit point and direction (stairs go up towards local -y)
    let lp: Pt, ld: Pt;
    if (style === 'straight') (lp = { x: 0, y: -d / 2 }), (ld = { x: 0, y: -1 });
    else if (style === 'L') (lp = { x: (w / 2) * mirror, y: -d / 2 + f / 2 }), (ld = { x: mirror, y: 0 });
    else (lp = { x: (w / 2 - f / 2) * mirror, y: d / 2 }), (ld = { x: 0, y: 1 });
    const r = (s.rotation * Math.PI) / 180;
    const rot = (q: Pt) => ({ x: q.x * Math.cos(r) - q.y * Math.sin(r), y: q.x * Math.sin(r) + q.y * Math.cos(r) });
    const p = rot(lp);
    const dv = rot(ld);
    return { p: { x: p.x + s.x, y: p.y + s.y }, dir: Math.atan2(dv.y, dv.x), stairs: s };
  });
}

export interface RouteOptions {
  /** Treat the furniture already on the plan as in the way. */
  furniture?: boolean;
  fmt?: (mm: number) => string;
}

/** Can this item be carried in? */
export function checkRoute(floors: Floor[], floorIndex: number, item: Item, opts: RouteOptions = {}): RouteResult {
  const fmt = opts.fmt ?? ((mm: number) => `${Math.round(mm)} mm`);
  const floor = floors[floorIndex];
  if (itemMount(item) !== 'floor' || isStairs(item)) return { ok: true, message: 'Nothing to carry in.', steps: [] };
  const ways = carryWays(item);
  const thin = Math.min(...ways.map((w) => w.wide));

  // where it comes in from
  const doors = outsideDoors(floor);
  let starts: Start[] = doors.map((d) => ({ p: d.p, dir: d.dir, via: d.name }));
  const below = floors[floorIndex - 1];
  if (!starts.length && below) {
    const exits = stairExits(below);
    for (const ex of exits) {
      const st = ex.stairs;
      const style = st.stairs?.style ?? 'straight';
      const f = Math.min(st.stairs?.flightWidthMm ?? Math.min(st.width, 1000), st.width / (style === 'U' ? 2 : 1), st.depth);
      const way = [...ways].sort((a, b) => a.wide - b.wide)[0];
      if (way.wide > f) return { ok: false, message: `It's too wide for the stairs: the stairs are ${fmt(f)} wide and it's at least ${fmt(way.wide)} wide.`, steps: [] };
      if (style !== 'straight') {
        const maxL = cornerMaxLength(f, f, way.wide);
        if (way.long > maxL) return { ok: false, message: `It's too long to turn on the stairs landing (up to ${fmt(maxL)} long fits; it's ${fmt(way.long)}).`, steps: [] };
      }
      starts.push({ p: ex.p, dir: ex.dir, via: 'the stairs' });
    }
  }
  if (!starts.length) {
    return {
      ok: false,
      message: below ? 'Add stairs on the floor below, or a door on an outside wall, so there is a way in.' : 'Add the main door on an outside wall first, so there is a way in.',
      steps: [],
    };
  }

  const narrow = doors.filter((d) => d.width < thin);
  if (narrow.length === doors.length && doors.length && !below) {
    return { ok: false, message: `It's too wide for the door: ${narrow[0].name} is ${fmt(narrow[0].width)} wide; even on its side it needs ${fmt(thin)}.`, steps: [] };
  }

  let best: { r: RouteResult; dist: number } | null = null;
  for (const way of ways) {
    const r = search(floor, item, way, starts, opts);
    if (r.ok) return r;
    if (!best || r.dist < best.dist) best = { r, dist: r.dist };
  }
  return best!.r;
}

function search(floor: Floor, item: Item, way: CarryWay, starts: Start[], opts: RouteOptions): RouteResult & { dist: number } {
  // obstacles taller than the floor and lower than the top of what is carried
  const obs: Obstacle[] = [];
  for (const w of buildWalls(floor)) if (w.z0 < way.high - 1) obs.push({ box: { minX: w.x0, minY: w.y0, maxX: w.x1, maxY: w.y1 } });
  for (const p of floor.partitions ?? []) {
    const { bottom, top } = partitionSpan(floor, p);
    if (bottom < way.high - 1 && top > 1) {
      const poly = partitionPoly(p);
      obs.push({ box: polyBoxOf(poly), poly });
    }
  }
  if (opts.furniture) {
    for (const it of floor.items) {
      if (it.id === item.id || itemMount(it) !== 'floor') continue;
      const poly = itemPoly(it);
      obs.push({ box: polyBoxOf(poly), poly });
    }
  }

  const b = floorBounds(floor) ?? { minX: 0, minY: 0, maxX: 4000, maxY: 3000 };
  const margin = way.long / 2 + 400;
  const minX = b.minX - margin,
    minY = b.minY - margin;
  const area = (b.maxX - b.minX + 2 * margin) * (b.maxY - b.minY + 2 * margin);
  const step = Math.max(40, Math.min(120, Math.round(Math.sqrt(area / 50000))));
  const nx = Math.ceil((b.maxX - b.minX + 2 * margin) / step) + 1;
  const ny = Math.ceil((b.maxY - b.minY + 2 * margin) / step) + 1;
  const N = nx * ny * ANGLES;

  // obstacle buckets
  const B = 600;
  const buckets = new Map<number, Obstacle[]>();
  const key = (i: number, j: number) => i * 100003 + j;
  for (const o of obs) {
    for (let i = Math.floor(o.box.minX / B); i <= Math.floor(o.box.maxX / B); i++)
      for (let j = Math.floor(o.box.minY / B); j <= Math.floor(o.box.maxY / B); j++) {
        const k = key(i, j);
        const l = buckets.get(k);
        if (l) l.push(o);
        else buckets.set(k, [o]);
      }
  }
  const hl = way.long / 2;
  const hw = way.wide / 2;
  const valid = new Int8Array(N); // 0 unknown, 1 free, 2 blocked
  const free = (ix: number, iy: number, a: number): boolean => {
    const idx = (ix * ny + iy) * ANGLES + a;
    if (valid[idx]) return valid[idx] === 1;
    const cx = minX + ix * step;
    const cy = minY + iy * step;
    const r = rect(cx, cy, (a * Math.PI) / ANGLES, hl, hw);
    const rb = polyBoxOf(r);
    let hit = false;
    const seen = new Set<Obstacle>();
    outer: for (let i = Math.floor(rb.minX / B); i <= Math.floor(rb.maxX / B); i++)
      for (let j = Math.floor(rb.minY / B); j <= Math.floor(rb.maxY / B); j++) {
        for (const o of buckets.get(key(i, j)) ?? []) {
          if (seen.has(o)) continue;
          seen.add(o);
          if (o.box.maxX <= rb.minX || o.box.minX >= rb.maxX || o.box.maxY <= rb.minY || o.box.minY >= rb.maxY) continue;
          const op = o.poly ?? [
            { x: o.box.minX, y: o.box.minY },
            { x: o.box.maxX, y: o.box.minY },
            { x: o.box.maxX, y: o.box.maxY },
            { x: o.box.minX, y: o.box.maxY },
          ];
          if (sat(r, op)) {
            hit = true;
            break outer;
          }
        }
      }
    valid[idx] = hit ? 2 : 1;
    return !hit;
  };

  const goal = { x: item.x, y: item.y };
  const reach = Math.max(step * 1.5, 150);
  const prev = new Int32Array(N).fill(-2); // -2 = not seen, -1 = start
  const queue = new Int32Array(N);
  let qh = 0,
    qt = 0;
  const angIdx = (rad: number) => ((Math.round((rad / Math.PI) * ANGLES) % ANGLES) + ANGLES) % ANGLES;
  for (const s of starts) {
    // start outside the door / past the top of the stairs, facing in
    for (const back of [hl + 150, hl + 400]) {
      const cx = s.p.x - Math.cos(s.dir) * back;
      const cy = s.p.y - Math.sin(s.dir) * back;
      const ix = Math.round((cx - minX) / step);
      const iy = Math.round((cy - minY) / step);
      if (ix < 0 || iy < 0 || ix >= nx || iy >= ny) continue;
      const a = angIdx(s.dir);
      const idx = (ix * ny + iy) * ANGLES + a;
      if (prev[idx] === -2 && free(ix, iy, a)) {
        prev[idx] = -1;
        queue[qt++] = idx;
      }
    }
  }
  // stairs: start on the floor above at the top, a bit in from the edge
  let found = -1;
  let closest = -1;
  let closestD = Infinity;
  while (qh < qt) {
    const idx = queue[qh++];
    const a = idx % ANGLES;
    const cell = (idx - a) / ANGLES;
    const iy = cell % ny;
    const ix = (cell - iy) / ny;
    const cx = minX + ix * step;
    const cy = minY + iy * step;
    const d = Math.hypot(cx - goal.x, cy - goal.y);
    if (d < closestD) {
      closestD = d;
      closest = idx;
    }
    if (d <= reach) {
      found = idx;
      break;
    }
    const next: [number, number, number][] = [
      [ix + 1, iy, a],
      [ix - 1, iy, a],
      [ix, iy + 1, a],
      [ix, iy - 1, a],
      [ix, iy, (a + 1) % ANGLES],
      [ix, iy, (a + ANGLES - 1) % ANGLES],
    ];
    for (const [jx, jy, b2] of next) {
      if (jx < 0 || jy < 0 || jx >= nx || jy >= ny) continue;
      const j = (jx * ny + jy) * ANGLES + b2;
      if (prev[j] !== -2) continue;
      if (!free(jx, jy, b2)) {
        prev[j] = -3;
        continue;
      }
      prev[j] = idx;
      queue[qt++] = j;
    }
  }

  const poseOf = (idx: number): Pt[] => {
    const a = idx % ANGLES;
    const cell = (idx - a) / ANGLES;
    const iy = cell % ny;
    const ix = (cell - iy) / ny;
    return rect(minX + ix * step, minY + iy * step, (a * Math.PI) / ANGLES, hl, hw);
  };
  const pathTo = (end: number): Pt[][] => {
    const chain: number[] = [];
    for (let k = end; k >= 0; k = prev[k]) chain.push(k);
    chain.reverse();
    const every = Math.max(1, Math.round(chain.length / 14));
    const picked = chain.filter((_, i) => i % every === 0);
    if (picked[picked.length - 1] !== end) picked.push(end);
    return picked.map(poseOf);
  };

  const how = way.how === 'as it stands' ? '' : ` (carried ${way.how})`;
  const via = starts.length === 1 ? starts[0].via : starts.some((s) => s.via === 'the stairs') ? 'the stairs' : 'the main door';
  if (found >= 0) return { ok: true, message: `Yes, it gets in through ${via}${how}.`, steps: pathTo(found), way, dist: 0 };
  if (closest < 0) return { ok: false, message: `It can't even get through ${via}: the way in is too tight${how}.`, steps: [], way, dist: Infinity };
  const end = poseOf(closest);
  const c = end.reduce((acc, q) => ({ x: acc.x + q.x / 4, y: acc.y + q.y / 4 }), { x: 0, y: 0 });
  const at = spaceOfPoint(floor, c);
  const target = spaceOfPoint(floor, goal);
  const where = at ? `as far as the ${at.name}` : 'only to the door';
  const into = target && target.id !== at?.id ? ` The way into the ${target.name} is too tight.` : ' It gets stuck before its spot.';
  return { ok: false, message: `No: it gets ${where}.${into}`, steps: pathTo(closest), way, dist: closestD };
}
