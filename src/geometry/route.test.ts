import { describe, it, expect } from 'vitest';
import { makeFloor, makeRoom } from '../model/defaults';
import { fi } from '../model/catalog';
import { checkRoute, cornerMaxLength, carryWays, outsideDoors } from './route';
import type { Floor, Item, Opening } from '../model/types';

const item = (over: Partial<Item>): Item => ({ id: 'it', type: 'custom', label: 'Thing', x: 1800, y: 2000, width: 900, depth: 600, rotation: 0, shape: 'rect', color: '#999', ...over });
const door = (roomId: string, widthMm: number, side: Opening['side'] = 'bottom', offsetMm = 1200): Opening =>
  ({ id: 'd' + Math.random(), roomId, kind: 'door', side, offsetMm, widthMm, doorType: 'swing', hinge: 'start', opensInto: 'this' }) as unknown as Opening;
const home = (doorW: number): Floor => {
  const r = makeRoom('Bedroom', fi(12), fi(10), 0, 0);
  return { ...makeFloor('G'), outerWallMm: 229, rooms: [r], openings: [door(r.id, doorW)] };
};

describe('will it get in', () => {
  it('finds the outside door', () => {
    expect(outsideDoors(home(914))).toHaveLength(1);
  });
  it('a cupboard comes in through a 3 ft door', () => {
    const t0 = Date.now();
    const r = checkRoute([home(914)], 0, item({ type: 'cupboard', width: fi(3), depth: fi(2), heightMm: fi(6, 6) }));
    expect(r.ok).toBe(true);
    expect(r.steps.length).toBeGreaterThan(2);
    expect(Date.now() - t0).toBeLessThan(3000);
  });
  it('a fridge does not get through a 2 ft door', () => {
    const r = checkRoute([home(610)], 0, item({ width: fi(2, 4), depth: fi(2, 4), heightMm: fi(5, 6) }), { fmt: (mm) => `${Math.round(mm)}` });
    expect(r.ok).toBe(false);
    expect(r.message).toContain('too wide for the door');
  });
  it('a sofa wider than the door goes in on its side', () => {
    const r = checkRoute([home(914)], 0, item({ width: fi(6), depth: fi(3, 2), heightMm: fi(2, 9) }));
    expect(r.ok).toBe(true);
    expect(r.way?.how).toBe('on its side');
  });
  it('no main door: asks for one', () => {
    const f = { ...home(914), openings: [] };
    expect(checkRoute([f], 0, item({})).message).toContain('main door');
  });
  it('a long thing can not turn from a narrow corridor into a narrow door', () => {
    // corridor 3 ft wide running along the top, bedroom below with a 2'6" door off the corridor
    const corridor = makeRoom('Corridor', fi(14), fi(3), 0, 0);
    const bed = makeRoom('Bedroom', fi(10), fi(10), 0, fi(3) + 114);
    const f: Floor = {
      ...makeFloor('G'),
      outerWallMm: 229,
      innerWallMm: 114,
      rooms: [corridor, bed],
      openings: [door(corridor.id, 914, 'right', 0), door(bed.id, 762, 'top', fi(4))],
    };
    const short = checkRoute([f], 0, item({ x: fi(5), y: fi(9), width: fi(2), depth: fi(3), heightMm: fi(2) }));
    expect(short.ok).toBe(true);
    const long = checkRoute([f], 0, item({ x: fi(5), y: fi(9), width: fi(2, 4), depth: fi(9), heightMm: fi(2, 4) }));
    expect(long.ok).toBe(false);
    expect(long.message).toContain('Bedroom');
  });
  it('corner formula: a 3 ft passage turns a 2 ft wide thing up to ~6 ft long', () => {
    const L = cornerMaxLength(914, 914, 610);
    expect(L).toBeGreaterThan(1300);
    expect(L).toBeLessThan(1400);
    expect(carryWays(item({ width: 900, depth: 600, heightMm: 1800 })).map((w) => w.how)).toEqual(['as it stands', 'on its side', 'lying flat']);
  });
});
