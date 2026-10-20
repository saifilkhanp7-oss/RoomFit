import { create } from 'zustand';
import type { AppData, Floor, Home, ItemTemplate, Layout, LayoutView, Settings } from '../model/types';
import { cloneHomeFresh, cloneLayoutFresh, makeHome, uniqueName, type NewHomeInput } from '../model/defaults';
import { blankLayoutFrom, nextLayoutName } from '../model/ops';
import { loadData, removeData, saveData, STORAGE_KEY, THEME_KEY, userDataKey } from '../storage/local';
import { getCachedUser } from '../auth/cachedUser';

// ---------- undo / redo (per layout, kept in memory only) ----------
const HISTORY_LIMIT = 100;
interface Hist {
  past: Layout[];
  future: Layout[];
}
const histories = new Map<string, Hist>();
const hist = (layoutId: string) => {
  let h = histories.get(layoutId);
  if (!h) histories.set(layoutId, (h = { past: [], future: [] }));
  return h;
};

export interface EditOpts {
  /** false = don't create an undo step (used for the live frames of a drag). */
  history?: boolean;
}

interface AppState {
  data: AppData;
  loadStatus: 'ok' | 'empty' | 'corrupt' | 'unavailable';
  saveFailed: boolean;
  otherTabChanged: boolean;
  histVersion: number;

  createHome: (input: NewHomeInput) => { homeId: string; layoutId: string };
  renameHome: (homeId: string, name: string) => void;
  deleteHome: (homeId: string) => void;
  duplicateHome: (homeId: string) => void;
  addHomes: (homes: Home[], mode: 'copy' | 'replace') => Home[];

  setSettings: (patch: Partial<Settings>) => void;
  setLastOpened: (homeId: string, layoutId: string, floorId: string) => void;
  setView: (homeId: string, layoutId: string, view: LayoutView) => void;

  /** Change one floor of a layout. */
  editFloor: (homeId: string, layoutId: string, floorId: string, fn: (f: Floor) => Floor, opts?: EditOpts) => void;
  /** Change the whole layout (floors added/removed etc). */
  editLayout: (homeId: string, layoutId: string, fn: (l: Layout) => Layout, opts?: EditOpts) => void;
  /** Save an undo step now (called when a drag starts). */
  checkpoint: (homeId: string, layoutId: string) => void;
  undo: (homeId: string, layoutId: string) => void;
  redo: (homeId: string, layoutId: string) => void;

  addLayout: (homeId: string, fromLayoutId: string, mode: 'blank' | 'duplicate') => string | undefined;
  renameLayout: (homeId: string, layoutId: string, name: string) => void;
  deleteLayout: (homeId: string, layoutId: string) => void;

  addTemplate: (t: ItemTemplate) => void;
  deleteTemplate: (id: string) => void;

  deleteAllData: () => void;
  setSaveFailed: (v: boolean) => void;

  /** Load the plans of this account on this device (null = logged out). Returns how many old plans were moved into the account. */
  switchUser: (userId: string | null) => number;
  /** Apply changes that came from the cloud (other devices). */
  applyRemote: (homes: { id: string; deleted: boolean; updatedAt: number; data: Home | null }[], templates?: { data: ItemTemplate[]; updatedAt: number }) => void;
  setHomeKind: (homeId: string, kind: 'single' | 'multi') => void;
}

/** Where this account's plans are saved in the browser. */
let currentKey = (() => {
  const u = getCachedUser();
  return u ? userDataKey(u.id) : STORAGE_KEY;
})();
export const currentStorageKey = () => currentKey;

function deviceTheme(): 'light' | 'dark' | 'system' | undefined {
  try {
    const t = localStorage.getItem(THEME_KEY);
    return t === 'light' || t === 'dark' || t === 'system' ? t : undefined;
  } catch {
    return undefined;
  }
}

const initial = loadData(currentKey);
{
  const t = deviceTheme();
  if (t) initial.data.settings.theme = t;
}

