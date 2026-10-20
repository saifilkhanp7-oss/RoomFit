// Draws the whole plan with the plain Canvas 2D API.
// Used by the editor canvas, the shared-plan viewer and PNG export.
import type { Floor, Item, LayoutView, Unit } from '../../model/types';
import { formatLength, gridSteps } from '../../model/units';
import { isStairs, itemElevation, itemMount, itemOpenBelow } from '../../model/catalog';
import { childBlocks, doorSwings, openingGeom, roomOuterBox, sharedWallBoxes } from '../../geometry/walls';
import { byDepth, childrenOf, freeRects, kindOf, rectArea } from '../../geometry/spaces';
import type { Room, RoomKind } from '../../model/types';
import { itemPoly, rotationHandle } from '../../geometry/items';
import { stairDrawing } from '../../geometry/stairs';
import { stairOpenings, type WarningResult } from '../../geometry/warnings';
import { wallDistances } from '../../geometry/measure';
import type { Guide } from '../../geometry/snapping';
import type { Pt } from '../../geometry/poly';

export interface Palette {
  bg: string;
  gridMinor: string;
  gridMajor: string;
  roomFill: string;
  wall: string;
  label: string;
  text: string;
  select: string;
  red: string;
  yellow: string;
  window: string;
  swing: string;
  guide: string;
  measure: string;
  railing: string;
  kinds: Record<RoomKind, string>;
}

export const PALETTES: Record<'light' | 'dark', Palette> = {
  light: {
    bg: '#eef0f3',
    gridMinor: '#dde1e7',
    gridMajor: '#c6ccd5',
    roomFill: '#ffffff',
    wall: '#3a3f48',
    label: '#5d6470',
    text: '#1a1d23',
    select: '#2f6fed',
    red: '#e03b3b',
    yellow: '#e0a100',
    window: '#7fb3ff',
    swing: 'rgba(47,111,237,0.07)',
    guide: '#e0399b',
    measure: '#0f9b8e',
    railing: '#9aa3ae',
    kinds: { room: '#ffffff', hall: '#f6f1e8', bathroom: '#e9f4fb', kitchen: '#f7f6ee', balcony: '#ecf6e8', parking: '#e6e8eb', store: '#f4f2f0' },
  },
  dark: {
    bg: '#17191d',
    gridMinor: '#23262c',
    gridMajor: '#31353d',
    roomFill: '#20242a',
    wall: '#c9ced6',
    label: '#a6adb8',
    text: '#eceef1',
    select: '#5b8ff5',
    red: '#ff5c5c',
    yellow: '#f0b429',
    window: '#5f9eff',
    swing: 'rgba(91,143,245,0.10)',
    guide: '#ff5cb8',
    measure: '#2dd4bf',
    railing: '#7b8592',
    kinds: { room: '#20242a', hall: '#27251f', bathroom: '#1d2a33', kitchen: '#26261f', balcony: '#1f2a22', parking: '#2a2c30', store: '#25232a' },
  },
};

export type Selection = { kind: 'item' | 'room' | 'opening'; id: string } | null;

export interface Measurement {
  a: Pt;
  b: Pt;
}

export interface DrawState {
  floor: Floor;
  floorBelow?: Floor;
  ghostBelow?: boolean;
  view: LayoutView;
  width: number;
  height: number;
  colors: Palette;
  unit: Unit;
  showGrid: boolean;
  showDims: boolean;
  selection?: Selection;
  warnings?: WarningResult;
  measurements?: Measurement[];
  measureDraft?: { a: Pt; b?: Pt } | null;
  guides?: Guide[];
  /** No selection handles or warning colours (PNG export) */
  clean?: boolean;
}

const FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';

function shade(hex: string, amt: number): string {
  const m = hex.replace('#', '');
  const n = parseInt(m.length === 3 ? m.split('').map((c) => c + c).join('') : m, 16);
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(v + (amt < 0 ? v * amt : (255 - v) * amt))));
  const r = f((n >> 16) & 255);
  const g = f((n >> 8) & 255);
  const b = f(n & 255);
  return `rgb(${r},${g},${b})`;
}

