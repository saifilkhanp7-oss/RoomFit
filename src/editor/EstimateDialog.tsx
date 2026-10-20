import { useEffect, useMemo, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { Dialog } from '../components/Dialog';
import { LengthInput } from '../components/LengthInput';
import type { Estimate, Layout, TileSpec, Unit } from '../model/types';
import { areaText, brickReport, cementReport, count, defaultEstimate, estimateOf, money, paintReport, tileReport, volume } from '../geometry/estimate';
import { isStairs } from '../model/catalog';
import './estimate.css';

const CURRENCIES = ['₹', '$', '€', '£'];

/** Plain number box (prices, %). Applied on Enter or when leaving the box. */
function NumField({ id, label, value, onChange, suffix, prefix }: { id: string; label: string; value: number; onChange: (v: number) => void; suffix?: string; prefix?: string }) {
  const [text, setText] = useState(String(value));
  const [bad, setBad] = useState(false);
  useEffect(() => {
    setText(String(value));
    setBad(false);
  }, [value]);
  const commit = () => {
    const v = parseFloat(text.replace(/[^\d.]/g, ''));
    if (!isFinite(v) || v < 0) {
      setBad(true);
      return;
    }
    setBad(false);
    if (v !== value) onChange(v);
  };
  return (
    <div className="field">
      <label htmlFor={id}>
        {label}
        {(prefix || suffix) && <span style={{ color: 'var(--text-3)', fontWeight: 500 }}> ({prefix ?? suffix})</span>}
      </label>
      <input
        id={id}
        className={`input${bad ? ' invalid' : ''}`}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            commit();
            (e.target as HTMLInputElement).blur();
          }
        }}
      />
      {bad && <span className="error-text">Type a number like 12 or 12.5</span>}
    </div>
  );
}

function TileInputs({ idp, tile, unit, currency, onChange, gap = true }: { idp: string; tile: TileSpec; unit: Unit; currency: string; onChange: (t: TileSpec) => void; gap?: boolean }) {
  return (
    <>
      <div className="row">
        <LengthInput id={`${idp}-l`} label="Tile length" size="small" unit={unit} valueMm={tile.lengthMm} min={20} max={5000} onChange={(lengthMm) => onChange({ ...tile, lengthMm })} />
        <LengthInput id={`${idp}-w`} label="Tile width" size="small" unit={unit} valueMm={tile.widthMm} min={20} max={5000} onChange={(widthMm) => onChange({ ...tile, widthMm })} />
      </div>
      <div className="row">
        <NumField id={`${idp}-price`} label="Price per tile" prefix={currency} value={tile.price} onChange={(price) => onChange({ ...tile, price })} />
        {gap && <LengthInput id={`${idp}-gap`} label="Gap between tiles" size="small" unit={unit} valueMm={tile.gapMm} min={0} max={50} onChange={(gapMm) => onChange({ ...tile, gapMm })} />}
      </div>
    </>
  );
}

interface Props {
  layout: Layout;
  unit: Unit;
  multi: boolean;
  onChange: (e: Estimate) => void;
  onClose: () => void;
}