function mapHome(data: AppData, homeId: string, fn: (h: Home) => Home, touch = true): AppData {
  return {
    ...data,
    homes: data.homes.map((h) => (h.id === homeId ? { ...fn(h), ...(touch ? { updatedAt: Date.now() } : {}) } : h)),
  };
}
function mapLayout(data: AppData, homeId: string, layoutId: string, fn: (l: Layout) => Layout, touch = true) {
  return mapHome(data, homeId, (h) => ({ ...h, layouts: h.layouts.map((l) => (l.id === layoutId ? fn(l) : l)) }), touch);
}
function getLayout(data: AppData, homeId: string, layoutId: string) {
  return data.homes.find((h) => h.id === homeId)?.layouts.find((l) => l.id === layoutId);
}

export const useAppStore = create<AppState>((set, get) => {
  /** Apply a layout change, recording the previous layout for undo. */
  const applyLayout = (homeId: string, layoutId: string, fn: (l: Layout) => Layout, opts?: EditOpts) => {
    const prev = getLayout(get().data, homeId, layoutId);
    if (!prev) return;
    const next = fn(prev);
    if (next === prev) return;
    if (opts?.history !== false) {
      const h = hist(layoutId);
      h.past.push(prev);
      if (h.past.length > HISTORY_LIMIT) h.past.shift();
      h.future = [];
    }
    set((s) => ({
      data: mapLayout(s.data, homeId, layoutId, () => ({ ...next, view: prev.view })),
      histVersion: opts?.history !== false ? s.histVersion + 1 : s.histVersion,
    }));
  };

  return {
    data: initial.data,
    loadStatus: initial.status,
    saveFailed: false,
    otherTabChanged: false,
    histVersion: 0,

    createHome: (input) => {
      const home = makeHome(input);
      set((s) => ({ data: { ...s.data, homes: [home, ...s.data.homes], settings: { ...s.data.settings, unit: input.unit } } }));
      return { homeId: home.id, layoutId: home.layouts[0].id };
    },

    renameHome: (homeId, name) => set((s) => ({ data: mapHome(s.data, homeId, (h) => ({ ...h, name })) })),

    deleteHome: (homeId) =>
      set((s) => ({
        data: {
          ...s.data,
          homes: s.data.homes.filter((h) => h.id !== homeId),
          lastOpened: s.data.lastOpened?.homeId === homeId ? undefined : s.data.lastOpened,
        },
      })),

    duplicateHome: (homeId) => {
      const { data } = get();
      const home = data.homes.find((h) => h.id === homeId);
      if (!home) return;
      const copy = cloneHomeFresh(home, uniqueName(home.name, data.homes.map((h) => h.name)));
      const homes = [...data.homes];
      homes.splice(homes.indexOf(home) + 1, 0, copy);
      set({ data: { ...data, homes } });
    },

    addHomes: (incoming, mode) => {
      const { data } = get();
      let homes = [...data.homes];
      const added: Home[] = [];
      for (const h of incoming) {
        const existingIdx = homes.findIndex((x) => x.id === h.id);
        if (mode === 'replace' && existingIdx >= 0) {
          homes[existingIdx] = h;
          added.push(h);
        } else if (existingIdx >= 0 || homes.some((x) => x.name === h.name)) {
          const copy = cloneHomeFresh(h, uniqueName(h.name, homes.map((x) => x.name)));
          homes = [copy, ...homes];
          added.push(copy);
        } else {
          homes = [h, ...homes];
          added.push(h);
        }
      }
      set({ data: { ...data, homes } });
      return added;
    },

    setSettings: (patch) => set((s) => ({ data: { ...s.data, settings: { ...s.data.settings, ...patch } } })),

    setLastOpened: (homeId, layoutId, floorId) =>
      set((s) => ({ data: { ...s.data, lastOpened: { homeId, layoutId, floorId, at: Date.now() } } })),

    setView: (homeId, layoutId, view) => set((s) => ({ data: mapLayout(s.data, homeId, layoutId, (l) => ({ ...l, view }), false) })),

    editFloor: (homeId, layoutId, floorId, fn, opts) =>
      applyLayout(
        homeId,
        layoutId,
        (l) => {
          let changed = false;
          const floors = l.floors.map((f) => {
            if (f.id !== floorId) return f;
            const nf = fn(f);
            if (nf !== f) changed = true;
            return nf;
          });
          return changed ? { ...l, floors } : l;
        },
        opts,
      ),

    editLayout: (homeId, layoutId, fn, opts) => applyLayout(homeId, layoutId, fn, opts),

    checkpoint: (homeId, layoutId) => {
      const cur = getLayout(get().data, homeId, layoutId);
      if (!cur) return;
      const h = hist(layoutId);
      h.past.push(cur);
      if (h.past.length > HISTORY_LIMIT) h.past.shift();
      h.future = [];
      set((s) => ({ histVersion: s.histVersion + 1 }));
    },

    undo: (homeId, layoutId) => {
      const h = hist(layoutId);
      const cur = getLayout(get().data, homeId, layoutId);
      const prev = h.past.pop();
      if (!cur || !prev) return;
      h.future.push(cur);
      set((s) => ({ data: mapLayout(s.data, homeId, layoutId, () => ({ ...prev, view: cur.view })), histVersion: s.histVersion + 1 }));
    },

    redo: (homeId, layoutId) => {
      const h = hist(layoutId);
      const cur = getLayout(get().data, homeId, layoutId);
      const next = h.future.pop();
      if (!cur || !next) return;
      h.past.push(cur);
      set((s) => ({ data: mapLayout(s.data, homeId, layoutId, () => ({ ...next, view: cur.view })), histVersion: s.histVersion + 1 }));
    },

    addLayout: (homeId, fromLayoutId, mode) => {
      const home = get().data.homes.find((h) => h.id === homeId);
      const from = home?.layouts.find((l) => l.id === fromLayoutId);
      if (!home || !from) return;
      const name = nextLayoutName(home.layouts.map((l) => l.name));
      const nl = mode === 'blank' ? blankLayoutFrom(from, name) : cloneLayoutFresh(from, name);
      nl.view = from.view ? { ...from.view } : undefined;
      set((s) => ({ data: mapHome(s.data, homeId, (h) => ({ ...h, layouts: [...h.layouts, nl] })) }));
      return nl.id;
    },

    renameLayout: (homeId, layoutId, name) => set((s) => ({ data: mapLayout(s.data, homeId, layoutId, (l) => ({ ...l, name })) })),

    deleteLayout: (homeId, layoutId) => {
      histories.delete(layoutId);
      set((s) => ({
        data: mapHome(s.data, homeId, (h) => (h.layouts.length <= 1 ? h : { ...h, layouts: h.layouts.filter((l) => l.id !== layoutId) })),
      }));
    },

    addTemplate: (t) =>
      set((s) => ({ data: { ...s.data, customItemTemplates: [t, ...s.data.customItemTemplates].slice(0, 50), templatesUpdatedAt: Date.now() } })),
    deleteTemplate: (tid) =>
      set((s) => ({ data: { ...s.data, customItemTemplates: s.data.customItemTemplates.filter((t) => t.id !== tid), templatesUpdatedAt: Date.now() } })),

    deleteAllData: () => {
      histories.clear();
      set((s) => ({ data: { ...s.data, homes: [], customItemTemplates: [], lastOpened: undefined } }));
    },

    setSaveFailed: (v) => set({ saveFailed: v }),

    switchUser: (userId) => {
      flush();
      histories.clear();
      const key = userId ? userDataKey(userId) : STORAGE_KEY;
      const loaded = loadData(key);
      const data = loaded.data;
      const theme = deviceTheme();
      if (theme) data.settings.theme = theme;
      let moved = 0;
      if (userId) {
        // Plans made on this device before logging in become part of this account.
        const anon = loadData(STORAGE_KEY).data;
        if (anon.homes.length) {
          const ids = new Set(data.homes.map((h) => h.id));
          const fresh = anon.homes.filter((h) => !ids.has(h.id)).map((h) => ({ ...h, updatedAt: Date.now() }));
          data.homes = [...fresh, ...data.homes];
          moved = fresh.length;
          const tl = new Set(data.customItemTemplates.map((t) => t.label + t.width + t.depth));
          const newT = anon.customItemTemplates.filter((t) => !tl.has(t.label + t.width + t.depth));
          if (newT.length) {
            data.customItemTemplates = [...newT, ...data.customItemTemplates];
            data.templatesUpdatedAt = Date.now();
          }
          if (!loaded.data.lastOpened) data.lastOpened = anon.lastOpened;
          saveData(data, key);
          removeData(STORAGE_KEY);
        }
      }
      currentKey = key;
      set({ data, loadStatus: loaded.status, histVersion: get().histVersion + 1, otherTabChanged: false });
      return moved;
    },

    applyRemote: (changes, templates) =>
      set((s) => {
        let homes = [...s.data.homes];
        for (const c of changes) {
          const i = homes.findIndex((h) => h.id === c.id);
          const local = i >= 0 ? homes[i] : undefined;
          if (c.deleted) {
            if (local && local.updatedAt <= c.updatedAt) homes.splice(i, 1);
          } else if (c.data && (!local || c.updatedAt > local.updatedAt)) {
            // keep this device's zoom/position for each layout
            const views = new Map((local?.layouts ?? []).map((l) => [l.id, l.view]));
            const next: Home = {
              ...c.data,
              updatedAt: c.updatedAt,
              layouts: c.data.layouts.map((l) => (views.get(l.id) ? { ...l, view: views.get(l.id) } : l)),
            };
            if (local) {
              homes[i] = next;
              for (const l of local.layouts) histories.delete(l.id);
            } else homes = [next, ...homes];
          }
        }
        let data = { ...s.data, homes };
        if (templates && templates.updatedAt > (s.data.templatesUpdatedAt ?? 0)) {
          data = { ...data, customItemTemplates: templates.data, templatesUpdatedAt: templates.updatedAt };
        }
        const lo = data.lastOpened;
        if (lo && !homes.some((h) => h.id === lo.homeId)) data.lastOpened = undefined;
        return { data, histVersion: s.histVersion + 1 };
      }),

    setHomeKind: (homeId, kind) => set((s) => ({ data: mapHome(s.data, homeId, (h) => ({ ...h, kind })) })),
  };
});

