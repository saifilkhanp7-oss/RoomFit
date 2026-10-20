import { describe, it, expect } from 'vitest';
import { makeFloor, makeRoom, cloneHomeFresh } from './defaults';
import { mergeRoommateThings } from './ops';
import { computeWarnings } from '../geometry/warnings';
import type { Floor, Home, Item } from './types';

const item = (over: Partial<Item>): Item => ({ id: Math.random().toString(36).slice(2), type: 'custom', label: 'Chair', x: 1000, y: 1000, width: 500, depth: 500, rotation: 0, shape: 'rect', color: '#999', ...over });
const people = [
  { id: 'a', name: 'Aman', color: '#e8590c' },
  { id: 'r', name: 'Rahul', color: '#1c7ed6' },
];
const floorWith = (items: Item[]): Floor => ({ ...makeFloor('F'), rooms: [makeRoom('Room', 4000, 3000, 0, 0)], items, zones: [{ id: 'z', personId: 'a', x: 0, y: 0, width: 2000, length: 3000 }] });
const warn = (f: Floor) => computeWarnings(f, { settings: { minWalkMm: 610, fanClearanceMm: 914 }, unit: 'ft', heights: true, people });

describe('roommates', () => {
  it("someone's thing in another person's space is a yellow warning", () => {
    const f = floorWith([item({ owner: 'r', label: 'Chair' })]);
    const w = warn(f).list.find((x) => x.id.startsWith('zone:'))!;
    expect(w.level).toBe('yellow');
    expect(w.message).toBe("Rahul's chair is in Aman's space");
    expect(warn(floorWith([item({ owner: 'a' })])).list).toHaveLength(0);
    expect(warn(floorWith([item({})])).list).toHaveLength(0); // shared things are fine
  });
  it("brings a roommate's things back from their copy", () => {
    const mine: Home = { id: 'h1', name: 'Hostel', kind: 'single', people, createdAt: 0, updatedAt: 0, layouts: [{ id: 'l', name: 'A', floors: [floorWith([item({ owner: 'a', label: 'Cot' })])] }] };
    const copy = cloneHomeFresh(mine, 'Hostel (copy)');
    expect(copy.originId).toBe('h1');
    copy.meId = 'r';
    copy.layouts[0].floors[0].items.push(item({ owner: 'r', label: 'Guitar' }), item({ owner: 'r', label: 'Bag' }));
    const { home, count } = mergeRoommateThings(mine, copy, 'r');
    expect(count).toBe(2);
    expect(home.layouts[0].floors[0].items.map((i) => i.label).sort()).toEqual(['Bag', 'Cot', 'Guitar']);
    // doing it again replaces, not duplicates
    expect(mergeRoommateThings(home, copy, 'r').home.layouts[0].floors[0].items).toHaveLength(3);
  });
});
