import type { Item } from '../model/types';
import type { Pt } from './poly';
import { rotatePt } from './poly';

const STEP = 260; // typical tread depth in mm

export interface StairDrawing {
  outlines: Pt[][]; // flight & landing rectangles (local coords, centred on item)
  steps: [Pt, Pt][]; // tread lines
  arrow: Pt[]; // walking line, bottom → top
}

function rect(x0: number, y0: number, x1: number, y1: number): Pt[] {
  return [
    { x: x0, y: y0 },
    { x: x1, y: y0 },
    { x: x1, y: y1 },
    { x: x0, y: y1 },
  ];
}

function stepsAlongY(x0: number, x1: number, yFrom: number, yTo: number): [Pt, Pt][] {
  const out: [Pt, Pt][] = [];
  const len = Math.abs(yTo - yFrom);
  const n = Math.max(1, Math.round(len / STEP));
  for (let i = 1; i < n; i++) {
    const y = yFrom + ((yTo - yFrom) * i) / n;
    out.push([{ x: x0, y }, { x: x1, y }]);
  }
  return out;
}
function stepsAlongX(y0: number, y1: number, xFrom: number, xTo: number): [Pt, Pt][] {
  const out: [Pt, Pt][] = [];
  const len = Math.abs(xTo - xFrom);
  const n = Math.max(1, Math.round(len / STEP));
  for (let i = 1; i < n; i++) {
    const x = xFrom + ((xTo - xFrom) * i) / n;
    out.push([{ x, y: y0 }, { x, y: y1 }]);
  }
  return out;
}

/**
 * Top-down drawing of a staircase in the item's local space (before rotation).
 * The stairs go "up" towards local -y (the same side as the rotation handle).
 */
export function stairDrawing(item: Item): StairDrawing {
  const w = item.width;
  const d = item.depth;
  const L = -w / 2,
    R = w / 2,
    T = -d / 2,
    B = d / 2;
  const style = item.stairs?.style ?? 'straight';
  const f = Math.min(item.stairs?.flightWidthMm ?? Math.min(w, 1000), w / (style === 'U' ? 2 : 1), d);
  const mirror = (item.stairs?.turn ?? 'right') === 'left';
  const mx = (p: Pt): Pt => (mirror ? { x: -p.x, y: p.y } : p);
  const mapSeg = (s: [Pt, Pt]): [Pt, Pt] => [mx(s[0]), mx(s[1])];

  if (style === 'straight') {
    return {
      outlines: [rect(L, T, R, B)],
      steps: stepsAlongY(L, R, B, T),
      arrow: [
        { x: 0, y: B - 120 },
        { x: 0, y: T + 120 },
      ],
    };
  }

  if (style === 'L') {
    // flight 1 up the left side, landing in the top-left corner, flight 2 to the right along the top
    const flight1 = rect(L, T + f, L + f, B);
    const landing = rect(L, T, L + f, T + f);
    const flight2 = rect(L + f, T, R, T + f);
    return {
      outlines: [flight1, landing, flight2].map((r) => r.map(mx)),
      steps: [...stepsAlongY(L, L + f, B, T + f), ...stepsAlongX(T, T + f, L + f, R)].map(mapSeg),
      arrow: [
        { x: L + f / 2, y: B - 120 },
        { x: L + f / 2, y: T + f / 2 },
        { x: R - 120, y: T + f / 2 },
      ].map(mx),
    };
  }

  // U: up the left side, landing across the top, back down the right side (still going up)
  const flight1 = rect(L, T + f, L + f, B);
  const landing = rect(L, T, R, T + f);
  const flight2 = rect(R - f, T + f, R, B);
  return {
    outlines: [flight1, landing, flight2].map((r) => r.map(mx)),
    steps: [...stepsAlongY(L, L + f, B, T + f), ...stepsAlongY(R - f, R, T + f, B)].map(mapSeg),
    arrow: [
      { x: L + f / 2, y: B - 120 },
      { x: L + f / 2, y: T + f / 2 },
      { x: R - f / 2, y: T + f / 2 },
      { x: R - f / 2, y: B - 120 },
    ].map(mx),
  };
}

/** One solid step for 3D, in the item's local space (before rotation). */
export interface StepBlock {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  top: number; // height of the tread
  bottom: number; // 0 for closed stairs; the underside for open ones
}

/** Open stairs: each step is a slab this thick (tread + the sloping part under it). */
export const OPEN_STAIR_THICK = 250;

/**
 * Steps for the 3D view, rising from 0 to `rise` (the floor above).
 * Same layout as the 2D drawing: going up towards local -y; landings count as one step.
 */
export function stairBlocks(item: Item, rise: number): StepBlock[] {
  const w = item.width;
  const d = item.depth;
  const L = -w / 2,
    R = w / 2,
    T = -d / 2,
    B = d / 2;
  const style = item.stairs?.style ?? 'straight';
  const f = Math.min(item.stairs?.flightWidthMm ?? Math.min(w, 1000), w / (style === 'U' ? 2 : 1), d);
  const mirror = (item.stairs?.turn ?? 'right') === 'left';
  const count = (len: number) => Math.max(1, Math.round(len / STEP));

  // each run: a list of rectangles in walking order
  const runY = (x0: number, x1: number, from: number, to: number) => {
    const n = count(Math.abs(to - from));
    return Array.from({ length: n }, (_, i) => {
      const a = from + ((to - from) * i) / n;
      const b = from + ((to - from) * (i + 1)) / n;
      return { x0, x1, y0: Math.min(a, b), y1: Math.max(a, b) };
    });
  };
  const runX = (y0: number, y1: number, from: number, to: number) => {
    const n = count(Math.abs(to - from));
    return Array.from({ length: n }, (_, i) => {
      const a = from + ((to - from) * i) / n;
      const b = from + ((to - from) * (i + 1)) / n;
      return { y0, y1, x0: Math.min(a, b), x1: Math.max(a, b) };
    });
  };

  let rects: { x0: number; y0: number; x1: number; y1: number }[];
  if (style === 'straight') rects = runY(L, R, B, T);
  else if (style === 'L') rects = [...runY(L, L + f, B, T + f), { x0: L, x1: L + f, y0: T, y1: T + f }, ...runX(T, T + f, L + f, R)];
  else rects = [...runY(L, L + f, B, T + f), { x0: L, x1: R, y0: T, y1: T + f }, ...runY(R - f, R, T + f, B)];

  const n = rects.length;
  return rects.map((r, i) => {
    const x0 = mirror ? -r.x1 : r.x0;
    const x1 = mirror ? -r.x0 : r.x1;
    const top = (rise * (i + 1)) / n;
    return { x0, x1, y0: r.y0, y1: r.y1, top, bottom: item.stairs?.open ? Math.max(0, top - OPEN_STAIR_THICK) : 0 };
  });
}

/** Steps on the plan (world mm), each with its underside height. */
export function stairBlocksWorld(item: Item, rise: number): { poly: Pt[]; top: number; bottom: number }[] {
  return stairBlocks(item, rise).map((b) => ({
    top: b.top,
    bottom: b.bottom,
    poly: [
      { x: b.x0, y: b.y0 },
      { x: b.x1, y: b.y0 },
      { x: b.x1, y: b.y1 },
      { x: b.x0, y: b.y1 },
    ].map((p) => {
      const r = rotatePt(p, item.rotation);
      return { x: r.x + item.x, y: r.y + item.y };
    }),
  }));
}
