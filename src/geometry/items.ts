import type { Item } from '../model/types';
import { polyBox, rotatePt, type Box, type Poly, type Pt } from './poly';

const ROUND_SEGMENTS = 20;

/** Item outline in floor coordinates (rotated rectangle, or ellipse as a polygon). */
export function itemPoly(item: Pick<Item, 'x' | 'y' | 'width' | 'depth' | 'rotation' | 'shape'>): Poly {
  const hw = item.width / 2;
  const hd = item.depth / 2;
  let local: Pt[];
  if (item.shape === 'round') {
    local = [];
    for (let i = 0; i < ROUND_SEGMENTS; i++) {
      const a = (i / ROUND_SEGMENTS) * Math.PI * 2;
      local.push({ x: Math.cos(a) * hw, y: Math.sin(a) * hd });
    }
  } else {
    local = [
      { x: -hw, y: -hd },
      { x: hw, y: -hd },
      { x: hw, y: hd },
      { x: -hw, y: hd },
    ];
  }
  return local.map((p) => {
    const r = rotatePt(p, item.rotation);
    return { x: r.x + item.x, y: r.y + item.y };
  });
}

export function itemBox(item: Item): Box {
  return polyBox(itemPoly(item));
}

/** Screen position of the rotation handle (in world mm), above the item's "head" side. */
export function rotationHandle(item: Item, zoom: number): Pt {
  const off = item.depth / 2 + 30 / zoom;
  const p = rotatePt({ x: 0, y: -off }, item.rotation);
  return { x: item.x + p.x, y: item.y + p.y };
}

export function normAngle(deg: number) {
  return ((Math.round(deg * 10) / 10) % 360 + 360) % 360;
}
