import { describe, it, expect } from 'vitest';
import { polysIntersect, rectPoly, polyGap, pointInPoly } from './poly';
import { itemPoly } from './items';
import { computeWarnings } from './warnings';
import { neighbors, openingGeom, doorSwings, hitWall, wallThickness } from './walls';
import { snapItemBox } from './snapping';
import { makeFloor, makeRoom } from '../model/defaults';
import type { Floor, Item } from '../model/types';
import { fi } from '../model/catalog';
import { stairDrawing } from './stairs';

const item = (over: Partial<Item>): Item => ({
  id: Math.random().toString(36).slice(2),
  type: 'cupboard',
  label: 'Cupboard',
  x: 1000,
  y: 1000,
  width: 900,
  depth: 600,
  rotation: 0,
  shape: 'rect',
  color: '#999',
  ...over,
});

const settings = { minWalkMm: 610, fanClearanceMm: 914 };
const warn = (floor: Floor, heights = false, floorBelow?: Floor) =>
  computeWarnings(floor, { settings, unit: 'ft', heights, floorBelow });

describe('polygons', () => {
  it('touching rectangles do not intersect, overlapping ones do', () => {
    expect(polysIntersect(rectPoly(0, 0, 100, 100), rectPoly(100, 0, 100, 100))).toBe(false);
    expect(polysIntersect(rectPoly(0, 0, 100, 100), rectPoly(90, 0, 100, 100))).toBe(true);
  });
  it('rotated rectangle overlap', () => {
    const a = itemPoly({ x: 0, y: 0, width: 1000, depth: 100, rotation: 45, shape: 'rect' });
    const b = itemPoly({ x: 300, y: 300, width: 100, depth: 100, rotation: 0, shape: 'rect' });
    const c = itemPoly({ x: 300, y: -300, width: 100, depth: 100, rotation: 0, shape: 'rect' });
    expect(polysIntersect(a, b)).toBe(true);
    expect(polysIntersect(a, c)).toBe(false);
  });
  it('gap between boxes', () => {
    expect(polyGap(rectPoly(0, 0, 100, 100), rectPoly(400, 0, 100, 100)).d).toBeCloseTo(300);
  });
  it('point in polygon', () => {
    expect(pointInPoly({ x: 5, y: 5 }, rectPoly(0, 0, 10, 10))).toBe(true);
    expect(pointInPoly({ x: 15, y: 5 }, rectPoly(0, 0, 10, 10))).toBe(false);
  });
});

describe('walls', () => {
  it('finds neighbours and wall thickness', () => {
    const a = makeRoom('A', 3000, 3000, 0, 0);
    const b = makeRoom('B', 2000, 3000, 3114, 0);
    const f = { ...makeFloor('F'), rooms: [a, b] };
    const n = neighbors(f, a);
    expect(n).toHaveLength(1);
    expect(n[0].side).toBe('right');
    expect(n[0].gap).toBe(114);
    expect(wallThickness(f, a, 'right')).toBe(114);
    expect(wallThickness(f, a, 'left')).toBe(f.outerWallMm);
  });
  it('door swing quarter circle goes into the room', () => {
    const r = makeRoom('A', 3000, 3000, 0, 0);
    const f = { ...makeFloor('F'), rooms: [r] };
    const op = { id: 'd', kind: 'door' as const, roomId: r.id, side: 'bottom' as const, offsetMm: 100, widthMm: 900, hinge: 'start' as const, opensInto: 'this' as const };
    const [s] = doorSwings(openingGeom(f, r, op), op);
    expect(s.radius).toBe(900);
    expect(s.poly.every((p) => p.y <= 3000 + 0.01)).toBe(true);
    expect(Math.min(...s.poly.map((p) => p.y))).toBeCloseTo(2100);
  });
  it('hits the nearest wall', () => {
    const r = makeRoom('A', 3000, 3000, 0, 0);
    const f = { ...makeFloor('F'), rooms: [r] };
    expect(hitWall(f, { x: 1500, y: -50 }, 100)?.side).toBe('top');
    expect(hitWall(f, { x: 3080, y: 1000 }, 100)?.side).toBe('right');
    expect(hitWall(f, { x: 1500, y: 1500 }, 100)).toBeNull();
  });
});

