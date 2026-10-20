import type { Item } from '../model/types';
import type { Pt } from './poly';

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
