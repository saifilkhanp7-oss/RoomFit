import { sanitizeEstimate } from '../geometry/estimate';
// Checks plans coming from outside (share links, backup files) and rebuilds them
// with only known fields, so a broken or edited file can't break the app.
import type { Floor, Home, Item, ItemTemplate, Layout, Opening, Room, Side } from '../model/types';
import { id as newId } from '../model/defaults.js';

const isObj = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown, fallback: string, max = 80) => (typeof v === 'string' && v.trim() ? v.slice(0, max) : fallback);
const num = (v: unknown, fallback: number, min = -1e7, max = 1e7) =>
  typeof v === 'number' && isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;
const optNum = (v: unknown, min: number, max: number) => (typeof v === 'number' && isFinite(v) ? Math.min(max, Math.max(min, v)) : undefined);
const oneOf = <T extends string>(v: unknown, opts: readonly T[], fallback: T): T => (opts.includes(v as T) ? (v as T) : fallback);
const color = (v: unknown) => (typeof v === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(v) ? v : '#9aa0a6');
const SIDES: Side[] = ['top', 'right', 'bottom', 'left'];

function room(r: any): Room | null {
  if (!isObj(r)) return null;
  return {
    id: str(r.id, newId(), 40),
    name: str(r.name, 'Room', 40),
    x: num(r.x, 0),
    y: num(r.y, 0),
    width: num(r.width, 3000, 100, 100000),
    length: num(r.length, 3000, 100, 100000),
    ceilingMm: optNum(r.ceilingMm, 1000, 10000),
    ...(r.kind && r.kind !== 'room' ? { kind: oneOf(r.kind, ['room', 'hall', 'bathroom', 'kitchen', 'balcony', 'parking', 'store'] as const, 'room') } : {}),
  };
}

function opening(o: any, roomIds: Set<string>): Opening | null {
  if (!isObj(o) || !roomIds.has(o.roomId)) return null;
  return {
    id: str(o.id, newId(), 40),
    kind: oneOf(o.kind, ['door', 'window'] as const, 'door'),
    roomId: o.roomId,
    side: oneOf(o.side, SIDES, 'top'),
    offsetMm: num(o.offsetMm, 0, 0, 100000),
    widthMm: num(o.widthMm, 900, 100, 100000),
    doorType: o.doorType ? oneOf(o.doorType, ['swing', 'double', 'sliding', 'shutter', 'opening'] as const, 'swing') : undefined,
    hinge: o.hinge ? oneOf(o.hinge, ['start', 'end'] as const, 'start') : undefined,
    opensInto: o.opensInto ? oneOf(o.opensInto, ['this', 'other'] as const, 'this') : undefined,
    sillMm: optNum(o.sillMm, 0, 10000),
    heightMm: optNum(o.heightMm, 0, 10000),
  };
}

function item(i: any): Item | null {
  if (!isObj(i)) return null;
  const it: Item = {
    id: str(i.id, newId(), 40),
    type: str(i.type, 'custom', 40),
    label: str(i.label, 'Item', 40),
    x: num(i.x, 0),
    y: num(i.y, 0),
    width: num(i.width, 600, 10, 100000),
    depth: num(i.depth, 600, 10, 100000),
    rotation: num(i.rotation, 0, -3600, 3600),
    shape: oneOf(i.shape, ['rect', 'round'] as const, 'rect'),
    color: color(i.color),
    heightMm: optNum(i.heightMm, 0, 20000),
    elevationMm: optNum(i.elevationMm, 0, 20000),
    openBelowMm: optNum(i.openBelowMm, 0, 20000),
    wallMounted: typeof i.wallMounted === 'boolean' ? i.wallMounted : undefined,
    mount: i.mount ? oneOf(i.mount, ['floor', 'ceiling', 'under'] as const, 'floor') : undefined,
    locked: i.locked === true ? true : undefined,
  };
  if (isObj(i.stairs)) {
    it.stairs = {
      style: oneOf(i.stairs.style, ['straight', 'L', 'U'] as const, 'straight'),
      flightWidthMm: num(i.stairs.flightWidthMm, 900, 300, 5000),
      turn: oneOf(i.stairs.turn, ['left', 'right'] as const, 'right'),
      upDir: 0,
      ...(i.stairs.open === true ? { open: true } : {}),
    };
  }
  return it;
}

function floor(f: any, index: number): Floor | null {
  if (!isObj(f)) return null;
  const rooms = (Array.isArray(f.rooms) ? f.rooms : []).map(room).filter(Boolean) as Room[];
  const ids = new Set(rooms.map((r) => r.id));
  return {
    id: str(f.id, newId(), 40),
    name: str(f.name, `Floor ${index + 1}`, 40),
    outerWallMm: num(f.outerWallMm, 229, 0, 2000),
    innerWallMm: optNum(f.innerWallMm, 0, 2000),
    floorHeightMm: optNum(f.floorHeightMm, 1800, 12000),
    rooms,
    sharedWalls: [],
    openings: (Array.isArray(f.openings) ? f.openings : []).map((o: any) => opening(o, ids)).filter(Boolean) as Opening[],
    items: (Array.isArray(f.items) ? f.items : []).map(item).filter(Boolean).slice(0, 2000) as Item[],
    ...(Array.isArray(f.okWarnings)
      ? { okWarnings: f.okWarnings.filter((w: unknown) => typeof w === 'string' && w.length < 120).slice(0, 500) }
      : {}),
  };
}

function layout(l: any): Layout | null {
  if (!isObj(l) || !Array.isArray(l.floors)) return null;
  const floors = l.floors.map(floor).filter(Boolean).slice(0, 10) as Floor[];
  if (!floors.length) return null;
  const estimate = sanitizeEstimate(l.estimate);
  return { id: str(l.id, newId(), 40), name: str(l.name, 'Layout A', 40), floors, ...(estimate ? { estimate } : {}) };
}

export function sanitizeHome(h: any): Home | null {
  if (!isObj(h) || !Array.isArray(h.layouts)) return null;
  const layouts = h.layouts.map(layout).filter(Boolean).slice(0, 30) as Layout[];
  if (!layouts.length) return null;
  const now = Date.now();
  return {
    id: str(h.id, newId(), 40),
    name: str(h.name, 'Shared plan', 60),
    kind: h.kind === 'multi' ? 'multi' : 'single',
    layouts,
    createdAt: num(h.createdAt, now, 0, 9e15),
    updatedAt: num(h.updatedAt, now, 0, 9e15),
  };
}

export function sanitizeTemplate(t: any): ItemTemplate | null {
  if (!isObj(t)) return null;
  return {
    id: str(t.id, newId(), 40),
    type: 'custom',
    label: str(t.label, 'Item', 40),
    width: num(t.width, 600, 10, 100000),
    depth: num(t.depth, 600, 10, 100000),
    heightMm: optNum(t.heightMm, 0, 20000),
    shape: oneOf(t.shape, ['rect', 'round'] as const, 'rect'),
    color: color(t.color),
  };
}
