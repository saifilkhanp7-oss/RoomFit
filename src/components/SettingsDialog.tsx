import { useRef, useState } from 'react';
import { FileDown, FileUp, Trash2, HelpCircle } from 'lucide-react';
import { Dialog, ConfirmDialog } from './Dialog';
import { LengthInput } from './LengthInput';
import { useAppStore } from '../store/useAppStore';
import { downloadBackup } from '../editor/dialogs';
import { parseBackup } from '../storage/backup';
import { useToast } from './Toast';
import { timeAgo } from '../utils/time';
import { navigate } from '../router';
import type { Home, ItemTemplate } from '../model/types';

export function SettingsDialog({ onClose }: { onClose: () => void }) {
  const settings = useAppStore((s) => s.data.settings);
  const homesCount = useAppStore((s) => s.data.homes.length);
  const { setSettings, deleteAllData } = useAppStore.getState();
  const [confirm1, setConfirm1] = useState(false);
  const [confirm2, setConfirm2] = useState(false);
  const toast = useToast((s) => s.show);

  if (confirm1)
    return (
      <ConfirmDialog
        title="Delete all data?"
        message={`All ${homesCount} homes and your saved items will be deleted from your account on all your devices.`}
        confirmLabel="Continue"
        danger
        onConfirm={() => setConfirm2(true)}
        onClose={() => setConfirm1(false)}
      />
    );
  if (confirm2)
    return (
      <ConfirmDialog
        title="Are you really sure?"
        message="This can't be undone. Download a backup first if you might need your plans."
        confirmLabel="Delete everything"
        danger
        onConfirm={() => {
          deleteAllData();
          toast('All data deleted');
          onClose();
          navigate('/');
        }}
        onClose={() => setConfirm2(false)}
      />
    );

  const toggle = (k: 'snap' | 'showGrid' | 'showDims', label: string) => (
    <label className="check-row">
      <input type="checkbox" checked={settings[k]} onChange={(e) => setSettings({ [k]: e.target.checked })} />
      {label}
    </label>
  );

  return (
    <Dialog title="Settings" onClose={onClose}>
      <div className="field">
        <span className="field-label">Units</span>
        <div className="segmented" role="group" aria-label="Units">
          <button aria-pressed={settings.unit === 'ft'} onClick={() => setSettings({ unit: 'ft' })}>
            Feet & inches
          </button>
          <button aria-pressed={settings.unit === 'm'} onClick={() => setSettings({ unit: 'm' })}>
            Meters
          </button>
        </div>
      </div>
      <div className="field">
        <span className="field-label">Theme</span>
        <div className="segmented" role="group" aria-label="Theme">
          {(['system', 'light', 'dark'] as const).map((t) => (
            <button key={t} aria-pressed={settings.theme === t} onClick={() => setSettings({ theme: t })}>
              {t === 'system' ? 'Auto' : t[0].toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
      </div>
      <div className="row">
        <LengthInput id="set-walk" label="Min walking space" unit={settings.unit} valueMm={settings.minWalkMm} min={300} max={1500} onChange={(minWalkMm) => setSettings({ minWalkMm })} />
        <LengthInput id="set-fan" label="Fan clearance" unit={settings.unit} valueMm={settings.fanClearanceMm} min={300} max={2000} onChange={(fanClearanceMm) => setSettings({ fanClearanceMm })} />
      </div>
      {toggle('snap', 'Snap to walls and furniture')}
      {toggle('showGrid', 'Show grid')}
      {toggle('showDims', 'Show sizes and distances')}

      <h3 className="settings-h">Backup</h3>
      <p className="hint" style={{ marginTop: 0 }}>Last backup: {settings.lastBackupAt ? timeAgo(settings.lastBackupAt) : 'never'}</p>
      <div className="stack-actions">
        <button className="btn" onClick={() => downloadBackup()} disabled={!homesCount}>
          <FileDown size={17} /> Download backup of everything
        </button>
        <ImportBackupButton onDone={onClose} />
      </div>

      <div className="stack-actions" style={{ marginTop: 18 }}>
        <button
          className="btn btn-ghost"
          onClick={() => {
            onClose();
            navigate('/help');
          }}
        >
          <HelpCircle size={17} /> Help & how to install
        </button>
        <button className="btn btn-ghost danger-outline" onClick={() => setConfirm1(true)} disabled={!homesCount}>
          <Trash2 size={17} /> Delete all data
        </button>
      </div>
    </Dialog>
  );
}

/** "Import backup" button with the file picker and the replace / add-as-copy question. */
export function ImportBackupButton({ onDone, className = 'btn' }: { onDone?: () => void; className?: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<{ homes: Home[]; templates: ItemTemplate[]; clash: number } | null>(null);
  const toast = useToast((s) => s.show);

  const doImport = (src: { homes: Home[]; templates: ItemTemplate[] }, mode: 'copy' | 'replace') => {
    const { addHomes, addTemplate, data } = useAppStore.getState();
    const added = addHomes(src.homes, mode);
    const have = new Set(data.customItemTemplates.map((t) => t.label + t.width + t.depth));
    for (const t of src.templates) if (!have.has(t.label + t.width + t.depth)) addTemplate(t);
    toast(`Imported ${added.length} home${added.length === 1 ? '' : 's'}`);
    setPending(null);
    onDone?.();
    navigate('/');
  };
  const finish = (mode: 'copy' | 'replace') => pending && doImport(pending, mode);

  return (
    <>
      <button className={className} onClick={() => inputRef.current?.click()}>
        <FileUp size={17} /> Import backup file
      </button>
      {/* iOS may label .json files differently, so accept broadly and check the content */}
      <input
        ref={inputRef}
        type="file"
        accept=".json,application/json,text/plain,.roomfit"
        hidden
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (!file) return;
          if (file.size > 20 * 1024 * 1024) return toast('That file is too big');
          const res = parseBackup(await file.text());
          if (!res.ok) return toast(res.error);
          const ids = new Set(useAppStore.getState().data.homes.map((h) => h.id));
          const clash = res.homes.filter((h) => ids.has(h.id)).length;
          if (clash) setPending({ homes: res.homes, templates: res.templates, clash });
          else doImport(res, 'copy');
        }}
      />
      {pending && pending.clash > 0 && (
        <Dialog title="Some plans already exist" subtitle={`${pending.clash} home(s) in this file are already on this device.`} onClose={() => setPending(null)}>
          <div className="stack-actions">
            <button className="btn btn-primary" onClick={() => finish('copy')}>
              Add as copies (keep both)
            </button>
            <button className="btn danger-outline" onClick={() => finish('replace')}>
              Replace the ones on this device
            </button>
            <button className="btn btn-ghost" onClick={() => setPending(null)}>
              Cancel
            </button>
          </div>
        </Dialog>
      )}
    </>
  );
}