function withAlpha(hex: string, a: number) {
  const m = hex.replace('#', '');
  const n = parseInt(m.length === 3 ? m.split('').map((c) => c + c).join('') : m, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

function pathPoly(c: CanvasRenderingContext2D, pts: Pt[]) {
  c.beginPath();
  pts.forEach((p, i) => (i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)));
  c.closePath();
}

function roundRect(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  c.beginPath();
  c.moveTo(x + rr, y);
  c.arcTo(x + w, y, x + w, y + h, rr);
  c.arcTo(x + w, y + h, x, y + h, rr);
  c.arcTo(x, y + h, x, y, rr);
  c.arcTo(x, y, x + w, y, rr);
  c.closePath();
}

/** Text with a soft outline so it stays readable on top of anything. */
function label(c: CanvasRenderingContext2D, text: string, x: number, y: number, px: number, color: string, halo: string, weight = 600) {
  c.font = `${weight} ${px}px ${FONT}`;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.lineWidth = px / 3.5;
  c.strokeStyle = halo;
  c.lineJoin = 'round';
  c.strokeText(text, x, y);
  c.fillStyle = color;
  c.fillText(text, x, y);
}

export function drawPlan(c: CanvasRenderingContext2D, s: DrawState) {
  const { floor, view, colors: K } = s;
  const z = view.zoom;
  const px = (n: number) => n / z; // screen px → world mm

  // ---------- background + grid (screen space) ----------
  c.fillStyle = K.bg;
  c.fillRect(0, 0, s.width, s.height);
  if (s.showGrid) {
    const { minor, major } = gridSteps(s.unit);
    const lines = (step: number, color: string) => {
      const sp = step * z;
      if (sp < 6) return;
      c.beginPath();
      for (let x = ((view.panX % sp) + sp) % sp; x <= s.width; x += sp) {
        const xx = Math.round(x) + 0.5;
        c.moveTo(xx, 0);
        c.lineTo(xx, s.height);
      }
      for (let y = ((view.panY % sp) + sp) % sp; y <= s.height; y += sp) {
        const yy = Math.round(y) + 0.5;
        c.moveTo(0, yy);
        c.lineTo(s.width, yy);
      }
      c.strokeStyle = color;
      c.lineWidth = 1;
      c.stroke();
    };
    lines(minor, K.gridMinor);
    lines(major, K.gridMajor);
  }

  c.save();
  c.translate(view.panX, view.panY);
  c.scale(z, z);

  // ---------- ghost of the floor below ----------
  if (s.ghostBelow && s.floorBelow) {
    c.setLineDash([px(6), px(4)]);
    c.strokeStyle = K.label;
    c.globalAlpha = 0.55;
    c.lineWidth = px(1.5);
    for (const r of s.floorBelow.rooms) c.strokeRect(r.x, r.y, r.width, r.length);
    c.globalAlpha = 1;
    c.setLineDash([]);
  }

  // ---------- walls and floors (outer rooms first, then rooms inside them, e.g. rooms inside a Hall) ----------
  const levels = byDepth(floor);
  const shared = sharedWallBoxes(floor);
  const maxDepth = levels.length ? levels[levels.length - 1].depth : 0;
  for (let d = 0; d <= maxDepth; d++) {
    const here = levels.filter((l) => l.depth === d).map((l) => l.room);
    // balconies get a lighter railing; real walls drawn after so shared walls stay solid
    for (const pass of ['balcony', 'wall'] as const) {
      c.fillStyle = pass === 'balcony' ? K.railing : K.wall;
      for (const r of here) {
        if ((kindOf(r) === 'balcony') !== (pass === 'balcony')) continue;
        const b = roomOuterBox(floor, r);
        c.fillRect(b.minX, b.minY, b.maxX - b.minX, b.maxY - b.minY);
      }
    }
    c.fillStyle = K.wall;
    for (const b of shared) c.fillRect(b.minX, b.minY, b.maxX - b.minX, b.maxY - b.minY);
    for (const r of here) drawRoomFloor(c, r, K, z);
  }

  // ---------- stair openings from the floor below ----------
  for (const so of stairOpenings(s.floorBelow)) {
    c.save();
    pathPoly(c, so.poly);
    c.fillStyle = withAlpha('#8a8f96', 0.18);
    c.fill();
    c.clip();
    c.strokeStyle = withAlpha('#8a8f96', 0.6);
    c.lineWidth = px(1.2);
    const bb = so.poly.reduce(
      (a, p) => ({ minX: Math.min(a.minX, p.x), maxX: Math.max(a.maxX, p.x), minY: Math.min(a.minY, p.y), maxY: Math.max(a.maxY, p.y) }),
      { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity },
    );
    const step = px(10);
    c.beginPath();
    for (let d = bb.minX - (bb.maxY - bb.minY); d < bb.maxX; d += step) {
      c.moveTo(d, bb.minY);
      c.lineTo(d + (bb.maxY - bb.minY), bb.maxY);
    }
    c.stroke();
    c.restore();
    pathPoly(c, so.poly);
    c.setLineDash([px(6), px(4)]);
    c.strokeStyle = K.label;
    c.lineWidth = px(1.5);
    c.stroke();
    c.setLineDash([]);
    const cx = so.poly.reduce((a, p) => a + p.x, 0) / so.poly.length;
    const cy = so.poly.reduce((a, p) => a + p.y, 0) / so.poly.length;
    label(c, 'Stair opening', cx, cy, px(11), K.label, K.roomFill);
  }

  // ---------- doors & windows ----------
  for (const op of floor.openings) {
    const room = floor.rooms.find((r) => r.id === op.roomId);
    if (!room) continue;
    const g = openingGeom(floor, room, op);
    const red = !s.clean && s.warnings?.redOpenings.has(op.id);
    const selected = !s.clean && s.selection?.kind === 'opening' && s.selection.id === op.id;
    // cut through the wall
    pathPoly(c, g.cut);
    c.fillStyle = K.kinds[kindOf(room)] ?? K.roomFill;
    c.fill();
    if (op.kind === 'window') {
      pathPoly(c, g.cut);
      c.fillStyle = withAlpha(K.window, 0.35);
      c.fill();
      c.strokeStyle = K.window;
      c.lineWidth = px(1.5);
      c.stroke();
      // glass line in the middle of the wall
      const off = { x: -g.inward.x * g.thickness * 0.5, y: -g.inward.y * g.thickness * 0.5 };
      c.beginPath();
      c.moveTo(g.p1.x + off.x, g.p1.y + off.y);
      c.lineTo(g.p2.x + off.x, g.p2.y + off.y);
      c.lineWidth = px(2);
      c.stroke();
    } else {
      // door frame ends
      c.strokeStyle = K.wall;
      c.lineWidth = px(2);
      c.beginPath();
      const o = { x: -g.inward.x * g.thickness, y: -g.inward.y * g.thickness };
      c.moveTo(g.p1.x, g.p1.y);
      c.lineTo(g.p1.x + o.x, g.p1.y + o.y);
      c.moveTo(g.p2.x, g.p2.y);
      c.lineTo(g.p2.x + o.x, g.p2.y + o.y);
      c.stroke();
      for (const sw of doorSwings(g, op)) {
        // swing area
        c.beginPath();
        c.moveTo(sw.hinge.x, sw.hinge.y);
        c.arc(sw.hinge.x, sw.hinge.y, sw.radius, sw.a0, sw.a1, sw.a1 < sw.a0);
        c.closePath();
        c.fillStyle = red ? withAlpha(K.red, 0.16) : K.swing;
        c.fill();
        // arc
        c.beginPath();
        c.arc(sw.hinge.x, sw.hinge.y, sw.radius, sw.a0, sw.a1, sw.a1 < sw.a0);
        c.setLineDash([px(5), px(4)]);
        c.strokeStyle = red ? K.red : K.label;
        c.lineWidth = px(1.3);
        c.stroke();
        c.setLineDash([]);
        // open door leaf
        c.beginPath();
        c.moveTo(sw.hinge.x, sw.hinge.y);
        c.lineTo(sw.hinge.x + Math.cos(sw.a1) * sw.radius, sw.hinge.y + Math.sin(sw.a1) * sw.radius);
        c.strokeStyle = red ? K.red : K.text;
        c.lineWidth = px(2.5);
        c.stroke();
      }
      if (op.doorType === 'shutter') {
        // rolling shutter / garage gate: a thick dashed line across the opening
        const off = { x: -g.inward.x * g.thickness * 0.5, y: -g.inward.y * g.thickness * 0.5 };
        c.beginPath();
        c.moveTo(g.p1.x + off.x, g.p1.y + off.y);
        c.lineTo(g.p2.x + off.x, g.p2.y + off.y);
        c.setLineDash([px(6), px(3)]);
        c.strokeStyle = K.text;
        c.lineWidth = px(4);
        c.stroke();
        c.setLineDash([]);
      }
      if ((op.doorType ?? 'swing') === 'sliding') {
        const off = { x: -g.inward.x * g.thickness * 0.5, y: -g.inward.y * g.thickness * 0.5 };
        c.beginPath();
        c.moveTo(g.p1.x + off.x, g.p1.y + off.y);
        c.lineTo((g.p1.x + g.p2.x) / 2 + off.x + g.inward.x * px(3), (g.p1.y + g.p2.y) / 2 + off.y + g.inward.y * px(3));
        c.moveTo(g.p2.x + off.x, g.p2.y + off.y);
        c.lineTo((g.p1.x + g.p2.x) / 2 + off.x - g.inward.x * px(3), (g.p1.y + g.p2.y) / 2 + off.y - g.inward.y * px(3));
        c.strokeStyle = K.text;
        c.lineWidth = px(3);
        c.stroke();
      }
    }
    if (selected) {
      pathPoly(c, g.cut);
      c.strokeStyle = K.select;
      c.lineWidth = px(3);
      c.stroke();
    }
  }

  // ---------- items: rugs under, then furniture, then ceiling items ----------
  const order = { under: 0, floor: 1, ceiling: 2 } as const;
  // lower things first, so a suitcase on a cupboard is drawn on top of it
  const items = [...floor.items].sort((a, b) => order[itemMount(a)] - order[itemMount(b)] || itemElevation(a) - itemElevation(b));
  for (const it of items) {
    const red = !s.clean && !!s.warnings?.red.has(it.id);
    const yellow = !s.clean && !red && !!s.warnings?.yellow.has(it.id);
    if (itemElevation(it) > 30 && itemMount(it) === 'floor') {
      // soft shadow so stacked things look like they sit on top
      c.save();
      c.shadowColor = 'rgba(0,0,0,0.35)';
      c.shadowBlur = 8;
      c.shadowOffsetY = 2;
      drawItem(c, it, z, K, red, yellow);
      c.restore();
      const e = itemElevation(it);
      const top = itemPoly({ ...it, shape: 'rect' });
      const tr = top.reduce((m, q) => (q.x - q.y > m.x - m.y ? q : m), top[0]);
      if (Math.min(it.width, it.depth) * z > 14) badge(c, `↑ ${formatLength(e, s.unit)}`, tr.x, tr.y, z, K);
    } else drawItem(c, it, z, K, red, yellow);
  }

  // ---------- room labels & sizes ----------
  const holes = stairOpenings(s.floorBelow).map((so) => so.item);
  for (const { room: r, depth } of levels) {
    const fillC = K.kinds[kindOf(r)] ?? K.roomFill;
    const kids = childrenOf(floor, r);
    // A room with rooms inside it (e.g. the Hall) shows its free parts, like 6′ × 10′ + 6′ × 2′.
    const parts = kids.length ? freeRects(r, childBlocks(floor, r)).sort((a, b) => rectArea(b) - rectArea(a)) : [];
    if (kids.length) {
      if (parts.length > 1) {
        c.setLineDash([px(4), px(4)]);
        c.strokeStyle = K.label;
        c.globalAlpha = 0.35;
        c.lineWidth = px(1);
        for (const b of parts) c.strokeRect(b.minX, b.minY, b.maxX - b.minX, b.maxY - b.minY);
        c.globalAlpha = 1;
        c.setLineDash([]);
      }
      parts.forEach((b, i) => {
        const w = b.maxX - b.minX;
        const h = b.maxY - b.minY;
        if (w * z < 60 || h * z < 22) return;
        const cx = b.minX + w / 2;
        const cy = b.minY + h / 2;
        const size = `${formatLength(w, s.unit)} × ${formatLength(h, s.unit)}`;
        if (i === 0 && h * z > 44) {
          label(c, r.name, cx, cy - px(8), px(13), K.label, fillC, 650);
          label(c, size, cx, cy + px(8), px(11), K.label, fillC, 500);
        } else label(c, i === 0 ? `${r.name} · ${size}` : size, cx, cy, px(11), K.label, fillC, 500);
      });
    } else if (r.width * z > 70 && r.length * z > 44) {
      const occupied = [...floor.items, ...holes].some(
        (it) => itemMount(it) !== 'under' && Math.abs(it.x - (r.x + r.width / 2)) < it.width / 2 + px(30) && Math.abs(it.y - (r.y + r.length / 2)) < it.depth / 2 + px(14),
      );
      // put the label at the top of the room if furniture sits in the middle
      const cy = occupied ? r.y + px(22) : r.y + r.length / 2;
      label(c, r.name, r.x + r.width / 2, cy - px(8), px(13), K.label, fillC, 650);
      label(c, `${formatLength(r.width, s.unit)} × ${formatLength(r.length, s.unit)}`, r.x + r.width / 2, cy + px(8), px(11), K.label, fillC, 500);
    }
    if (s.showDims && depth === 0) {
      const t = floor.outerWallMm;
      label(c, formatLength(r.width, s.unit), r.x + r.width / 2, r.y - t - px(10), px(11.5), K.text, K.bg);
      c.save();
      c.translate(r.x - t - px(10), r.y + r.length / 2);
      c.rotate(-Math.PI / 2);
      label(c, formatLength(r.length, s.unit), 0, 0, px(11.5), K.text, K.bg);
      c.restore();
    }
  }

  // ---------- walking-space lines ----------
  if (!s.clean && s.warnings) {
    for (const l of s.warnings.clearLines) {
      c.beginPath();
      c.moveTo(l.a.x, l.a.y);
      c.lineTo(l.b.x, l.b.y);
      c.setLineDash([px(4), px(3)]);
      c.strokeStyle = K.yellow;
      c.lineWidth = px(2);
      c.stroke();
      c.setLineDash([]);
      label(c, formatLength(l.gap, s.unit), (l.a.x + l.b.x) / 2, (l.a.y + l.b.y) / 2, px(11), K.yellow, K.roomFill, 700);
    }
  }

  // ---------- selection ----------
  if (!s.clean && s.selection) {
    const sel = s.selection;
    if (sel.kind === 'room') {
      const r = floor.rooms.find((x) => x.id === sel.id);
      if (r) {
        c.setLineDash([px(8), px(5)]);
        c.strokeStyle = K.select;
        c.lineWidth = px(2.5);
        c.strokeRect(r.x, r.y, r.width, r.length);
        c.setLineDash([]);
      }
    } else if (sel.kind === 'item') {
      const it = floor.items.find((x) => x.id === sel.id);
      if (it) {
        // distances to walls
        if (s.showDims) {
          for (const d of wallDistances(floor, it)) dimLine(c, d.a, d.b, formatLength(d.value, s.unit), z, K.select, K.roomFill);
        }
        pathPoly(c, itemPoly(it));
        c.strokeStyle = K.select;
        c.lineWidth = px(2.5);
        c.stroke();
        if (!it.locked) {
          const h = rotationHandle(it, z);
          const top = itemPoly({ ...it, shape: 'rect' });
          const mid = { x: (top[0].x + top[1].x) / 2, y: (top[0].y + top[1].y) / 2 };
          c.beginPath();
          c.moveTo(mid.x, mid.y);
          c.lineTo(h.x, h.y);
          c.lineWidth = px(1.5);
          c.stroke();
          c.beginPath();
          c.arc(h.x, h.y, px(9), 0, Math.PI * 2);
          c.fillStyle = K.roomFill;
          c.fill();
          c.lineWidth = px(2);
          c.stroke();
          // little rotate arrow
          c.beginPath();
          c.arc(h.x, h.y, px(4.5), -Math.PI * 0.9, Math.PI * 0.4);
          c.lineWidth = px(1.6);
          c.stroke();
        }
      }
    }
  }

  // ---------- snap guides ----------
  if (s.guides?.length) {
    c.strokeStyle = K.guide;
    c.lineWidth = px(1.2);
    c.setLineDash([px(4), px(3)]);
    c.beginPath();
    for (const g of s.guides) {
      c.moveTo(g.x1, g.y1);
      c.lineTo(g.x2, g.y2);
    }
    c.stroke();
    c.setLineDash([]);
  }

  // ---------- measurements ----------
  const ms = [...(s.measurements ?? [])];
  if (s.measureDraft?.b) ms.push({ a: s.measureDraft.a, b: s.measureDraft.b });
  for (const m of ms) {
    const d = Math.hypot(m.b.x - m.a.x, m.b.y - m.a.y);
    dimLine(c, m.a, m.b, formatLength(d, s.unit), z, K.measure, K.roomFill, true);
  }
  if (s.measureDraft && !s.measureDraft.b) {
    c.beginPath();
    c.arc(s.measureDraft.a.x, s.measureDraft.a.y, px(5), 0, Math.PI * 2);
    c.fillStyle = K.measure;
    c.fill();
  }

  c.restore();
}

function dimLine(c: CanvasRenderingContext2D, a: Pt, b: Pt, text: string, z: number, color: string, halo: string, endDots = false) {
  const px = (n: number) => n / z;
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  if (len * z < 4) return;
  const nx = -(b.y - a.y) / len;
  const ny = (b.x - a.x) / len;
  c.beginPath();
  c.moveTo(a.x, a.y);
  c.lineTo(b.x, b.y);
  const tick = px(5);
  c.moveTo(a.x - nx * tick, a.y - ny * tick);
  c.lineTo(a.x + nx * tick, a.y + ny * tick);
  c.moveTo(b.x - nx * tick, b.y - ny * tick);
  c.lineTo(b.x + nx * tick, b.y + ny * tick);
  c.strokeStyle = color;
  c.lineWidth = px(1.5);
  c.stroke();
  if (endDots) {
    for (const p of [a, b]) {
      c.beginPath();
      c.arc(p.x, p.y, px(3.5), 0, Math.PI * 2);
      c.fillStyle = color;
      c.fill();
    }
  }
  if (len * z > 34) label(c, text, (a.x + b.x) / 2, (a.y + b.y) / 2, px(11), color, halo, 700);
}

/** One piece of furniture, drawn in its own rotated space. */
export function drawItem(c: CanvasRenderingContext2D, it: Item, z: number, K: Palette, red: boolean, yellow: boolean) {
  const px = (n: number) => n / z;
  const w = it.width;
  const d = it.depth;
  const L = -w / 2;
  const T = -d / 2;
  const mount = itemMount(it);
  const base = it.color || '#999999';
  const stroke = red ? K.red : yellow ? K.yellow : shade(base, -0.35);
  const fill = withAlpha(base, mount === 'under' ? 0.45 : 0.88);

  c.save();
  c.translate(it.x, it.y);
  c.rotate((it.rotation * Math.PI) / 180);

  const outline = () => {
    if (it.shape === 'round') {
      c.beginPath();
      c.ellipse(0, 0, w / 2, d / 2, 0, 0, Math.PI * 2);
    } else {
      roundRect(c, L, T, w, d, it.type.startsWith('car-') ? Math.min(w, d) * 0.22 : Math.min(px(4), w * 0.08, d * 0.08));
    }
  };

  if (isStairs(it)) {
    const sd = stairDrawing(it);
    for (const o of sd.outlines) {
      pathPoly(c, o);
      c.fillStyle = fill;
      c.fill();
    }
    c.beginPath();
    for (const [a, b] of sd.steps) {
      c.moveTo(a.x, a.y);
      c.lineTo(b.x, b.y);
    }
    c.strokeStyle = shade(base, -0.4);
    c.lineWidth = px(1.2);
    c.stroke();
    for (const o of sd.outlines) {
      pathPoly(c, o);
      c.strokeStyle = stroke;
      c.lineWidth = px(red || yellow ? 3 : 1.5);
      c.stroke();
    }
    // walking line + arrow head
    c.beginPath();
    sd.arrow.forEach((p, i) => (i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)));
    c.strokeStyle = K.text;
    c.lineWidth = px(1.8);
    c.stroke();
    const [p1, p2] = sd.arrow.slice(-2);
    const ang = Math.atan2(p2.y - p1.y, p2.x - p1.x);
    const ah = px(10);
    c.beginPath();
    c.moveTo(p2.x, p2.y);
    c.lineTo(p2.x - Math.cos(ang - 0.45) * ah, p2.y - Math.sin(ang - 0.45) * ah);
    c.lineTo(p2.x - Math.cos(ang + 0.45) * ah, p2.y - Math.sin(ang + 0.45) * ah);
    c.closePath();
    c.fillStyle = K.text;
    c.fill();
    c.restore();
    if (w * z > 40) label(c, 'UP', it.x, it.y, px(11), K.text, withAlpha(base, 0.9), 800);
    return;
  }

  // body
  outline();
  if (mount === 'ceiling') {
    c.setLineDash([px(5), px(4)]);
    c.strokeStyle = stroke;
    c.lineWidth = px(red || yellow ? 3 : 1.5);
    c.stroke();
    c.setLineDash([]);
    // fan blades
    c.beginPath();
    for (let i = 0; i < 3; i++) {
      const a = (i * Math.PI * 2) / 3 - Math.PI / 2;
      c.moveTo(0, 0);
      c.lineTo((Math.cos(a) * w) / 2.3, (Math.sin(a) * d) / 2.3);
    }
    c.lineWidth = px(5);
    c.strokeStyle = withAlpha(base, 0.9);
    c.lineCap = 'round';
    c.stroke();
    c.lineCap = 'butt';
    c.beginPath();
    c.arc(0, 0, Math.min(w, d) * 0.07, 0, Math.PI * 2);
    c.fillStyle = shade(base, -0.3);
    c.fill();
  } else {
    c.fillStyle = fill;
    c.fill();
    if (red) {
      outline();
      c.fillStyle = withAlpha(K.red, 0.28);
      c.fill();
    }
    if (mount === 'under') c.setLineDash([px(6), px(4)]);
    outline();
    c.strokeStyle = stroke;
    c.lineWidth = px(red || yellow ? 3 : 1.5);
    c.stroke();
    c.setLineDash([]);

    // legs: small dots in the corners when there's open space underneath
    if (itemOpenBelow(it) > 0 && it.shape === 'rect') {
      const r = Math.max(px(2), Math.min(w, d) * 0.035);
      const ix = w / 2 - r * 1.8;
      const iy = d / 2 - r * 1.8;
      c.fillStyle = shade(base, -0.45);
      for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        c.beginPath();
        c.arc(sx * ix, sy * iy, r, 0, Math.PI * 2);
        c.fill();
      }
    }
    // simple details so items are recognisable from above
    const detail = shade(base, -0.25);
    c.strokeStyle = detail;
    c.fillStyle = withAlpha('#ffffff', 0.55);
    c.lineWidth = px(1.2);
    const type = it.type;
    if (type.startsWith('bed-')) {
      const pillows = w > 1200 ? 2 : 1;
      const pw = (w - px(4) * (pillows + 1)) / pillows;
      for (let i = 0; i < pillows; i++) {
        roundRect(c, L + px(4) + i * (pw + px(4)), T + px(4), pw, Math.min(d * 0.16, 380), px(3));
        c.fill();
        c.stroke();
      }
      // blanket fold
      c.beginPath();
      c.moveTo(L, T + d * 0.32);
      c.lineTo(L + w, T + d * 0.32);
      c.stroke();
      if (type === 'bed-bunk') {
        c.beginPath();
        c.moveTo(L, T + d * 0.32);
        c.lineTo(L + w, T + d);
        c.moveTo(L + w, T + d * 0.32);
        c.lineTo(L, T + d);
        c.stroke();
      }
    } else if (type.startsWith('car-')) {
      // windscreen at the front (top edge), rear window, side mirrors
      c.fillStyle = 'rgba(30,40,55,0.45)';
      c.beginPath();
      c.moveTo(L + w * 0.14, T + d * 0.25);
      c.lineTo(L + w * 0.86, T + d * 0.25);
      c.lineTo(L + w * 0.8, T + d * 0.36);
      c.lineTo(L + w * 0.2, T + d * 0.36);
      c.closePath();
      c.fill();
      c.beginPath();
      c.moveTo(L + w * 0.2, T + d * 0.8);
      c.lineTo(L + w * 0.8, T + d * 0.8);
      c.lineTo(L + w * 0.86, T + d * 0.88);
      c.lineTo(L + w * 0.14, T + d * 0.88);
      c.closePath();
      c.fill();
      c.fillStyle = shade(base, -0.3);
      c.fillRect(L - w * 0.06, T + d * 0.3, w * 0.07, d * 0.035);
      c.fillRect(L + w * 0.99, T + d * 0.3, w * 0.07, d * 0.035);
      c.strokeStyle = shade(base, -0.35);
      c.beginPath();
      c.moveTo(L + w * 0.12, T + d * 0.45);
      c.lineTo(L + w * 0.12, T + d * 0.75);
      c.moveTo(L + w * 0.88, T + d * 0.45);
      c.lineTo(L + w * 0.88, T + d * 0.75);
      c.stroke();
    } else if (type === 'motorbike' || type === 'scooter' || type === 'bicycle') {
      c.strokeStyle = shade(base, -0.45);
      c.lineWidth = Math.max(px(1.5), w * 0.06);
      c.beginPath();
      c.moveTo(L + w * 0.1, T + d * 0.12);
      c.lineTo(L + w * 0.9, T + d * 0.12);
      c.moveTo(0, T + d * 0.05);
      c.lineTo(0, T + d * 0.95);
      c.stroke();
    } else if (type === 'toilet') {
      c.beginPath();
      c.ellipse(0, T + d * 0.6, w * 0.38, d * 0.32, 0, 0, Math.PI * 2);
      c.stroke();
      roundRect(c, L, T, w, d * 0.22, px(2));
      c.stroke();
    } else if (type === 'basin') {
      c.beginPath();
      c.ellipse(0, T + d * 0.55, w * 0.36, d * 0.3, 0, 0, Math.PI * 2);
      c.stroke();
    } else if (type === 'shower') {
      c.beginPath();
      c.arc(0, 0, Math.min(w, d) * 0.08, 0, Math.PI * 2);
      c.moveTo(L, T);
      c.lineTo(L + w, T + d);
      c.moveTo(L + w, T);
      c.lineTo(L, T + d);
      c.stroke();
    } else if (type === 'washing-machine') {
      c.beginPath();
      c.arc(0, 0, Math.min(w, d) * 0.3, 0, Math.PI * 2);
      c.stroke();
    } else if (type === 'sofa') {
      roundRect(c, L, T, w, d * 0.28, px(3));
      c.stroke();
      roundRect(c, L, T, w * 0.12, d, px(3));
      c.stroke();
      roundRect(c, L + w * 0.88, T, w * 0.12, d, px(3));
      c.stroke();
    } else if (type === 'chair') {
      roundRect(c, L, T, w, d * 0.22, px(2));
      c.stroke();
    } else if (type === 'cupboard' || type === 'drawers' || type === 'tv-unit' || type === 'shoe-rack') {
      c.beginPath();
      c.moveTo(L, T + d * 0.85);
      c.lineTo(L + w, T + d * 0.85);
      if (type === 'cupboard') {
        c.moveTo(0, T + d * 0.85);
        c.lineTo(0, T + d);
      }
      c.stroke();
    } else if (type === 'bookshelf' || type === 'shelf') {
      c.beginPath();
      for (let i = 1; i < 4; i++) {
        c.moveTo(L + (w * i) / 4, T);
        c.lineTo(L + (w * i) / 4, T + d);
      }
      c.stroke();
    } else if (type === 'fridge') {
      c.beginPath();
      c.moveTo(L, T + d * 0.85);
      c.lineTo(L + w, T + d * 0.85);
      c.stroke();
    } else if (type === 'stove') {
      for (const fx of [-0.25, 0.25]) {
        c.beginPath();
        c.arc(fx * w, 0, Math.min(w, d) * 0.16, 0, Math.PI * 2);
        c.stroke();
      }
    } else if (type === 'dining-table') {
      // chairs around
      const cs = Math.min(450, d * 0.4);
      c.strokeStyle = shade(base, -0.4);
      for (const fx of [-0.25, 0.25]) {
        roundRect(c, fx * w - cs / 2, T - cs * 0.7, cs, cs * 0.6, px(2));
        c.stroke();
        roundRect(c, fx * w - cs / 2, T + d + cs * 0.1, cs, cs * 0.6, px(2));
        c.stroke();
      }
    } else if (type === 'bathroom') {
      c.beginPath();
      c.ellipse(L + w * 0.3, T + d * 0.25, w * 0.12, d * 0.09, 0, 0, Math.PI * 2);
      c.stroke();
      roundRect(c, L + w * 0.55, T + px(6), w * 0.38, d * 0.18, px(3));
      c.stroke();
    } else if (type === 'pillar') {
      c.beginPath();
      c.moveTo(L, T);
      c.lineTo(L + w, T + d);
      c.moveTo(L + w, T);
      c.lineTo(L, T + d);
      c.stroke();
    }
  }
  c.restore();

  // label (always upright)
  const minSide = Math.min(w, d) * z;
  const maxSide = Math.max(w, d) * z;
  if (maxSide > 46 && minSide > 18) {
    const fs = Math.max(9, Math.min(12.5, minSide / 3));
    const name = it.label.length > 18 ? it.label.slice(0, 17) + '…' : it.label;
    label(c, name, it.x, it.y, fs / z, K.text, withAlpha(base, 0.9), 650);
  }
}


