// Cloud sync: plans are saved on this device first (works offline), then sent to the
// account in the background, and changes from other devices are pulled in.
import { create } from 'zustand';
import { api, ApiError } from '../api/client';
import { useAppStore } from '../store/useAppStore';
import type { Home, ItemTemplate } from '../model/types';

export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'offline' | 'error';

interface SyncState {
  status: SyncStatus;
  lastSyncedAt?: number;
  message?: string;
  pending: number; // homes changed on this device but not yet in the cloud
}

export const useSync = create<SyncState>(() => ({ status: 'idle', pending: 0 }));

interface Meta {
  since: number;
  synced: Record<string, number>; // home id → updatedAt the cloud has
  templatesSyncedAt: number;
}

const metaKey = (userId: string) => `roomfit:v1:sync:u:${userId}`;
function loadMeta(userId: string): Meta {
  try {
    const m = JSON.parse(localStorage.getItem(metaKey(userId)) ?? 'null');
    if (m && typeof m.since === 'number' && m.synced) return { templatesSyncedAt: 0, ...m };
  } catch {
    /* ignore */
  }
  return { since: 0, synced: {}, templatesSyncedAt: 0 };
}
function saveMeta(userId: string, m: Meta) {
  try {
    localStorage.setItem(metaKey(userId), JSON.stringify(m));
  } catch {
    /* ignore */
  }
}

let userId: string | null = null;
let running: Promise<void> | null = null;
let again = false;
let timer: ReturnType<typeof setTimeout> | null = null;
let onLoggedOut: (() => void) | null = null;

interface Change {
  id: string;
  data?: Home;
  deleted?: boolean;
  updatedAt: number;
}

function localChanges(meta: Meta): Change[] {
  const { homes } = useAppStore.getState().data;
  const out: Change[] = [];
  const present = new Set<string>();
  for (const h of homes) {
    present.add(h.id);
    if (meta.synced[h.id] !== h.updatedAt) {
      const { layouts, ...rest } = h;
      out.push({ id: h.id, updatedAt: h.updatedAt, data: { ...rest, layouts: layouts.map(({ view: _v, ...l }) => l) } as Home });
    }
  }
  for (const id of Object.keys(meta.synced)) {
    if (!present.has(id)) out.push({ id, deleted: true, updatedAt: Date.now() });
  }
  return out;
}

function updatePending() {
  if (!userId) return useSync.setState({ pending: 0 });
  const meta = loadMeta(userId);
  const t = useAppStore.getState().data.templatesUpdatedAt ?? 0;
  useSync.setState({ pending: localChanges(meta).length + (t > meta.templatesSyncedAt ? 1 : 0) });
}

async function runOnce(uid: string) {
  const meta = loadMeta(uid);
  const changes = localChanges(meta);
  const state = useAppStore.getState().data;
  const tUpdated = state.templatesUpdatedAt ?? 0;
  const sendTemplates = tUpdated > meta.templatesSyncedAt;

  // Send in chunks so a big account never hits the request size limit.
  const chunks: Change[][] = [];
  for (let i = 0; i < changes.length; i += 40) chunks.push(changes.slice(i, i + 40));
  if (!chunks.length) chunks.push([]);

  for (let ci = 0; ci < chunks.length; ci++) {
    const chunk = chunks[ci];
    const res = await api<{
      since: number;
      homes: { id: string; deleted: boolean; updatedAt: number; data: Home | null }[];
      templates?: { data: ItemTemplate[]; updatedAt: number };
    }>('/api/sync', {
      body: {
        since: meta.since,
        homes: chunk,
        templates: ci === 0 && sendTemplates ? { data: state.customItemTemplates, updatedAt: tUpdated } : undefined,
      },
    });
    if (userId !== uid) return; // logged out meanwhile
    useAppStore.getState().applyRemote(res.homes, res.templates);
    for (const h of res.homes) {
      if (h.deleted) delete meta.synced[h.id];
      else meta.synced[h.id] = h.updatedAt;
    }
    const returned = new Set(res.homes.map((h) => h.id));
    for (const c of chunk) {
      if (returned.has(c.id)) continue;
      // the cloud already had this exact version (or a newer one we have)
      if (c.deleted) delete meta.synced[c.id];
      else meta.synced[c.id] = c.updatedAt;
    }
    if (ci === 0 && sendTemplates) meta.templatesSyncedAt = Math.max(tUpdated, res.templates?.updatedAt ?? 0);
    else if (res.templates) meta.templatesSyncedAt = Math.max(meta.templatesSyncedAt, res.templates.updatedAt);
    meta.since = Math.max(meta.since, res.since);
    saveMeta(uid, meta);
  }
}

/** Sync now (or right after the sync that is already running). */
export function syncNow(): Promise<void> {
  if (!userId) return Promise.resolve();
  if (running) {
    again = true;
    return running;
  }
  const uid = userId;
  useSync.setState({ status: 'syncing' });
  running = (async () => {
    try {
      do {
        again = false;
        await runOnce(uid);
      } while (again && userId === uid);
      if (userId === uid) useSync.setState({ status: 'synced', lastSyncedAt: Date.now(), message: undefined });
    } catch (e) {
      const err = e as ApiError;
      if (err.status === 401) {
        useSync.setState({ status: 'idle', message: 'Please log in again' });
        onLoggedOut?.();
      } else if (err.offline) useSync.setState({ status: 'offline', message: 'Offline – will sync when you are back online' });
      else useSync.setState({ status: 'error', message: err.message || 'Could not sync' });
    } finally {
      running = null;
      updatePending();
    }
  })();
  return running;
}

/** Sync a little after the user stops editing. */
function scheduleSync(delay = 1500) {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    void syncNow();
  }, delay);
}

let wired = false;
function wireOnce() {
  if (wired) return;
  wired = true;
  useAppStore.subscribe((s, prev) => {
    if (!userId || s.data === prev.data) return;
    if (s.data.homes !== prev.data.homes || s.data.customItemTemplates !== prev.data.customItemTemplates) {
      updatePending();
      if (useSync.getState().pending > 0) scheduleSync();
    }
  });
  window.addEventListener('online', () => scheduleSync(300));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') scheduleSync(300);
  });
  setInterval(() => {
    if (document.visibilityState === 'visible') void syncNow();
  }, 60_000);
}

/** Start syncing for this user (call after login / on app start). */
export function startSync(uid: string, loggedOut: () => void) {
  userId = uid;
  onLoggedOut = loggedOut;
  wireOnce();
  updatePending();
  void syncNow();
}

export function stopSync() {
  userId = null;
  if (timer) clearTimeout(timer);
  timer = null;
  useSync.setState({ status: 'idle', pending: 0, lastSyncedAt: undefined, message: undefined });
}

export function forgetSyncData(uid: string) {
  try {
    localStorage.removeItem(metaKey(uid));
  } catch {
    /* ignore */
  }
}
