import { describe, it, expect } from 'vitest';
import { makeFloor, makeRoom } from '../model/defaults';
import { fi } from '../model/catalog';
import { packThings } from './pack';
import { polysIntersect } from './poly';
import { itemPoly } from './items';
import type { Floor, Room } from '../model/types';

const thing = (label: string, w: number, d: number, vehicle = false) => ({ key: label + Math.random(), label, width: w, depth: d, vehicle });
const plan = (rooms: Room[]): Floor[] => [{ ...makeFloor('G'), rooms }];

describe('my things', () => {
  const stuff = [thing('Cot', fi(3), fi(6, 6)), thing('Cupboard', fi(3), fi(2)), thing('Study table', fi(4), fi(2)), thing('Chair', fi(1, 8), fi(1, 8))];
  it('a 12 × 10 room takes a student\'s things, without overlaps', () => {
    const r = packThings(plan([makeRoom('Room', fi(12), fi(10))]), stuff);
    expect(r.missing).toHaveLength(0);
    const polys = r.placed.map((p) => itemPoly({ x: p.x, y: p.y, width: p.thing.width, depth: p.thing.depth, rotation: p.rotation, shape: 'rect' }));
    for (let i = 0; i < polys.length; i++) for (let j = i + 1; j < polys.length; j++) expect(polysIntersect(polys[i], polys[j], 1)).toBe(false);
  });
  it('a tiny room: says what does not fit', () => {
    const tight = packThings(plan([makeRoom('Box room', fi(7), fi(7))]), stuff);
    expect(tight.filled).toBeGreaterThan(0.55);
    const r = packThings(plan([makeRoom('Box room', fi(6), fi(6))]), stuff);
    expect(r.missing.length).toBeGreaterThan(0);
    expect(r.placed.length + r.missing.length).toBe(4);
  });
  it('cars only go in parking', () => {
    const room = makeRoom('Room', fi(20), fi(20));
    const park = { ...makeRoom('Parking', fi(10), fi(18), fi(21), 0), kind: 'parking' as const };
    const r = packThings(plan([room, park]), [thing('Car', 1750, 4500, true), thing('Cot', fi(3), fi(6, 6))]);
    expect(r.placed.find((p) => p.thing.label === 'Car')?.room.name).toBe('Parking');
    expect(r.placed.find((p) => p.thing.label === 'Cot')?.room.name).toBe('Room');
    expect(packThings(plan([room]), [thing('Car', 1750, 4500, true)]).missing).toHaveLength(1);
  });
});
