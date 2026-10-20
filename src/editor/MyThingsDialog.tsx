import { useMemo } from 'react';
import { CheckCircle2, Minus, PackageOpen, Plus, Trash2, XCircle } from 'lucide-react';
import { Dialog } from '../components/Dialog';
import type { Floor, Home, ItemTemplate, Unit } from '../model/types';
import { catalogEntry } from '../model/catalog';
import { formatLength } from '../model/units';
import { packThings, type PackThing, type Placed } from '../geometry/pack';
import './estimate.css';

interface Props {
  templates: ItemTemplate[];
  homes: Home[];
  homeId: string;
  floors: Floor[];
  floorIndex: number;
  unit: Unit;
  onPlace: (placed: Placed[], missing: PackThing[], already: number) => void;
  onCount: (id: string, count: number) => void;
  onDelete: (id: string) => void;
  onOpenHome: (homeId: string) => void;
  onClose: () => void;
}

export function thingsOf(templates: ItemTemplate[]): PackThing[] {
  return templates.flatMap((t) =>
    Array.from({ length: t.count ?? 1 }, (_, i) => ({ key: `${t.id}#${i}`, label: t.label, width: t.width, depth: t.depth, vehicle: catalogEntry(t.type)?.category === 'Vehicles' })),
  );
}

/** Your own furniture, kept for every home: put it all into this plan, or see which home fits it best. */
export function MyThingsDialog({ templates, homes, homeId, floors, floorIndex, unit, onPlace, onCount, onDelete, onOpenHome, onClose }: Props) {
  const things = useMemo(() => thingsOf(templates), [templates]);
  const fmt = (mm: number) => formatLength(mm, unit);
  const compare = useMemo(
    () =>
      homes
        .map((h) => {
          const r = packThings(h.layouts[0].floors, things);
          return { h, fits: r.placed.length, missing: r.missing, tight: r.filled > 0.55 };
        })
        .sort((a, b) => b.fits - a.fits),
    [homes, things],
  );

  const placeHere = () => {
    // things that are already on this floor (same name and size) aren't added again
    const left = [...floors[floorIndex].items];
    const todo: PackThing[] = [];
    let already = 0;
    for (const t of things) {
      const i = left.findIndex((it) => it.label === t.label && ((it.width === t.width && it.depth === t.depth) || (it.width === t.depth && it.depth === t.width)));
      if (i >= 0) {
        left.splice(i, 1);
        already++;
      } else todo.push(t);
    }
    const r = packThings(floors, todo, { keepItems: true, floorIndex });
    onPlace(r.placed, r.missing, already);
  };

  return (
    <Dialog title="My things" subtitle="Your own furniture, for any home. Add things from a plan: select one → Add to My things." onClose={onClose}>
      <div className="est">
        {templates.length === 0 ? (
          <p className="hint">No things yet. Select your bed, cupboard, cycle… on a plan and tap "Add to My things", or make a custom item with your own sizes.</p>
        ) : (
          <ul className="est-rooms">
            {templates.map((t) => (
              <li key={t.id} className="est-room thing-row">
                <div className="est-room-head">
                  <strong>{t.label}</strong>
                  <span className="muted">
                    {fmt(t.width)} × {fmt(t.depth)}
                    {t.heightMm ? ` · ${fmt(t.heightMm)} high` : ''}
                  </span>
                </div>
                <div className="thing-actions">
                  <div className="stepper" role="group" aria-label={`How many ${t.label}`}>
                    <button className="icon-btn" aria-label={`One less ${t.label}`} disabled={(t.count ?? 1) <= 1} onClick={() => onCount(t.id, (t.count ?? 1) - 1)}>
                      <Minus size={16} />
                    </button>
                    <span>{t.count ?? 1}</span>
                    <button className="icon-btn" aria-label={`One more ${t.label}`} onClick={() => onCount(t.id, Math.min(20, (t.count ?? 1) + 1))}>
                      <Plus size={16} />
                    </button>
                  </div>
                  <button className="icon-btn danger" aria-label={`Remove ${t.label}`} onClick={() => onDelete(t.id)}>
                    <Trash2 size={17} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        {things.length > 0 && (
          <>
            <button className="btn btn-primary btn-block" onClick={placeHere}>
              <PackageOpen size={18} /> Put all my things in this plan
            </button>
            <p className="hint">They go along the walls, away from doors and stairs. Move them where you like after.</p>

            <h4 className="est-h">Which home fits my things?</h4>
            <ul className="est-rooms">
              {compare.map(({ h, fits, missing, tight }) => (
                <li key={h.id} className={`est-room fit-row${missing.length ? ' no' : ' ok'}`}>
                  <button className="fit-btn" onClick={() => onOpenHome(h.id)} aria-label={`Open ${h.name}`}>
                    <span className="est-room-head">
                      <strong>
                        {missing.length ? <XCircle size={16} /> : <CheckCircle2 size={16} />} {h.name}
                        {h.id === homeId ? ' (this one)' : ''}
                      </strong>
                      <span className="muted">{missing.length ? `${fits} of ${things.length} fit` : `All ${things.length} fit${tight ? ', but tight' : ''}`}</span>
                    </span>
                    {missing.length > 0 && <span className="muted fit-missing">No room for: {[...new Set(missing.map((m) => m.label))].join(', ')}</span>}
                    {!missing.length && tight && <span className="muted fit-missing">Little space left to walk around.</span>}
                  </button>
                </li>
              ))}
            </ul>
            <p className="hint">Checks the empty rooms of each home (first layout), without the furniture already in them.</p>
          </>
        )}
      </div>
    </Dialog>
  );
}
