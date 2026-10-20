import { useState } from 'react';
import { Check, Copy, FileDown, Image as ImageIcon, Link2, Pencil, Plus, Trash2, Layers, Share2 } from 'lucide-react';
import { Dialog, ConfirmDialog } from '../components/Dialog';
import { LengthInput } from '../components/LengthInput';
import { RenameDialog } from '../pages/HomeList';
import type { Floor, Home, Layout, RoomKind, Side, Unit } from '../model/types';
import { ROOM_KINDS, kindOf, parentOf } from '../geometry/spaces';
import { fi, CUSTOM_COLOR, COLOR_SWATCHES } from '../model/catalog';
import { formatLength, formatSmall } from '../model/units';
import { WALL_PRESETS_MM } from './panels/RoomPanel';
import type { Align, Corner } from '../model/ops';
import { makeShareLink } from '../storage/share';
import { makeBackup, backupFileName } from '../storage/backup';
import { shareOrDownload } from '../storage/shareFile';
import { floorToPng } from '../storage/exportPng';
import { useToast } from '../components/Toast';
import { useAppStore } from '../store/useAppStore';

// ---------------- Add room ----------------
export type AddRoomValue =
  | { mode: 'next'; name: string; kind: RoomKind; width: number; length: number; toId: string | null; side: Side; align: Align; gap: number }
  | { mode: 'inside'; name: string; kind: RoomKind; width: number; length: number; parentId: string; corner: Corner };

const KIND_SIZES: Partial<Record<RoomKind, [number, number]>> = {
  room: [fi(10), fi(10)],
  bathroom: [fi(5), fi(7)],
  kitchen: [fi(8), fi(10)],
  balcony: [fi(10), fi(4)],
  parking: [fi(10), fi(18)],
  store: [fi(5), fi(5)],
};

export function KindPicker({ value, onChange, exclude = [] }: { value: RoomKind; onChange: (k: RoomKind) => void; exclude?: RoomKind[] }) {
  return (
    <div className="kind-chips" role="group" aria-label="Type of space">
      {ROOM_KINDS.filter((k) => !exclude.includes(k.kind)).map((k) => (
        <button type="button" key={k.kind} className="chip" aria-pressed={value === k.kind} onClick={() => onChange(k.kind)}>
          {k.label}
        </button>
      ))}
    </div>
  );
}

