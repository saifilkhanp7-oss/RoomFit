import type { Home, ItemTemplate } from '../model/types';
import { SCHEMA_VERSION } from '../model/defaults';
import { sanitizeHome, sanitizeTemplate } from './sanitize';

export function makeBackup(homes: Home[], templates: ItemTemplate[]): string {
  return JSON.stringify(
    {
      app: 'roomfit',
      schemaVersion: SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      homes: homes.map((h) => ({ ...h, layouts: h.layouts.map(({ view: _v, ...l }) => l) })),
      customItemTemplates: templates,
    },
    null,
    1,
  );
}

export function backupFileName(homeName?: string) {
  const d = new Date();
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  if (homeName) return `roomfit-${homeName.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').toLowerCase() || 'home'}-${date}.roomfit.json`;
  return `roomfit-backup-${date}.roomfit.json`;
}

export type ParsedBackup = { ok: true; homes: Home[]; templates: ItemTemplate[] } | { ok: false; error: string };

export function parseBackup(text: string): ParsedBackup {
  let raw: any;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: "This file can't be read. Choose a RoomFit backup file (.json)." };
  }
  if (!raw || raw.app !== 'roomfit' || !Array.isArray(raw.homes)) {
    return { ok: false, error: "This doesn't look like a RoomFit backup file." };
  }
  if (typeof raw.schemaVersion === 'number' && raw.schemaVersion > SCHEMA_VERSION) {
    return { ok: false, error: 'This backup was made with a newer version of RoomFit. Reload the app and try again.' };
  }
  const homes = raw.homes.map(sanitizeHome).filter(Boolean) as Home[];
  const templates = (Array.isArray(raw.customItemTemplates) ? raw.customItemTemplates : []).map(sanitizeTemplate).filter(Boolean) as ItemTemplate[];
  if (!homes.length) return { ok: false, error: 'No plans found in this file.' };
  return { ok: true, homes, templates };
}
