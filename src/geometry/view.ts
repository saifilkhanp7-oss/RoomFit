import type { Floor, LayoutView } from '../model/types';

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export const MIN_ZOOM = 0.01; // px per mm  (≈ 3 px per foot)
export const MAX_ZOOM = 1.5; // px per mm  (≈ 457 px per foot)

/** Outer bounds of all rooms on a floor including walls (mm). */
export function floorBounds(floor: Floor): Bounds | null {
  if (floor.rooms.length === 0) return null;
  const w = floor.outerWallMm;
  return {
    minX: Math.min(...floor.rooms.map((r) => r.x)) - w,
    minY: Math.min(...floor.rooms.map((r) => r.y)) - w,
    maxX: Math.max(...floor.rooms.map((r) => r.x + r.width)) + w,
    maxY: Math.max(...floor.rooms.map((r) => r.y + r.length)) + w,
  };
}

/** View that fits the bounds inside a screen box with padding. */
export function fitView(
  b: Bounds | null,
  screenW: number,
  screenH: number,
  floorId: string,
  pad = { top: 48, right: 32, bottom: 48, left: 32 },
): LayoutView {
  const bounds = b ?? { minX: 0, minY: 0, maxX: 4000, maxY: 3000 };
  const availW = Math.max(50, screenW - pad.left - pad.right);
  const availH = Math.max(50, screenH - pad.top - pad.bottom);
  const bw = bounds.maxX - bounds.minX;
  const bh = bounds.maxY - bounds.minY;
  const zoom = clampZoom(Math.min(availW / bw, availH / bh));
  const panX = pad.left + (availW - bw * zoom) / 2 - bounds.minX * zoom;
  const panY = pad.top + (availH - bh * zoom) / 2 - bounds.minY * zoom;
  return { floorId, zoom, panX, panY };
}

export function clampZoom(z: number) {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));
}

/** Zoom around a screen point so that point stays under the finger/cursor. */
export function zoomAt(view: LayoutView, newZoom: number, sx: number, sy: number): LayoutView {
  const z = clampZoom(newZoom);
  const wx = (sx - view.panX) / view.zoom;
  const wy = (sy - view.panY) / view.zoom;
  return { ...view, zoom: z, panX: sx - wx * z, panY: sy - wy * z };
}

export function screenToWorld(view: LayoutView, sx: number, sy: number) {
  return { x: (sx - view.panX) / view.zoom, y: (sy - view.panY) / view.zoom };
}
