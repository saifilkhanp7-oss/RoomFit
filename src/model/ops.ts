import { isBasementName } from '../geometry/levels';
// Pure edit operations on a floor or layout. The store wraps these with undo history.
import type { Cover, Floor, Home, Item, Layout, Opening, Partition, PowerPoint, Room, RoomKind, Side, Zone } from './types';
import { id as newItemId } from './defaults';
import { cloneLayoutFresh, floorName, id, makeFloor, makeRoom } from './defaults';
import { innerWallOf } from '../geometry/walls';
import { itemBox, itemPoly } from '../geometry/items';
import { pointInPoly } from '../geometry/poly';
import { itemMount, itemSpan } from './catalog';
import { descendantsOf, parentOf, spaceOfPoint } from '../geometry/spaces';

export function addItem(f: Floor, item: Item): Floor {
  return { ...f, items: [...f.items, item] };
}

export function updateItem(f: Floor, itemId: string, patch: Partial<Item>): Floor {
  return { ...f, items: f.items.map((it) => (it.id === itemId ? { ...it, ...patch } : it)) };
}

/**
 * Change an item but keep it inside the room it was fully inside before
 * (e.g. turning a cupboard that stands against a wall shouldn't push it into the wall).
 */
export function updateItemKeepInside(f: Floor, itemId: string, patch: Partial<Item>): Floor {
  const it = f.items.find((i) => i.id === itemId);
  if (!it) return f;
  const before = itemBox(it);
  const room = f.rooms.find((r) => before.minX >= r.x - 1 && before.maxX <= r.x + r.width + 1 && before.minY >= r.y - 1 && before.maxY <= r.y + r.length + 1);
  const next = { ...it, ...patch };
  if (room) {
    const b = itemBox(next);
    let dx = 0;
    let dy = 0;
    if (b.maxX - b.minX <= room.width) {
      if (b.minX < room.x) dx = room.x - b.minX;
      else if (b.maxX > room.x + room.width) dx = room.x + room.width - b.maxX;
    }
    if (b.maxY - b.minY <= room.length) {
      if (b.minY < room.y) dy = room.y - b.minY;
      else if (b.maxY > room.y + room.length) dy = room.y + room.length - b.maxY;
    }
    next.x = Math.round(next.x + dx);
    next.y = Math.round(next.y + dy);
  }
  return { ...f, items: f.items.map((i) => (i.id === itemId ? next : i)) };
}

export function deleteItem(f: Floor, itemId: string): Floor {
  return { ...f, items: f.items.filter((it) => it.id !== itemId) };
}

export function duplicateItem(f: Floor, itemId: string, offset: number): { floor: Floor; newId?: string } {
  const src = f.items.find((it) => it.id === itemId);
  if (!src) return { floor: f };
  const copy = { ...src, id: id(), x: src.x + offset, y: src.y + offset, locked: false };
  return { floor: { ...f, items: [...f.items, copy] }, newId: copy.id };
}

export function addOpening(f: Floor, op: Opening): Floor {
  return { ...f, openings: [...f.openings, op] };
}

export function updateOpening(f: Floor, opId: string, patch: Partial<Opening>): Floor {
  return { ...f, openings: f.openings.map((o) => (o.id === opId ? { ...o, ...patch } : o)) };
}

export function deleteOpening(f: Floor, opId: string): Floor {
  return { ...f, openings: f.openings.filter((o) => o.id !== opId) };
}

/** Items whose centre is inside the room (they move with it). */
function itemsInRoom(f: Floor, r: Room) {
  return f.items.filter((it) => it.x >= r.x && it.x <= r.x + r.width && it.y >= r.y && it.y <= r.y + r.length);
}

/** What moves together with a room: the rooms inside it and the furniture inside it. */
export function roomGroup(f: Floor, roomId: string): { rooms: string[]; items: string[] } {
  const room = f.rooms.find((r) => r.id === roomId);
  if (!room) return { rooms: [], items: [] };
  return { rooms: descendantsOf(f, room).map((r) => r.id), items: itemsInRoom(f, room).map((it) => it.id) };
}

/**
 * Change a room. Moving it also moves the rooms and furniture inside it.
 * `group` can be worked out once at the start of a drag, so a room dragged over other
 * furniture doesn't pick it up on the way.
 */
