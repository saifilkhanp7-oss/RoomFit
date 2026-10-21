import { sanitizeEstimate } from '../geometry/estimate';
// Checks plans coming from outside (share links, backup files) and rebuilds them
// with only known fields, so a broken or edited file can't break the app.
import type { Cover, Floor, Home, Item, ItemTemplate, Layout, Opening, Partition, Person, PowerPoint, Room, Side, Zone } from '../model/types';
import { id as newId } from '../model/defaults.js';

const isObj = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown, fallback: string, max = 80) => (typeof v === 'string' && v.trim() ? v.slice(0, max) : fallback);
const num = (v: unknown, fallback: number, min = -1e7, max = 1e7) =>
  typeof v === 'number' && isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;
const optNum = (v: unknown, min: number, max: number) => (typeof v === 'number' && isFinite(v) ? Math.min(max, Math.max(min, v)) : undefined);
const oneOf = <T extends string>(v: unknown, opts: readonly T[], fallback: T): T => (opts.includes(v as T) ? (v as T) : fallback);
const color = (v: unknown) => (typeof v === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(v) ? v : '#9aa0a6');
const SIDES: Side[] = ['top', 'right', 'bottom', 'left'];
const isColor = (v: unknown): v is string => typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v);

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
    ...(isColor(r.wallColor) ? { wallColor: r.wallColor } : {}),
    ...(isObj(r.sideColors) ? { sideColors: Object.fromEntries(SIDES.filter((s) => isColor(r.sideColors[s])).map((s) => [s, r.sideColors[s]])) } : {}),
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
    ...(typeof i.owner === 'string' && i.owner.length <= 40 ? { owner: i.owner } : {}),
    ...(i.power === 'none' || i.power === 'light' || i.power === 'heavy' ? { power: i.power } : {}),
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

const pt = (p: any) => ({ x: num(p?.x, 0), y: num(p?.y, 0) });
function partition(p: any): Partition | null {
  if (!isObj(p) || !isObj(p.a) || !isObj(p.b)) return null;
  const top = optNum(p.topMm, 100, 12000);
  return {
    id: str(p.id, newId(), 40),
    a: pt(p.a),
    b: pt(p.b),
    thicknessMm: num(p.thicknessMm, 114, 20, 1000),
    bottomMm: num(p.bottomMm, 0, 0, 10000),
    ...(top !== undefined ? { topMm: top } : {}),
    ...(isColor(p.color) ? { color: p.color } : {}),
  };
}
function zone(z: any): Zone | null {
  if (!isObj(z) || typeof z.personId !== 'string') return null;
  return { id: str(z.id, newId(), 40), personId: z.personId.slice(0, 40), x: num(z.x, 0), y: num(z.y, 0), width: num(z.width, 1000, 100, 1e6), length: num(z.length, 1000, 100, 1e6) };
}
function powerPoint(p: any, rooms: Set<string>): PowerPoint | null {
  if (!isObj(p) || !rooms.has(p.roomId)) return null;
  const h = optNum(p.heightMm, 0, 5000);
  return {
    id: str(p.id, newId(), 40),
    roomId: p.roomId,
    side: oneOf(p.side, SIDES, 'top'),
    offsetMm: num(p.offsetMm, 0, 0, 1e6),
    kind: oneOf(p.kind, ['board', 'socket', 'power', 'switch'] as const, 'board'),
    ...(h !== undefined ? { heightMm: h } : {}),
  };
}
function cover(c: any): Cover | null {
  if (!isObj(c)) return null;
  return { id: str(c.id, newId(), 40), x: num(c.x, 0), y: num(c.y, 0), width: num(c.width, 500, 50, 1e5), length: num(c.length, 500, 50, 1e5) };
}
function person(p: any): Person | null {
  if (!isObj(p)) return null;
  return { id: str(p.id, newId(), 40), name: str(p.name, 'Roommate', 30), color: color(p.color) };
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
    ...(Array.isArray(f.partitions) ? { partitions: f.partitions.map(partition).filter(Boolean).slice(0, 500) as Partition[] } : {}),
    ...(Array.isArray(f.zones) ? { zones: f.zones.map(zone).filter(Boolean).slice(0, 50) as Zone[] } : {}),
    ...(Array.isArray(f.points) ? { points: f.points.map((p: any) => powerPoint(p, ids)).filter(Boolean).slice(0, 300) as PowerPoint[] } : {}),
    ...(Array.isArray(f.covers) ? { covers: f.covers.map(cover).filter(Boolean).slice(0, 50) as Cover[] } : {}),
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
    ...(Array.isArray(h.people) ? { people: h.people.map(person).filter(Boolean).slice(0, 12) as Person[] } : {}),
    ...(typeof h.meId === 'string' && h.meId.length <= 40 ? { meId: h.meId } : {}),
    ...(typeof h.originId === 'string' && h.originId.length <= 40 ? { originId: h.originId } : {}),
  };
}

export function sanitizeTemplate(t: any): ItemTemplate | null {
  if (!isObj(t)) return null;
  return {
    id: str(t.id, newId(), 40),
    type: typeof t.type === 'string' && /^[a-z0-9-]{1,40}$/.test(t.type) ? t.type : 'custom',
    label: str(t.label, 'Item', 40),
    width: num(t.width, 600, 10, 100000),
    depth: num(t.depth, 600, 10, 100000),
    heightMm: optNum(t.heightMm, 0, 20000),
    shape: oneOf(t.shape, ['rect', 'round'] as const, 'rect'),
    color: color(t.color),
    ...(typeof t.count === 'number' && t.count > 1 ? { count: Math.min(20, Math.round(t.count)) } : {}),
  };
}
