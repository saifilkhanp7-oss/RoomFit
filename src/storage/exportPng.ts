import type { Floor, Unit, Person } from '../model/types';
import { drawPlan, PALETTES } from '../editor/canvas/draw';
import { itemPoly } from '../geometry/items';
import { floorBounds } from '../geometry/view';
import { stairOpenings } from '../geometry/warnings';
import { formatLength, MM_PER_FOOT } from '../model/units';

const HEADER = 64;
const FOOTER = 44;
const MARGIN = 44;
const FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';

/** Render one floor to a PNG (light theme, no selection or warning colours). */
export async function floorToPng(opts: { floor: Floor; floorBelow?: Floor; title: string; subtitle: string; unit: Unit; showDims: boolean; people?: Person[] }): Promise<Blob> {
  const { floor } = opts;
  const b = floorBounds(floor) ?? { minX: 0, minY: 0, maxX: 4000, maxY: 3000 };
  // include furniture or stair openings that stick out of the rooms
  for (const p of [...floor.items.map((it) => itemPoly(it)), ...stairOpenings(opts.floorBelow).map((s) => s.poly)]) {
    for (const q of p) {
      b.minX = Math.min(b.minX, q.x);
      b.minY = Math.min(b.minY, q.y);
      b.maxX = Math.max(b.maxX, q.x);
      b.maxY = Math.max(b.maxY, q.y);
    }
  }
  const bw = b.maxX - b.minX;
  const bh = b.maxY - b.minY;
  // ~900 layout px on the long side, drawn at 2x so text stays readable in the image
  const SCALE = 2;
  const zoom = Math.min(900 / Math.max(bw, bh), 0.3);
  const W = Math.max(520, Math.round(bw * zoom + MARGIN * 2));
  const H = Math.round(bh * zoom + MARGIN * 2 + HEADER + FOOTER);

  const canvas = document.createElement('canvas');
  canvas.width = W * SCALE;
  canvas.height = H * SCALE;
  const c = canvas.getContext('2d')!;
  c.scale(SCALE, SCALE);
  const K = PALETTES.light;

  const panX = (W - bw * zoom) / 2 - b.minX * zoom;
  const panY = HEADER + MARGIN - b.minY * zoom;
  drawPlan(c, {
    floor,
    floorBelow: opts.floorBelow,
    view: { floorId: floor.id, zoom, panX, panY },
    width: W,
    height: H,
    colors: K,
    unit: opts.unit,
    showGrid: true,
    showDims: opts.showDims,
    clean: true,
    people: opts.people,
  });

  // header
  c.fillStyle = 'rgba(255,255,255,0.92)';
  c.fillRect(0, 0, W, HEADER);
  c.fillStyle = K.text;
  c.textAlign = 'left';
  c.textBaseline = 'alphabetic';
  c.font = `700 20px ${FONT}`;
  c.fillText(opts.title, 20, 32);
  c.font = `500 13px ${FONT}`;
  c.fillStyle = K.label;
  c.fillText(opts.subtitle, 20, 52);

  // footer: scale bar + app name
  c.fillStyle = 'rgba(255,255,255,0.92)';
  c.fillRect(0, H - FOOTER, W, FOOTER);
  const unitMm = opts.unit === 'ft' ? MM_PER_FOOT * 5 : 1000;
  const barPx = unitMm * zoom;
  const y = H - 18;
  c.strokeStyle = K.text;
  c.lineWidth = 2;
  c.beginPath();
  c.moveTo(20, y - 6);
  c.lineTo(20, y);
  c.lineTo(20 + barPx, y);
  c.lineTo(20 + barPx, y - 6);
  c.stroke();
  c.fillStyle = K.text;
  c.font = `600 12px ${FONT}`;
  c.fillText(formatLength(unitMm, opts.unit), 26 + barPx, y);
  c.textAlign = 'right';
  c.fillStyle = K.label;
  c.fillText('Made with RoomFit', W - 20, y);

  return new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('PNG failed'))), 'image/png'));
}
