import type { AppData } from '../model/types';
import { SCHEMA_VERSION, defaultSettings, emptyData } from '../model/defaults';

/** Plans saved before login existed (or while logged out). */
export const STORAGE_KEY = 'roomfit:v1:data';
/** Each account keeps its own copy of its plans on this device. */
export const userDataKey = (userId: string) => `roomfit:v1:data:u:${userId}`;
/** Theme is a device setting (read in index.html before the app loads). */
export const THEME_KEY = 'roomfit:v1:theme';

export type LoadResult = { data: AppData; status: 'ok' | 'empty' | 'corrupt' | 'unavailable' };

export function loadData(key = STORAGE_KEY): LoadResult {
  let raw: string | null;
  try {
    raw = localStorage.getItem(key);
  } catch {
    return { data: emptyData(), status: 'unavailable' };
  }
  if (!raw) return { data: emptyData(), status: 'empty' };
  try {
    return { data: migrate(JSON.parse(raw)), status: 'ok' };
  } catch {
    // Keep a copy of the broken data so nothing is lost for good.
    try {
      localStorage.setItem(`${key}:broken:${Date.now()}`, raw);
    } catch {
      /* ignore */
    }
    return { data: emptyData(), status: 'corrupt' };
  }
}

/** Bring old saved data up to the current schema. */
export function migrate(input: any): AppData {
  if (!input || typeof input !== 'object' || !Array.isArray(input.homes)) {
    throw new Error('Not RoomFit data');
  }
  const data: AppData = {
    schemaVersion: SCHEMA_VERSION,
    homes: input.homes,
    customItemTemplates: Array.isArray(input.customItemTemplates) ? input.customItemTemplates : [],
    templatesUpdatedAt: typeof input.templatesUpdatedAt === 'number' ? input.templatesUpdatedAt : 0,
    settings: { ...defaultSettings(), ...(input.settings ?? {}) },
    lastOpened: input.lastOpened,
  };
  // Fill in fields added after the first version so old saves keep working.
  for (const h of data.homes) {
    for (const l of h.layouts ?? []) {
      for (const f of l.floors ?? []) {
        f.rooms ??= [];
        f.items ??= [];
        f.openings ??= [];
        f.sharedWalls ??= [];
        f.outerWallMm ??= 229;
      }
    }
  }
  return data;
}

/** Returns true if saved. Accepts data or an already-made JSON string. */
export function saveData(data: AppData | string, key = STORAGE_KEY): boolean {
  try {
    localStorage.setItem(key, typeof data === 'string' ? data : JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function removeData(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}
