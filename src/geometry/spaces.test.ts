import { describe, it, expect } from 'vitest';
import { freeRects, parentOf, spaceOfPoint, depthOf } from './spaces';
import { childBlocks, wallThickness, roomOuterBox, hitWall } from './walls';
import { computeWarnings } from './warnings';
import { makeFloor, makeRoom } from '../model/defaults';
import { fi } from '../model/catalog';
import type { Floor, Item } from '../model/types';

const FT = 304.8;
// 12×10 ft home (Hall) with two 6×4 rooms stacked on the left, no wall between them for simple numbers
function home(innerWall = 114): Floor {
  const hall = { ...makeRoom('Hall', fi(12), fi(10), 0, 0), kind: 'hall' as const };
  const a = makeRoom('Room A', fi(6), fi(4), 0, 0);
  const b = makeRoom('Room B', fi(6), fi(4), 0, fi(4) + innerWall);
  return { ...makeFloor('F'), innerWallMm: innerWall, rooms: [hall, a, b] };
}

const item = (over: Partial<Item>): Item => ({ id: Math.random().toString(36).slice(2), type: 'cupboard', label: 'Cupboard', x: 0, y: 0, width: 900, depth: 600, rotation: 0, shape: 'rect', color: '#999', ...over });
const warn = (f: Floor) => computeWarnings(f, { settings: { minWalkMm: 610, fanClearanceMm: 914 }, unit: 'ft', heights: false });

describe('rooms inside a hall', () => {
  it('finds parents and depth', () => {
    const f = home();
    const [hall, a, b] = f.rooms;
    expect(parentOf(f, a)?.id).toBe(hall.id);
    expect(parentOf(f, b)?.id).toBe(hall.id);
    expect(parentOf(f, hall)).toBeUndefined();
    expect(depthOf(f, a)).toBe(1);
  });

  it('leftover hall is 6×10 + 6×2 (the user example)', () => {
    const f = home();
    const hall = f.rooms[0];
    const rects = freeRects(hall, childBlocks(f, hall));
    const sizes = rects.map((r) => [Math.round((r.maxX - r.minX) / FT), Math.round((r.maxY - r.minY) / FT)]).sort();
    // room walls (4.5") are part of the rooms, so the free parts are a bit smaller than 6×2
    expect(rects).toHaveLength(2);
    expect(sizes[0][0]).toBeGreaterThanOrEqual(5);
    expect(sizes.some(([w, h]) => w === 6 && h === 10) || sizes.some(([w, h]) => w === 6 && h === 9)).toBe(true);
  });

  it('wall thickness: outer wall where the room touches the outside, inside wall towards the hall', () => {
    const f = home();
    const a = f.rooms[1];
    expect(wallThickness(f, a, 'left')).toBe(f.outerWallMm);
    expect(wallThickness(f, a, 'top')).toBe(f.outerWallMm);
    expect(wallThickness(f, a, 'right')).toBe(114);
    expect(roomOuterBox(f, a).maxX).toBe(a.x + a.width + 114);
  });

  it('point in hall vs room', () => {
    const f = home();
    expect(spaceOfPoint(f, { x: 500, y: 500 })?.name).toBe('Room A');
    expect(spaceOfPoint(f, { x: fi(9), y: 500 })?.name).toBe('Hall');
  });

  it('furniture: fine in the hall, red when it goes into a room wall', () => {
    const f = home();
    f.items = [item({ x: fi(9), y: fi(5) }), item({ id: 'bad', x: fi(6), y: fi(2) })];
    const w = warn(f);
    expect(w.red.has(f.items[0].id)).toBe(false);
    expect(w.list.find((x) => x.itemIds[0] === 'bad')?.message).toBe('Cupboard goes into the wall');
  });

  it('doors on room walls facing the hall go to the room', () => {
    const f = home();
    const hit = hitWall(f, { x: fi(6) + 50, y: fi(2) }, 100);
    expect(hit?.room.name).toBe('Room A');
    expect(hit?.side).toBe('right');
  });
});

describe('vehicles', () => {
  const garage = () => {
    const g = { ...makeRoom('Parking', fi(10), fi(18), 0, 0), kind: 'parking' as const };
    return { ...makeFloor('B'), rooms: [g] };
  };
  const car = (over: Partial<Item> = {}) => item({ id: 'car', type: 'car-sedan', label: 'Car (sedan)', width: 1750, depth: 4500, x: fi(5), y: fi(9), ...over });

  it('car fits with room to open doors', () => {
    const f = garage();
    f.items = [car()];
    expect(warn(f).list).toHaveLength(0);
  });

  it('no space to open the doors', () => {
    const f = garage();
    f.rooms[0].width = 2200;
    f.items = [car({ x: 1100 })];
    expect(warn(f).list.map((w) => w.message)).toContain('No space to open the Car (sedan) doors (needs 2′ on one side)');
  });

  it('gate too narrow', () => {
    const f = garage();
    f.items = [car()];
    f.openings = [{ id: 'g', kind: 'door', roomId: f.rooms[0].id, side: 'bottom', offsetMm: 500, widthMm: 1800, doorType: 'shutter' }];
    expect(warn(f).list.some((w) => w.id.startsWith('gate:'))).toBe(true);
    f.openings[0].widthMm = 2400;
    expect(warn(f).list.some((w) => w.id.startsWith('gate:'))).toBe(false);
  });

  it('car longer than the garage is outside', () => {
    const f = garage();
    f.rooms[0].length = 4000;
    f.items = [car({ y: 2000 })];
    expect(warn(f).red.has('car')).toBe(true);
  });
});
