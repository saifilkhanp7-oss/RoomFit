import { Trash2 } from 'lucide-react';
import type { PowerPoint, Unit } from '../../model/types';
import { LengthInput } from '../../components/LengthInput';
import { POWER_KINDS, kindInfo } from '../../geometry/power';
import './panels.css';

interface Props {
  point: PowerPoint;
  unit: Unit;
  onChange: (patch: Partial<PowerPoint>) => void;
  onDelete: () => void;
}

export function PointPanel({ point, unit, onChange, onDelete }: Props) {
  const info = kindInfo(point.kind);
  return (
    <div className="opening-panel">
      <div className="field">
        <span className="field-label">What is it</span>
        <div className="preset-row" role="group" aria-label="Kind">
          {POWER_KINDS.map((k) => (
            <button key={k.kind} className="chip" aria-pressed={point.kind === k.kind} onClick={() => onChange({ kind: k.kind, heightMm: undefined })}>
              {k.label}
            </button>
          ))}
        </div>
        <p className="hint" style={{ marginTop: 2 }}>{info.note}.</p>
      </div>
      <LengthInput id="pt-h" label="Height from floor" unit={unit} valueMm={point.heightMm ?? info.heightMm} min={0} max={5000} onChange={(heightMm) => onChange({ heightMm })} />
      <p className="hint">
        Drag it along the wall on the plan. Things that need electricity (study table, TV, fridge, AC, geyser…) get a warning when they're too far from a plug, with the extension cord length to buy.
      </p>
      <button className="btn danger-outline btn-block" onClick={onDelete}>
        <Trash2 size={17} /> Delete
      </button>
    </div>
  );
}
