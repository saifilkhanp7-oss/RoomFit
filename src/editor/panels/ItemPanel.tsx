import { useEffect, useState } from 'react';
import { Copy, Lock, RotateCcw, RotateCw, Trash2, Unlock, BookmarkPlus } from 'lucide-react';
import type { Item, Unit } from '../../model/types';
import { LengthInput } from '../../components/LengthInput';
import { COLOR_SWATCHES, catalogEntry, isStairs, itemMount } from '../../model/catalog';
import { normAngle } from '../../geometry/items';
import { DEFAULT_CEILING, FAN_DROP } from '../../geometry/warnings';
import { formatLength } from '../../model/units';
import './panels.css';

interface Props {
  item: Item;
  unit: Unit;
  heights: boolean;
  ceilingMm?: number;
  onChange: (patch: Partial<Item>) => void;
  onRotate: (deg: number) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onSaveTemplate?: () => void;
}

export function ItemPanel({ item, unit, heights, ceilingMm, onChange, onRotate, onDuplicate, onDelete, onSaveTemplate }: Props) {
  const [label, setLabel] = useState(item.label);
  const [rot, setRot] = useState(String(Math.round(item.rotation)));
  useEffect(() => setLabel(item.label), [item.id, item.label]);
  useEffect(() => setRot(String(Math.round(item.rotation * 10) / 10)), [item.id, item.rotation]);
  const entry = catalogEntry(item.type);
  const mount = itemMount(item);
  const ceiling = ceilingMm ?? DEFAULT_CEILING;

  return (
    <div className="item-panel">
      <div className="field">
        <label htmlFor="item-label">Name / label</label>
        <input
          id="item-label"
          className="input"
          value={label}
          maxLength={40}
          onChange={(e) => setLabel(e.target.value)}
          onBlur={() => {
            const v = label.trim();
            if (v && v !== item.label) onChange({ label: v });
            else setLabel(item.label);
          }}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        />
      </div>

      <div className="row">
        <LengthInput id="item-w" label={item.shape === 'round' ? 'Width' : 'Width'} unit={unit} valueMm={item.width} min={50} max={20000} onChange={(width) => onChange({ width })} />
        <LengthInput id="item-d" label="Depth" unit={unit} valueMm={item.depth} min={30} max={20000} onChange={(depth) => onChange({ depth })} />
      </div>

      {heights && mount !== 'under' && !isStairs(item) && (
        <>
          {mount === 'ceiling' ? (
            <LengthInput
              id="item-h"
              label="Fan height from floor"
              unit={unit}
              valueMm={item.heightMm ?? ceiling - FAN_DROP}
              min={1500}
              max={6000}
              onChange={(heightMm) => onChange({ heightMm })}
            />
          ) : (
            <LengthInput
              id="item-h"
              label="Height"
              unit={unit}
              valueMm={item.heightMm ?? entry?.heightMm ?? 750}
              min={10}
              max={6000}
              onChange={(heightMm) => onChange({ heightMm })}
            />
          )}
          {item.heightMm === undefined && <p className="hint" style={{ marginTop: -8 }}>Typical height. Change it if yours is different.</p>}
        </>
      )}

      {isStairs(item) && (
        <>
          <div className="field">
            <span className="field-label">Stair type</span>
            <div className="segmented" role="group" aria-label="Stair type">
              {(['straight', 'L', 'U'] as const).map((st) => (
                <button
                  key={st}
                  aria-pressed={(item.stairs?.style ?? 'straight') === st}
                  onClick={() => onChange({ stairs: { ...defStairs(item), style: st } })}
                >
                  {st === 'straight' ? 'Straight' : `${st} shape`}
                </button>
              ))}
            </div>
          </div>
          {item.stairs?.style && item.stairs.style !== 'straight' && (
            <>
              <LengthInput
                id="stair-flight"
                label="Flight width"
                unit={unit}
                valueMm={item.stairs.flightWidthMm}
                min={500}
                max={3000}
                onChange={(flightWidthMm) => onChange({ stairs: { ...defStairs(item), flightWidthMm } })}
              />
              <div className="field">
                <span className="field-label">Turns</span>
                <div className="segmented" role="group" aria-label="Turn direction">
                  {(['left', 'right'] as const).map((t) => (
                    <button key={t} aria-pressed={item.stairs?.turn === t} onClick={() => onChange({ stairs: { ...defStairs(item), turn: t } })}>
                      {t === 'left' ? 'Left' : 'Right'}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
          <p className="hint" style={{ marginTop: -4 }}>The arrow shows the way up. The same space is kept free on the floor above.</p>
        </>
      )}

      <div className="field">
        <label htmlFor="item-rot">Rotation (degrees)</label>
        <div className="rot-row">
          <button className="icon-btn bordered" aria-label="Rotate 90° left" onClick={() => onRotate(-90)}>
            <RotateCcw size={18} />
          </button>
          <input
            id="item-rot"
            className="input"
            inputMode="decimal"
            value={rot}
            onChange={(e) => setRot(e.target.value)}
            onBlur={() => {
              const v = parseFloat(rot);
              if (isFinite(v)) onChange({ rotation: normAngle(v) });
              else setRot(String(item.rotation));
            }}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          />
          <button className="icon-btn bordered" aria-label="Rotate 90° right" onClick={() => onRotate(90)}>
            <RotateCw size={18} />
          </button>
        </div>
      </div>

      <div className="field">
        <span className="field-label">Colour</span>
        <div className="swatches">
          {COLOR_SWATCHES.map((c) => (
            <button
              key={c}
              className="swatch"
              style={{ background: c }}
              aria-label={`Colour ${c}`}
              aria-pressed={item.color.toLowerCase() === c}
              onClick={() => onChange({ color: c })}
            />
          ))}
          <label className="swatch swatch-custom" aria-label="Pick any colour">
            <input type="color" value={item.color} onChange={(e) => onChange({ color: e.target.value })} />
          </label>
        </div>
      </div>

      <div className="panel-actions">
        <button className="btn" onClick={() => onChange({ locked: !item.locked })}>
          {item.locked ? <Unlock size={17} /> : <Lock size={17} />} {item.locked ? 'Unlock' : 'Lock'}
        </button>
        <button className="btn" onClick={onDuplicate}>
          <Copy size={17} /> Duplicate
        </button>
        <button className="btn danger-outline" onClick={onDelete}>
          <Trash2 size={17} /> Delete
        </button>
      </div>
      {onSaveTemplate && (
        <button className="btn btn-ghost btn-block" style={{ marginTop: 6 }} onClick={onSaveTemplate}>
          <BookmarkPlus size={17} /> Save to My items
        </button>
      )}
      <p className="hint" style={{ marginTop: 10 }}>
        {formatLength(item.width, unit)} × {formatLength(item.depth, unit)}
        {item.locked ? ' · locked in place' : ''}
      </p>
    </div>
  );
}

function defStairs(item: Item) {
  return item.stairs ?? { style: 'straight' as const, flightWidthMm: 900, turn: 'right' as const, upDir: 0 as const };
}
