import type { Floor, PowerKind, PowerPoint, Room, Unit } from '../model/types';
import type { Pt } from './poly';
import { sideLine } from './walls';
import { fi } from '../model/catalog';

export const POWER_KINDS: { kind: PowerKind; label: string; short: string; heightMm: number; givesPower: boolean; note: string }[] = [
  { kind: 'board', label: 'Switchboard', short: 'Board', heightMm: fi(4), givesPower: true, note: 'Switches with a plug point' },
  { kind: 'socket', label: 'Plug point', short: 'Plug', heightMm: fi(1), givesPower: true, note: 'Just a socket, low on the wall' },
  { kind: 'power', label: 'Power point (16A)', short: '16A', heightMm: fi(1), givesPower: true, note: 'For AC (put it high, next to the AC), fridge, geyser, washing machine' },
  { kind: 'switch', label: 'Switches only', short: 'Switch', heightMm: fi(4), givesPower: false, note: 'Light and fan switches, no plug' },
];
export const kindInfo = (k: PowerKind) => POWER_KINDS.find((x) => x.kind === k)!;

/** Where it is: a point on the inside face of the room's wall. */
export function pointPos(floor: Floor, p: PowerPoint): { pos: Pt; inward: Pt; room: Room; along: Pt } | null {
  const room = floor.rooms.find((r) => r.id === p.roomId);
  if (!room) return null;
  const line = sideLine(room, p.side);
  const off = Math.max(0, Math.min(line.length, p.offsetMm));
  const dir = { x: (line.b.x - line.a.x) / line.length, y: (line.b.y - line.a.y) / line.length };
  return { pos: { x: line.a.x + dir.x * off, y: line.a.y + dir.y * off }, inward: line.inward, room, along: dir };
}

export function hitPoint(floor: Floor, q: Pt, tol: number): PowerPoint | undefined {
  for (const p of [...(floor.points ?? [])].reverse()) {
    const g = pointPos(floor, p);
    if (!g) continue;
    const c = { x: g.pos.x + g.inward.x * 90, y: g.pos.y + g.inward.y * 90 };
    if (Math.hypot(q.x - c.x, q.y - c.y) <= tol + 110) return p;
  }
  return undefined;
}

/** Common extension cord lengths, in the user's units. */
const CORDS = { ft: [6, 10, 15, 25, 50].map((f) => fi(f)), m: [1500, 3000, 5000, 10000, 15000] };
export function cordFor(distMm: number, unit: Unit): number | null {
  const need = distMm + 300; // a little slack to reach the plug
  return CORDS[unit].find((c) => c >= need) ?? null;
}
export function cordText(mm: number, unit: Unit): string {
  return unit === 'ft' ? `${Math.round(mm / 304.8)} ft` : `${Math.round(mm / 100) / 10} m`;
}

export const REACH_LIGHT = fi(5); // a normal cable reaches about 5 ft
export const REACH_HEAVY = fi(4);
