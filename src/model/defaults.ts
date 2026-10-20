import { nanoid } from 'nanoid';
import type { AppData, Floor, Home, Layout, Room, Settings, Unit } from './types';
import { MM_PER_FOOT, MM_PER_INCH } from './units.js';

export const SCHEMA_VERSION = 1;

export const DEFAULT_OUTER_WALL_MM = Math.round(9 * MM_PER_INCH); // 229

export const FLOOR_NAMES = [
  'Ground Floor',
  'First Floor',
  'Second Floor',
  'Third Floor',
  'Fourth Floor',
  'Fifth Floor',
];

export function floorName(index: number): string {
  return FLOOR_NAMES[index] ?? `Floor ${index}`;
}

export const id = () => nanoid(10);

export function defaultSettings(): Settings {
  return {
    unit: 'ft',
    theme: 'system',
    minWalkMm: Math.round(2 * MM_PER_FOOT), // 610
    fanClearanceMm: Math.round(3 * MM_PER_FOOT), // 914
    snap: true,
    showGrid: true,
    showDims: true,
  };
}

export function emptyData(): AppData {
  return {
    schemaVersion: SCHEMA_VERSION,
    homes: [],
    customItemTemplates: [],
    settings: defaultSettings(),
  };
}

export function makeRoom(name: string, width: number, length: number, x = 0, y = 0): Room {
  return { id: id(), name, x, y, width, length };
}

export function makeFloor(name: string, room?: Room): Floor {
  return {
    id: id(),
    name,
    outerWallMm: DEFAULT_OUTER_WALL_MM,
    rooms: room ? [room] : [],
    sharedWalls: [],
    openings: [],
    items: [],
  };
}

export interface NewHomeInput {
  name: string;
  kind: 'single' | 'multi';
  floorCount: number;
  roomName: string;
  roomWidth: number;
  roomLength: number;
  unit: Unit;
}

export function makeHome(input: NewHomeInput): Home {
  const count = input.kind === 'single' ? 1 : Math.max(2, Math.min(5, input.floorCount));
  const floors: Floor[] = [];
  for (let i = 0; i < count; i++) {
    // Every floor starts with one room of the same size so the user has something to plan on.
    const roomName = i === 0 ? input.roomName : 'Room';
    floors.push(makeFloor(count === 1 ? 'Floor' : floorName(i), makeRoom(roomName, input.roomWidth, input.roomLength)));
  }
  const layout: Layout = { id: id(), name: 'Layout A', floors };
  const now = Date.now();
  return { id: id(), name: input.name, kind: input.kind, layouts: [layout], createdAt: now, updatedAt: now };
}

/** Deep copy with fresh ids everywhere (used for duplicate home/layout). */
export function cloneLayoutFresh(layout: Layout, name?: string): Layout {
  const roomMap = new Map<string, string>();
  const floors = layout.floors.map((f) => {
    const rooms = f.rooms.map((r) => {
      const nid = id();
      roomMap.set(r.id, nid);
      return { ...r, id: nid };
    });
    return {
      ...f,
      id: id(),
      rooms,
      sharedWalls: f.sharedWalls.map((w) => ({
        ...w,
        id: id(),
        roomA: roomMap.get(w.roomA) ?? w.roomA,
        roomB: roomMap.get(w.roomB) ?? w.roomB,
      })),
      openings: f.openings.map((o) => ({ ...o, id: id(), roomId: roomMap.get(o.roomId) ?? o.roomId })),
      items: f.items.map((it) => ({ ...it, id: id() })),
      ...(f.partitions ? { partitions: f.partitions.map((p) => ({ ...p, id: id() })) } : {}),
      ...(f.zones ? { zones: f.zones.map((z) => ({ ...z, id: id() })) } : {}),
    };
  });
  const estimate = layout.estimate
    ? { ...layout.estimate, rooms: Object.fromEntries(Object.entries(layout.estimate.rooms).map(([k, v]) => [roomMap.get(k) ?? k, v])) }
    : undefined;
  return { id: id(), name: name ?? layout.name, floors, ...(estimate ? { estimate } : {}) };
}

export function cloneHomeFresh(home: Home, name: string): Home {
  const now = Date.now();
  return {
    ...home,
    id: id(),
    originId: home.originId ?? home.id,
    name,
    layouts: home.layouts.map((l) => cloneLayoutFresh(l)),
    createdAt: now,
    updatedAt: now,
  };
}

/** "Hostel Room 204 (copy)", "(copy 2)" ... avoiding names already used */
export function uniqueName(base: string, existing: string[]): string {
  if (!existing.includes(base)) return base;
  let n = 1;
  for (;;) {
    const candidate = n === 1 ? `${base} (copy)` : `${base} (copy ${n})`;
    if (!existing.includes(candidate)) return candidate;
    n++;
  }
}