describe('warnings', () => {
  const room = () => makeRoom('Bedroom', fi(12), fi(10), 0, 0);

  it('overlap is red, rug under bed is fine', () => {
    const r = room();
    const f = {
      ...makeFloor('F'),
      rooms: [r],
      items: [item({ x: 1000, y: 1000 }), item({ x: 1300, y: 1000, label: 'Bed', type: 'bed-single' }), item({ x: 1000, y: 1000, type: 'rug', label: 'Rug' })],
    };
    const w = warn(f);
    expect(w.list.filter((x) => x.id.startsWith('overlap'))).toHaveLength(1);
  });

  it('outside room and in wall', () => {
    const r = room();
    const f = { ...makeFloor('F'), rooms: [r], items: [item({ x: 200, y: 1000 }), item({ x: -5000, y: 1000 })] };
    const msgs = warn(f).list.map((x) => x.message);
    expect(msgs).toContain('Cupboard goes into the wall');
    expect(msgs).toContain('Cupboard is outside the room');
  });

  it('tight walking space is yellow, flush is not', () => {
    const r = room();
    const f = {
      ...makeFloor('F'),
      rooms: [r],
      items: [item({ x: 1000, y: 1000 }), item({ x: 1000 + 900 + 400, y: 1000, label: 'Table' }), item({ x: 700, y: 1600, label: 'Shelf' })],
    };
    const w = warn(f);
    const clear = w.list.filter((x) => x.id.startsWith('clear'));
    expect(clear).toHaveLength(1);
    expect(clear[0].level).toBe('yellow');
  });

  it('item in door swing is red', () => {
    const r = room();
    const f = {
      ...makeFloor('F'),
      rooms: [r],
      openings: [{ id: 'd1', kind: 'door' as const, roomId: r.id, side: 'top' as const, offsetMm: 0, widthMm: 900 }],
      items: [item({ x: 500, y: 400 })],
    };
    const w = warn(f);
    expect(w.redOpenings.has('d1')).toBe(true);
  });

  it('stair opening from floor below', () => {
    const r = room();
    const below = { ...makeFloor('G'), rooms: [r], items: [item({ type: 'stairs', label: 'Stairs', x: 1500, y: 1500, width: 1000, depth: 2500 })] };
    const above = { ...makeFloor('F'), rooms: [r], items: [item({ x: 1500, y: 1500, label: 'Bed' })] };
    expect(warn(above, false, below).list.some((x) => x.message === 'Bed is on the stair opening')).toBe(true);
  });

  it('height checks: ceiling, window and fan', () => {
    const r = { ...room(), ceilingMm: fi(8) };
    const f = {
      ...makeFloor('F'),
      rooms: [r],
      openings: [{ id: 'w1', kind: 'window' as const, roomId: r.id, side: 'top' as const, offsetMm: 600, widthMm: 1200, sillMm: 900 }],
      items: [
        item({ x: 1200, y: 320, label: 'Cupboard', heightMm: fi(6, 6) }), // in front of window
        item({ x: 2800, y: 2000, label: 'Tall shelf', heightMm: fi(8, 2), type: 'shelf' }),
        item({ x: 1500, y: 2000, label: 'Bunk bed', type: 'bed-bunk', width: 900, depth: 1980, heightMm: fi(5, 6) }),
        item({ x: 1500, y: 2000, label: 'Ceiling fan', type: 'fan', shape: 'round', width: 1200, depth: 1200 }),
      ],
    };
    const msgs = warn(f, true).list.map((x) => x.message);
    expect(msgs.some((m) => m.includes('covers part of the window'))).toBe(true);
    expect(msgs.some((m) => m.includes('taller than the ceiling'))).toBe(true);
    expect(msgs.some((m) => m.includes('too close to the ceiling fan'))).toBe(true);
  });
});

describe('snapping', () => {
  it('snaps to a nearby wall', () => {
    const r = makeRoom('A', 3000, 3000, 0, 0);
    const f = { ...makeFloor('F'), rooms: [r] };
    const s = snapItemBox({ minX: 40, minY: 1000, maxX: 940, maxY: 1600 }, f, 'x', 100, 'floor');
    expect(s.dx).toBe(-40);
    expect(s.wall).toBe('left');
  });
});

describe('stairs', () => {
  it('draws all three styles', () => {
    for (const style of ['straight', 'L', 'U'] as const) {
      const d = stairDrawing(item({ type: 'stairs', width: 2000, depth: 3000, stairs: { style, flightWidthMm: 900, turn: 'right', upDir: 0 } }));
      expect(d.outlines.length).toBeGreaterThan(0);
      expect(d.steps.length).toBeGreaterThan(3);
    }
  });
});
