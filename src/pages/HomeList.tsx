import { useState } from 'react';
import { MoreHorizontal, Plus, Pencil, Copy, Trash2, ArrowRight, Layers, X, Settings, FileDown } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { navigate } from '../router';
import { ThemeToggle } from '../components/ThemeToggle';
import { NewPlanDialog } from '../components/NewPlanDialog';
import { Dialog, ConfirmDialog } from '../components/Dialog';
import { PlanThumb } from '../components/PlanThumb';
import { timeAgo } from '../utils/time';
import { SettingsDialog, ImportBackupButton } from '../components/SettingsDialog';
import { IosBanners, InstallButton } from '../components/Banners';
import { downloadBackup } from '../editor/dialogs';
import type { Home } from '../model/types';
import { AccountChip, AccountDialog } from '../auth/AccountDialog';
import './HomeList.css';

// Show "Continue your plan?" only once per app open.
let continueDismissed = false;

function openHome(home: Home, preferLayoutId?: string) {
  const layout = home.layouts.find((l) => l.id === preferLayoutId) ?? home.layouts[0];
  navigate(`/edit/${home.id}/${layout.id}`);
}

export function HomeList() {
  const homes = useAppStore((s) => s.data.homes);
  const lastOpened = useAppStore((s) => s.data.lastOpened);
  const renameHome = useAppStore((s) => s.renameHome);
  const duplicateHome = useAppStore((s) => s.duplicateHome);
  const deleteHome = useAppStore((s) => s.deleteHome);

  const [showNew, setShowNew] = useState(false);
  const [menuFor, setMenuFor] = useState<Home | null>(null);
  const [renaming, setRenaming] = useState<Home | null>(null);
  const [deleting, setDeleting] = useState<Home | null>(null);
  const [showContinue, setShowContinue] = useState(!continueDismissed);
  const [showSettings, setShowSettings] = useState(false);
  const [showAccount, setShowAccount] = useState(false);

  const lastHome = lastOpened ? homes.find((h) => h.id === lastOpened.homeId) : undefined;
  const lastLayout = lastHome?.layouts.find((l) => l.id === lastOpened?.layoutId) ?? lastHome?.layouts[0];

  const dismissContinue = () => {
    continueDismissed = true;
    setShowContinue(false);
  };

  return (
    <div className="home-page">
      <header className="home-header">
        <div className="brand">
          <img src="/icon.svg" alt="" width={32} height={32} />
          <span>RoomFit</span>
        </div>
        <div className="header-actions">
          <InstallButton />
          <AccountChip onClick={() => setShowAccount(true)} />
          <button className="icon-btn" aria-label="Settings and backup" onClick={() => setShowSettings(true)}>
            <Settings size={21} />
          </button>
          <ThemeToggle />
        </div>
      </header>

      <main className="home-main">
        <IosBanners />
        {showContinue && lastHome && lastLayout && (
          <section className="continue-card" aria-label="Continue your plan">
            <button className="icon-btn continue-close" aria-label="Dismiss" onClick={dismissContinue}>
              <X size={18} />
            </button>
            <div className="continue-thumb">
              <PlanThumb floor={lastLayout.floors.find((f) => f.id === lastOpened?.floorId) ?? lastLayout.floors[0]} />
            </div>
            <div className="continue-body">
              <h2>Continue your plan?</h2>
              <p>
                {lastHome.name} · {lastLayout.name} · edited {timeAgo(lastHome.updatedAt)}
              </p>
              <div className="continue-actions">
                <button
                  className="btn btn-primary"
                  onClick={() => {
                    continueDismissed = true;
                    openHome(lastHome, lastLayout.id);
                  }}
                >
                  Continue <ArrowRight size={18} />
                </button>
                <button className="btn" onClick={dismissContinue}>
                  See all homes
                </button>
              </div>
            </div>
          </section>
        )}

        {homes.length === 0 ? (
          <section className="empty">
            <div className="empty-art" aria-hidden>
              <svg viewBox="0 0 160 110">
                <rect x="10" y="10" width="140" height="90" rx="3" fill="var(--room-fill)" stroke="var(--wall)" strokeWidth="6" />
                <rect x="22" y="22" width="34" height="58" rx="4" fill="var(--accent-soft)" stroke="var(--accent)" strokeWidth="2" />
                <rect x="98" y="66" width="40" height="22" rx="3" fill="var(--warn-soft)" stroke="var(--warn)" strokeWidth="2" />
                <path d="M150 34 A26 26 0 0 0 124 60 L150 60" fill="none" stroke="var(--text-3)" strokeWidth="2" strokeDasharray="4 4" />
                <line x1="70" y1="10" x2="96" y2="10" stroke="#7fb3ff" strokeWidth="6" />
              </svg>
            </div>
            <h1>Will the bed fit next to the window?</h1>
            <p>Plan your hostel room, flat or house on screen before you shift. Everything is to real scale.</p>
            <button className="btn btn-primary btn-lg" onClick={() => setShowNew(true)}>
              <Plus size={20} /> Plan your first room
            </button>
            <div style={{ marginTop: 14 }}>
              <ImportBackupButton className="btn btn-ghost" />
            </div>
          </section>
        ) : (
          <>
            <div className="section-head">
              <h1>Your homes</h1>
              <button className="btn btn-primary" onClick={() => setShowNew(true)}>
                <Plus size={18} /> New plan
              </button>
            </div>
            <ul className="home-grid">
              {homes.map((h) => (
                <li key={h.id} className="home-card">
                  <button className="home-card-main" onClick={() => openHome(h)}>
                    <div className="home-thumb">
                      <PlanThumb floor={h.layouts[0]?.floors[0]} />
                    </div>
                    <div className="home-info">
                      <strong>{h.name}</strong>
                      <span>
                        {h.kind === 'multi' ? (
                          <>
                            <Layers size={13} /> {h.layouts[0]?.floors.length} floors ·{' '}
                          </>
                        ) : null}
                        {h.layouts.length} layout{h.layouts.length === 1 ? '' : 's'} · {timeAgo(h.updatedAt)}
                      </span>
                    </div>
                  </button>
                  <button className="icon-btn home-more" aria-label={`More options for ${h.name}`} onClick={() => setMenuFor(h)}>
                    <MoreHorizontal size={20} />
                  </button>
                </li>
              ))}
            </ul>
            <div className="home-footer">
              <button className="btn btn-ghost" onClick={() => downloadBackup()}>
                <FileDown size={17} /> Download backup
              </button>
              <ImportBackupButton className="btn btn-ghost" />
            </div>
          </>
        )}
      </main>

      {showNew && <NewPlanDialog onClose={() => setShowNew(false)} />}
      {showSettings && <SettingsDialog onClose={() => setShowSettings(false)} />}
      {showAccount && <AccountDialog onClose={() => setShowAccount(false)} />}

      {menuFor && (
        <Dialog title={menuFor.name} onClose={() => setMenuFor(null)}>
          <div className="action-list">
            <button
              className="action-item"
              onClick={() => {
                setRenaming(menuFor);
                setMenuFor(null);
              }}
            >
              <Pencil size={18} /> Rename
            </button>
            <button
              className="action-item"
              onClick={() => {
                duplicateHome(menuFor.id);
                setMenuFor(null);
              }}
            >
              <Copy size={18} /> Duplicate
            </button>
            <button
              className="action-item danger"
              onClick={() => {
                setDeleting(menuFor);
                setMenuFor(null);
              }}
            >
              <Trash2 size={18} /> Delete
            </button>
          </div>
        </Dialog>
      )}

      {renaming && (
        <RenameDialog
          title="Rename home"
          initial={renaming.name}
          onSave={(name) => renameHome(renaming.id, name)}
          onClose={() => setRenaming(null)}
        />
      )}

      {deleting && (
        <ConfirmDialog
          title={`Delete "${deleting.name}"?`}
          message="All layouts of this home will be deleted from this device. This can't be undone."
          confirmLabel="Delete"
          danger
          onConfirm={() => deleteHome(deleting.id)}
          onClose={() => setDeleting(null)}
        />
      )}
    </div>
  );
}

export function RenameDialog(props: { title: string; initial: string; onSave: (v: string) => void; onClose: () => void }) {
  const [value, setValue] = useState(props.initial);
  return (
    <Dialog title={props.title} onClose={props.onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const v = value.trim();
          if (v) props.onSave(v);
          props.onClose();
        }}
      >
        <div className="field">
          <label htmlFor="rename-input" className="visually-hidden">
            Name
          </label>
          <input
            id="rename-input"
            className="input"
            value={value}
            maxLength={60}
            onChange={(e) => setValue(e.target.value)}
            onFocus={(e) => e.target.select()}
          />
        </div>
        <div className="dialog-actions">
          <button type="button" className="btn" onClick={props.onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={!value.trim()}>
            Save
          </button>
        </div>
      </form>
    </Dialog>
  );
}