export function updateRoom(f: Floor, roomId: string, patch: Partial<Room>, group = roomGroup(f, roomId)): Floor {
  const room = f.rooms.find((r) => r.id === roomId);
  if (!room) return f;
  const dx = patch.x !== undefined ? patch.x - room.x : 0;
  const dy = patch.y !== undefined ? patch.y - room.y : 0;
  let items = f.items;
  let rooms = f.rooms.map((r) => (r.id === roomId ? { ...r, ...patch } : r));
  if (dx || dy) {
    const movingItems = new Set(group.items);
    const movingRooms = new Set(group.rooms);
    items = f.items.map((it) => (movingItems.has(it.id) ? { ...it, x: it.x + dx, y: it.y + dy } : it));
    rooms = rooms.map((r) => (movingRooms.has(r.id) ? { ...r, x: r.x + dx, y: r.y + dy } : r));
  }
  return { ...f, items, rooms };
}

export type Corner = 'tl' | 'tr' | 'bl' | 'br';

/** Put a new room inside another one (e.g. a bedroom inside the Hall, a bathroom inside a bedroom), in a corner. */
export function placeInside(f: Floor, parentId: string, name: string, kind: RoomKind, width: number, length: number, corner: Corner): { floor: Floor; roomId: string } | { error: string } {
  const p = f.rooms.find((r) => r.id === parentId);
  if (!p) return { error: 'Room not found' };
  if (width > p.width || length > p.length) return { error: `It doesn't fit inside ${p.name}` };
  const x = corner === 'tl' || corner === 'bl' ? p.x : p.x + p.width - width;
  const y = corner === 'tl' || corner === 'tr' ? p.y : p.y + p.length - length;
  const room = { ...makeRoom(name, width, length, Math.round(x), Math.round(y)), kind };
  return { floor: { ...f, rooms: [...f.rooms, room], innerWallMm: f.innerWallMm ?? innerWallOf(f) }, roomId: room.id };
}

/**
 * Make a Hall / Lobby of the whole home's size around the rooms that are already there,
 * so the space left over becomes the hall.
 */
export function hallAround(f: Floor, name: string, width: number, length: number): { floor: Floor; roomId: string } | { error: string; needW: number; needL: number } {
  const top = f.rooms.filter((r) => !parentOf(f, r));
  const minX = top.length ? Math.min(...top.map((r) => r.x)) : 0;
  const minY = top.length ? Math.min(...top.map((r) => r.y)) : 0;
  const needW = top.length ? Math.max(...top.map((r) => r.x + r.width)) - minX : 0;
  const needL = top.length ? Math.max(...top.map((r) => r.y + r.length)) - minY : 0;
  if (width < needW - 1 || length < needL - 1) return { error: 'too small', needW, needL };
  const hall = { ...makeRoom(name, width, length, minX, minY), kind: 'hall' as const };
  return { floor: { ...f, rooms: [hall, ...f.rooms], innerWallMm: f.innerWallMm ?? innerWallOf(f) }, roomId: hall.id };
}

export type Align = 'start' | 'center' | 'end';

/** Place a new room on one side of an existing room with a wall of `gap` between them. */
export function attachRoom(f: Floor, name: string, width: number, length: number, toId: string | null, side: Side, align: Align, gap: number, kind: RoomKind = 'room'): { floor: Floor; roomId: string } {
  const to = f.rooms.find((r) => r.id === toId);
  let x = 0,
    y = 0;
  if (to) {
    const alignX = align === 'start' ? to.x : align === 'center' ? to.x + (to.width - width) / 2 : to.x + to.width - width;
    const alignY = align === 'start' ? to.y : align === 'center' ? to.y + (to.length - length) / 2 : to.y + to.length - length;
    if (side === 'right') [x, y] = [to.x + to.width + gap, alignY];
    if (side === 'left') [x, y] = [to.x - gap - width, alignY];
    if (side === 'bottom') [x, y] = [alignX, to.y + to.length + gap];
    if (side === 'top') [x, y] = [alignX, to.y - gap - length];
  }
  const room = { ...makeRoom(name, width, length, Math.round(x), Math.round(y)), ...(kind !== 'room' ? { kind } : {}) };
  return { floor: { ...f, rooms: [...f.rooms, room], innerWallMm: f.innerWallMm ?? innerWallOf(f) }, roomId: room.id };
}

export function deleteRoom(f: Floor, roomId: string): Floor {
  const room = f.rooms.find((r) => r.id === roomId);
  if (!room) return f;
  // furniture standing in this room goes; rooms inside it (and their furniture) stay
  const gone = new Set(itemsInRoom(f, room).filter((it) => spaceOfPoint(f, it)?.id === roomId).map((it) => it.id));
  return {
    ...f,
    rooms: f.rooms.filter((r) => r.id !== roomId),
    openings: f.openings.filter((o) => o.roomId !== roomId),
    items: f.items.filter((it) => !gone.has(it.id)),
    ...(f.points ? { points: f.points.filter((p) => p.roomId !== roomId) } : {}),
  };
}

