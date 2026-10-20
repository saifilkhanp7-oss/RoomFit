import { useEffect, useSyncExternalStore } from 'react';
import { useAppStore } from '../store/useAppStore';

const mq = () => window.matchMedia('(prefers-color-scheme: dark)');

function subscribe(cb: () => void) {
  const m = mq();
  m.addEventListener('change', cb);
  return () => m.removeEventListener('change', cb);
}

/** Returns the theme actually shown ('light' | 'dark') and keeps <html data-theme> in sync. */
export function useResolvedTheme(): 'light' | 'dark' {
  const pref = useAppStore((s) => s.data.settings.theme);
  const systemDark = useSyncExternalStore(subscribe, () => mq().matches, () => false);
  const resolved = pref === 'system' ? (systemDark ? 'dark' : 'light') : pref;

  useEffect(() => {
    try {
      localStorage.setItem('roomfit:v1:theme', pref);
    } catch {
      /* ignore */
    }
  }, [pref]);

  useEffect(() => {
    document.documentElement.dataset.theme = resolved;
    const color = resolved === 'dark' ? '#14161a' : '#f6f7f9';
    document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute('content', color));
  }, [resolved]);

  return resolved;
}