/** Floor of one room, tinted by its kind (bathroom tiles, parking bays…). */
function drawRoomFloor(c: CanvasRenderingContext2D, r: Room, K: Palette, z: number) {
  const kind = kindOf(r);
  c.fillStyle = K.kinds[kind] ?? K.roomFill;
  c.fillRect(r.x, r.y, r.width, r.length);
  if (kind === 'bathroom' && 300 * z > 6) {
    // 1 ft tiles
    c.save();
    c.beginPath();
    c.rect(r.x, r.y, r.width, r.length);
    c.clip();
    c.beginPath();
    for (let x = r.x + 300; x < r.x + r.width; x += 300) {
      c.moveTo(x, r.y);
      c.lineTo(x, r.y + r.length);
    }
    for (let y = r.y + 300; y < r.y + r.length; y += 300) {
      c.moveTo(r.x, y);
      c.lineTo(r.x + r.width, y);
    }
    c.strokeStyle = 'rgba(90,140,180,0.25)';
    c.lineWidth = 1 / z;
    c.stroke();
    c.restore();
  } else if (kind === 'balcony') {
    c.save();
    c.beginPath();
    c.rect(r.x, r.y, r.width, r.length);
    c.clip();
    c.beginPath();
    for (let x = r.x; x < r.x + r.width; x += 150) {
      c.moveTo(x, r.y);
      c.lineTo(x, r.y + r.length);
    }
    c.strokeStyle = 'rgba(110,150,100,0.18)';
    c.lineWidth = 1 / z;
    c.stroke();
    c.restore();
  }
}

/** Small pill label, e.g. the height of a stacked item. */
function badge(c: CanvasRenderingContext2D, text: string, x: number, y: number, z: number, K: Palette) {
  const fs = 10.5 / z;
  c.font = `700 ${fs}px ${FONT}`;
  const w = c.measureText(text).width + 8 / z;
  const h = fs + 6 / z;
  c.fillStyle = K.select;
  roundRect(c, x - w / 2, y - h / 2, w, h, h / 2);
  c.fill();
  c.fillStyle = '#ffffff';
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText(text, x, y + 0.5 / z);
}
