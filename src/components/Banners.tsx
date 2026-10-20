import { useEffect, useState } from 'react';
import { Download, Share, SquarePlus, X, ShieldAlert } from 'lucide-react';
import { isIOS, isStandalone } from '../hooks/usePlatform';
import { useAppStore } from '../store/useAppStore';
import { downloadBackup } from '../editor/dialogs';
import { useAuth } from '../auth/useAuth';

const WEEK = 7 * 24 * 3600 * 1000;

// ---------- Android / desktop install button ----------
interface BIPEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
}
let deferred: BIPEvent | null = null;
const listeners = new Set<() => void>();
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferred = e as BIPEvent;
  listeners.forEach((l) => l());
});
window.addEventListener('appinstalled', () => {
  deferred = null;
  listeners.forEach((l) => l());
});

export function InstallButton() {
  const [, force] = useState(0);
  useEffect(() => {
    const l = () => force((n) => n + 1);
    listeners.add(l);
    return () => void listeners.delete(l);
  }, []);
  if (!deferred) return null;
  return (
    <button
      className="btn"
      onClick={async () => {
        await deferred?.prompt();
        deferred = null;
        force((n) => n + 1);
      }}
    >
      <Download size={17} /> Install app
    </button>
  );
}

// ---------- iPhone: "Add to Home Screen" guide + storage reminder ----------
const IOS_GUIDE_KEY = 'roomfit:iosGuideDismissed';

export function IosBanners() {
  const homes = useAppStore((s) => s.data.homes.length);
  const settings = useAppStore((s) => s.data.settings);
  const setSettings = useAppStore((s) => s.setSettings);
  const loggedIn = useAuth((s) => !!s.user);
  const [guideHidden, setGuideHidden] = useState(() => {
    try {
      return localStorage.getItem(IOS_GUIDE_KEY) === '1';
    } catch {
      return false;
    }
  });
  if (!isIOS()) return null;
  const installed = isStandalone();

  // Storage reminder: Safari may delete site data after ~7 days without a visit.
  const needBackup = !settings.lastBackupAt || Date.now() - settings.lastBackupAt > WEEK;
  const remindDue = !settings.iosReminderDismissedAt || Date.now() - settings.iosReminderDismissedAt > WEEK;
  if (!loggedIn && homes > 0 && !installed && remindDue) {
    return (
      <div className="ios-card warn" role="note">
        <ShieldAlert size={22} className="ios-card-icon" />
        <div>
          <strong>Keep your plans safe</strong>
          <p>
            Safari can delete saved plans if you don't open this site for a few days. Tap <Share size={14} /> <b>Share</b> → <SquarePlus size={14} /> <b>Add to Home Screen</b>, or download a backup file.
          </p>
          <div className="ios-card-actions">
            <button className="btn btn-primary" onClick={() => downloadBackup()}>
              <Download size={16} /> Download backup
            </button>
            <button className="btn btn-ghost" onClick={() => setSettings({ iosReminderDismissedAt: Date.now() })}>
              Later
            </button>
          </div>
        </div>
      </div>
    );
  }
  if (!loggedIn && homes > 0 && installed && needBackup && remindDue && settings.lastBackupAt) {
    return (
      <div className="ios-card" role="note">
        <ShieldAlert size={22} className="ios-card-icon" />
        <div>
          <strong>Time for a backup?</strong>
          <p>Your last backup was more than a week ago.</p>
          <div className="ios-card-actions">
            <button className="btn btn-primary" onClick={() => downloadBackup()}>
              <Download size={16} /> Download backup
            </button>
            <button className="btn btn-ghost" onClick={() => setSettings({ iosReminderDismissedAt: Date.now() })}>
              Later
            </button>
          </div>
        </div>
      </div>
    );
  }
  if (!installed && !guideHidden) {
    return (
      <div className="ios-card" role="note">
        <SquarePlus size={22} className="ios-card-icon" />
        <div>
          <strong>Install RoomFit on your iPhone</strong>
          <p>
            Tap <Share size={14} /> <b>Share</b> at the bottom of Safari, then <SquarePlus size={14} /> <b>Add to Home Screen</b>. It then opens like an app, stays logged in and works offline.
          </p>
        </div>
        <button
          className="icon-btn ios-close"
          aria-label="Dismiss"
          onClick={() => {
            setGuideHidden(true);
            try {
              localStorage.setItem(IOS_GUIDE_KEY, '1');
            } catch {
              /* ignore */
            }
          }}
        >
          <X size={18} />
        </button>
      </div>
    );
  }
  return null;
}
