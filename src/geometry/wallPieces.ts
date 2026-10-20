import type { Floor } from '../model/types';
import { DEFAULT_SILL, DEFAULT_WINDOW_H } from './warnings';
import { DOOR_HEIGHT, neighbors, openingGeom, sideLine, SIDES, wallThickness } from './walls';
import { flushWithParent, kindOf } from './spaces';
import { polyBox } from './poly';
import { roomCeiling } from './levels';

export const RAILING = 1000; // balcony railing height
export const CUT_HEIGHT = 1000; // "Cut walls" in 3D

/** A box of wall in mm: x/y on the plan, z = height from the floor. */
export interface WallPiece {
  key: string;
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  z0: number;
  z1: number;
  glass?: boolean;
}

/**
 * Wall boxes for every room side, with gaps for doors and windows (from either side of the wall).
 * Walls go up to the room's ceiling (a balcony gets a railing). Rooms sharing a wall both give a
 * box for it, so they can overlap: use unionVolume() when measuring.
 */
export function buildWalls(floor: Floor, cut = false): WallPiece[] {
  const out: WallPiece[] = [];
  const cuts = floor.openings.flatMap((o) => {
    const room = floor.rooms.find((r) => r.id === o.roomId);
    return room ? [{ o, b: polyBox(openingGeom(floor, room, o).cut) }] : [];
  });
  for (const r of floor.rooms) {
    const H = roomCeiling(floor, r);
    const balcony = kindOf(r) === 'balcony';
    for (const side of SIDES) {
      if (flushWithParent(floor, r, side)) continue; // the outer room's wall is already there
      const line = sideLine(r, side);
      const t = wallThickness(floor, r, side);
      if (t <= 0) continue;
      const shared = neighbors(floor, r).some((n) => n.side === side);
      const fullTop = balcony && !shared ? RAILING : H;
      const top = cut ? Math.min(fullTop, CUT_HEIGHT) : fullTop;
      const horiz = side === 'top' || side === 'bottom';
      // horizontal walls run past the corners so the corners are closed
      const ext = horiz ? [wallThickness(floor, r, 'left'), wallThickness(floor, r, 'right')] : [0, 0];
      const band =
        side === 'top' ? { lo: r.y - t, hi: r.y } : side === 'bottom' ? { lo: r.y + r.length, hi: r.y + r.length + t } : side === 'left' ? { lo: r.x - t, hi: r.x } : { lo: r.x + r.width, hi: r.x + r.width + t };
      const ops = cuts
        .filter(({ b }) => {
          const lo = horiz ? b.minY : b.minX;
          const hi = horiz ? b.maxY : b.maxX;
          return Math.min(hi, band.hi) - Math.max(lo, band.lo) > 1;
        })
        .map(({ o, b }) => ({ o, from: (horiz ? b.minX : b.minY) - (horiz ? line.a.x : line.a.y), to: (horiz ? b.maxX : b.maxY) - (horiz ? line.a.x : line.a.y) }))
        .filter((x) => x.to > -ext[0] && x.from < line.length + ext[1])
        .sort((a, b) => a.from - b.from);

      const piece = (from: number, to: number, z0: number, z1: number, key: string, glass = false) => {
        if (to - from < 1 || z1 - z0 < 1) return;
        // across the wall: from the inner face outwards by t (glass is a thin pane in the middle)
        const across0 = glass ? -t * 0.625 : -t;
        const across1 = glass ? -t * 0.375 : 0;
        const fixed = horiz ? line.a.y : line.a.x;
        const inward = horiz ? line.inward.y : line.inward.x;
        const c0 = fixed + inward * across0;
        const c1 = fixed + inward * across1;
        const start = horiz ? line.a.x : line.a.y;
        const lo = { a: start + from, b: start + to };
        const cross = { a: Math.min(c0, c1), b: Math.max(c0, c1) };
        out.push(
          horiz
            ? { key, x0: lo.a, x1: lo.b, y0: cross.a, y1: cross.b, z0, z1, glass }
            : { key, x0: cross.a, x1: cross.b, y0: lo.a, y1: lo.b, z0, z1, glass },
        );
      };

      let cursor = -ext[0];
      ops.forEach(({ o, from, to }, i) => {
        if (from > cursor) piece(cursor, from, 0, top, `${r.id}${side}s${i}`);
        const a = Math.max(from, cursor);
        if (o.kind === 'door') {
          piece(a, to, Math.min(o.doorType === 'shutter' ? 2400 : DOOR_HEIGHT, top), top, `${r.id}${side}d${i}`);
        } else {
          const sill = o.sillMm ?? DEFAULT_SILL;
          const wh = o.heightMm ?? DEFAULT_WINDOW_H;
          piece(a, to, 0, Math.min(sill, top), `${r.id}${side}wb${i}`);
          piece(a, to, Math.min(sill + wh, top), top, `${r.id}${side}wt${i}`);
          piece(a, to, Math.min(sill, top), Math.min(sill + wh, top), `${r.id}${side}wg${i}`, true);
        }
        cursor = Math.max(cursor, to);
      });
      piece(cursor, line.length + ext[1], 0, top, `${r.id}${side}end`);
    }
  }
  return out;
}

interface Box3 {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  z0: number;
  z1: number;
}

/** Volume (mm³) covered by a set of boxes, counting overlaps once. */
export function unionVolume(boxes: Box3[]): number {
  const bs = boxes.filter((b) => b.x1 > b.x0 && b.y1 > b.y0 && b.z1 > b.z0);
  if (!bs.length) return 0;
  const xs = [...new Set(bs.flatMap((b) => [b.x0, b.x1]))].sort((a, b) => a - b);
  let vol = 0;
  for (let i = 0; i < xs.length - 1; i++) {
    const xa = xs[i];
    const xb = xs[i + 1];
    const inX = bs.filter((b) => b.x0 <= xa && b.x1 >= xb);
    if (!inX.length) continue;
    const ys = [...new Set(inX.flatMap((b) => [b.y0, b.y1]))].sort((a, b) => a - b);
    for (let j = 0; j < ys.length - 1; j++) {
      const ya = ys[j];
      const yb = ys[j + 1];
      const zs = inX.filter((b) => b.y0 <= ya && b.y1 >= yb).map((b) => [b.z0, b.z1] as [number, number]);
      if (!zs.length) continue;
      zs.sort((a, b) => a[0] - b[0]);
      let h = 0;
      let [s, e] = zs[0];
      for (const [a, b] of zs.slice(1)) {
        if (a > e) {
          h += e - s;
          s = a;
          e = b;
        } else e = Math.max(e, b);
      }
      h += e - s;
      vol += (xb - xa) * (yb - ya) * h;
    }
  }
  return vol;
}

/** Area (mm²) covered by axis-aligned rectangles, counting overlaps once. */
export function unionArea(rects: { minX: number; minY: number; maxX: number; maxY: number }[]): number {
  return unionVolume(rects.map((r) => ({ x0: r.minX, x1: r.maxX, y0: r.minY, y1: r.maxY, z0: 0, z1: 1 })));
}