/** Bricks and tiles: how many and what they cost, from the walls, stairs, ceilings and floors of the plan. */
export function EstimateDialog({ layout, unit, multi, onChange, onClose }: Props) {
  const est = estimateOf(layout.estimate, unit);
  const [tab, setTab] = useState<'bricks' | 'cement' | 'paint' | 'tiles'>('bricks');
  const set = (patch: Partial<Estimate>) => onChange({ ...est, ...patch });
  const bricks = useMemo(() => brickReport(layout.floors, est), [layout.floors, layout.estimate, unit]); // eslint-disable-line react-hooks/exhaustive-deps
  const tiles = useMemo(() => tileReport(layout.floors, est), [layout.floors, layout.estimate, unit]); // eslint-disable-line react-hooks/exhaustive-deps
  const paint = useMemo(() => paintReport(layout.floors, est), [layout.floors, layout.estimate, unit]); // eslint-disable-line react-hooks/exhaustive-deps
  const cement = useMemo(() => cementReport(layout.floors, est, unit), [layout.floors, layout.estimate, unit]); // eslint-disable-line react-hooks/exhaustive-deps
  const hasStairs = layout.floors.some((f) => f.items.some(isStairs));
  const pt = est.paint;
  const cm = est.cement;
  const SQFT = 10.7639;
  const total = bricks.cost + cement.cost + paint.cost + tiles.cost;
  const cur = est.currency;
  const b = est.brick;
  const anyOwn = Object.keys(est.rooms).length > 0;

  return (
    <Dialog title="Building cost" subtitle="Change any size or price. The numbers update as you go." onClose={onClose}>
      <div className="est">
        <div className="est-top">
          <div className="segmented est-tabs" role="tablist" aria-label="What to count">
            <button role="tab" aria-pressed={tab === 'bricks'} aria-selected={tab === 'bricks'} onClick={() => setTab('bricks')}>
              Bricks
            </button>
            <button role="tab" aria-pressed={tab === 'cement'} aria-selected={tab === 'cement'} onClick={() => setTab('cement')}>
              Cement
            </button>
            <button role="tab" aria-pressed={tab === 'paint'} aria-selected={tab === 'paint'} onClick={() => setTab('paint')}>
              Paint
            </button>
            <button role="tab" aria-pressed={tab === 'tiles'} aria-selected={tab === 'tiles'} onClick={() => setTab('tiles')}>
              Tiles
            </button>
          </div>
          <div className="est-cur-row">
            <span>Currency</span>
            <div className="segmented est-cur" role="group" aria-label="Currency">
              {CURRENCIES.map((c) => (
                <button key={c} aria-pressed={cur === c} onClick={() => set({ currency: c })}>
                  {c}
                </button>
              ))}
            </div>
          </div>
        </div>

        {tab === 'bricks' ? (
          <>
            <h4 className="est-h">One brick</h4>
            <div className="row">
              <LengthInput id="brick-l" label="Length" size="small" unit={unit} valueMm={b.lengthMm} min={20} max={1000} onChange={(lengthMm) => set({ brick: { ...b, lengthMm } })} />
              <LengthInput id="brick-w" label="Width" size="small" unit={unit} valueMm={b.widthMm} min={20} max={1000} onChange={(widthMm) => set({ brick: { ...b, widthMm } })} />
            </div>
            <div className="row">
              <LengthInput id="brick-h" label="Height" size="small" unit={unit} valueMm={b.heightMm} min={20} max={1000} onChange={(heightMm) => set({ brick: { ...b, heightMm } })} />
              <LengthInput id="brick-gap" label="Gap between bricks" size="small" unit={unit} valueMm={b.jointMm} min={0} max={100} onChange={(jointMm) => set({ brick: { ...b, jointMm } })} />
            </div>
            <div className="row">
              <NumField id="brick-price" label="Price of one brick" prefix={cur} value={b.price} onChange={(price) => set({ brick: { ...b, price } })} />
              <NumField id="brick-waste" label="Extra for breakage" suffix="%" value={b.wastePct} onChange={(wastePct) => set({ brick: { ...b, wastePct } })} />
            </div>

            <h4 className="est-h">Count bricks for</h4>
            <label className="check-row">
              <input type="checkbox" checked={est.walls} onChange={(e) => set({ walls: e.target.checked })} />
              Walls (up to each room's ceiling height)
            </label>
            {hasStairs && (
              <label className="check-row">
                <input type="checkbox" checked={est.stairs} onChange={(e) => set({ stairs: e.target.checked })} />
                Stairs
              </label>
            )}
            <label className="check-row">
              <input type="checkbox" checked={est.ceiling} onChange={(e) => set({ ceiling: e.target.checked })} />
              Ceiling / roof
            </label>
            {est.ceiling && <LengthInput id="ceiling-thick" label="Ceiling thickness" size="small" unit={unit} valueMm={est.ceilingMm} min={20} max={1000} onChange={(ceilingMm) => set({ ceilingMm })} />}
            <p className="hint">Doors and windows are taken out. A wall shared by two rooms is counted once. Set ceiling heights in each room's settings.</p>

            <div className="est-result" aria-label="Brick count">
              {bricks.parts.length === 0 ? (
                <p className="hint">Nothing to count yet.</p>
              ) : (
                <table>
                  <tbody>
                    {bricks.parts.map((p, i) => (
                      <tr key={i}>
                        <td>{multi ? `${p.floor} · ${p.part}` : p.part}</td>
                        <td className="muted">{volume(p.volMm3, unit)}</td>
                        <td className="num">{count(p.bricks)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <div className="est-total">
                <span>
                  {count(bricks.bricks)} bricks × {money(b.price, cur)}
                </span>
                <strong data-testid="brick-cost">{money(bricks.cost, cur)}</strong>
              </div>
            </div>
          </>
        ) : tab === 'cement' ? (
          <>
            <div className="row">
              <NumField id="cement-price" label="Price of one bag (50 kg)" prefix={cur} value={cm.price} onChange={(price) => set({ cement: { ...cm, price } })} />
              <NumField id="cement-mortar" label="Brick mortar mix  1 :" value={cm.mortarMix} onChange={(mortarMix) => set({ cement: { ...cm, mortarMix: Math.max(1, mortarMix) } })} />
            </div>
            <p className="hint">Mortar goes in the gaps between the bricks (from the Bricks tab). 1 : 6 means 1 part cement, 6 parts sand.</p>
            <label className="check-row">
              <input type="checkbox" checked={cm.plaster} onChange={(e) => set({ cement: { ...cm, plaster: e.target.checked } })} />
              Plaster on the walls
            </label>
            {cm.plaster && (
              <>
                <div className="row">
                  <LengthInput id="plaster-mm" label="Plaster thickness" size="small" unit={unit} valueMm={cm.plasterMm} min={1} max={100} onChange={(plasterMm) => set({ cement: { ...cm, plasterMm } })} />
                  <NumField id="plaster-mix" label="Plaster mix  1 :" value={cm.plasterMix} onChange={(plasterMix) => set({ cement: { ...cm, plasterMix: Math.max(1, plasterMix) } })} />
                </div>
                <label className="check-row">
                  <input type="checkbox" checked={cm.plasterOutside} onChange={(e) => set({ cement: { ...cm, plasterOutside: e.target.checked } })} />
                  Outside walls of the house too
                </label>
              </>
            )}
            <label className="check-row">
              <input type="checkbox" checked={cm.tileBed} onChange={(e) => set({ cement: { ...cm, tileBed: e.target.checked } })} />
              Bed under the floor tiles
            </label>
            {cm.tileBed && (
              <div className="row">
                <LengthInput id="bed-mm" label="Bed thickness" size="small" unit={unit} valueMm={cm.tileBedMm} min={1} max={200} onChange={(tileBedMm) => set({ cement: { ...cm, tileBedMm } })} />
                <NumField id="bed-mix" label="Bed mix  1 :" value={cm.tileBedMix} onChange={(tileBedMix) => set({ cement: { ...cm, tileBedMix: Math.max(1, tileBedMix) } })} />
              </div>
            )}
            <div className="est-result" aria-label="Cement bags">
              {cement.rows.length === 0 ? (
                <p className="hint">Nothing to count yet.</p>
              ) : (
                <table>
                  <tbody>
                    {cement.rows.map((r) => (
                      <tr key={r.part}>
                        <td>{r.part}</td>
                        <td className="muted">{r.note}</td>
                        <td className="num">{r.bags.toFixed(1)} bags</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <div className="est-total">
                <span>
                  {count(cement.bags)} bags × {money(cm.price, cur)}
                </span>
                <strong data-testid="cement-cost">{money(cement.cost, cur)}</strong>
              </div>
            </div>
          </>
        ) : tab === 'paint' ? (
          <>
            <div className="row">
              <NumField id="paint-price" label="Price of 1 litre" prefix={cur} value={pt.price} onChange={(price) => set({ paint: { ...pt, price } })} />
              <NumField id="paint-coats" label="Coats" value={pt.coats} onChange={(coats) => set({ paint: { ...pt, coats: Math.max(1, Math.round(coats)) } })} />
            </div>
            <NumField
              id="paint-cover"
              label="1 litre covers (one coat)"
              suffix={unit === 'ft' ? 'sq ft' : 'm²'}
              value={unit === 'ft' ? Math.round(pt.coverageM2 * SQFT) : pt.coverageM2}
              onChange={(v) => set({ paint: { ...pt, coverageM2: unit === 'ft' ? v / SQFT : v } })}
            />
            <p className="hint">The tin usually says how much one litre covers.</p>
            <label className="check-row">
              <input type="checkbox" checked={pt.ceiling} onChange={(e) => set({ paint: { ...pt, ceiling: e.target.checked } })} />
              Ceilings
            </label>
            <label className="check-row">
              <input type="checkbox" checked={pt.outside} onChange={(e) => set({ paint: { ...pt, outside: e.target.checked } })} />
              Outside walls of the house
            </label>
            <p className="hint">Inside walls up to the ceiling, both sides of walls between rooms and of inner walls. Doors and windows are taken out.</p>
            <div className="est-result" aria-label="Paint">
              {paint.rows.length === 0 ? (
                <p className="hint">Nothing to paint yet.</p>
              ) : (
                <table>
                  <tbody>
                    {paint.rows.map((r, i) => (
                      <tr key={i}>
                        <td>{multi ? `${r.floor} · ${r.part}` : r.part}</td>
                        <td className="num">{areaText(r.areaMm2, unit)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <div className="est-total">
                <span>
                  {paint.litres.toFixed(1)} L ({pt.coats} coat{pt.coats === 1 ? '' : 's'}) × {money(pt.price, cur)}
                </span>
                <strong data-testid="paint-cost">{money(paint.cost, cur)}</strong>
              </div>
            </div>
          </>
        ) : (
          <>
            <h4 className="est-h">Tile for all rooms</h4>
            <TileInputs idp="tile" tile={est.tile} unit={unit} currency={cur} onChange={(tile) => set({ tile })} />
            <NumField id="tile-waste" label="Extra for cutting & breakage" suffix="%" value={est.tileWastePct} onChange={(tileWastePct) => set({ tileWastePct })} />

            <div className="est-rooms-head">
              <h4 className="est-h">Rooms</h4>
              {anyOwn && (
                <button className="btn btn-ghost" onClick={() => set({ rooms: {} })}>
                  <RotateCcw size={15} /> Same tile everywhere
                </button>
              )}
            </div>
            <ul className="est-rooms">
              {tiles.rows.map((r) => {
                const setMode = (mode: 'same' | 'own' | 'none') => {
                  const rooms = { ...est.rooms };
                  if (mode === 'same') delete rooms[r.room.id];
                  else rooms[r.room.id] = mode === 'own' ? { mode, tile: est.rooms[r.room.id]?.tile ?? est.tile } : { mode };
                  set({ rooms });
                };
                return (
                  <li key={r.room.id} className="est-room">
                    <div className="est-room-head">
                      <strong>{r.room.name}</strong>
                      <span className="muted">
                        {multi ? `${r.floor} · ` : ''}
                        {areaText(r.areaMm2, unit)}
                      </span>
                    </div>
                    <div className="segmented small" role="group" aria-label={`Tile for ${r.room.name}`}>
                      <button aria-pressed={r.mode === 'same'} onClick={() => setMode('same')}>
                        Same tile
                      </button>
                      <button aria-pressed={r.mode === 'own'} onClick={() => setMode('own')}>
                        Own tile
                      </button>
                      <button aria-pressed={r.mode === 'none'} onClick={() => setMode('none')}>
                        No tiles
                      </button>
                    </div>
                    {r.mode === 'own' && (
                      <TileInputs idp={`tile-${r.room.id}`} tile={r.tile} unit={unit} currency={cur} onChange={(tile) => set({ rooms: { ...est.rooms, [r.room.id]: { mode: 'own', tile } } })} />
                    )}
                    <div className="est-room-sum">
                      {r.mode === 'none' ? (
                        <span className="muted">No tiles</span>
                      ) : (
                        <>
                          <span>
                            {count(r.tiles)} tiles × {money(r.tile.price, cur)}
                          </span>
                          <strong>{money(r.cost, cur)}</strong>
                        </>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
            <p className="hint">Floor area without the walls, rooms inside it and stair openings. Includes {est.tileWastePct}% extra.</p>
            <div className="est-result">
              <div className="est-total">
                <span>
                  {count(tiles.tiles)} tiles · {areaText(tiles.areaMm2, unit)}
                </span>
                <strong data-testid="tile-cost">{money(tiles.cost, cur)}</strong>
              </div>
            </div>
          </>
        )}

        <div className="est-grand">
          <span className="est-grand-parts">
            Bricks {money(bricks.cost, cur)} · Cement {money(cement.cost, cur)} · Paint {money(paint.cost, cur)} · Tiles {money(tiles.cost, cur)}
          </span>
          <strong data-testid="total-cost">{money(total, cur)}</strong>
        </div>
        <div className="est-foot">
          <p className="hint">Prices are examples until you change them. Sand and labour are not included.</p>
          <button className="btn btn-ghost" onClick={() => onChange({ ...defaultEstimate(unit), currency: cur })}>
            <RotateCcw size={15} /> Reset to defaults
          </button>
        </div>
      </div>
    </Dialog>
  );
}
