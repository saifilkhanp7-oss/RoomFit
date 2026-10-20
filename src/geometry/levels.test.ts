import { describe, it, expect } from 'vitest';
import { makeFloor, makeRoom } from '../model/defaults';
import { fi } from '../model/catalog';
import { clipToRect, floorHeight, floorLevels, SLAB } from './levels';
import { stairBlocks } from './stairs';
import { computeWarnings } from './warnings';
import type { Floor, Item } from '../model/types';

const item = (over: Partial<Item>): Item => ({ id: Math.random().toString(36).slice(2), type: 'custom', label: 'Item', x: 1500, y: 1500, width: 900, depth: 600, rotation: 0, shape: 'rect', color: '#999', ...over });
const floor = (name: string, ceiling?: number): Floor => {
  const r = makeRoom('Room', fi(12), fi(10), 0, 0);
  if (ceiling) r.ceilingMm = ceiling;
  return { ...makeFloor(name), rooms: [r] };
};
const warn = (f: Floor, below?: Floor) => computeWarnings(f, { floorBelow: below, settings: { minWalkMm: 610, fanClearanceMm: 914 }, unit: 'ft', heights: true });

describe('floor levels', () => {
  it('floor height = highest ceiling + slab, unless set', () => {
    expect(floorHeight(floor('G', 3000))).toBe(3000 + SLAB);
    expect(floorHeight({ ...floor('G', 3000), floorHeightMm: 3500 })).toBe(3500);
  });
  it('ground is 0, floors stack up, basements go below', () => {
    const fl = [floor('Basement', 2600), floor('Ground Floor', 3000), floor('First Floor', 2800)];
    expect(floorLevels(fl)).toEqual([-(2600 + SLAB), 0, 3000 + SLAB]);
  });
  it('clips a stair hole to a room', () => {
    const p = clipToRect(
      [
        { x: -100, y: 100 },
        { x: 500, y: 100 },
        { x: 500, y: 300 },
        { x: -100, y: 300 },
      ],
      { minX: 0, minY: 0, maxX: 1000, maxY: 1000 },
    );
    expect(Math.min(...p.map((q) => q.x))).toBe(0);
    expect(p.length).toBe(4);
  });
});

describe('3D stairs', () => {
  it('steps rise evenly to the floor above', () => {
    for (const style of ['straight', 'L', 'U'] as const) {
      const b = stairBlocks(item({ type: 'stairs', width: 2000, depth: 3000, stairs: { style, flightWidthMm: 900, turn: 'right', upDir: 0 } }), 3150);
      expect(b[b.length - 1].top).toBeCloseTo(3150);
      for (let i = 1; i < b.length; i++) expect(b[i].top).toBeGreaterThan(b[i - 1].top);
      // all inside the stair footprint
      for (const s of b) expect(Math.min(s.x0, s.y0)).toBeGreaterThanOrEqual(-1500.01);
    }
  });
});

describe('over the stair opening', () => {
  const below = { ...floor('Ground Floor'), items: [item({ id: 's', type: 'stairs', label: 'Stairs', x: 1500, y: 1500, width: 1000, depth: 2500 })] };
  it('stairs above stairs: yellow note about head room, can be let be', () => {
    let f: Floor = { ...floor('First Floor'), items: [item({ id: 's2', type: 'stairs', label: 'Stairs', x: 1500, y: 1500, width: 1000, depth: 2500 })] };
    const w = warn(f, below).list.find((x) => x.id.startsWith('stairhole:'))!;
    expect(w.level).toBe('yellow');
    expect(w.message).toContain('head room');
    f = { ...f, okWarnings: [w.id] };
    expect(warn(f, below).list.some((x) => x.id.startsWith('stairhole:'))).toBe(false);
  });
  it('a hanging lamp over the stairs is fine', () => {
    const f: Floor = { ...floor('First Floor'), items: [item({ type: 'lamp', label: 'Hanging lamp', x: 1500, y: 1500, width: 400, depth: 400, shape: 'round' })] };
    expect(warn(f, below).list).toHaveLength(0);
    const g: Floor = { ...below, items: [...below.items, item({ type: 'lamp', label: 'Hanging lamp', x: 1500, y: 1500, width: 400, depth: 400, shape: 'round' })] };
    expect(warn(g).list).toHaveLength(0);
  });
  it('a lamp only warns when something touches it', () => {
    const lamp = item({ id: 'l', type: 'lamp', label: 'Hanging lamp', x: 1500, y: 1500, width: 400, depth: 400, shape: 'round' });
    const table = item({ type: 'dining-table', label: 'Table', x: 1500, y: 1500, width: 1200, depth: 800, heightMm: 750 });
    expect(warn({ ...floor('G'), items: [lamp, table] }).list).toHaveLength(0);
    const tall = item({ type: 'cupboard', label: 'Cupboard', x: 1500, y: 1500, width: 900, depth: 600, heightMm: 2600 });
    expect(warn({ ...floor('G'), items: [lamp, tall] }).list.some((x) => x.id.startsWith('fan:'))).toBe(true);
  });
});

describe('open stairs', () => {
  const stairs = (open: boolean) => item({ id: 's', type: 'stairs', label: 'Stairs', x: 1500, y: 1500, width: 1000, depth: 3000, stairs: { style: 'straight', flightWidthMm: 1000, turn: 'right', upDir: 0, ...(open ? { open: true } : {}) } });
  // stairs go up towards -y: the high end is at y = 0..., the low end near y = 3000
  const box = (y: number, h: number) => item({ id: 'b', type: 'box', label: 'Box', x: 1500, y, width: 600, depth: 400, heightMm: h });
  it('closed stairs: nothing can go under', () => {
    const f = { ...floor('G'), items: [stairs(false), box(400, 900)] };
    expect(warn(f).list[0].message).toBe('Box is on the stairs');
  });
  it('open stairs: fits under the high end, not the low end', () => {
    expect(warn({ ...floor('G'), items: [stairs(true), box(400, 900)] }).list).toHaveLength(0);
    const low = warn({ ...floor('G'), items: [stairs(true), box(2700, 900)] }).list[0];
    expect(low.message).toContain("doesn't fit under the stairs there");
  });
});
