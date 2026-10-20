import { describe, it, expect } from 'vitest';
import { fitView, zoomAt, screenToWorld, floorBounds } from './view';
import { makeFloor, makeRoom } from '../model/defaults';

describe('view math', () => {
  it('fits a room inside the screen and centres it', () => {
    const floor = makeFloor('F', makeRoom('R', 3658, 3048));
    const b = floorBounds(floor)!;
    const v = fitView(b, 800, 600, floor.id, { top: 0, right: 0, bottom: 0, left: 0 });
    const tl = { x: b.minX * v.zoom + v.panX, y: b.minY * v.zoom + v.panY };
    const br = { x: b.maxX * v.zoom + v.panX, y: b.maxY * v.zoom + v.panY };
    expect(tl.x).toBeGreaterThanOrEqual(-0.01);
    expect(br.x).toBeLessThanOrEqual(800.01);
    expect(tl.y).toBeGreaterThanOrEqual(-0.01);
    expect(br.y).toBeLessThanOrEqual(600.01);
    expect(Math.abs((tl.x + br.x) / 2 - 400)).toBeLessThan(0.01);
    expect(Math.abs((tl.y + br.y) / 2 - 300)).toBeLessThan(0.01);
  });

  it('keeps the point under the finger fixed while zooming', () => {
    const v = { floorId: 'f', zoom: 0.1, panX: 50, panY: 20 };
    const before = screenToWorld(v, 300, 200);
    const v2 = zoomAt(v, 0.25, 300, 200);
    const after = screenToWorld(v2, 300, 200);
    expect(after.x).toBeCloseTo(before.x, 6);
    expect(after.y).toBeCloseTo(before.y, 6);
  });
});
