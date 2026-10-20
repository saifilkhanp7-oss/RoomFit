import { useSyncExternalStore } from 'react';

// Tiny hash router: #/  #/edit/:homeId/:layoutId  #/s/:data  #/help
// Hash routing works on static hosting (Vercel) and offline (PWA) with no server config.

function subscribe(cb: () => void) {
  window.addEventListener('hashchange', cb);
  return () => window.removeEventListener('hashchange', cb);
}
const getHash = () => window.location.hash || '#/';

export type Route =
  | { name: 'home' }
  | { name: 'edit'; homeId: string; layoutId: string; show3d: boolean }
  | { name: 'shared'; data: string }
  | { name: 'help' }
  | { name: 'notfound' };

export function parseRoute(hash: string): Route {
  const path = hash.replace(/^#/, '') || '/';
  const parts = path.split('/').filter(Boolean);
  if (parts.length === 0) return { name: 'home' };
  if (parts[0] === 'edit' && parts[1] && parts[2]) return { name: 'edit', homeId: parts[1], layoutId: parts[2], show3d: parts[3] === '3d' };
  if (parts[0] === 's' && parts[1]) return { name: 'shared', data: parts.slice(1).join('/') };
  if (parts[0] === 'help') return { name: 'help' };
  return { name: 'notfound' };
}

export function useRoute(): Route {
  const hash = useSyncExternalStore(subscribe, getHash, getHash);
  return parseRoute(hash);
}

export function navigate(path: string, replace = false) {
  const hash = `#${path}`;
  if (replace) window.history.replaceState(null, '', hash);
  else window.location.hash = hash;
  if (replace) window.dispatchEvent(new HashChangeEvent('hashchange'));
}
