import type { Floor } from '../model/types';
import { byDepth, kindOf } from '../geometry/spaces';
import { roomOuterBox, sharedWallBoxes } from '../geometry/walls';

const KIND_FILL: Record<string, string> = {
  hall: 'var(--thumb-hall, #f3ede3)',
  bathroom: '#dcedf8',
  balcony: '#e3f1dd',
  parking: '#dfe2e6',
};

/** Tiny SVG preview of a floor's rooms for the home cards. */
export function PlanThumb({ floor }: { floor?: Floor }) {
  if (!floor || floor.rooms.length === 0) {
    return <svg className="plan-thumb" viewBox="0 0 100 70" aria-hidden />;
  }
  const outer = floor.rooms.map((r) => roomOuterBox(floor, r));
  const minX = Math.min(...outer.map((b) => b.minX));
  const minY = Math.min(...outer.map((b) => b.minY));
  const maxX = Math.max(...outer.map((b) => b.maxX));
  const maxY = Math.max(...outer.map((b) => b.maxY));
  const pad = Math.max(maxX - minX, maxY - minY) * 0.08;
  const shared = sharedWallBoxes(floor);
  return (
    <svg
      className="plan-thumb"
      viewBox={`${minX - pad} ${minY - pad} ${maxX - minX + pad * 2} ${maxY - minY + pad * 2}`}
      preserveAspectRatio="xMidYMid meet"
      aria-hidden
    >
      {byDepth(floor).map(({ room: r }) => {
        const b = roomOuterBox(floor, r);
        return (
          <g key={r.id}>
            <rect x={b.minX} y={b.minY} width={b.maxX - b.minX} height={b.maxY - b.minY} fill="var(--wall)" />
            {shared.map((s, i) => (
              <rect key={i} x={s.minX} y={s.minY} width={s.maxX - s.minX} height={s.maxY - s.minY} fill="var(--wall)" />
            ))}
            <rect x={r.x} y={r.y} width={r.width} height={r.length} fill={KIND_FILL[kindOf(r)] ?? 'var(--room-fill)'} />
          </g>
        );
      })}
      {floor.items.map((it) => (
        <rect
          key={it.id}
          x={it.x - it.width / 2}
          y={it.y - it.depth / 2}
          width={it.width}
          height={it.depth}
          fill={it.color}
          opacity={0.8}
          transform={`rotate(${it.rotation} ${it.x} ${it.y})`}
        />
      ))}
    </svg>
  );
}
