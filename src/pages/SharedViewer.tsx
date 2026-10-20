import { useCallback, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Download, Maximize } from 'lucide-react';
import { readShareData } from '../storage/share';
import { navigate } from '../router';
import { PlanCanvas } from '../editor/canvas/PlanCanvas';
import { PALETTES } from '../editor/canvas/draw';
import { fitView, floorBounds } from '../geometry/view';
import { ThemeToggle } from '../components/ThemeToggle';
import { useResolvedTheme } from '../hooks/useTheme';
import { useAppStore } from '../store/useAppStore';
import { cloneHomeFresh, uniqueName } from '../model/defaults';
import { useToast } from '../components/Toast';
import type { LayoutView } from '../model/types';
import { useAuth } from '../auth/useAuth';
import { AuthScreen } from '../auth/AuthScreen';
import './Editor.css';

/** Read-only view of a plan opened from a share link. */
export function SharedViewer({ data }: { data: string }) {
  const home = useMemo(() => readShareData(data), [data]);
  const theme = useResolvedTheme();
  const unit = useAppStore((s) => s.data.settings.unit);
  const toast = useToast((s) => s.show);
  const [layoutIdx, setLayoutIdx] = useState(0);
  const [floorIdx, setFloorIdx] = useState(0);
  const [view, setView] = useState<LayoutView | null>(null);
  const user = useAuth((st) => st.user);
  const [askLogin, setAskLogin] = useState(false);
  const sizeRef = useRef({ w: 0, h: 0 });

  const layout = home?.layouts[Math.min(layoutIdx, (home?.layouts.length ?? 1) - 1)];
  const floor = layout?.floors[Math.min(floorIdx, layout.floors.length - 1)];

  const fit = useCallback(() => {
    if (!floor) return;
    const { w, h } = sizeRef.current;
    if (w && h) setView(fitView(floorBounds(floor), w, h, floor.id, { top: 40, right: 32, bottom: 80, left: 48 }));
  }, [floor]);

  if (!home || !layout || !floor) {
    return (
      <div className="editor-missing">
        <h2>This link doesn't work</h2>
        <p>It may have been cut off when it was sent. Ask for the link again, or for a backup file.</p>
        <button className="btn btn-primary" onClick={() => navigate('/', true)}>
          Open RoomFit
        </button>
      </div>
    );
  }

  const saveCopy = () => {
    if (!useAuth.getState().user) return setAskLogin(true);
    const { data: appData, addHomes } = useAppStore.getState();
    const copy = cloneHomeFresh(home, uniqueName(home.name, appData.homes.map((h) => h.name)));
    const [added] = addHomes([copy], 'copy');
    toast('Saved to your homes');
    navigate(`/edit/${added.id}/${added.layouts[Math.min(layoutIdx, added.layouts.length - 1)].id}`, true);
  };

  const floorBelow = floorIdx > 0 ? layout.floors[floorIdx - 1] : undefined;

  return (
    <div className="editor">
      <header className="editor-top">
        <button className="icon-btn" aria-label="Open RoomFit" onClick={() => navigate('/')}>
          <ArrowLeft size={22} />
        </button>
        <div className="editor-title" style={{ cursor: 'default' }}>
          <strong>{home.name}</strong>
          <span>Shared plan · view only</span>
        </div>
        <button className="btn btn-primary" style={{ minHeight: 40 }} onClick={saveCopy}>
          <Download size={17} /> {user ? 'Save a copy' : 'Log in to save'}
        </button>
        <ThemeToggle />
      </header>
      <div className="shared-banner">This is a shared plan. Save a copy to edit it.</div>
      {askLogin && !user && <AuthScreen embedded onDone={() => setAskLogin(false)} />}
      {(home.layouts.length > 1 || layout.floors.length > 1) && (
        <nav className="floor-tabs" aria-label="Layouts and floors">
          {home.layouts.length > 1 &&
            home.layouts.map((l, i) => (
              <button
                key={l.id}
                className="floor-tab"
                aria-current={i === layoutIdx ? 'page' : undefined}
                onClick={() => {
                  setLayoutIdx(i);
                  setFloorIdx(0);
                }}
              >
                {l.name}
              </button>
            ))}
          {home.layouts.length > 1 && layout.floors.length > 1 && <span style={{ width: 12 }} />}
          {layout.floors.length > 1 &&
            layout.floors.map((f, i) => (
              <button key={f.id} className="floor-tab" aria-current={i === floorIdx ? 'page' : undefined} onClick={() => setFloorIdx(i)}>
                {f.name}
              </button>
            ))}
        </nav>
      )}
      <div className="editor-body">
        <div className="canvas-area">
          <PlanCanvas
            view={view ?? { floorId: floor.id, zoom: 0.1, panX: 0, panY: 0 }}
            setView={setView}
            onResize={(w, h) => {
              sizeRef.current = { w, h };
              if (!view && floor) setView(fitView(floorBounds(floor), w, h, floor.id, { top: 40, right: 32, bottom: 80, left: 48 }));
            }}
            draw={{ floor, floorBelow, colors: PALETTES[theme], unit, showGrid: true, showDims: true, clean: true }}
          />
          <div className="zoom-controls" style={{ bottom: 'calc(16px + var(--safe-bottom))' }}>
            <button className="icon-btn" aria-label="Fit plan to screen" onClick={fit}>
              <Maximize size={19} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
