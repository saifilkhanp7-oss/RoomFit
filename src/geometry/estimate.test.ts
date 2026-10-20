import { describe, it, expect } from 'vitest';
import { makeFloor, makeRoom } from '../model/defaults';
import { brickReport, bricksFor, estimateOf, sanitizeEstimate, tileReport } from './estimate';
import { buildWalls, unionVolume } from './wallPieces';
import { DOOR_HEIGHT } from './walls';
import type { Floor, Item, Opening } from '../model/types';

const W = 3658,
  L = 3048,
  t = 229,
  H = 3048;

describe('bricks', () => {
  it('500 bricks of 190×90×90 with a 10 mm gap make 1 m³', () => {
    expect(bricksFor(1e9, estimateOf().brick)).toBeCloseTo(500);
  });

  it('one room: four walls up to the ceiling, the door taken out', () => {
    const f: Floor = { ...makeFloor('F'), outerWallMm: t, rooms: [makeRoom('Room', W, L, 0, 0)] };
    const four = H * (2 * t * (W + 2 * t) + 2 * t * L);
    expect(unionVolume(buildWalls(f))).toBeCloseTo(four, -3);
    const door: Opening = { id: 'd', roomId: f.rooms[0].id, kind: 'door', side: 'top', offsetMm: 500, widthMm: 900, hinge: 'left', swing: 'in' } as unknown as Opening;
    const withDoor = { ...f, openings: [door] };
    expect(unionVolume(buildWalls(withDoor).filter((w) => !w.glass))).toBeCloseTo(four - 900 * DOOR_HEIGHT * t, -3);
  });

  it('a wall shared by two rooms is counted once', () => {
    const g = 114;
    const a = makeRoom('A', W, L, 0, 0);
    const b = makeRoom('B', W, L, W + g, 0);
    const f: Floor = { ...makeFloor('F'), outerWallMm: t, rooms: [a, b] };
    const expected = H * (2 * t * (2 * W + g + 2 * t) + L * (2 * t + g));
    expect(unionVolume(buildWalls(f))).toBeCloseTo(expected, -3);
  });

  it('report: walls + ceiling for one room, stairs when there are some', () => {
    const f: Floor = { ...makeFloor('F'), outerWallMm: t, rooms: [makeRoom('Room', W, L, 0, 0)] };
    const est = estimateOf();
    const r = brickReport([f], est);
    expect(r.parts.map((p) => p.part)).toEqual(['Walls', 'Ceiling']);
    const ceil = r.parts[1];
    expect(ceil.volMm3).toBeCloseTo((W + 2 * t) * (L + 2 * t) * 125, -3);
    expect(r.cost).toBe(r.bricks * 8);
    const stairs: Item = { id: 's', type: 'stairs', label: 'Stairs', x: 1500, y: 1500, width: 1000, depth: 2500, rotation: 0, shape: 'rect', color: '#999', stairs: { style: 'straight', flightWidthMm: 1000, turn: 'right', upDir: 0 } };
    const closed = brickReport([{ ...f, items: [stairs] }], { ...est, walls: false, ceiling: false });
    const open = brickReport([{ ...f, items: [{ ...stairs, stairs: { ...stairs.stairs!, open: true } }] }], { ...est, walls: false, ceiling: false });
    expect(closed.parts[0].part).toBe('Stairs');
    expect(open.volMm3).toBeLessThan(closed.volMm3 / 2);
    expect(brickReport([f], { ...est, walls: false, ceiling: false }).bricks).toBe(0);
  });
});

describe('tiles', () => {
  const f: Floor = { ...makeFloor('F'), rooms: [makeRoom('Room', 3000, 2000, 0, 0)] };
  it('tiles by floor area, rounded up, with extra', () => {
    const est = estimateOf({ tile: { lengthMm: 600, widthMm: 600, gapMm: 0, price: 100 }, tileWastePct: 0 });
    expect(tileReport([f], est).tiles).toBe(17);
    expect(tileReport([f], { ...est, tileWastePct: 10 }).tiles).toBe(19);
    expect(tileReport([f], est).cost).toBe(1700);
  });
  it('each room can have its own tile, or none', () => {
    const id = f.rooms[0].id;
    const est = estimateOf({ tileWastePct: 0, rooms: { [id]: { mode: 'own', tile: { lengthMm: 300, widthMm: 300, gapMm: 0, price: 10 } } } });
    const r = tileReport([f], est);
    expect(r.tiles).toBe(67);
    expect(r.cost).toBe(670);
    expect(tileReport([f], estimateOf({ rooms: { [id]: { mode: 'none' } } })).tiles).toBe(0);
  });
  it('a room inside another room is not tiled twice', () => {
    const hall = makeRoom('Hall', 4000, 3000, 0, 0);
    const bath = makeRoom('Bath', 1500, 1500, 0, 0);
    const g: Floor = { ...makeFloor('F'), innerWallMm: 0, rooms: [hall, bath] };
    const r = tileReport([g], estimateOf({ tile: { lengthMm: 500, widthMm: 500, gapMm: 0, price: 1 }, tileWastePct: 0 }));
    const total = r.rows.reduce((s, x) => s + x.areaMm2, 0);
    expect(total).toBeCloseTo(4000 * 3000, -2);
  });
  it('saved settings are checked when loading', () => {
    const e = sanitizeEstimate({ currency: '$', brick: { lengthMm: -5, price: 12 }, rooms: { abc: { mode: 'own', tile: { lengthMm: 300 } }, bad: { mode: 'x' } } })!;
    expect(e.brick.lengthMm).toBe(20);
    expect(e.brick.price).toBe(12);
    expect(e.rooms.abc.mode).toBe('own');
    expect(e.rooms.bad).toBeUndefined();
  });
});