export function AddRoomDialog(props: { floor: Floor; unit: Unit; defaultAttach?: string; onAdd: (v: AddRoomValue) => void; onClose: () => void }) {
  const { floor, unit } = props;
  const hall = floor.rooms.find((r) => kindOf(r) === 'hall');
  const [kind, setKind] = useState<RoomKind>('room');
  const [name, setName] = useState(floor.rooms.length ? 'Bedroom' : 'Room');
  const [nameTouched, setNameTouched] = useState(false);
  const [width, setWidth] = useState(fi(10));
  const [length, setLength] = useState(fi(10));
  const [mode, setMode] = useState<'next' | 'inside'>(hall ? 'inside' : 'next');
  const [toId, setToId] = useState<string | null>(props.defaultAttach ?? floor.rooms[0]?.id ?? null);
  const [parentId, setParentId] = useState<string>(props.defaultAttach ?? hall?.id ?? floor.rooms[0]?.id ?? '');
  const [side, setSide] = useState<Side>('right');
  const [align, setAlign] = useState<Align>('start');
  const [corner, setCorner] = useState<Corner>('tl');
  const [gap, setGap] = useState(floor.innerWallMm ?? 114);
  const [error, setError] = useState<string | null>(null);

  const pickKind = (k: RoomKind) => {
    setKind(k);
    if (!nameTouched) setName(ROOM_KINDS.find((x) => x.kind === k)!.name);
    const sz = KIND_SIZES[k];
    if (sz) {
      setWidth(sz[0]);
      setLength(sz[1]);
    }
  };

  const parent = floor.rooms.find((r) => r.id === parentId);

  return (
    <Dialog title="Add room" subtitle="Bedroom, bathroom, kitchen, balcony, parking…" onClose={props.onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const n = name.trim() || 'Room';
          if (mode === 'inside') {
            if (!parent) return setError('Choose a room to put it in');
            if (width > parent.width || length > parent.length) return setError(`It's bigger than ${parent.name} (${formatLength(parent.width, unit)} × ${formatLength(parent.length, unit)})`);
            props.onAdd({ mode, name: n, kind, width, length, parentId, corner });
          } else props.onAdd({ mode, name: n, kind, width, length, toId, side, align, gap });
          props.onClose();
        }}
      >
        <div className="field">
          <span className="field-label">Type</span>
          <KindPicker value={kind} onChange={pickKind} exclude={['hall']} />
        </div>
        <div className="field">
          <label htmlFor="newroom-name">Name</label>
          <input
            id="newroom-name"
            className="input"
            value={name}
            maxLength={40}
            onChange={(e) => {
              setName(e.target.value);
              setNameTouched(true);
            }}
            onFocus={(e) => e.target.select()}
          />
        </div>
        <div className="row">
          <LengthInput id="newroom-w" label="Width" unit={unit} valueMm={width} min={300} max={50000} onChange={setWidth} />
          <LengthInput id="newroom-l" label="Length" unit={unit} valueMm={length} min={300} max={50000} onChange={setLength} />
        </div>
        {floor.rooms.length > 0 && (
          <>
            <div className="field">
              <span className="field-label">Where</span>
              <div className="segmented" role="group" aria-label="Where">
                <button type="button" aria-pressed={mode === 'inside'} onClick={() => setMode('inside')}>
                  Inside a room / hall
                </button>
                <button type="button" aria-pressed={mode === 'next'} onClick={() => setMode('next')}>
                  Next to a room
                </button>
              </div>
            </div>

            {mode === 'inside' ? (
              <>
                <div className="field">
                  <label htmlFor="newroom-parent">Inside</label>
                  <select id="newroom-parent" className="input" value={parentId} onChange={(e) => setParentId(e.target.value)}>
                    {floor.rooms.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name} ({formatLength(r.width, unit)} × {formatLength(r.length, unit)})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <span className="field-label">Corner</span>
                  <div className="segmented" role="group" aria-label="Corner">
                    {(
                      [
                        ['tl', 'Top left'],
                        ['tr', 'Top right'],
                        ['bl', 'Bottom left'],
                        ['br', 'Bottom right'],
                      ] as [Corner, string][]
                    ).map(([c, l]) => (
                      <button type="button" key={c} aria-pressed={corner === c} onClick={() => setCorner(c)}>
                        {l}
                      </button>
                    ))}
                  </div>
                </div>
                <p className="hint" style={{ marginTop: -6 }}>
                  The space left around it stays part of {parent?.name ?? 'the room'}. You can drag the new room after adding it.
                </p>
              </>
            ) : (
              <>
                <div className="field">
                  <label htmlFor="newroom-to">Next to</label>
                  <select id="newroom-to" className="input" value={toId ?? ''} onChange={(e) => setToId(e.target.value)}>
                    {floor.rooms.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <span className="field-label">Which side</span>
                  <div className="segmented" role="group" aria-label="Side">
                    {(['left', 'right', 'top', 'bottom'] as Side[]).map((sd) => (
                      <button type="button" key={sd} aria-pressed={side === sd} onClick={() => setSide(sd)}>
                        {sd === 'top' ? 'Above' : sd === 'bottom' ? 'Below' : sd[0].toUpperCase() + sd.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="field">
                  <span className="field-label">Line up with</span>
                  <div className="segmented" role="group" aria-label="Alignment">
                    {(['start', 'center', 'end'] as Align[]).map((a) => (
                      <button type="button" key={a} aria-pressed={align === a} onClick={() => setAlign(a)}>
                        {a === 'center' ? 'Middle' : side === 'left' || side === 'right' ? (a === 'start' ? 'Top' : 'Bottom') : a === 'start' ? 'Left' : 'Right'}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="field">
                  <span className="field-label">Wall between rooms</span>
                  <div className="segmented" role="group" aria-label="Wall thickness">
                    {WALL_PRESETS_MM.map((mm) => (
                      <button type="button" key={mm} aria-pressed={gap === mm} onClick={() => setGap(mm)}>
                        {formatSmall(mm, unit)}
                      </button>
                    ))}
                  </div>
                </div>
                <LengthInput id="newroom-gap" label="Custom wall" size="small" unit={unit} valueMm={gap} min={0} max={600} onChange={setGap} />
              </>
            )}
          </>
        )}
        {error && <p className="error-text" style={{ fontSize: 14, fontWeight: 600 }}>{error}</p>}
        <div className="dialog-actions">
          <button type="button" className="btn" onClick={props.onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary">
            Add room
          </button>
        </div>
      </form>
    </Dialog>
  );
}

// ---------------- Hall / lobby around the rooms ----------------
export function HallDialog(props: { floor: Floor; unit: Unit; onAdd: (v: { name: string; width: number; length: number }) => string | null; onClose: () => void }) {
  const { floor, unit } = props;
  const top = floor.rooms.filter((r) => !parentOf(floor, r));
  const needW = top.length ? Math.max(...top.map((r) => r.x + r.width)) - Math.min(...top.map((r) => r.x)) : fi(12);
  const needL = top.length ? Math.max(...top.map((r) => r.y + r.length)) - Math.min(...top.map((r) => r.y)) : fi(10);
  const [name, setName] = useState('Hall');
  const [width, setWidth] = useState(Math.max(fi(12), Math.ceil(needW / 25.4) * 25.4 + fi(4)));
  const [length, setLength] = useState(Math.max(fi(10), Math.ceil(needL / 25.4) * 25.4));
  const [error, setError] = useState<string | null>(null);
  return (
    <Dialog
      title="Hall / lobby"
      subtitle="Enter the size of the whole home (inside the outer walls). Your rooms go inside it, and the space left over is the hall."
      onClose={props.onClose}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const err = props.onAdd({ name: name.trim() || 'Hall', width, length });
          if (err) setError(err);
          else props.onClose();
        }}
      >
        <div className="field">
          <label htmlFor="hall-name">Name</label>
          <input id="hall-name" className="input" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} placeholder="Hall, Lobby, Living area" />
        </div>
        <div className="row">
          <LengthInput id="hall-w" label="Home width" unit={unit} valueMm={width} min={1000} max={60000} onChange={setWidth} />
          <LengthInput id="hall-l" label="Home length" unit={unit} valueMm={length} min={1000} max={60000} onChange={setLength} />
        </div>
        {top.length > 0 && (
          <p className="hint" style={{ marginTop: -6 }}>
            Your rooms need at least {formatLength(needW, unit)} × {formatLength(needL, unit)}. They are placed in the top-left corner; drag them where they are in your home.
          </p>
        )}
        {error && <p className="error-text" style={{ fontSize: 14, fontWeight: 600 }}>{error}</p>}
        <div className="dialog-actions">
          <button type="button" className="btn" onClick={props.onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary">
            Add hall
          </button>
        </div>
      </form>
    </Dialog>
  );
}

// ---------------- Custom item ----------------
export function CustomItemDialog(props: {
  unit: Unit;
  heights: boolean;
  onAdd: (v: { label: string; width: number; depth: number; heightMm?: number; shape: 'rect' | 'round'; color: string; save: boolean }) => void;
  onClose: () => void;
}) {
  const [label, setLabel] = useState('');
  const [width, setWidth] = useState(fi(2));
  const [depth, setDepth] = useState(fi(2));
  const [heightMm, setHeight] = useState<number | undefined>(undefined);
  const [shape, setShape] = useState<'rect' | 'round'>('rect');
  const [color, setColor] = useState(CUSTOM_COLOR);
  const [save, setSave] = useState(true);
  return (
    <Dialog title="Custom item" subtitle='Anything you own, like "my guitar" or "cycle".' onClose={props.onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          props.onAdd({ label: label.trim() || 'My item', width, depth, heightMm, shape, color, save });
          props.onClose();
        }}
      >
        <div className="field">
          <label htmlFor="custom-name">Name</label>
          <input id="custom-name" className="input" value={label} maxLength={40} placeholder="e.g. My guitar" onChange={(e) => setLabel(e.target.value)} />
        </div>
        <div className="row">
          <LengthInput id="custom-w" label="Width" unit={props.unit} valueMm={width} min={30} max={20000} onChange={setWidth} />
          <LengthInput id="custom-d" label="Depth" unit={props.unit} valueMm={depth} min={30} max={20000} onChange={setDepth} />
        </div>
        {props.heights && (
          <LengthInput id="custom-h" label="Height (optional)" unit={props.unit} valueMm={heightMm ?? fi(3)} min={10} max={6000} onChange={setHeight} />
        )}
        <div className="field">
          <span className="field-label">Shape</span>
          <div className="segmented" role="group" aria-label="Shape">
            <button type="button" aria-pressed={shape === 'rect'} onClick={() => setShape('rect')}>
              Rectangle
            </button>
            <button type="button" aria-pressed={shape === 'round'} onClick={() => setShape('round')}>
              Round
            </button>
          </div>
        </div>
        <div className="field">
          <span className="field-label">Colour</span>
          <div className="swatches">
            {COLOR_SWATCHES.slice(0, 7).map((c) => (
              <button type="button" key={c} className="swatch" style={{ background: c }} aria-label={`Colour ${c}`} aria-pressed={color === c} onClick={() => setColor(c)} />
            ))}
          </div>
        </div>
        <label className="check-row">
          <input type="checkbox" checked={save} onChange={(e) => setSave(e.target.checked)} />
          Save to "My items" to use again
        </label>
        <div className="dialog-actions">
          <button type="button" className="btn" onClick={props.onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary">
            Add
          </button>
        </div>
      </form>
    </Dialog>
  );
}

// ---------------- Layouts ----------------
export function LayoutsDialog(props: {
  home: Home;
  currentId: string;
  onSwitch: (id: string) => void;
  onAdd: (mode: 'blank' | 'duplicate') => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  onRenameHome: (name: string) => void;
  onClose: () => void;
}) {
  const [renaming, setRenaming] = useState<Layout | null>(null);
  const [renamingHome, setRenamingHome] = useState(false);
  const [deleting, setDeleting] = useState<Layout | null>(null);
  const { home } = props;
  if (renaming)
    return <RenameDialog title="Rename layout" initial={renaming.name} onSave={(n) => props.onRename(renaming.id, n)} onClose={() => setRenaming(null)} />;
  if (renamingHome) return <RenameDialog title="Rename home" initial={home.name} onSave={props.onRenameHome} onClose={() => setRenamingHome(false)} />;
  if (deleting)
    return (
      <ConfirmDialog
        title={`Delete "${deleting.name}"?`}
        message="This layout will be deleted. Other layouts stay."
        confirmLabel="Delete"
        danger
        onConfirm={() => props.onDelete(deleting.id)}
        onClose={() => setDeleting(null)}
      />
    );
  return (
    <Dialog title={home.name} subtitle="Layouts let you try different arrangements and compare them." onClose={props.onClose}>
      <ul className="layout-list">
        {home.layouts.map((l) => (
          <li key={l.id} className={l.id === props.currentId ? 'current' : ''}>
            <button className="layout-pick" onClick={() => props.onSwitch(l.id)}>
              {l.id === props.currentId ? <Check size={18} /> : <span style={{ width: 18 }} />}
              <span>{l.name}</span>
            </button>
            <button className="icon-btn" aria-label={`Rename ${l.name}`} onClick={() => setRenaming(l)}>
              <Pencil size={17} />
            </button>
            {home.layouts.length > 1 && (
              <button className="icon-btn" aria-label={`Delete ${l.name}`} onClick={() => setDeleting(l)}>
                <Trash2 size={17} />
              </button>
            )}
          </li>
        ))}
      </ul>
      <div className="stack-actions">
        <button className="btn" onClick={() => props.onAdd('duplicate')}>
          <Copy size={17} /> Copy this layout
        </button>
        <button className="btn" onClick={() => props.onAdd('blank')}>
          <Plus size={17} /> New empty layout
        </button>
        <button className="btn btn-ghost" onClick={() => setRenamingHome(true)}>
          <Pencil size={17} /> Rename home
        </button>
      </div>
      <p className="hint">"New empty layout" keeps the rooms, doors and windows but no furniture.</p>
    </Dialog>
  );
}

// ---------------- Floor menu ----------------
export function FloorMenu(props: { floor: Floor; canDelete: boolean; onRename: (n: string) => void; onDelete: () => void; onClose: () => void }) {
  const [mode, setMode] = useState<'menu' | 'rename' | 'delete'>('menu');
  if (mode === 'rename') return <RenameDialog title="Rename floor" initial={props.floor.name} onSave={props.onRename} onClose={props.onClose} />;
  if (mode === 'delete')
    return (
      <ConfirmDialog
        title={`Delete "${props.floor.name}"?`}
        message="All rooms and furniture on this floor will be deleted from this layout."
        confirmLabel="Delete floor"
        danger
        onConfirm={props.onDelete}
        onClose={props.onClose}
      />
    );
  return (
    <Dialog title={props.floor.name} onClose={props.onClose}>
      <div className="action-list">
        <button className="action-item" onClick={() => setMode('rename')}>
          <Pencil size={18} /> Rename floor
        </button>
        {props.canDelete && (
          <button className="action-item danger" onClick={() => setMode('delete')}>
            <Trash2 size={18} /> Delete floor
          </button>
        )}
      </div>
    </Dialog>
  );
}

// ---------------- Share link ----------------
export function ShareDialog(props: { home: Home; layoutId: string; onBackup: () => void; onClose: () => void }) {
  const [scope, setScope] = useState<'layout' | 'home' | null>(props.home.layouts.length === 1 ? 'layout' : null);
  const toast = useToast((s) => s.show);
  const layout = props.home.layouts.find((l) => l.id === props.layoutId)!;
  const result = scope ? makeShareLink(props.home, scope === 'layout' ? props.layoutId : null) : null;

  const share = async () => {
    if (!result) return;
    const touch = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Mac/.test(navigator.userAgent));
    if (touch && navigator.share) {
      try {
        await navigator.share({ title: `RoomFit: ${props.home.name}`, text: `My room plan: ${props.home.name}`, url: result.url });
        return;
      } catch (e) {
        if ((e as Error).name === 'AbortError') return;
      }
    }
    try {
      await navigator.clipboard.writeText(result.url);
      toast('Link copied');
    } catch {
      toast('Select the link and copy it');
    }
  };

  return (
    <Dialog title="Share plan" subtitle="Anyone who opens the link sees the same plan and can save their own copy." onClose={props.onClose}>
      {props.home.layouts.length > 1 && (
        <div className="field">
          <span className="field-label">What do you want to send?</span>
          <div className="choice-list">
            <button className="choice" aria-pressed={scope === 'layout'} onClick={() => setScope('layout')}>
              <Link2 size={18} />
              <span>
                <strong>This layout only</strong>
                <span>{layout.name}</span>
              </span>
            </button>
            <button className="choice" aria-pressed={scope === 'home'} onClick={() => setScope('home')}>
              <Layers size={18} />
              <span>
                <strong>Whole home</strong>
                <span>All {props.home.layouts.length} layouts</span>
              </span>
            </button>
          </div>
        </div>
      )}

      {result && !result.tooBig && (
        <>
          <div className="field">
            <label htmlFor="share-url">Link</label>
            <input id="share-url" className="input" readOnly value={result.url} onFocus={(e) => e.target.select()} />
          </div>
          <div className="dialog-actions">
            <button className="btn" onClick={props.onClose}>
              Close
            </button>
            <button className="btn btn-primary" onClick={share}>
              <Share2 size={17} /> Share link
            </button>
          </div>
        </>
      )}
      {result?.tooBig && (
        <>
          <p className="notice">
            This plan is too big for a link. Use <strong>Download backup</strong> instead and send the file.
          </p>
          <div className="dialog-actions">
            <button className="btn" onClick={props.onClose}>
              Close
            </button>
            <button className="btn btn-primary" onClick={props.onBackup}>
              <FileDown size={17} /> Download backup
            </button>
          </div>
        </>
      )}
    </Dialog>
  );
}

// ---------------- Export images ----------------
export function ExportDialog(props: { home: Home; layout: Layout; floorId: string; unit: Unit; showDims: boolean; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  const toast = useToast((s) => s.show);
  const { home, layout } = props;

  const exportFloors = async (floors: Floor[]) => {
    setBusy(true);
    try {
      for (const f of floors) {
        const idx = layout.floors.indexOf(f);
        const blob = await floorToPng({
          floor: f,
          floorBelow: idx > 0 ? layout.floors[idx - 1] : undefined,
          title: home.name,
          subtitle: home.kind === 'multi' ? `${layout.name} · ${f.name}` : layout.name,
          unit: props.unit,
          showDims: props.showDims,
        });
        const safe = `${home.name}-${layout.name}${home.kind === 'multi' ? '-' + f.name : ''}`.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').toLowerCase();
        const r = await shareOrDownload(blob, `${safe || 'roomfit'}.png`, `${home.name} – ${f.name}`);
        if (r === 'cancelled') break;
      }
      props.onClose();
    } catch {
      toast("Couldn't make the image");
    } finally {
      setBusy(false);
    }
  };

  const current = layout.floors.find((f) => f.id === props.floorId) ?? layout.floors[0];
  return (
    <Dialog title="Save as image" subtitle="A PNG picture of the plan to send to your roommate or family." onClose={props.onClose}>
      <div className="stack-actions">
        <button className="btn btn-primary" disabled={busy} onClick={() => exportFloors([current])}>
          <ImageIcon size={17} /> {home.kind === 'multi' ? `This floor (${current.name})` : 'Save image'}
        </button>
        {home.kind === 'multi' && (
          <button className="btn" disabled={busy} onClick={() => exportFloors(layout.floors)}>
            <Layers size={17} /> All floors ({layout.floors.length} images)
          </button>
        )}
      </div>
      {busy && <p className="hint">Making the image…</p>}
    </Dialog>
  );
}

/** Download a backup of one home or everything. */
export async function downloadBackup(home?: Home) {
  const { data, setSettings } = useAppStore.getState();
  const json = makeBackup(home ? [home] : data.homes, data.customItemTemplates);
  const blob = new Blob([json], { type: 'application/json' });
  const r = await shareOrDownload(blob, backupFileName(home?.name), 'RoomFit backup');
  if (r !== 'cancelled') setSettings({ lastBackupAt: Date.now() });
  return r;
}
