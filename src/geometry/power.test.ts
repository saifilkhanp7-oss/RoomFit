import { describe, it, expect } from 'vitest';
import { makeFloor, makeRoom } from '../model/defaults';
import { fi } from '../model/catalog';
import { computeWarnings, coverHeadroom, HEADROOM } from './warnings';
import { cordFor } from './power';
import type { Floor, Item, PowerPoint } from '../model/types';

const item = (over: Partial<Item>): Item => ({ id: Math.random().toString(36).slice(2), type: 'custom', label: 'Thing', x: 1500, y: 1500, width: 600, depth: 600, rotation: 0, shape: 'rect', color: '#999', ...over });
const warn = (f: Floor, below?: Floor) => computeWarnings(f, { floorBelow: below, settings: { minWalkMm: 610, fanClearanceMm: 914 }, unit: 'ft', heights: true });

describe('plug points', () => {
  const room = makeRoom('Bedroom', fi(12), fi(10), 0, 0);
  const plug = (over: Partial<PowerPoint> = {}): PowerPoint => ({ id: 'p' + Math.random(), roomId: room.id, side: 'left', offsetMm: 600, kind: 'board', ...over });
  const table = () => item({ id: 'desk', type: 'study-table', label: 'Study table', x: fi(9), y: fi(8), width: fi(4), depth: fi(2) });
  const base = (): Floor => ({ ...makeFloor('F'), rooms: [room] });

  it('no plug points marked: no power warnings at all', () => {
    expect(warn({ ...base(), items: [table()] }).list).toHaveLength(0);
  });
  it('study table far from the only plug: warning with an extension cord length', () => {
    const w = warn({ ...base(), points: [plug()], items: [table()] }).list.find((x) => x.id === 'power:desk')!;
    expect(w.level).toBe('yellow');
    expect(w.message).toMatch(/Study table is .* from the nearest plug point\. Use a \d+ ft extension cord/);
  });
  it('a plug next to it: fine', () => {
    const f = { ...base(), points: [plug({ side: 'right', offsetMm: fi(8) })], items: [table()] };
    expect(warn(f).list.filter((x) => x.id.startsWith('power'))).toHaveLength(0);
  });
  it('switches only do not count', () => {
    const f = { ...base(), points: [plug({ side: 'right', offsetMm: fi(8), kind: 'switch' }), plug()], items: [table()] };
    expect(warn(f).list.some((x) => x.id === 'power:desk')).toBe(true);
  });
  it('AC needs a power point on its wall; fridge says no extension cord', () => {
    const ac = item({ id: 'ac', type: 'ac', label: 'AC (split)', x: fi(6), y: 120, width: fi(3, 2), depth: fi(0, 9), elevationMm: fi(7) });
    const fridge = item({ id: 'fr', type: 'fridge', label: 'Fridge', x: fi(10), y: fi(8) });
    const f = { ...base(), points: [plug({ side: 'bottom', offsetMm: 300 })], items: [ac, fridge] };
    const l = warn(f).list;
    expect(l.find((x) => x.id === 'power:ac')?.message).toContain('no power point on its wall');
    expect(l.find((x) => x.id === 'power:fr')?.message).toContain("shouldn't use an extension cord");
    const ok = { ...f, points: [plug({ side: 'top', offsetMm: fi(6) + 500, kind: 'power' })] };
    expect(warn(ok).list.some((x) => x.id === 'power:ac')).toBe(false);
  });
  it('cord sizes', () => {
    expect(cordFor(fi(7), 'ft')).toBe(fi(10));
    expect(cordFor(2000, 'm')).toBe(3000);
  });
});

describe('floor over the stairs', () => {
  // straight stairs going up towards -y: low end at the bottom (high y), top end at low y
  const stairs = item({ id: 's', type: 'stairs', label: 'Stairs', x: 1500, y: 2000, width: 1000, depth: 3500, stairs: { style: 'straight', flightWidthMm: 1000, turn: 'right', upDir: 0 } });
  const below: Floor = { ...makeFloor('Ground Floor'), rooms: [makeRoom('Hall', 5000, 5000, 0, 0)], items: [stairs] };
  const above = (cover: { x: number; y: number; width: number; length: number }): Floor => ({ ...makeFloor('First Floor'), rooms: [makeRoom('Hall', 5000, 5000, 0, 0)], covers: [{ id: 'c', ...cover }] });
  it('over the low steps there is plenty of head room', () => {
    const c = { x: 1000, y: 3200, width: 1000, length: 500 };
    expect(coverHeadroom(below, c)).toBeGreaterThan(HEADROOM);
    expect(warn(above(c), below).list.some((x) => x.id.startsWith('headroom'))).toBe(false);
  });
  it('over the high steps: warning under 6 ft', () => {
    const c = { x: 1000, y: 250, width: 1000, length: 1800 };
    expect(coverHeadroom(below, c)).toBeLessThan(HEADROOM);
    const w = warn(above(c), below).list.find((x) => x.id === 'headroom:c')!;
    expect(w.message).toContain('head room on the stairs');
  });
  it('things on the floor over the stairs are not "over the opening"', () => {
    const c = { x: 1000, y: 3000, width: 1000, length: 750 };
    const f = { ...above(c), items: [item({ x: 1500, y: 3375, width: 600, depth: 500 })] };
    expect(warn(f, below).list.some((x) => x.id.startsWith('stairhole'))).toBe(false);
  });
});
