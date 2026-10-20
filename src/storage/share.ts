import LZString from 'lz-string';
import type { Home } from '../model/types';
import { sanitizeHome } from './sanitize';

/** Links longer than this are unreliable in WhatsApp and some browsers. */
export const MAX_LINK_LENGTH = 8000;

export interface ShareResult {
  url: string;
  tooBig: boolean;
}

/** Put a plan inside a link. `layoutId` = share only that layout, null = the whole home. */
export function makeShareLink(home: Home, layoutId: string | null, origin = window.location.origin + window.location.pathname): ShareResult {
  const layouts = (layoutId ? home.layouts.filter((l) => l.id === layoutId) : home.layouts).map(({ view: _view, ...l }) => l);
  const payload = {
    v: 1,
    home: {
      name: home.name,
      kind: home.kind,
      layouts,
      // roommates: who is who, and which home this came from (to bring their things back)
      ...(home.people?.length ? { people: home.people, originId: home.originId ?? home.id } : {}),
      ...(home.people?.length && home.meId ? { meId: home.meId } : {}),
    },
  };
  const data = LZString.compressToEncodedURIComponent(JSON.stringify(payload));
  const url = `${origin.replace(/\/$/, '')}/#/s/${data}`;
  return { url, tooBig: url.length > MAX_LINK_LENGTH };
}

/** Read a plan from the part of the link after #/s/. Returns null if the link is broken. */
export function readShareData(data: string): Home | null {
  try {
    const json = LZString.decompressFromEncodedURIComponent(data);
    if (!json) return null;
    const payload = JSON.parse(json);
    if (!payload || payload.v !== 1) return null;
    return sanitizeHome({ ...payload.home, id: undefined });
  } catch {
    return null;
  }
}
