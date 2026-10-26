import { useState } from 'react';
import { KeyRound, LogOut, Trash2 } from 'lucide-react';
import { Dialog } from '../components/Dialog';
import { PasswordInput } from './AuthScreen';
import { accountDeleted, logout, useAuth } from './useAuth';
import { authApi, type ApiError } from '../api/client';
import { navigate } from '../router';
import { useToast } from '../components/Toast';
import './auth.css';

/** Small button with the user's initial, for headers. */
export function AccountChip({ onClick }: { onClick: () => void }) {
  const user = useAuth((s) => s.user);
  if (!user) return null;
  return (
    <button className="sync-chip" onClick={onClick} aria-label={`Account: ${user.name}`}>
      <span className="mini-avatar">{user.name.slice(0, 1).toUpperCase()}</span>
      <span className="chip-name">{user.name}</span>
    </button>
  );
}

type View = 'main' | 'logout-warn' | 'code' | 'delete';

export function AccountDialog({ onClose }: { onClose: () => void }) {
  const user = useAuth((s) => s.user);
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
          <div className="hint">Your homes are the same on every device you log in on.</div>
        </div>
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
