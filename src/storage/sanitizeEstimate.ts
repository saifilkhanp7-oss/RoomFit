// Checks the cost settings saved with a layout (from this device, the cloud, a share link or a backup).
// The server uses this too, so it must not import any app code: only types (and files ending in .js).
import type { BrickSpec, CementSpec, Estimate, PaintSpec, TileSpec } from '../model/types';

export const DEFAULT_BRICK: BrickSpec = { lengthMm: 190, widthMm: 90, heightMm: 90, jointMm: 10, price: 8, wastePct: 5 };
export const DEFAULT_TILE: TileSpec = { lengthMm: 600, widthMm: 600, gapMm: 2, price: 120 };
export const DEFAULT_PAINT: PaintSpec = { coats: 2, coverageM2: 12, price: 250, ceiling: true, outside: false };
export const DEFAULT_CEMENT: CementSpec = { price: 420, mortarMix: 6, plaster: true, plasterMix: 4, plasterMm: 12, plasterOutside: true, tileBed: true, tileBedMm: 20, tileBedMix: 4 };


const n = (v: unknown, d: number, min: number, max: number) => (typeof v === 'number' && isFinite(v) ? Math.min(max, Math.max(min, v)) : d);
const brick = (b: any): BrickSpec => ({
  lengthMm: n(b?.lengthMm, DEFAULT_BRICK.lengthMm, 20, 1000),
  widthMm: n(b?.widthMm, DEFAULT_BRICK.widthMm, 20, 1000),
  heightMm: n(b?.heightMm, DEFAULT_BRICK.heightMm, 20, 1000),
  jointMm: n(b?.jointMm, DEFAULT_BRICK.jointMm, 0, 100),
  price: n(b?.price, DEFAULT_BRICK.price, 0, 1e7),
  wastePct: n(b?.wastePct, DEFAULT_BRICK.wastePct, 0, 100),
});
const tile = (t: any): TileSpec => ({
  lengthMm: n(t?.lengthMm, DEFAULT_TILE.lengthMm, 20, 5000),
  widthMm: n(t?.widthMm, DEFAULT_TILE.widthMm, 20, 5000),
  gapMm: n(t?.gapMm, DEFAULT_TILE.gapMm, 0, 50),
  price: n(t?.price, DEFAULT_TILE.price, 0, 1e7),
});
export function sanitizeEstimate(e: any): Estimate | undefined {
  if (!e || typeof e !== 'object') return undefined;
  const rooms: Estimate['rooms'] = {};
  if (e.rooms && typeof e.rooms === 'object') {
    for (const [k, v] of Object.entries(e.rooms).slice(0, 500) as [string, any][]) {
      if (typeof k !== 'string' || k.length > 40 || !v) continue;
      if (v.mode === 'none') rooms[k] = { mode: 'none' };
      else if (v.mode === 'own') rooms[k] = { mode: 'own', tile: tile(v.tile) };
    }
  }
  return {
    currency: typeof e.currency === 'string' && e.currency.length <= 4 ? e.currency : '₹',
    brick: brick(e.brick),
    walls: e.walls !== false,
    stairs: e.stairs !== false,
    ceiling: e.ceiling !== false,
    ceilingMm: n(e.ceilingMm, 125, 20, 1000),
    tile: tile(e.tile),
    tileWastePct: n(e.tileWastePct, 10, 0, 100),
    rooms,
    paint: {
      coats: n(e.paint?.coats, DEFAULT_PAINT.coats, 1, 10),
      coverageM2: n(e.paint?.coverageM2, DEFAULT_PAINT.coverageM2, 0.5, 100),
      price: n(e.paint?.price, DEFAULT_PAINT.price, 0, 1e7),
      ceiling: e.paint?.ceiling !== false,
      outside: e.paint?.outside === true,
    },
    cement: {
      price: n(e.cement?.price, DEFAULT_CEMENT.price, 0, 1e7),
      mortarMix: n(e.cement?.mortarMix, DEFAULT_CEMENT.mortarMix, 1, 20),
      plaster: e.cement?.plaster !== false,
      plasterMix: n(e.cement?.plasterMix, DEFAULT_CEMENT.plasterMix, 1, 20),
      plasterMm: n(e.cement?.plasterMm, DEFAULT_CEMENT.plasterMm, 1, 100),
      plasterOutside: e.cement?.plasterOutside !== false,
      tileBed: e.cement?.tileBed !== false,
      tileBedMm: n(e.cement?.tileBedMm, DEFAULT_CEMENT.tileBedMm, 1, 200),
      tileBedMix: n(e.cement?.tileBedMix, DEFAULT_CEMENT.tileBedMix, 1, 20),
    },
  };
}
