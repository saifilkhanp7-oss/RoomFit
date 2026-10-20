import type { Floor, Room } from '../model/types';
import { itemBox } from './items';
import { itemMount } from '../model/catalog';
import { boxesOverlap, type Box } from './poly';
import { roomOuterBox } from './walls';
import type { Side } from '../model/types';

export interface Guide {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface SnapResult {
  dx: number;
  dy: number;
  guides: Guide[];
  /** Wall the item ended up flush against (used to auto-turn beds/cupboards on drop). */
  wall?: Side;
}

interface Cand {
  delta: number;
  guide: Guide;
  wall?: Side;
}

function best(cands: Cand[], thr: number): Cand | null {
  let b: Cand | null = null;
  for (const c of cands) if (Math.abs(c.delta) <= thr && (!b || Math.abs(c.delta) < Math.abs(b.delta))) b = c;
  return b;
}

/**
 * Snap a moving box to room walls and to other items.
 * `box` is the item's bounding box at its un-snapped position.
 */
export function snapItemBox(box: Box, floor: Floor, movingId: string, thr: number, mount: string): SnapResult {
  const cx: Cand[] = [];
  const cy: Cand[] = [];
  const cxMid = (box.minX + box.maxX) / 2;
  const cyMid = (box.minY + box.maxY) / 2;

  // walls of the room the item is in (or nearest by centre)
  for (const r of floor.rooms) {
    const inside = cxMid >= r.x - thr && cxMid <= r.x + r.width + thr && cyMid >= r.y - thr && cyMid <= r.y + r.length + thr;
    if (!inside) continue;
    const vy = { y1: r.y, y2: r.y + r.length };
    const vx = { x1: r.x, x2: r.x + r.width };
    cx.push({ delta: r.x - box.minX, guide: { x1: r.x, x2: r.x, ...vy }, wall: 'left' });
    cx.push({ delta: r.x + r.width - box.maxX, guide: { x1: r.x + r.width, x2: r.x + r.width, ...vy }, wall: 'right' });
    cy.push({ delta: r.y - box.minY, guide: { y1: r.y, y2: r.y, ...vx }, wall: 'top' });
    cy.push({ delta: r.y + r.length - box.maxY, guide: { y1: r.y + r.length, y2: r.y + r.length, ...vx }, wall: 'bottom' });
  }

  // walls of rooms seen from outside (e.g. furniture in the Hall pushed against a bedroom wall)
  for (const r of floor.rooms) {
    if (cxMid >= r.x && cxMid <= r.x + r.width && cyMid >= r.y && cyMid <= r.y + r.length) continue;
    const ob = roomOuterBox(floor, r);
    const near: Box = { minX: box.minX - thr, minY: box.minY - thr, maxX: box.maxX + thr, maxY: box.maxY + thr };
    if (!boxesOverlap(ob, near)) continue;
    const ySpan = { y1: ob.minY, y2: ob.maxY };
    const xSpan = { x1: ob.minX, x2: ob.maxX };
    if (box.minY < ob.maxY && ob.minY < box.maxY) {
      cx.push({ delta: ob.maxX - box.minX, guide: { x1: ob.maxX, x2: ob.maxX, ...ySpan }, wall: 'left' });
      cx.push({ delta: ob.minX - box.maxX, guide: { x1: ob.minX, x2: ob.minX, ...ySpan }, wall: 'right' });
    }
    if (box.minX < ob.maxX && ob.minX < box.maxX) {
      cy.push({ delta: ob.maxY - box.minY, guide: { y1: ob.maxY, y2: ob.maxY, ...xSpan }, wall: 'top' });
      cy.push({ delta: ob.minY - box.maxY, guide: { y1: ob.minY, y2: ob.minY, ...xSpan }, wall: 'bottom' });
    }
  }

  // other items (only same "layer": rugs snap to rugs etc. would be odd, so skip under/ceiling)
  if (mount === 'floor') {
    const near: Box = { minX: box.minX - thr * 6, minY: box.minY - thr * 6, maxX: box.maxX + thr * 6, maxY: box.maxY + thr * 6 };
    for (const it of floor.items) {
      if (it.id === movingId || itemMount(it) !== 'floor') continue;
      const b = itemBox(it);
      if (!boxesOverlap(b, near)) continue;
      const ySpan = { y1: Math.min(b.minY, box.minY), y2: Math.max(b.maxY, box.maxY) };
      const xSpan = { x1: Math.min(b.minX, box.minX), x2: Math.max(b.maxX, box.maxX) };
      const overlapY = box.minY < b.maxY + thr && b.minY < box.maxY + thr;
      const overlapX = box.minX < b.maxX + thr && b.minX < box.maxX + thr;
      if (overlapY) {
        cx.push({ delta: b.maxX - box.minX, guide: { x1: b.maxX, x2: b.maxX, ...ySpan } }); // touch right side
        cx.push({ delta: b.minX - box.maxX, guide: { x1: b.minX, x2: b.minX, ...ySpan } }); // touch left side
      }
      if (overlapX) {
        cy.push({ delta: b.maxY - box.minY, guide: { y1: b.maxY, y2: b.maxY, ...xSpan } });
        cy.push({ delta: b.minY - box.maxY, guide: { y1: b.minY, y2: b.minY, ...xSpan } });
      }
      // edge alignment
      cx.push({ delta: b.minX - box.minX, guide: { x1: b.minX, x2: b.minX, ...ySpan } });
      cx.push({ delta: b.maxX - box.maxX, guide: { x1: b.maxX, x2: b.maxX, ...ySpan } });
      cy.push({ delta: b.minY - box.minY, guide: { y1: b.minY, y2: b.minY, ...xSpan } });
      cy.push({ delta: b.maxY - box.maxY, guide: { y1: b.maxY, y2: b.maxY, ...xSpan } });
    }
  }

  const bx = best(cx, thr);
  const by = best(cy, thr);
  const guides: Guide[] = [];
  if (bx) guides.push(bx.guide);
  if (by) guides.push(by.guide);
  return { dx: bx?.delta ?? 0, dy: by?.delta ?? 0, guides, wall: bx?.wall ?? by?.wall };
}

/** Rotation that turns an item's back ("head" side, local -y) to a wall. */
export function rotationFacingWall(wall: Side): number {
  return { top: 0, right: 90, bottom: 180, left: 270 }[wall];
}

/**
 * Snap a moving room so it sits next to other rooms with exactly `gap` wall between them,
 * or lines up with their edges.
 */
export function snapRoom(r: Room, floor: Floor, gap: number, thr: number): { dx: number; dy: number; guides: Guide[] } {
  const cx: Cand[] = [];
  const cy: Cand[] = [];
  for (const o of floor.rooms) {
    if (o.id === r.id) continue;
    const ySpan = { y1: Math.min(o.y, r.y), y2: Math.max(o.y + o.length, r.y + r.length) };
    const xSpan = { x1: Math.min(o.x, r.x), x2: Math.max(o.x + o.width, r.x + r.width) };
    cx.push({ delta: o.x + o.width + gap - r.x, guide: { x1: o.x + o.width + gap / 2, x2: o.x + o.width + gap / 2, ...ySpan } });
    cx.push({ delta: o.x - gap - (r.x + r.width), guide: { x1: o.x - gap / 2, x2: o.x - gap / 2, ...ySpan } });
    cx.push({ delta: o.x - r.x, guide: { x1: o.x, x2: o.x, ...ySpan } });
    cx.push({ delta: o.x + o.width - (r.x + r.width), guide: { x1: o.x + o.width, x2: o.x + o.width, ...ySpan } });
    cy.push({ delta: o.y + o.length + gap - r.y, guide: { y1: o.y + o.length + gap / 2, y2: o.y + o.length + gap / 2, ...xSpan } });
    cy.push({ delta: o.y - gap - (r.y + r.length), guide: { y1: o.y - gap / 2, y2: o.y - gap / 2, ...xSpan } });
    cy.push({ delta: o.y - r.y, guide: { y1: o.y, y2: o.y, ...xSpan } });
    cy.push({ delta: o.y + o.length - (r.y + r.length), guide: { y1: o.y + o.length, y2: o.y + o.length, ...xSpan } });
  }
  const bx = best(cx, thr);
  const by = best(cy, thr);
  return {
    dx: bx?.delta ?? 0,
    dy: by?.delta ?? 0,
    guides: [bx?.guide, by?.guide].filter(Boolean) as Guide[],
  };
}
