import { Moon, Sun } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { useResolvedTheme } from '../hooks/useTheme';

export function ThemeToggle() {
  const resolved = useResolvedTheme();
  const setSettings = useAppStore((s) => s.setSettings);
  const next = resolved === 'dark' ? 'light' : 'dark';
  return (
    <button
      className="icon-btn"
      aria-label={`Switch to ${next} mode`}
      title={`Switch to ${next} mode`}
      onClick={() => setSettings({ theme: next })}
    >
      {resolved === 'dark' ? <Sun size={21} /> : <Moon size={21} />}
    </button>
  );
}
