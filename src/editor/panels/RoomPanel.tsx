import { WallColorPicker } from './WallColorPicker';
import { useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import type { Floor, Room, Side, Unit } from '../../model/types';
import { LengthInput } from '../../components/LengthInput';
import { formatLength, formatSmall } from '../../model/units';
import { childBlocks, neighbors } from '../../geometry/walls';
import { childrenOf, freeRects, kindOf, parentOf, rectArea } from '../../geometry/spaces';
import { KindPicker } from '../dialogs';
import { DEFAULT_CEILING } from '../../geometry/warnings';
import './panels.css';

interface Props {
  room: Room;
  floor: Floor;
  unit: Unit;
  heights: boolean;
  onChangeRoom: (patch: Partial<Room>) => void;
  onChangeFloor: (patch: Partial<Floor>) => void;
  onSharedWall: (neighborId: string, side: Side, mm: number) => void;
  onDelete?: () => void;
  idPrefix?: string;
}

export const WALL_PRESETS_MM = [114, 152, 229]; // 4.5", 6", 9"

export function RoomPanel({ room, floor, unit, heights, onChangeRoom, onChangeFloor, onSharedWall, onDelete, idPrefix = 'room' }: Props) {
  const [name, setName] = useState(room.name);
  useEffect(() => setName(room.name), [room.id, room.name]);

  const area = (room.width * room.length) / 1e6;
  const areaText = unit === 'm' ? `${area.toFixed(1)} m²` : `${Math.round(area * 10.7639)} sq ft`;
  const shared = neighbors(floor, room);
  const kids = childrenOf(floor, room);
  const parts = kids.length ? freeRects(room, childBlocks(floor, room)).sort((a, b) => rectArea(b) - rectArea(a)) : [];
  const freeArea = parts.reduce((s, b) => s + rectArea(b), 0) / 1e6;
  const fmtArea = (a: number) => (unit === 'm' ? `${a.toFixed(1)} m²` : `${Math.round(a * 10.7639)} sq ft`);
  const parent = parentOf(floor, room);

  return (
    <div className="room-panel">
      <div className="field">
        <label htmlFor={`${idPrefix}-name`}>Room name</label>
        <input
          id={`${idPrefix}-name`}
          className="input"
          value={name}
          maxLength={40}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => {
            const v = name.trim();
            if (v && v !== room.name) onChangeRoom({ name: v });
            else setName(room.name);
          }}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        />
      </div>
      <div className="field">
        <span className="field-label">Type</span>
        <KindPicker value={kindOf(room)} onChange={(kind) => onChangeRoom({ kind })} />
      </div>
      <div className="row">
        <LengthInput id={`${idPrefix}-width`} label="Width" unit={unit} valueMm={room.width} min={300} max={50000} onChange={(width) => onChangeRoom({ width })} />
        <LengthInput id={`${idPrefix}-length`} label="Length" unit={unit} valueMm={room.length} min={300} max={50000} onChange={(length) => onChangeRoom({ length })} />
      </div>
      <p className="hint" style={{ margin: '-6px 0 16px' }}>
        Inside size (wall to wall) · Floor area {areaText}
        {parent ? ` · inside ${parent.name}` : ''}
      </p>
      {kids.length > 0 && (
        <div className="free-space" role="note">
          <strong>Free floor space (without the {kids.length} room{kids.length === 1 ? '' : 's'} inside)</strong>
          <span>
            {parts.map((b) => `${formatLength(b.maxX - b.minX, unit)} × ${formatLength(b.maxY - b.minY, unit)}`).join(' + ')} · {fmtArea(freeArea)}
          </span>
        </div>
      )}

      {heights && (
        <LengthInput
          id={`${idPrefix}-ceiling`}
          label="Ceiling height"
          unit={unit}
          valueMm={room.ceilingMm ?? DEFAULT_CEILING}
          min={1800}
          max={8000}
          onChange={(ceilingMm) => onChangeRoom({ ceilingMm })}
        />
      )}

      <WallColorPicker room={room} onChange={onChangeRoom} />

      {shared.length > 0 && (
        <div className="field">
          <span className="field-label">Walls shared with other rooms</span>
          {shared.map((n) => (
            <div key={n.room.id + n.side} className="shared-wall">
              <span>
                {n.room.name} <span className="hint">({n.side}) · {formatSmall(n.gap, unit)}</span>
              </span>
              <div className="segmented" role="group" aria-label={`Wall thickness to ${n.room.name}`}>
                {WALL_PRESETS_MM.map((mm) => (
                  <button key={mm} aria-pressed={Math.abs(n.gap - mm) < 2} onClick={() => onSharedWall(n.room.id, n.side, mm)}>
                    {formatSmall(mm, unit)}
                  </button>
                ))}
              </div>
            </div>
          ))}
          <p className="hint">Changing it moves this room (and its furniture).</p>
        </div>
      )}

      <div className="field">
        <span className="field-label">Outside wall thickness (whole floor)</span>
        <div className="segmented" role="group" aria-label="Outside wall thickness">
          {WALL_PRESETS_MM.map((mm) => (
            <button key={mm} aria-pressed={floor.outerWallMm === mm} onClick={() => onChangeFloor({ outerWallMm: mm })}>
              {formatSmall(mm, unit)}
            </button>
          ))}
        </div>
      </div>
      <LengthInput
        id={`${idPrefix}-wall`}
        label="Custom outside wall"
        size="small"
        unit={unit}
        valueMm={floor.outerWallMm}
        min={0}
        max={1000}
        onChange={(outerWallMm) => onChangeFloor({ outerWallMm })}
      />
      <p className="hint" style={{ marginTop: -6 }}>
        Outside size with walls: {formatLength(room.width + floor.outerWallMm * 2, unit)} × {formatLength(room.length + floor.outerWallMm * 2, unit)}
      </p>
      {floor.rooms.length > 1 && <p className="hint">Tip: when a room is selected you can drag it on the plan.</p>}

      {onDelete && (
        <button className="btn danger-outline btn-block" style={{ marginTop: 8 }} onClick={onDelete}>
          <Trash2 size={17} /> Delete room
        </button>
      )}
    </div>
  );
}
