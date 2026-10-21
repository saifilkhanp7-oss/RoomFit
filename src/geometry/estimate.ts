import type { BrickSpec, CementSpec, Estimate, Floor, PaintSpec, Room, TileSpec, Unit } from '../model/types';
import { isStairs } from '../model/catalog';
import { buildWalls, unionArea, unionVolume } from './wallPieces';
import { floorHeight, roomCeiling, clipToRect } from './levels';
import { stairBlocks } from './stairs';
import { stairOpenings } from './warnings';
import { depthOf, flushWithParent, kindOf, parentOf, spaceOfPoint } from './spaces';
import { childBlocks, DOOR_HEIGHT, neighbors, roomOuterBox, sideLine, SIDES, wallThickness } from './walls';
import { partitionLength, partitionMid, partitionSpan } from './partitions';
import { DEFAULT_WINDOW_H } from './warnings';
import { RAILING } from './wallPieces';
import { itemPoly } from '../geometry/items';
import type { Pt } from './poly';

export const DEFAULT_BRICK: BrickSpec = { lengthMm: 190, widthMm: 90, heightMm: 90, jointMm: 10, price: 8, wastePct: 5 };
export const DEFAULT_TILE: TileSpec = { lengthMm: 600, widthMm: 600, gapMm: 2, price: 120 };
export const DEFAULT_PAINT: PaintSpec = { coats: 2, coverageM2: 12, price: 250, ceiling: true, outside: false };
export const DEFAULT_CEMENT: CementSpec = { price: 420, mortarMix: 6, plaster: true, plasterMix: 4, plasterMm: 12, plasterOutside: true, tileBed: true, tileBedMm: 20, tileBedMix: 4 };

