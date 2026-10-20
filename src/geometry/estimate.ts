import type { BrickSpec, Estimate, Floor, Room, TileSpec, Unit } from '../model/types';
import { isStairs } from '../model/catalog';
import { buildWalls, unionArea, unionVolume } from './wallPieces';
import { floorHeight, roomCeiling, clipToRect } from './levels';
import { stairBlocks } from './stairs';
import { stairOpenings } from './warnings';
import { depthOf, kindOf } from './spaces';
import { childBlocks, roomOuterBox } from './walls';
import { itemPoly } from '../geometry/items';
import type { Pt } from './poly';

export const DEFAULT_BRICK: BrickSpec = { lengthMm: 190, widthMm: 90, heightMm: 90, jointMm: 10, price: 8, wastePct: 5 };
export const DEFAULT_TILE: TileSpec = { lengthMm: 600, widthMm: 600, gapMm: 2, price: 120 };
export const DEFAULT_ESTIMATE: Estimate = {
  currency: '₹',
  brick: DEFAULT_BRICK,
  walls: true,
  stairs: true,
  ceiling: true,
  ceilingMm: 125,
  tile: DEFAULT_TILE,
  tileWastePct: 10,
  rooms: {},
};

/** Feet & inches users: the common 9″ × 4½″ × 3″ brick and 2′ × 2′ tiles. */
export const DEFAULT_ESTIMATE_FT: Estimate = {
  ...DEFAULT_ESTIMATE,
  brick: { ...DEFAULT_BRICK, lengthMm: 229, widthMm: 114, heightMm: 76 },
  tile: { ...DEFAULT_TILE, lengthMm: 610, widthMm: 610 },
};

export const defaultEstimate = (unit: Unit = 'm') => (unit === 'ft' ? DEFAULT_ESTIMATE_FT : DEFAULT_ESTIMATE);

export function estimateOf(e?: Partial<Estimate>, unit: Unit = 'm'): Estimate {
  const d = defaultEstimate(unit);
  return { ...d, ...e, brick: { ...d.brick, ...e?.brick }, tile: { ...d.tile, ...e?.tile }, rooms: e?.rooms ?? {} };
}

/** Bricks in a volume (mm³): each brick takes its size plus the mortar gap. */
export function bricksFor(volMm3: number, b: BrickSpec): number {
  const one = (b.lengthMm + b.jointMm) * (b.widthMm + b.jointMm) * (b.heightMm + b.jointMm);
  return one > 0 ? volMm3 / one : 0;
}

/** Tiles for an area (mm²), with the gap, before extra. */
export function tilesFor(areaMm2: number, t: TileSpec): number {
  const one = (t.lengthMm + t.gapMm) * (t.widthMm + t.gapMm);
  return one > 0 ? areaMm2 / one : 0;
}

const polyArea = (p: Pt[]) => Math.abs(p.reduce((s, q, i) => s + q.x * p[(i + 1) % p.length].y - p[(i + 1) % p.length].x * q.y, 0)) / 2;

export interface BrickPart {
  floor: string;
  part: 'Walls' | 'Stairs' | 'Ceiling';
  volMm3: number;
  bricks: number; // with extra, rounded up
}

export interface BrickReport {
  parts: BrickPart[];
  volMm3: number;
  bricks: number;
  cost: number;
}

export function brickReport(floors: Floor[], est: Estimate): BrickReport {
  const parts: BrickPart[] = [];
  const extra = 1 + est.brick.wastePct / 100;
  const push = (floor: string, part: BrickPart['part'], volMm3: number) => {
    if (volMm3 > 0) parts.push({ floor, part, volMm3, bricks: Math.ceil(bricksFor(volMm3, est.brick) * extra) });
  };
  floors.forEach((f, i) => {
    const above = i < floors.length - 1;
    if (est.walls) push(f.name, 'Walls', unionVolume(buildWalls(f).filter((w) => !w.glass)));
    if (est.stairs) {
      let v = 0;
      for (const it of f.items.filter(isStairs)) {
        const room = f.rooms.find((r) => it.x >= r.x && it.x <= r.x + r.width && it.y >= r.y && it.y <= r.y + r.length);
        const rise = above ? floorHeight(f) : room ? roomCeiling(f, room) : 3048;
        for (const b of stairBlocks(it, rise)) v += (b.x1 - b.x0) * (b.y1 - b.y0) * (b.top - b.bottom);
      }
      push(f.name, 'Stairs', v);
    }
    if (est.ceiling) {
      const tops = f.rooms.filter((r) => depthOf(f, r) === 0 && kindOf(r) !== 'balcony');
      let area = unionArea(tops.map((r) => roomOuterBox(f, r)));
      // the stairs on this floor go up through a hole in the ceiling
      if (above) for (const it of f.items.filter(isStairs)) area -= polyArea(itemPoly(it));
      push(f.name, 'Ceiling', Math.max(0, area) * est.ceilingMm);
    }
  });
  const bricks = parts.reduce((s, p) => s + p.bricks, 0);
  return { parts, volMm3: parts.reduce((s, p) => s + p.volMm3, 0), bricks, cost: bricks * est.brick.price };
}

