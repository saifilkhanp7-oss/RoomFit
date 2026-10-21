import type { PlugDistance } from '../../geometry/warnings';
import { useEffect, useState } from 'react';
import { ArrowDownToLine, Copy, Layers, Lock, RotateCcw, RotateCw, Trash2, Unlock, BookmarkPlus, Route } from 'lucide-react';
import type { Item, Unit, Person } from '../../model/types';
import { LengthInput } from '../../components/LengthInput';
import { COLOR_SWATCHES, DEFAULT_ITEM_HEIGHT, catalogEntry, fi, isStairs, isWallFixed, itemElevation, itemHeight, itemMount, itemOpenBelow, itemDrop, itemPower } from '../../model/catalog';
import { normAngle } from '../../geometry/items';
import { DEFAULT_CEILING } from '../../geometry/warnings';
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
  onRoute?: () => void;
  people?: Person[];
  /** Nearest plug in 3D (when plug points are marked). */
  plug?: PlugDistance | null;
  /** Item it could be put on top of (under its middle). */
  support?: Item;
  onStack: () => void;
  onFloor: () => void;
}

export function ItemPanel({ item, unit, ceilingMm, onChange, onRotate, onDuplicate, onDelete, onSaveTemplate, support, onStack, onFloor, onRoute, people = [], plug }: Props) {
  const height = itemHeight(item) ?? DEFAULT_ITEM_HEIGHT;
  const openBelow = itemOpenBelow(item);
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

      {mount === 'ceiling' && (
        <LengthInput
          id="item-h"
          label={item.type === 'fan' ? 'Fan height from floor' : 'Bottom of it from floor'}
          unit={unit}
          valueMm={item.heightMm ?? ceiling - itemDrop(item)}
          min={1200}
          max={6000}
          onChange={(heightMm) => onChange({ heightMm })}
        />
      )}

      {mount === 'floor' && !isStairs(item) && (
        <div className="height-box">
          <span className="field-label">Height and stacking</span>
          <div className="row">
            <LengthInput
              id="item-h"
              label="Height"
              unit={unit}
              valueMm={item.heightMm ?? entry?.heightMm ?? DEFAULT_ITEM_HEIGHT}
              min={10}
              max={6000}
              onChange={(heightMm) => onChange({ heightMm })}
            />
            <LengthInput
              id="item-elev"
              label="Height from floor"
              unit={unit}
              valueMm={itemElevation(item)}
              min={0}
              max={6000}
              onChange={(elevationMm) => onChange({ elevationMm })}
            />
          </div>
          {item.heightMm === undefined && <p className="hint" style={{ marginTop: -8 }}>Typical height. Change it if yours is different.</p>}
          <div className="stack-row">
            {support && (
              <button className="btn" onClick={onStack}>
                <Layers size={16} /> On top of {support.label}
              </button>
            )}
            {itemElevation(item) > 0 && (
              <button className="btn" onClick={onFloor}>
                <ArrowDownToLine size={16} /> On the floor
              </button>
            )}
          </div>

          <div className="field">
            <span className="field-label">Underneath</span>
            <div className="segmented" role="group" aria-label="Underneath">
              <button aria-pressed={openBelow > 0} onClick={() => onChange({ openBelowMm: openBelow > 0 ? openBelow : Math.min(fi(1, 2), Math.max(0, height - 100)) })}>
                Open (legs)
              </button>
              <button aria-pressed={openBelow === 0} onClick={() => onChange({ openBelowMm: 0 })}>
                Closed
              </button>
            </div>
          </div>
          {openBelow > 0 && (
            <LengthInput
              id="item-open"
              label="Open space height (floor to bottom)"
              unit={unit}
              valueMm={openBelow}
              min={10}
              max={Math.max(20, height - 20)}
              onChange={(openBelowMm) => onChange({ openBelowMm })}
            />
          )}
          <p className="hint" style={{ marginTop: -6 }}>
            {openBelow > 0 ? `Things up to ${formatLength(openBelow, unit)} tall fit under it.` : 'Nothing fits under it (like a box bed or cupboard).'}
          </p>
          <label className="check-row">
            <input type="checkbox" checked={isWallFixed(item)} onChange={(e) => onChange({ wallMounted: e.target.checked })} />
            Fixed to the wall (can hang in the air)
          </label>
        </div>
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
          <div className="field">
            <span className="field-label">Underneath</span>
            <div className="segmented" role="group" aria-label="Under the stairs">
              <button aria-pressed={!item.stairs?.open} onClick={() => onChange({ stairs: { ...defStairs(item), open: undefined } })}>
                Closed
              </button>
              <button aria-pressed={!!item.stairs?.open} onClick={() => onChange({ stairs: { ...defStairs(item), open: true } })}>
                Open (use the space)
              </button>
            </div>
          </div>
          {item.stairs?.open && <p className="hint" style={{ marginTop: -6 }}>Things can go under the stairs where they're low enough. The space is higher towards the top of the stairs.</p>}
          <p className="hint" style={{ marginTop: -4 }}>The arrow shows the way up. The floor above gets a stair opening here; anything you put over it gets a warning you can let be.</p>
        </>
      )}

      {!isStairs(item) && itemMount(item) !== 'under' && (
        <div className="field">
          <span className="field-label">Needs a plug</span>
          <div className="segmented" role="group" aria-label="Needs a plug">
            {(
              [
                ['none', 'No'],
                ['light', 'Yes'],
                ['heavy', 'Big appliance'],
              ] as const
            ).map(([v, l]) => {
              const cur = itemPower(item);
              const on = cur === v || (v === 'heavy' && cur === 'ac');
              return (
                <button key={v} aria-pressed={on} onClick={() => onChange({ power: v === 'heavy' && cur === 'ac' ? undefined : v })}>
                  {l}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {plug !== undefined && itemPower(item) !== 'none' && (
        <p className="hint plug-dist" role="status">
          {plug
            ? `Nearest plug: ${formatLength(plug.distance, unit)}` + (plug.up > 50 ? ` (${formatLength(plug.across, unit)} across, ${formatLength(plug.up, unit)} ${plug.above ? 'up' : 'down'})` : '')
            : 'No plug point on this floor yet.'}
        </p>
      )}

      {people.length > 0 && !isStairs(item) && (
        <div className="field">
          <span className="field-label">Belongs to</span>
          <div className="preset-row" role="group" aria-label="Belongs to">
            <button className="chip" aria-pressed={!item.owner} onClick={() => onChange({ owner: undefined })}>
              Shared
            </button>
            {people.map((p) => (
              <button key={p.id} className="chip person-chip" aria-pressed={item.owner === p.id} onClick={() => onChange({ owner: p.id })}>
                <span className="person-dot" style={{ background: p.color }} /> {p.name}
              </button>
            ))}
          </div>
        </div>
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
      {onRoute && (
        <button className="btn btn-block" style={{ marginTop: 8 }} onClick={onRoute}>
          <Route size={17} /> Will it get in? (from the door to here)
        </button>
      )}
      {onSaveTemplate && (
        <button className="btn btn-ghost btn-block" style={{ marginTop: 6 }} onClick={onSaveTemplate}>
          <BookmarkPlus size={17} /> Add to My things
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