export const DEFAULT_ESTIMATE: Estimate = {
  paint: DEFAULT_PAINT,
  cement: DEFAULT_CEMENT,
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
  return {
    ...d,
    ...e,
    brick: { ...d.brick, ...e?.brick },
    tile: { ...d.tile, ...e?.tile },
    paint: { ...d.paint, ...e?.paint },
    cement: { ...d.cement, ...e?.cement },
    rooms: e?.rooms ?? {},
  };
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
  part: 'Walls' | 'Inner walls' | 'Stairs' | 'Ceiling';
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
    if (est.walls) {
      push(f.name, 'Walls', unionVolume(buildWalls(f).filter((w) => !w.glass)));
      push(f.name, 'Inner walls', partitionsVolume(f));
    }
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

/** Volume of the walls inside rooms. */
export function partitionsVolume(f: Floor): number {
  return (f.partitions ?? []).reduce((v, p) => {
    const { bottom, top } = partitionSpan(f, p);
    return v + partitionLength(p) * p.thicknessMm * Math.max(0, top - bottom);
  }, 0);
}

/** Floor area of a room that gets tiles: without the rooms inside it, stair openings and inner walls standing on it. */
export function tileArea(floor: Floor, r: Room, below?: Floor): number {
  const box = { minX: r.x, minY: r.y, maxX: r.x + r.width, maxY: r.y + r.length };
  const kids = childBlocks(floor, r).map((b) => ({ minX: Math.max(b.minX, box.minX), minY: Math.max(b.minY, box.minY), maxX: Math.min(b.maxX, box.maxX), maxY: Math.min(b.maxY, box.maxY) }));
  let area = r.width * r.length - unionArea(kids.filter((k) => k.maxX > k.minX && k.maxY > k.minY));
  for (const so of stairOpenings(below)) {
    const c = clipToRect(so.poly, box);
    if (c.length >= 3) area -= polyArea(c);
  }
  // floor built over part of the stairs gets tiles again
  for (const cv of floor.covers ?? []) {
    const c = clipToRect(
      [
        { x: cv.x, y: cv.y },
        { x: cv.x + cv.width, y: cv.y },
        { x: cv.x + cv.width, y: cv.y + cv.length },
        { x: cv.x, y: cv.y + cv.length },
      ],
      box,
    );
    if (c.length >= 3) area += polyArea(c);
  }
  for (const p of floor.partitions ?? []) {
    if (p.bottomMm > 0 || spaceOfPoint(floor, partitionMid(p))?.id !== r.id) continue;
    area -= partitionLength(p) * p.thicknessMm;
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

// ---------- paint ----------

export interface Faces {
  insideMm2: number;
  outsideMm2: number;
  ceilingMm2: number;
  innerWallsMm2: number;
}

/** Wall faces to paint or plaster on one floor: inside faces of every room, outside of the house, ceilings, inner walls. */
export function wallFaces(f: Floor): Faces {
  let inside = 0;
  let outside = 0;
  let ceiling = 0;
  const ceil = (r: Room) => roomCeiling(f, r);
  for (const r of f.rooms) {
    const balcony = kindOf(r) === 'balcony';
    const H = ceil(r);
    const parent = parentOf(f, r);
    const ns = neighbors(f, r);
    for (const side of SIDES) {
      const len = sideLine(r, side).length;
      const nHere = ns.filter((n) => n.side === side);
      const shared = nHere.length > 0;
      const h = balcony && !shared ? RAILING : H;
      inside += len * h;
      if (parent) {
        if (flushWithParent(f, r, side)) inside -= len * Math.min(h, ceil(parent)); // the parent's face there is this room's face
        else inside += len * Math.min(h, ceil(parent)); // the outside of this room's wall, seen from the parent room
      } else if (!balcony) {
        const horiz = side === 'top' || side === 'bottom';
        const ext = horiz ? wallThickness(f, r, 'left') + wallThickness(f, r, 'right') : 0;
        const covered = nHere.reduce((a, n) => a + (n.to - n.from), 0);
        outside += Math.max(0, len + ext - covered) * H;
      }
    }
    // doors and windows go through the wall: off both faces
    for (const o of f.openings.filter((x) => x.roomId === r.id)) {
      const hole = o.widthMm * (o.kind === 'door' ? Math.min(o.doorType === 'shutter' ? 2400 : DOOR_HEIGHT, H) : (o.heightMm ?? DEFAULT_WINDOW_H));
      inside -= hole;
      const shared = ns.some((n) => n.side === o.side);
      if (shared || (parent && !flushWithParent(f, r, o.side))) inside -= hole;
      else if (!parent) outside -= hole;
    }
    if (!balcony) ceiling += tileArea(f, r);
  }
  const innerWalls = (f.partitions ?? []).reduce((a, p) => {
    const { bottom, top } = partitionSpan(f, p);
    return a + 2 * partitionLength(p) * Math.max(0, top - bottom);
  }, 0);
  return { insideMm2: Math.max(0, inside), outsideMm2: Math.max(0, outside), ceilingMm2: ceiling, innerWallsMm2: innerWalls };
}

export interface PaintRow {
  floor: string;
  part: 'Walls inside' | 'Inner walls' | 'Ceilings' | 'Outside walls';
  areaMm2: number;
}

export function paintReport(floors: Floor[], est: Estimate): { rows: PaintRow[]; areaMm2: number; litres: number; cost: number } {
  const rows: PaintRow[] = [];
  for (const f of floors) {
    const fc = wallFaces(f);
    const push = (part: PaintRow['part'], a: number) => a > 0 && rows.push({ floor: f.name, part, areaMm2: a });
    push('Walls inside', fc.insideMm2);
    push('Inner walls', fc.innerWallsMm2);
    if (est.paint.ceiling) push('Ceilings', fc.ceilingMm2);
    if (est.paint.outside) push('Outside walls', fc.outsideMm2);
  }
  const areaMm2 = rows.reduce((a, r) => a + r.areaMm2, 0);
  const litres = est.paint.coverageM2 > 0 ? Math.ceil(((areaMm2 / 1e6) * est.paint.coats) / est.paint.coverageM2 * 10) / 10 : 0;
  return { rows, areaMm2, litres, cost: litres * est.paint.price };
}

// ---------- cement ----------

export const BAG_M3 = 0.0347; // one 50 kg bag of cement
const DRY = 1.33; // wet mortar → dry materials
const bagsOf = (wetMm3: number, mix: number) => ((wetMm3 / 1e9) * DRY) / (1 + mix) / BAG_M3;

export interface CementRow {
  part: 'Brick mortar' | 'Plaster' | 'Under tiles';
  note: string;
  bags: number;
}

export function cementReport(floors: Floor[], est: Estimate, unit: Unit = 'm'): { rows: CementRow[]; bags: number; cost: number } {
  const c = est.cement;
  const rows: CementRow[] = [];
  const b = est.brick;
  const bricks = brickReport(floors, est);
  const one = b.lengthMm * b.widthMm * b.heightMm;
  const mortar = bricks.parts.reduce((a, p) => a + Math.max(0, p.volMm3 - bricksFor(p.volMm3, b) * one), 0);
  if (mortar > 0) rows.push({ part: 'Brick mortar', note: `1 : ${c.mortarMix}`, bags: bagsOf(mortar, c.mortarMix) });
  if (c.plaster) {
    const area = floors.reduce((a, f) => {
      const fc = wallFaces(f);
      return a + fc.insideMm2 + fc.innerWallsMm2 + (c.plasterOutside ? fc.outsideMm2 : 0);
    }, 0);
    const thick = unit === 'ft' ? `${Math.round((c.plasterMm / 25.4) * 10) / 10}″` : `${c.plasterMm} mm`;
    if (area > 0) rows.push({ part: 'Plaster', note: `1 : ${c.plasterMix}, ${thick}`, bags: bagsOf(area * c.plasterMm, c.plasterMix) });
  }
  if (c.tileBed) {
    const area = tileReport(floors, est).areaMm2;
    const thick = unit === 'ft' ? `${Math.round((c.tileBedMm / 25.4) * 10) / 10}″` : `${c.tileBedMm} mm`;
    if (area > 0) rows.push({ part: 'Under tiles', note: `1 : ${c.tileBedMix}, ${thick}`, bags: bagsOf(area * c.tileBedMm, c.tileBedMix) });
  }
  const bags = Math.ceil(rows.reduce((a, r) => a + r.bags, 0));
  return { rows, bags, cost: bags * c.price };
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
    paint: {
      coats: n(e.paint?.coats, DEFAULT_PAINT.coats, 1, 10),
      coverageM2: n(e.paint?.coverageM2, DEFAULT_PAINT.coverageM2, 0.5, 100),
      price: n(e.paint?.price, DEFAULT_PAINT.price, 0, 1e7),
      ceiling: e.paint?.ceiling !== false,
      outside: e.paint?.outside === true,
    },
    cement: {
      price: n(e.cement?.price, DEFAULT_CEMENT.price, 0, 1e7),
      mortarMix: n(e.cement?.mortarMix, DEFAULT_CEMENT.mortarMix, 1, 20),
      plaster: e.cement?.plaster !== false,
      plasterMix: n(e.cement?.plasterMix, DEFAULT_CEMENT.plasterMix, 1, 20),
      plasterMm: n(e.cement?.plasterMm, DEFAULT_CEMENT.plasterMm, 1, 100),
      plasterOutside: e.cement?.plasterOutside !== false,
      tileBed: e.cement?.tileBed !== false,
      tileBedMm: n(e.cement?.tileBedMm, DEFAULT_CEMENT.tileBedMm, 1, 200),
      tileBedMix: n(e.cement?.tileBedMix, DEFAULT_CEMENT.tileBedMix, 1, 20),
    },
  };
}
