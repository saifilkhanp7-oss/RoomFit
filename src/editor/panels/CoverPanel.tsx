import { Trash2 } from 'lucide-react';
import type { Cover, Unit } from '../../model/types';
import { LengthInput } from '../../components/LengthInput';
import { formatLength } from '../../model/units';
import { HEADROOM } from '../../geometry/warnings';
import './panels.css';

interface Props {
  cover: Cover;
  unit: Unit;
  headroom: number;
  onChange: (patch: Partial<Cover>) => void;
  onDelete: () => void;
}

/** A piece of floor over the stairs: its size, and the head room left on the stairs below it. */
export function CoverPanel({ cover, unit, headroom, onChange, onDelete }: Props) {
  const ok = headroom >= HEADROOM;
  return (
    <div className="opening-panel">
      <div className="row">
        <LengthInput id="cv-w" label="Width" unit={unit} valueMm={cover.width} min={100} max={50000} onChange={(width) => onChange({ width })} />
        <LengthInput id="cv-l" label="Length" unit={unit} valueMm={cover.length} min={100} max={50000} onChange={(length) => onChange({ length })} />
      </div>
      <div className={`headroom ${ok ? 'ok' : 'no'}`} role="status">
        {isFinite(headroom) ? (
          <>
            Head room on the stairs under it: <strong>{formatLength(Math.max(0, headroom), unit)}</strong>
            {ok ? ' ✓' : ` — less than ${formatLength(HEADROOM, unit)}, people may hit their head.`}
          </>
        ) : (
          'No stairs under it.'
        )}
      </div>
      <p className="hint">The floor goes over the low end of the stairs, where there's space above people's heads. Drag it to move, or its corner circle to resize.</p>
      <button className="btn danger-outline btn-block" onClick={onDelete}>
        <Trash2 size={17} /> Delete floor over stairs
      </button>
    </div>
  );
}
