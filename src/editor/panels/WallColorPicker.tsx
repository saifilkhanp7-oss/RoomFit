import { useState } from 'react';
import type { Room, Side } from '../../model/types';
import './panels.css';

/** Common wall paints, light to dark. */
export const WALL_PAINTS = ['#ffffff', '#f6f1e7', '#fbe7c6', '#fff3b0', '#f6d6c8', '#f4b6b6', '#e8d5f2', '#d6e6f5', '#a8d8ea', '#d4ecdf', '#b8e0c8', '#c9c9c9', '#7d8597', '#3d405b', '#264653', '#6b4f3a'];

function Swatches({ value, onPick, label }: { value?: string; onPick: (c: string | undefined) => void; label: string }) {
  return (
    <div className="paint-row" role="group" aria-label={label}>
      <button className={`paint-sw plain${!value ? ' on' : ''}`} aria-label="No colour" aria-pressed={!value} onClick={() => onPick(undefined)}>
        ⌀
      </button>
      {WALL_PAINTS.map((c) => (
        <button key={c} className={`paint-sw${value === c ? ' on' : ''}`} style={{ background: c }} aria-label={`Colour ${c}`} aria-pressed={value === c} onClick={() => onPick(c)} />
      ))}
      <label className={`paint-sw custom${value && !WALL_PAINTS.includes(value) ? ' on' : ''}`} style={value && !WALL_PAINTS.includes(value) ? { background: value } : undefined} title="Any colour">
        <input type="color" value={value ?? '#ffffff'} aria-label="Pick any colour" onChange={(e) => onPick(e.target.value)} />
      </label>
    </div>
  );
}

const SIDE_NAMES: [Side, string][] = [
  ['top', 'Top'],
  ['right', 'Right'],
  ['bottom', 'Bottom'],
  ['left', 'Left'],
];

/** Paint for the walls of a room: all walls the same, or one wall different. */
export function WallColorPicker({ room, onChange }: { room: Room; onChange: (patch: Partial<Room>) => void }) {
  const [target, setTarget] = useState<'all' | Side>('all');
  const value = target === 'all' ? room.wallColor : room.sideColors?.[target];
  const pick = (c: string | undefined) => {
    if (target === 'all') return onChange({ wallColor: c });
    const sideColors = { ...(room.sideColors ?? {}) };
    if (c) sideColors[target] = c;
    else delete sideColors[target];
    onChange({ sideColors: Object.keys(sideColors).length ? sideColors : undefined });
  };
  return (
    <div className="field">
      <span className="field-label">Wall colour</span>
      <div className="preset-row" role="group" aria-label="Which walls">
        <button className="chip" aria-pressed={target === 'all'} onClick={() => setTarget('all')}>
          All walls
        </button>
        {SIDE_NAMES.map(([s, n]) => (
          <button key={s} className="chip" aria-pressed={target === s} onClick={() => setTarget(s)}>
            {room.sideColors?.[s] && <span className="person-dot" style={{ background: room.sideColors[s] }} />} {n} wall
          </button>
        ))}
      </div>
      <Swatches value={value} onPick={pick} label={target === 'all' ? 'Colour for all walls' : `Colour for the ${target} wall`} />
      <p className="hint" style={{ marginTop: 4 }}>
        {target === 'all' ? 'Top, right, bottom, left are as on the plan. Pick one to paint just that wall.' : `Only the ${target} wall (as on the plan). ⌀ = same as the other walls.`}
      </p>
    </div>
  );
}

export function PaintPicker({ value, onChange }: { value?: string; onChange: (c: string | undefined) => void }) {
  return (
    <div className="field">
      <span className="field-label">Colour</span>
      <Swatches value={value} onPick={onChange} label="Wall colour" />
    </div>
  );
}
