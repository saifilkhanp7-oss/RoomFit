import { describe, it, expect } from 'vitest';
import { computeWarnings } from './warnings';
import { makeFloor, makeRoom } from '../model/defaults';
import { fi } from '../model/catalog';
import { putOnFloor, setWarningOk, stackOn, supportUnder } from '../model/ops';
import type { Floor, Item } from '../model/types';

const item = (over: Partial<Item>): Item => ({ id: Math.random().toString(36).slice(2), type: 'custom', label: 'Item', x: 1500, y: 1500, width: 900, depth: 600, rotation: 0, shape: 'rect', color: '#999', ...over });
const room = () => ({ ...makeFloor('F'), rooms: [makeRoom('Room', fi(12), fi(10), 0, 0)] });
const warn = (f: Floor) => computeWarnings(f, { settings: { minWalkMm: 610, fanClearanceMm: 914 }, unit: 'ft', heights: true });

const cupboard = () => item({ id: 'cup', type: 'cupboard', label: 'Cupboard', width: 900, depth: 600, heightMm: fi(6, 6) });
const suitcase = (over: Partial<Item> = {}) => item({ id: 'case', type: 'suitcase', label: 'Suitcase', width: 450, depth: 250, heightMm: 650, ...over });

describe('stacking', () => {
  it('suitcase on the floor inside a cupboard footprint is an overlap, with a "put on top" fix', () => {
    const f = { ...room(), items: [cupboard(), suitcase()] };
    const w = warn(f).list.find((x) => x.id.startsWith('overlap'))!;
    expect(w.level).toBe('red');
    expect(w.fix).toMatchObject({ action: 'stack', itemId: 'case', supportId: 'cup' });
  });

  it('put on top → no overlap, no floating', () => {
    let f: Floor = { ...room(), items: [cupboard(), suitcase()] };
    expect(supportUnder(f, 'case')?.id).toBe('cup');
    f = stackOn(f, 'case', 'cup');
    expect(f.items.find((i) => i.id === 'case')!.elevationMm).toBe(fi(6, 6));
    expect(warn(f).list).toHaveLength(0);
  });

  it('cupboard moved away → suitcase is floating, fix puts it on the floor', () => {
    let f: Floor = { ...room(), items: [cupboard(), suitcase()] };
    f = stackOn(f, 'case', 'cup');
    f = { ...f, items: f.items.map((i) => (i.id === 'cup' ? { ...i, x: 3000 } : i)) };
    const w = warn(f).list.find((x) => x.id === 'float:case')!;
    expect(w.message).toContain('in the air');
    expect(w.fix?.action).toBe('floor');
    f = putOnFloor(f, 'case');
    expect(warn(f).list.find((x) => x.id === 'float:case')).toBeUndefined();
  });

  it('things fixed to the wall may hang', () => {
    const f = { ...room(), items: [item({ type: 'mirror', label: 'Mirror', x: 1000, y: 60, width: 600, depth: 100, elevationMm: 1200 })] };
    expect(warn(f).list).toHaveLength(0);
  });

  it('box fits under a cot with open space; a tall one does not', () => {
    const cot = item({ id: 'cot', type: 'bed-single', label: 'Single bed', x: 1500, y: 1500, width: fi(3), depth: fi(6, 6), heightMm: fi(1, 6) });
    const box = item({ id: 'box', type: 'box', label: 'Box', width: 450, depth: 350, heightMm: fi(1) });
    expect(warn({ ...room(), items: [cot, box] }).list).toHaveLength(0);
    const tall = { ...box, heightMm: fi(2) };
    const w = warn({ ...room(), items: [cot, tall] }).list[0];
    expect(w.message).toBe('Box (2′ tall) doesn’t fit under Single bed (1′ 2″ space)'.replace('’', "'"));
    // closed bed (storage bed): nothing fits under
    const closed = { ...cot, openBelowMm: 0 };
    expect(warn({ ...room(), items: [closed, box] }).list[0].message).toContain('overlaps');
  });

  it('chair partly under the table: warning, then "let it be"', () => {
    const table = item({ id: 'table', type: 'study-table', label: 'Study table', x: 1500, y: 320, width: fi(4), depth: fi(2), heightMm: fi(2, 6) });
    const chair = item({ id: 'chair', type: 'chair', label: 'Chair', x: 1500, y: 650, width: fi(1, 8), depth: fi(1, 8), heightMm: fi(3) });
    let f: Floor = { ...room(), items: [table, chair] };
    const w = warn(f);
    expect(w.list).toHaveLength(1);
    expect(w.red.has('chair')).toBe(true);
    f = setWarningOk(f, w.list[0].id, true);
    const w2 = warn(f);
    expect(w2.list).toHaveLength(0);
    expect(w2.ignored).toHaveLength(1);
    expect(w2.red.size).toBe(0);
    f = setWarningOk(f, w.list[0].id, false);
    expect(warn(f).list).toHaveLength(1);
  });

  it('ceiling check uses the top of stacked items', () => {
    let f: Floor = { ...room(), items: [cupboard(), suitcase({ heightMm: fi(4) })] };
    f.rooms[0].ceilingMm = fi(10);
    f = stackOn(f, 'case', 'cup');
    expect(warn(f).list.some((x) => x.id === 'tall:case' && x.message.includes('top at'))).toBe(true);
  });
});
