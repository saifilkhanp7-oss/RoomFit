import { PaintPicker } from './WallColorPicker';
import { RotateCw, Trash2 } from 'lucide-react';
import type { Floor, Partition, Unit } from '../../model/types';
import { LengthInput } from '../../components/LengthInput';
import { formatLength } from '../../model/units';
import { partitionAngle, partitionCeiling, partitionHeightText, partitionLength, partitionMid } from '../../geometry/partitions';
import { fi } from '../../model/catalog';
import './panels.css';

interface Props {
  wall: Partition;
  floor: Floor;
  unit: Unit;
  onChange: (patch: Partial<Partition>) => void;
  onDelete: () => void;
}

/** Settings of a wall inside a room: length, thickness and which part of the height it fills. */
export function PartitionPanel({ wall, floor, unit, onChange, onDelete }: Props) {
  const len = partitionLength(wall);
  const ceiling = partitionCeiling(floor, wall);
  const toCeiling = wall.topMm === undefined;
  const top = wall.topMm ?? ceiling;
  const fmt = (mm: number) => formatLength(mm, unit);

  const setLength = (l: number) => {
    const a = partitionAngle(wall);
    onChange({ b: { x: Math.round(wall.a.x + Math.cos(a) * l), y: Math.round(wall.a.y + Math.sin(a) * l) } });
  };
  const turn = () => {
    const m = partitionMid(wall);
    const rot = (p: { x: number; y: number }) => ({ x: Math.round(m.x - (p.y - m.y)), y: Math.round(m.y + (p.x - m.x)) });
    onChange({ a: rot(wall.a), b: rot(wall.b) });
  };
  const preset = (bottomMm: number, topMm: number | undefined) => onChange({ bottomMm, topMm });

  return (
    <div className="opening-panel">
      <div className="row">
        <LengthInput id="pw-len" label="Length" unit={unit} valueMm={Math.round(len)} min={100} max={50000} onChange={setLength} />
        <LengthInput id="pw-thick" label="Thickness" size="small" unit={unit} valueMm={wall.thicknessMm} min={20} max={1000} onChange={(thicknessMm) => onChange({ thicknessMm })} />
      </div>

      <div className="height-box">
        <span className="field-label">Height</span>
        <div className="preset-row">
          <button className="chip" aria-pressed={wall.bottomMm === 0 && toCeiling} onClick={() => preset(0, undefined)}>
            Full wall
          </button>
          <button className="chip" aria-pressed={wall.bottomMm === 0 && !toCeiling} onClick={() => preset(0, wall.topMm ?? fi(3))}>
            Half wall
          </button>
          <button className="chip" aria-pressed={wall.bottomMm > 0 && toCeiling} onClick={() => preset(wall.bottomMm > 0 ? wall.bottomMm : fi(7), undefined)}>
            From the ceiling down
          </button>
        </div>
        <div className="row">
          <LengthInput id="pw-bottom" label="Starts at (from floor)" unit={unit} valueMm={wall.bottomMm} min={0} max={Math.max(0, top - 50)} onChange={(bottomMm) => onChange({ bottomMm })} />
          <div className="field">
            <span className="field-label">Goes up to</span>
            <div className="segmented" role="group" aria-label="Top of the wall">
              <button aria-pressed={toCeiling} onClick={() => onChange({ topMm: undefined })}>
                Ceiling
              </button>
              <button aria-pressed={!toCeiling} onClick={() => onChange({ topMm: Math.min(ceiling - 50, Math.max(wall.bottomMm + 300, fi(3))) })}>
                A height
              </button>
            </div>
          </div>
        </div>
        {!toCeiling && <LengthInput id="pw-top" label="Top (from floor)" unit={unit} valueMm={top} min={wall.bottomMm + 50} max={ceiling} onChange={(topMm) => onChange({ topMm: topMm >= ceiling ? undefined : topMm })} />}
        <p className="hint">
          {partitionHeightText(floor, wall, fmt)} · {fmt(Math.max(0, top - wall.bottomMm))} of wall.{' '}
          {wall.bottomMm > 0 ? 'Things lower than the gap can go under it, like a cupboard.' : 'It stands on the floor, so no tiles under it.'}
        </p>
      </div>
      <PaintPicker value={wall.color} onChange={(color) => onChange({ color })} />
      <p className="hint">Counted in the bricks, cement, paint and tiles cost.</p>

      <div className="panel-actions">
        <button className="btn" onClick={turn}>
          <RotateCw size={17} /> Turn 90°
        </button>
        <button className="btn danger-outline" onClick={onDelete}>
          <Trash2 size={17} /> Delete wall
        </button>
      </div>
    </div>
  );
}
