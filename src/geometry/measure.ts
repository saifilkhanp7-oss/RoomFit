import type { Floor, Item } from '../model/types';
import { itemBox, itemPoly } from './items';
import { closestOnSeg, type Pt } from './poly';
import { childBlocks, openingGeom, sideLine, SIDES } from './walls';
import { roomOfPoint } from './warnings';

/** Snap a measuring point to corners first, then to wall faces. */
export function snapMeasurePoint(floor: Floor, p: Pt, thr: number): Pt {
  const corners: Pt[] = [];
  for (const r of floor.rooms) {
    corners.push({ x: r.x, y: r.y }, { x: r.x + r.width, y: r.y }, { x: r.x, y: r.y + r.length }, { x: r.x + r.width, y: r.y + r.length });
  }
  for (const it of floor.items) if (it.shape === 'rect') corners.push(...itemPoly(it));
  for (const op of floor.openings) {
    const r = floor.rooms.find((x) => x.id === op.roomId);
    if (r) {
      const g = openingGeom(floor, r, op);
      corners.push(g.p1, g.p2);
    }
  }
  let best: Pt | null = null;
  let bd = thr;
  for (const c of corners) {
    const d = Math.hypot(c.x - p.x, c.y - p.y);
    if (d < bd) {
      bd = d;
      best = c;
    }
  }
  if (best) return { ...best };

  // wall faces and item edges
  bd = thr * 0.75;
  const segs: [Pt, Pt][] = [];
  for (const r of floor.rooms) for (const s of SIDES) {
    const l = sideLine(r, s);
    segs.push([l.a, l.b]);
  }
  for (const it of floor.items) {
    const poly = itemPoly(it);
    for (let i = 0; i < poly.length; i++) segs.push([poly[i], poly[(i + 1) % poly.length]]);
  }
  for (const [a, b] of segs) {
    const q = closestOnSeg(p, a, b);
    const d = Math.hypot(q.x - p.x, q.y - p.y);
    if (d < bd) {
      bd = d;
      best = q;
    }
  }
  return best ?? p;
}

export interface DimLine {
  a: Pt;
  b: Pt;
  value: number;
}

/** Distances from the item's edges to the walls of its room (left, right, top, bottom). */
export function wallDistances(floor: Floor, item: Item): DimLine[] {
  const room = roomOfPoint(floor, item);
  if (!room) return [];
  const b = itemBox(item);
  const cx = Math.max(room.x, Math.min(room.x + room.width, (b.minX + b.maxX) / 2));
  const cy = Math.max(room.y, Math.min(room.y + room.length, (b.minY + b.maxY) / 2));
  const out: DimLine[] = [];
  // walls of the room, or of rooms inside it (e.g. a bedroom wall when standing in the Hall)
  const blocks = childBlocks(floor, room);
  let leftX = room.x,
    rightX = room.x + room.width,
    topY = room.y,
    bottomY = room.y + room.length;
  for (const k of blocks) {
    if (cy > k.minY && cy < k.maxY) {
      if (k.maxX <= b.minX + 1) leftX = Math.max(leftX, k.maxX);
      if (k.minX >= b.maxX - 1) rightX = Math.min(rightX, k.minX);
    }
    if (cx > k.minX && cx < k.maxX) {
      if (k.maxY <= b.minY + 1) topY = Math.max(topY, k.maxY);
      if (k.minY >= b.maxY - 1) bottomY = Math.min(bottomY, k.minY);
    }
  }
  const left = b.minX - leftX;
  const right = rightX - b.maxX;
  const top = b.minY - topY;
  const bottom = bottomY - b.maxY;
  if (left > 5) out.push({ a: { x: leftX, y: cy }, b: { x: b.minX, y: cy }, value: left });
  if (right > 5) out.push({ a: { x: b.maxX, y: cy }, b: { x: rightX, y: cy }, value: right });
  if (top > 5) out.push({ a: { x: cx, y: topY }, b: { x: cx, y: b.minY }, value: top });
  if (bottom > 5) out.push({ a: { x: cx, y: b.maxY }, b: { x: cx, y: bottomY }, value: bottom });
  return out;
}
