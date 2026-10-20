import type { User } from '../api/client';

// The logged-in user is remembered on this device, so the app opens even offline.
const KEY = 'roomfit:v1:user';

export function getCachedUser(): User | null {
  try {
    const u = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    return u && typeof u.id === 'string' && typeof u.name === 'string' ? u : null;
  } catch {
    return null;
  }
}

export function setCachedUser(u: User | null) {
  try {
    if (u) localStorage.setItem(KEY, JSON.stringify(u));
    else localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
