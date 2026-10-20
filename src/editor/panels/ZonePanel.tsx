import { Trash2 } from 'lucide-react';
import type { Item, Person, Unit, Zone } from '../../model/types';
import { LengthInput } from '../../components/LengthInput';
import './panels.css';

interface Props {
  zone: Zone;
  people: Person[];
  unit: Unit;
  items: Item[];
  onChange: (patch: Partial<Zone>) => void;
  onDelete: () => void;
}

/** A roommate's own space: whose it is and its size. */
export function ZonePanel({ zone, people, unit, items, onChange, onDelete }: Props) {
  const inside = items.filter((it) => it.x >= zone.x && it.x <= zone.x + zone.width && it.y >= zone.y && it.y <= zone.y + zone.length);
  const theirs = inside.filter((it) => it.owner === zone.personId).length;
  return (
    <div className="opening-panel">
      <div className="field">
        <span className="field-label">Whose space</span>
        <div className="preset-row">
          {people.map((p) => (
            <button key={p.id} className="chip person-chip" aria-pressed={zone.personId === p.id} onClick={() => onChange({ personId: p.id })}>
              <span className="person-dot" style={{ background: p.color }} /> {p.name}
            </button>
          ))}
        </div>
      </div>
      <div className="row">
        <LengthInput id="zone-w" label="Width" unit={unit} valueMm={zone.width} min={300} max={50000} onChange={(width) => onChange({ width })} />
        <LengthInput id="zone-l" label="Length" unit={unit} valueMm={zone.length} min={300} max={50000} onChange={(length) => onChange({ length })} />
      </div>
      <p className="hint">
        {inside.length} thing{inside.length === 1 ? '' : 's'} here, {theirs} of them theirs. Drag the space to move it, or its corner circle to resize.
      </p>
      <button className="btn danger-outline btn-block" onClick={onDelete}>
        <Trash2 size={17} /> Delete space
      </button>
    </div>
  );
}
