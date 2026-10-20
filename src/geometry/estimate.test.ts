import { describe, it, expect } from 'vitest';
import { makeFloor, makeRoom } from '../model/defaults';
import { brickReport, bricksFor, cementReport, estimateOf, paintReport, sanitizeEstimate, tileReport } from './estimate';
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

describe('inner walls, paint, cement', () => {
  const room = () => ({ ...makeFloor('F'), outerWallMm: t, rooms: [makeRoom('Room', W, L, 0, 0)] }) as Floor;
  it('inner walls add bricks; a wall above a cupboard only counts its part', () => {
    const f = room();
    const full = { ...f, partitions: [{ id: 'p', a: { x: 0, y: 1500 }, b: { x: 2000, y: 1500 }, thicknessMm: 114, bottomMm: 0 }] };
    const r = brickReport([full], estimateOf());
    const inner = r.parts.find((p) => p.part === 'Inner walls')!;
    expect(inner.volMm3).toBeCloseTo(2000 * 114 * H);
    const high = { ...f, partitions: [{ id: 'p', a: { x: 0, y: 1500 }, b: { x: 2000, y: 1500 }, thicknessMm: 114, bottomMm: 2134 }] };
    expect(brickReport([high], estimateOf()).parts.find((p) => p.part === 'Inner walls')!.volMm3).toBeCloseTo(2000 * 114 * (H - 2134));
  });
  it('a wall on the floor takes tiles away; a hanging one does not', () => {
    const f = room();
    const est = estimateOf({ tileWastePct: 0 });
    const base = tileReport([f], est).areaMm2;
    const on = { ...f, partitions: [{ id: 'p', a: { x: 0, y: 1500 }, b: { x: 2000, y: 1500 }, thicknessMm: 114, bottomMm: 0 }] };
    const up = { ...f, partitions: [{ id: 'p', a: { x: 0, y: 1500 }, b: { x: 2000, y: 1500 }, thicknessMm: 114, bottomMm: 2000 }] };
    expect(tileReport([on], est).areaMm2).toBeCloseTo(base - 2000 * 114);
    expect(tileReport([up], est).areaMm2).toBeCloseTo(base);
  });
  it('paint: inside walls up to the ceiling, without the door; inner walls on both sides', () => {
    const f = room();
    const door: Opening = { id: 'd', roomId: f.rooms[0].id, kind: 'door', side: 'top', offsetMm: 500, widthMm: 900, doorType: 'swing' } as unknown as Opening;
    const est = estimateOf({ paint: { coats: 1, coverageM2: 10, price: 100, ceiling: false, outside: false } });
    const r = paintReport([{ ...f, openings: [door] }], est);
    expect(r.areaMm2).toBeCloseTo(2 * (W + L) * H - 900 * DOOR_HEIGHT);
    const withWall = paintReport([{ ...f, partitions: [{ id: 'p', a: { x: 0, y: 1500 }, b: { x: 2000, y: 1500 }, thicknessMm: 114, bottomMm: 0 }] }], est);
    expect(withWall.areaMm2 - paintReport([f], est).areaMm2).toBeCloseTo(2 * 2000 * H);
    expect(r.litres).toBeCloseTo(Math.ceil((r.areaMm2 / 1e6 / 10) * 10) / 10);
    expect(r.cost).toBeCloseTo(r.litres * 100);
  });
  it('cement: bags for mortar, plaster and tile bed', () => {
    const r = cementReport([room()], estimateOf());
    expect(r.rows.map((x) => x.part)).toEqual(['Brick mortar', 'Plaster', 'Under tiles']);
    // ~10.5 m³ of brickwork with 10 mm joints: about 2 m³ of mortar → ~13 bags at 1:6
    const mortar = r.rows[0].bags;
    expect(mortar).toBeGreaterThan(8);
    expect(mortar).toBeLessThan(25);
    expect(r.cost).toBe(r.bags * 420);
    expect(cementReport([room()], estimateOf({ cement: { ...estimateOf().cement, plaster: false, tileBed: false } })).rows).toHaveLength(1);
  });
});
