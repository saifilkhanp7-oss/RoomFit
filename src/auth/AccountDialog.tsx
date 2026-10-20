import { useState } from 'react';
import { Cloud, CloudOff, KeyRound, LogOut, RefreshCw, Trash2 } from 'lucide-react';
import { Dialog } from '../components/Dialog';
import { PasswordInput } from './AuthScreen';
import { accountDeleted, logout, useAuth } from './useAuth';
import { syncNow, useSync } from '../sync/sync';
import { authApi, type ApiError } from '../api/client';
import { timeAgo } from '../utils/time';
import { navigate } from '../router';
import { useToast } from '../components/Toast';
import './auth.css';

export function syncText(s: ReturnType<typeof useSync.getState>): string {
  if (s.status === 'syncing') return 'Saving to your account…';
  if (s.status === 'offline') return s.pending ? `Offline · ${s.pending} change${s.pending === 1 ? '' : 's'} will sync later` : 'Offline · will sync later';
  if (s.status === 'error') return s.message ?? 'Could not sync';
  if (s.pending) return `${s.pending} change${s.pending === 1 ? '' : 's'} waiting to sync`;
  if (s.lastSyncedAt) return `Saved to your account · ${timeAgo(s.lastSyncedAt)}`;
  return 'Saved to your account';
}

/** Small button with the user's initial and sync dot, for headers. */
export function AccountChip({ onClick }: { onClick: () => void }) {
  const user = useAuth((s) => s.user);
  const status = useSync((s) => s.status);
  const pending = useSync((s) => s.pending);
  if (!user) return null;
  const dot = pending && status !== 'syncing' ? (status === 'offline' ? 'offline' : status === 'error' ? 'error' : 'syncing') : status;
  return (
    <button className="sync-chip" onClick={onClick} aria-label={`Account: ${user.name}`}>
      <span className="mini-avatar">{user.name.slice(0, 1).toUpperCase()}</span>
      <span className="chip-name">{user.name}</span>
      <span className={`sync-dot ${dot}`} aria-hidden />
    </button>
  );
}

type View = 'main' | 'logout-warn' | 'code' | 'delete';

export function AccountDialog({ onClose }: { onClose: () => void }) {
  const user = useAuth((s) => s.user);
  const sync = useSync();
  const [view, setView] = useState<View>('main');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [unsynced, setUnsynced] = useState(0);
  const toast = useToast((s) => s.show);
  if (!user) return null;

  const doLogout = async (force = false) => {
    setBusy(true);
    const r = await logout({ force });
    setBusy(false);
    if (!r.ok) {
      setUnsynced(r.unsynced ?? 0);
      setView('logout-warn');
      return;
    }
    onClose();
    navigate('/', true);
  };

  if (view === 'logout-warn')
    return (
      <Dialog title="Changes not saved yet" subtitle={`${unsynced} change${unsynced === 1 ? ' is' : 's are'} only on this device (you may be offline). If you log out now, ${unsynced === 1 ? 'it' : 'they'} will be lost.`} onClose={onClose}>
        <div className="stack-actions">
          <button className="btn btn-primary" onClick={() => setView('main')}>
            Stay logged in
          </button>
          <button className="btn danger-outline" disabled={busy} onClick={() => doLogout(true)}>
            Log out anyway
          </button>
        </div>
      </Dialog>
    );

  if (view === 'code' || view === 'delete') {
    const isDelete = view === 'delete';
    return (
      <Dialog
        title={isDelete ? 'Delete account?' : 'New recovery code'}
        subtitle={
          isDelete
            ? 'Your account and all your plans will be deleted from all devices. This cannot be undone.'
            : 'Your old recovery code will stop working. Enter your password to continue.'
        }
        onClose={onClose}
      >
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError(null);
            try {
              if (isDelete) {
                await authApi.deleteAccount(password);
                accountDeleted();
                toast('Account deleted');
                onClose();
                navigate('/', true);
              } else {
                const { recoveryCode } = await authApi.newRecoveryCode(password);
                useAuth.setState({ recoveryCode });
                onClose();
              }
            } catch (err) {
              setError((err as ApiError).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {error && <p className="auth-error">{error}</p>}
          <PasswordInput id="acct-pw" label="Password" value={password} onChange={setPassword} autoComplete="current-password" />
          <div className="dialog-actions">
            <button type="button" className="btn" onClick={() => setView('main')}>
              Cancel
            </button>
            <button type="submit" className={`btn ${isDelete ? 'btn-danger' : 'btn-primary'}`} disabled={busy || !password}>
              {isDelete ? 'Delete everything' : 'Get new code'}
            </button>
          </div>
        </form>
      </Dialog>
    );
  }

  return (
    <Dialog title="Account" onClose={onClose}>
      <div className="account-head">
        <span className="avatar">{user.name.slice(0, 1).toUpperCase()}</span>
        <div>
          <strong style={{ fontSize: 17 }}>{user.name}</strong>
          <div className="hint">Logged in on this device</div>
        </div>
      </div>
      <div className="sync-line" role="status">
        {sync.status === 'offline' ? <CloudOff size={18} /> : <Cloud size={18} />}
        <span>{syncText(sync)}</span>
        <button className="btn" disabled={sync.status === 'syncing'} onClick={() => syncNow()}>
          <RefreshCw size={14} /> Sync
        </button>
      </div>
      <div className="action-list">
        <button className="action-item" onClick={() => setView('code')}>
          <KeyRound size={18} /> Get a new recovery code
        </button>
        <button className="action-item" disabled={busy} onClick={() => doLogout(false)}>
          <LogOut size={18} /> Log out on this device
        </button>
        <button className="action-item danger" onClick={() => setView('delete')}>
          <Trash2 size={18} /> Delete account
        </button>
      </div>
    </Dialog>
  );
}
