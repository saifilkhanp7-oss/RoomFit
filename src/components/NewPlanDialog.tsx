import { useState } from 'react';
import { Building2, Square } from 'lucide-react';
import { Dialog } from './Dialog';
import { LengthInput } from './LengthInput';
import { useAppStore } from '../store/useAppStore';
import { navigate } from '../router';
import { MM_PER_FOOT } from '../model/units';
import type { Unit } from '../model/types';

export function NewPlanDialog({ onClose }: { onClose: () => void }) {
  const createHome = useAppStore((s) => s.createHome);
  const savedUnit = useAppStore((s) => s.data.settings.unit);

  const [name, setName] = useState('My Room');
  const [kind, setKind] = useState<'single' | 'multi'>('single');
  const [floors, setFloors] = useState(2);
  const [unit, setUnit] = useState<Unit>(savedUnit);
  const [roomName, setRoomName] = useState('Bedroom');
  const [width, setWidth] = useState(Math.round(12 * MM_PER_FOOT));
  const [length, setLength] = useState(Math.round(10 * MM_PER_FOOT));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const { homeId, layoutId } = createHome({
      name: name.trim() || 'My Room',
      kind,
      floorCount: floors,
      roomName: roomName.trim() || 'Room',
      roomWidth: width,
      roomLength: length,
      unit,
    });
    onClose();
    // Ask the browser to keep our storage (helps against Safari clearing it).
    navigator.storage?.persist?.().catch(() => {});
    navigate(`/edit/${homeId}/${layoutId}`);
  };

  return (
    <Dialog title="New plan" subtitle="You can change all of this later." onClose={onClose}>
      <form onSubmit={submit}>
        <div className="field">
          <label htmlFor="home-name">Name</label>
          <input
            id="home-name"
            className="input"
            value={name}
            maxLength={60}
            placeholder="e.g. Hostel Room 204"
            onChange={(e) => setName(e.target.value)}
            onFocus={(e) => e.target.select()}
          />
        </div>

        <div className="field">
          <span className="field-label">Type</span>
          <div className="kind-picker">
            <button
              type="button"
              aria-pressed={kind === 'single'}
              onClick={() => setKind('single')}
              className="kind-option"
            >
              <Square size={22} />
              <strong>Single floor</strong>
              <span>Hostel room, flat</span>
            </button>
            <button
              type="button"
              aria-pressed={kind === 'multi'}
              onClick={() => setKind('multi')}
              className="kind-option"
            >
              <Building2 size={22} />
              <strong>Multi-floor</strong>
              <span>House with stairs</span>
            </button>
          </div>
        </div>

        {kind === 'multi' && (
          <div className="field">
            <span className="field-label">Number of floors</span>
            <div className="segmented" role="group" aria-label="Number of floors">
              {[2, 3, 4, 5].map((n) => (
                <button type="button" key={n} aria-pressed={floors === n} onClick={() => setFloors(n)}>
                  {n}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="field">
          <span className="field-label">Units</span>
          <div className="segmented" role="group" aria-label="Units">
            <button type="button" aria-pressed={unit === 'ft'} onClick={() => setUnit('ft')}>
              Feet
            </button>
            <button type="button" aria-pressed={unit === 'm'} onClick={() => setUnit('m')}>
              Meters
            </button>
          </div>
        </div>

        <div className="field">
          <label htmlFor="room-name">{kind === 'multi' ? 'First room (ground floor)' : 'First room'}</label>
          <input
            id="room-name"
            className="input"
            value={roomName}
            maxLength={40}
            onChange={(e) => setRoomName(e.target.value)}
          />
        </div>
        <div className="row">
          <LengthInput label="Width" unit={unit} valueMm={width} onChange={setWidth} min={300} max={50000} />
          <LengthInput label="Length" unit={unit} valueMm={length} onChange={setLength} min={300} max={50000} />
        </div>

        <div className="dialog-actions">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary">
            Start planning
          </button>
        </div>
      </form>
    </Dialog>
  );
}