export function canUndo(layoutId: string) {
  return (histories.get(layoutId)?.past.length ?? 0) > 0;
}
export function canRedo(layoutId: string) {
  return (histories.get(layoutId)?.future.length ?? 0) > 0;
}

// ---------- autosave ----------
// Debounced save after every change, plus a forced save when the page is hidden or closed.
// On iPhone `beforeunload` is unreliable, so `pagehide` + `visibilitychange` are used.
let timer: ReturnType<typeof setTimeout> | null = null;
let pending = false;
let lastSavedJson: string | null = null;

export function flush() {
  if (timer) clearTimeout(timer);
  timer = null;
  if (!pending) return;
  pending = false;
  const json = JSON.stringify(useAppStore.getState().data);
  const ok = saveData(json, currentKey);
  if (ok) lastSavedJson = json;
  if (ok === useAppStore.getState().saveFailed) useAppStore.getState().setSaveFailed(!ok);
}

export function startAutosave() {
  useAppStore.subscribe((state, prev) => {
    if (state.data === prev.data) return;
    pending = true;
    if (timer) clearTimeout(timer);
    timer = setTimeout(flush, 300);
  });
  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
  });
  // Another tab saved different data → warn instead of silently overwriting it.
  window.addEventListener('storage', (e) => {
    if (e.key === currentKey && e.newValue && e.newValue !== lastSavedJson) {
      useAppStore.setState({ otherTabChanged: true });
    }
  });
}

export function findHome(data: AppData, homeId?: string) {
  return data.homes.find((h) => h.id === homeId);
}