/** Change the wall between `roomId` and its neighbour by moving `roomId` (and its items). */
export function setSharedWall(f: Floor, roomId: string, neighborId: string, side: Side, thickness: number): Floor {
  const r = f.rooms.find((x) => x.id === roomId);
  const n = f.rooms.find((x) => x.id === neighborId);
  if (!r || !n) return f;
  let patch: Partial<Room> = {};
  if (side === 'right') patch = { x: n.x - thickness - r.width };
  if (side === 'left') patch = { x: n.x + n.width + thickness };
  if (side === 'bottom') patch = { y: n.y - thickness - r.length };
  if (side === 'top') patch = { y: n.y + n.length + thickness };
  return updateRoom(f, roomId, patch);
}

// ---------- floors & layouts ----------

const isBasement = isBasementName;

/** New floor on top, with the same room outlines as the floor below (no furniture). */
export function addFloor(l: Layout): { layout: Layout; floorId: string } {
  const top = l.floors[l.floors.length - 1];
  const f = makeFloor(floorName(l.floors.filter((x) => !isBasement(x.name)).length));
  f.outerWallMm = top?.outerWallMm ?? f.outerWallMm;
  f.innerWallMm = top?.innerWallMm;
  f.rooms = (top?.rooms ?? [makeRoom('Room', 3658, 3048)]).map((r) => ({ ...r, id: id() }));
  return { layout: { ...l, floors: [...l.floors, f] }, floorId: f.id };
}

/** New underground floor below the lowest one, with one Parking space as big as the floor above. */
export function addBasement(l: Layout): { layout: Layout; floorId: string } {
  const low = l.floors[0];
  const n = l.floors.filter((x) => isBasement(x.name)).length;
  const f = makeFloor(n ? `Basement ${n + 1}` : 'Basement');
  f.outerWallMm = low?.outerWallMm ?? f.outerWallMm;
  f.innerWallMm = low?.innerWallMm;
  const rooms = low?.rooms ?? [];
  const minX = rooms.length ? Math.min(...rooms.map((r) => r.x)) : 0;
  const minY = rooms.length ? Math.min(...rooms.map((r) => r.y)) : 0;
  const w = rooms.length ? Math.max(...rooms.map((r) => r.x + r.width)) - minX : 6000;
  const h = rooms.length ? Math.max(...rooms.map((r) => r.y + r.length)) - minY : 6000;
  f.rooms = [{ ...makeRoom('Parking', Math.max(3000, w), Math.max(5500, h), minX, minY), kind: 'parking' }];
  return { layout: { ...l, floors: [f, ...l.floors] }, floorId: f.id };
}

export function renameFloor(l: Layout, floorId: string, name: string): Layout {
  return { ...l, floors: l.floors.map((f) => (f.id === floorId ? { ...f, name } : f)) };
}

export function deleteFloor(l: Layout, floorId: string): Layout {
  if (l.floors.length <= 1) return l;
  return { ...l, floors: l.floors.filter((f) => f.id !== floorId) };
}

/** A new layout with the same rooms, doors and windows but no furniture. */
export function blankLayoutFrom(l: Layout, name: string): Layout {
  const copy = cloneLayoutFresh(l, name);
  return { ...copy, floors: copy.floors.map((f) => ({ ...f, items: f.items.filter((it) => it.type === 'stairs') })) };
}

export function nextLayoutName(names: string[]): string {
  for (let i = 0; i < 26; i++) {
    const n = `Layout ${String.fromCharCode(65 + i)}`;
    if (!names.includes(n)) return n;
  }
  return `Layout ${names.length + 1}`;
}

// ---------- stacking ----------

/**
 * What this item could be put on top of: the highest floor item under its middle
 * that isn't itself sitting on this item.
 */
export function supportUnder(f: Floor, itemId: string): Item | undefined {
  const it = f.items.find((i) => i.id === itemId);
  if (!it) return undefined;
  const mine = itemSpan(it);
  let best: Item | undefined;
  for (const o of f.items) {
    if (o.id === it.id || itemMount(o) !== 'floor') continue;
    const s = itemSpan(o);
    if (s.bottom >= mine.top - 20) continue; // it's on top of this item, not under it
    if (!pointInPoly({ x: it.x, y: it.y }, itemPoly(o))) continue;
    if (!best || s.top > itemSpan(best).top) best = o;
  }
  return best;
}