/** Floor area of a room that gets tiles: without the rooms inside it and stair openings. */
export function tileArea(floor: Floor, r: Room, below?: Floor): number {
  const box = { minX: r.x, minY: r.y, maxX: r.x + r.width, maxY: r.y + r.length };
  const kids = childBlocks(floor, r).map((b) => ({ minX: Math.max(b.minX, box.minX), minY: Math.max(b.minY, box.minY), maxX: Math.min(b.maxX, box.maxX), maxY: Math.min(b.maxY, box.maxY) }));
  let area = r.width * r.length - unionArea(kids.filter((k) => k.maxX > k.minX && k.maxY > k.minY));
  for (const so of stairOpenings(below)) {
    const c = clipToRect(so.poly, box);
    if (c.length >= 3) area -= polyArea(c);
  }
  return Math.max(0, area);
}

export interface TileRow {
  floor: string;
  floorIndex: number;
  room: Room;
  areaMm2: number;
  mode: 'same' | 'own' | 'none';
  tile: TileSpec;
  tiles: number;
  cost: number;
}

export function tileReport(floors: Floor[], est: Estimate): { rows: TileRow[]; tiles: number; cost: number; areaMm2: number } {
  const extra = 1 + est.tileWastePct / 100;
  const rows: TileRow[] = [];
  floors.forEach((f, i) => {
    for (const r of f.rooms) {
      const o = est.rooms[r.id];
      const mode = o?.mode ?? 'same';
      const tile = mode === 'own' && o?.tile ? o.tile : est.tile;
      const areaMm2 = tileArea(f, r, floors[i - 1]);
      const tiles = mode === 'none' ? 0 : Math.ceil(tilesFor(areaMm2, tile) * extra);
      rows.push({ floor: f.name, floorIndex: i, room: r, areaMm2, mode, tile, tiles, cost: tiles * tile.price });
    }
  });
  return {
    rows,
    tiles: rows.reduce((s, r) => s + r.tiles, 0),
    cost: rows.reduce((s, r) => s + r.cost, 0),
    areaMm2: rows.filter((r) => r.mode !== 'none').reduce((s, r) => s + r.areaMm2, 0),
  };
}

// ---------- formatting ----------

export function money(n: number, currency: string): string {
  const v = Math.round(n * 100) / 100;
  const s = v.toLocaleString(currency === '₹' ? 'en-IN' : 'en-US', { maximumFractionDigits: v >= 100 ? 0 : 2 });
  return `${currency}${s}`;
}
export const count = (n: number) => n.toLocaleString('en-IN');
export function volume(mm3: number, unit: Unit): string {
  const m3 = mm3 / 1e9;
  return unit === 'ft' ? `${(m3 * 35.3147).toFixed(1)} cu ft` : `${m3.toFixed(2)} m³`;
}
export function areaText(mm2: number, unit: Unit): string {
  return unit === 'ft' ? `${(mm2 / 92903.04).toFixed(1)} sq ft` : `${(mm2 / 1e6).toFixed(2)} m²`;
}

// ---------- reading saved / shared data ----------

const n = (v: unknown, d: number, min: number, max: number) => (typeof v === 'number' && isFinite(v) ? Math.min(max, Math.max(min, v)) : d);
const brick = (b: any): BrickSpec => ({
  lengthMm: n(b?.lengthMm, DEFAULT_BRICK.lengthMm, 20, 1000),
  widthMm: n(b?.widthMm, DEFAULT_BRICK.widthMm, 20, 1000),
  heightMm: n(b?.heightMm, DEFAULT_BRICK.heightMm, 20, 1000),
  jointMm: n(b?.jointMm, DEFAULT_BRICK.jointMm, 0, 100),
  price: n(b?.price, DEFAULT_BRICK.price, 0, 1e7),
  wastePct: n(b?.wastePct, DEFAULT_BRICK.wastePct, 0, 100),
});
const tile = (t: any): TileSpec => ({
  lengthMm: n(t?.lengthMm, DEFAULT_TILE.lengthMm, 20, 5000),
  widthMm: n(t?.widthMm, DEFAULT_TILE.widthMm, 20, 5000),
  gapMm: n(t?.gapMm, DEFAULT_TILE.gapMm, 0, 50),
  price: n(t?.price, DEFAULT_TILE.price, 0, 1e7),
});
export function sanitizeEstimate(e: any): Estimate | undefined {
  if (!e || typeof e !== 'object') return undefined;
  const rooms: Estimate['rooms'] = {};
  if (e.rooms && typeof e.rooms === 'object') {
    for (const [k, v] of Object.entries(e.rooms).slice(0, 500) as [string, any][]) {
      if (typeof k !== 'string' || k.length > 40 || !v) continue;
      if (v.mode === 'none') rooms[k] = { mode: 'none' };
      else if (v.mode === 'own') rooms[k] = { mode: 'own', tile: tile(v.tile) };
    }
  }
  return {
    currency: typeof e.currency === 'string' && e.currency.length <= 4 ? e.currency : '₹',
    brick: brick(e.brick),
    walls: e.walls !== false,
    stairs: e.stairs !== false,
    ceiling: e.ceiling !== false,
    ceilingMm: n(e.ceilingMm, 125, 20, 1000),
    tile: tile(e.tile),
    tileWastePct: n(e.tileWastePct, 10, 0, 100),
    rooms,
  };
}
