import type { Floor, Partition } from '../model/types';
import type { Poly, Pt } from './poly';
import { roomCeiling, DEFAULT_CEILING_MM } from './levels';
import { spaceOfPoint } from './spaces';

export const PARTITION_DEFAULT = 114; // half-brick wall, 4.5"

export const partitionLength = (p: Partition) => Math.hypot(p.b.x - p.a.x, p.b.y - p.a.y);
export const partitionMid = (p: Partition): Pt => ({ x: (p.a.x + p.b.x) / 2, y: (p.a.y + p.b.y) / 2 });
export const partitionAngle = (p: Partition) => Math.atan2(p.b.y - p.a.y, p.b.x - p.a.x);

/** The wall's outline on the plan. */
export function partitionPoly(p: Partition): Poly {
  const len = partitionLength(p) || 1;
  const nx = (-(p.b.y - p.a.y) / len) * (p.thicknessMm / 2);
  const ny = ((p.b.x - p.a.x) / len) * (p.thicknessMm / 2);
  return [
    { x: p.a.x + nx, y: p.a.y + ny },
    { x: p.b.x + nx, y: p.b.y + ny },
    { x: p.b.x - nx, y: p.b.y - ny },
    { x: p.a.x - nx, y: p.a.y - ny },
  ];
}

/** The room it stands in and its ceiling. */
export function partitionCeiling(floor: Floor, p: Partition): number {
  const r = spaceOfPoint(floor, partitionMid(p));
  return r ? roomCeiling(floor, r) : DEFAULT_CEILING_MM;
}

/** Bottom and top heights from the floor. */
export function partitionSpan(floor: Floor, p: Partition): { bottom: number; top: number } {
  const ceiling = partitionCeiling(floor, p);
  const top = Math.min(ceiling, p.topMm ?? ceiling);
  return { bottom: Math.min(p.bottomMm, top), top };
}

/** Plain words for its height, e.g. "Floor to ceiling", "From the floor up to 3′", "From 7′ up to the ceiling". */
export function partitionHeightText(floor: Floor, p: Partition, fmt: (mm: number) => string): string {
  const { bottom, top } = partitionSpan(floor, p);
  const toCeiling = p.topMm === undefined || top >= partitionCeiling(floor, p);
  if (bottom <= 0 && toCeiling) return 'Floor to ceiling';
  if (bottom <= 0) return `From the floor up to ${fmt(top)}`;
  if (toCeiling) return `From ${fmt(bottom)} up to the ceiling`;
  return `From ${fmt(bottom)} up to ${fmt(top)}`;
}

function distToSeg(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2)) : 0;
  return Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t));
}

export function hitPartition(floor: Floor, p: Pt, tol: number): Partition | undefined {
  const list = floor.partitions ?? [];
  for (let i = list.length - 1; i >= 0; i--) {
    const w = list[i];
    if (distToSeg(p, w.a, w.b) <= w.thicknessMm / 2 + tol) return w;
  }
  return undefined;
}

/** Keep a drawn wall straight: snap to horizontal / vertical when close. */
export function straighten(a: Pt, b: Pt, degTol = 8): Pt {
  const ang = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
  const near = Math.round(ang / 90) * 90;
  if (Math.abs(ang - near) > degTol) return b;
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  const r = (near * Math.PI) / 180;
  return { x: Math.round(a.x + Math.cos(r) * len), y: Math.round(a.y + Math.sin(r) * len) };
}