/** Put an item on top of another one (its bottom = the other's top). */
export function stackOn(f: Floor, itemId: string, supportId: string): Floor {
  const s = f.items.find((i) => i.id === supportId);
  if (!s) return f;
  return updateItem(f, itemId, { elevationMm: Math.round(itemSpan(s).top) });
}

export function putOnFloor(f: Floor, itemId: string): Floor {
  return updateItem(f, itemId, { elevationMm: 0 });
}

/** "Let it be": hide a warning (or show it again). */
export function setWarningOk(f: Floor, warningId: string, ok: boolean): Floor {
  const cur = new Set(f.okWarnings ?? []);
  if (ok) cur.add(warningId);
  else cur.delete(warningId);
  return { ...f, okWarnings: [...cur] };
}

// ---------- inner walls ----------

export function addPartition(f: Floor, p: Partition): Floor {
  return { ...f, partitions: [...(f.partitions ?? []), p] };
}
export function updatePartition(f: Floor, pid: string, patch: Partial<Partition>): Floor {
  return { ...f, partitions: (f.partitions ?? []).map((p) => (p.id === pid ? { ...p, ...patch } : p)) };
}
export function deletePartition(f: Floor, pid: string): Floor {
  return { ...f, partitions: (f.partitions ?? []).filter((p) => p.id !== pid) };
}

// ---------- roommates' spaces ----------

export function addZone(f: Floor, z: Zone): Floor {
  return { ...f, zones: [...(f.zones ?? []), z] };
}
export function updateZone(f: Floor, zid: string, patch: Partial<Zone>): Floor {
  return { ...f, zones: (f.zones ?? []).map((z) => (z.id === zid ? { ...z, ...patch } : z)) };
}
export function deleteZone(f: Floor, zid: string): Floor {
  return { ...f, zones: (f.zones ?? []).filter((z) => z.id !== zid) };
}

// ---------- roommates ----------

export const PERSON_COLORS = ['#e8590c', '#1c7ed6', '#2f9e44', '#ae3ec9', '#f08c00', '#0c8599', '#e64980', '#5f3dc4'];

/**
 * Bring a roommate's things from their copy of the home into mine: on each layout and floor
 * (matched by position), their things and their space replace what I had for them.
 */
export function mergeRoommateThings(mine: Home, theirs: Home, personId: string): { home: Home; count: number } {
  let count = 0;
  const person = theirs.people?.find((p) => p.id === personId);
  const people = mine.people ?? [];
  const nextPeople = person && !people.some((p) => p.id === personId) ? [...people, person] : people;
  const layouts = mine.layouts.map((l, li) => {
    const tl = theirs.layouts[li] ?? theirs.layouts[0];
    return {
      ...l,
      floors: l.floors.map((f, fi) => {
        const tf = tl?.floors[fi];
        if (!tf) return f;
        const items = tf.items.filter((it) => it.owner === personId).map((it) => ({ ...it, id: newItemId() }));
        const zones = (tf.zones ?? []).filter((z) => z.personId === personId).map((z) => ({ ...z, id: newItemId() }));
        count += items.length;
        return {
          ...f,
          items: [...f.items.filter((it) => it.owner !== personId), ...items],
          zones: [...(f.zones ?? []).filter((z) => z.personId !== personId), ...zones],
        };
      }),
    };
  });
  return { home: { ...mine, people: nextPeople, layouts }, count };
}

// ---------- plug points & switchboards ----------

export function addPoint(f: Floor, p: PowerPoint): Floor {
  return { ...f, points: [...(f.points ?? []), p] };
}
export function updatePoint(f: Floor, pid: string, patch: Partial<PowerPoint>): Floor {
  return { ...f, points: (f.points ?? []).map((p) => (p.id === pid ? { ...p, ...patch } : p)) };
}
export function deletePoint(f: Floor, pid: string): Floor {
  return { ...f, points: (f.points ?? []).filter((p) => p.id !== pid) };
}

// ---------- floor over the stairs ----------

export function addCover(f: Floor, c: Cover): Floor {
  return { ...f, covers: [...(f.covers ?? []), c] };
}
export function updateCover(f: Floor, cid: string, patch: Partial<Cover>): Floor {
  return { ...f, covers: (f.covers ?? []).map((c) => (c.id === cid ? { ...c, ...patch } : c)) };
}
export function deleteCover(f: Floor, cid: string): Floor {
  return { ...f, covers: (f.covers ?? []).filter((c) => c.id !== cid) };
}
