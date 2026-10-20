import { useMemo, useRef, useState } from 'react';
import { Plus, Search, Trash2, PackageOpen } from 'lucide-react';
import { CATALOG, CATEGORIES, type CatalogEntry } from '../../model/catalog';
import type { ItemTemplate, Unit } from '../../model/types';
import { formatLength } from '../../model/units';
import './panels.css';

export type Pickable = { kind: 'catalog'; entry: CatalogEntry } | { kind: 'template'; t: ItemTemplate };

interface Props {
  multi: boolean;
  unit: Unit;
  templates: ItemTemplate[];
  onPick: (p: Pickable) => void;
  /** Called when a tile is dragged and released somewhere on screen. */
  onDrop?: (p: Pickable, clientX: number, clientY: number) => void;
  onCustom: () => void;
  onDeleteTemplate: (id: string) => void;
  onMyThings?: () => void;
}

export function FurniturePanel({ multi, unit, templates, onPick, onDrop, onCustom, onDeleteTemplate, onMyThings }: Props) {
  const [q, setQ] = useState('');
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return CATALOG.filter((c) => (multi || !c.multiOnly) && (!s || c.label.toLowerCase().includes(s) || c.category.toLowerCase().includes(s)));
  }, [q, multi]);
  const myItems = templates.filter((t) => !q || t.label.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="furniture-panel">
      <div className="search">
        <Search size={16} aria-hidden />
        <input
          className="input"
          type="search"
          placeholder="Search furniture"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Search furniture"
          enterKeyHint="search"
        />
      </div>

      <button className="btn btn-block custom-btn" onClick={onCustom}>
        <Plus size={18} /> Custom item
      </button>
      {onMyThings && (
        <button className="btn btn-block btn-ghost" onClick={onMyThings}>
          <PackageOpen size={18} /> My things (for any home)
        </button>
      )}

      {myItems.length > 0 && (
        <section>
          <h4>My things</h4>
          <div className="tile-grid">
            {myItems.map((t) => (
              <Tile
                key={t.id}
                label={t.label}
                size={`${formatLength(t.width, unit)} × ${formatLength(t.depth, unit)}`}
                color={t.color}
                round={t.shape === 'round'}
                pick={{ kind: 'template', t }}
                onPick={onPick}
                onDrop={onDrop}
                onDelete={() => onDeleteTemplate(t.id)}
              />
            ))}
          </div>
        </section>
      )}

      {CATEGORIES.map((cat) => {
        const items = list.filter((c) => c.category === cat);
        if (!items.length) return null;
        return (
          <section key={cat}>
            <h4>{cat === 'Kitchen' ? 'Kitchen & dining' : cat}</h4>
            <div className="tile-grid">
              {items.map((c) => (
                <Tile
                  key={c.type}
                  label={c.label}
                  size={`${formatLength(c.width, unit)} × ${formatLength(c.depth, unit)}`}
                  color={c.color}
                  round={c.shape === 'round'}
                  pick={{ kind: 'catalog', entry: c }}
                  onPick={onPick}
                  onDrop={onDrop}
                />
              ))}
            </div>
          </section>
        );
      })}
      {list.length === 0 && myItems.length === 0 && <p className="hint">Nothing found. Try "Custom item".</p>}
    </div>
  );
}

function Tile(props: {
  label: string;
  size: string;
  color: string;
  round: boolean;
  pick: Pickable;
  onPick: (p: Pickable) => void;
  onDrop?: (p: Pickable, x: number, y: number) => void;
  onDelete?: () => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const suppressClick = useRef(false);

  // Drag a tile onto the plan (laptop / iPad). A plain tap adds it in the middle of the view.
  const onPointerDown = (e: React.PointerEvent) => {
    if (!props.onDrop || (e.pointerType === 'mouse' && e.button !== 0)) return;
    const start = { x: e.clientX, y: e.clientY };
    let ghost: HTMLDivElement | null = null;
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - start.x;
      const dy = ev.clientY - start.y;
      if (!ghost) {
        // start dragging only on a mostly sideways move, so the list can still scroll
        if (Math.hypot(dx, dy) < 10) return;
        if (ev.pointerType !== 'mouse' && Math.abs(dy) > Math.abs(dx)) {
          cleanup();
          return;
        }
        ghost = document.createElement('div');
        ghost.className = 'drag-ghost';
        ghost.textContent = props.label;
        ghost.style.background = props.color;
        document.body.appendChild(ghost);
        ref.current?.setAttribute('data-dragging', '1');
      }
      ghost.style.transform = `translate(${ev.clientX - 40}px, ${ev.clientY - 20}px)`;
      ev.preventDefault();
    };
    const up = (ev: PointerEvent) => {
      const wasDragging = !!ghost;
      cleanup();
      if (wasDragging) {
        suppressClick.current = true;
        props.onDrop!(props.pick, ev.clientX, ev.clientY);
      }
    };
    const cleanup = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cleanup);
      ghost?.remove();
      ref.current?.removeAttribute('data-dragging');
    };
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cleanup);
  };

  return (
    <div className="tile-wrap">
      <button
        ref={ref}
        className="tile"
        onPointerDown={onPointerDown}
        onClick={() => {
          if (suppressClick.current) {
            suppressClick.current = false;
            return;
          }
          props.onPick(props.pick);
        }}
        aria-label={`Add ${props.label}`}
      >
        <span className="tile-swatch" style={{ background: props.color, borderRadius: props.round ? '50%' : 5 }} />
        <span className="tile-text">
          <strong>{props.label}</strong>
          <span>{props.size}</span>
        </span>
      </button>
      {props.onDelete && (
        <button className="icon-btn tile-del" aria-label={`Remove ${props.label} from My things`} onClick={props.onDelete}>
          <Trash2 size={15} />
        </button>
      )}
    </div>
  );
}
