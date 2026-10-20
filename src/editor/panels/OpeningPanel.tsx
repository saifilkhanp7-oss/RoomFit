import type { Floor, Opening, Unit } from '../../model/types';
import { LengthInput } from '../../components/LengthInput';
import { Trash2 } from 'lucide-react';
import { DEFAULT_SILL, DEFAULT_WINDOW_H } from '../../geometry/warnings';
import { neighbors, sideLine } from '../../geometry/walls';
import './panels.css';

interface Props {
  opening: Opening;
  floor: Floor;
  unit: Unit;
  heights: boolean;
  onChange: (patch: Partial<Opening>) => void;
  onDelete: () => void;
}

export function OpeningPanel({ opening: op, floor, unit, heights, onChange, onDelete }: Props) {
  const room = floor.rooms.find((r) => r.id === op.roomId);
  const wallLen = room ? sideLine(room, op.side).length : 10000;
  const otherRoom = room
    ? neighbors(floor, room).find((n) => {
        if (n.side !== op.side) return false;
        const start = op.side === 'top' || op.side === 'bottom' ? room.x : room.y;
        return n.from < start + op.offsetMm + op.widthMm && n.to > start + op.offsetMm;
      })?.room
    : undefined;
  const sideName = { top: 'top', bottom: 'bottom', left: 'left', right: 'right' }[op.side];

  return (
    <div className="opening-panel">
      <p className="hint" style={{ marginTop: -6, marginBottom: 14 }}>
        On the {sideName} wall of {room?.name ?? 'room'}
        {otherRoom ? `, between ${room?.name} and ${otherRoom.name}` : ''}.
      </p>
      <div className="row">
        <LengthInput id="op-w" label="Width" unit={unit} valueMm={op.widthMm} min={300} max={wallLen} onChange={(widthMm) => onChange({ widthMm })} />
        <LengthInput
          id="op-off"
          label={op.side === 'top' || op.side === 'bottom' ? 'From left corner' : 'From top corner'}
          unit={unit}
          valueMm={op.offsetMm}
          min={0}
          max={Math.max(0, wallLen - op.widthMm)}
          onChange={(offsetMm) => onChange({ offsetMm })}
        />
      </div>

      {op.kind === 'door' && (
        <>
          <div className="field">
            <span className="field-label">Door type</span>
            <div className="segmented small" role="group" aria-label="Door type">
              {(
                [
                  ['swing', 'Single'],
                  ['double', 'Double'],
                  ['sliding', 'Sliding'],
                  ['shutter', 'Shutter'],
                  ['opening', 'No door'],
                ] as const
              ).map(([v, l]) => (
                <button key={v} aria-pressed={(op.doorType ?? 'swing') === v} onClick={() => onChange({ doorType: v })}>
                  {l}
                </button>
              ))}
            </div>
          </div>
          {(op.doorType ?? 'swing') === 'swing' && (
            <div className="field">
              <span className="field-label">Hinge side</span>
              <div className="segmented" role="group" aria-label="Hinge side">
                <button aria-pressed={(op.hinge ?? 'start') === 'start'} onClick={() => onChange({ hinge: 'start' })}>
                  {op.side === 'top' || op.side === 'bottom' ? 'Left' : 'Top'}
                </button>
                <button aria-pressed={op.hinge === 'end'} onClick={() => onChange({ hinge: 'end' })}>
                  {op.side === 'top' || op.side === 'bottom' ? 'Right' : 'Bottom'}
                </button>
              </div>
            </div>
          )}
          {['swing', 'double'].includes(op.doorType ?? 'swing') && (
            <div className="field">
              <span className="field-label">Opens into</span>
              <div className="segmented" role="group" aria-label="Opens into">
                <button aria-pressed={(op.opensInto ?? 'this') === 'this'} onClick={() => onChange({ opensInto: 'this' })}>
                  {room?.name ?? 'This room'}
                </button>
                <button aria-pressed={op.opensInto === 'other'} onClick={() => onChange({ opensInto: 'other' })}>
                  {otherRoom ? otherRoom.name : 'Outside'}
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {op.kind === 'window' && heights && (
        <div className="row">
          <LengthInput id="op-sill" label="Height from floor" unit={unit} valueMm={op.sillMm ?? DEFAULT_SILL} min={0} max={5000} onChange={(sillMm) => onChange({ sillMm })} />
          <LengthInput id="op-h" label="Window height" unit={unit} valueMm={op.heightMm ?? DEFAULT_WINDOW_H} min={100} max={5000} onChange={(heightMm) => onChange({ heightMm })} />
        </div>
      )}

      <p className="hint" style={{ marginTop: -4, marginBottom: 12 }}>Tip: drag it along the wall on the plan.</p>
      <button className="btn danger-outline btn-block" onClick={onDelete}>
        <Trash2 size={17} /> Delete {op.kind}
      </button>
    </div>
  );
}
