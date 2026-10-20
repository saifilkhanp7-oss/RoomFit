import { create } from 'zustand';
import { authApi, type User } from '../api/client';
import { getCachedUser, setCachedUser } from './cachedUser';
import { useAppStore } from '../store/useAppStore';
import { forgetSyncData, startSync, stopSync, syncNow, useSync } from '../sync/sync';
import { removeData, userDataKey } from '../storage/local';
import { useToast } from '../components/Toast';

interface AuthState {
  user: User | null;
  /** Shown once after sign up / recovery, until the user confirms they wrote it down. */
  recoveryCode: string | null;
}

export const useAuth = create<AuthState>(() => ({ user: getCachedUser(), recoveryCode: null }));

/** After a successful sign up, log in or recovery on this device. */
export function loggedIn(user: User, recoveryCode?: string) {
  setCachedUser(user);
  const moved = useAppStore.getState().switchUser(user.id);
  useAuth.setState({ user, recoveryCode: recoveryCode ?? null });
  startSync(user.id, expired);
  if (moved) useToast.getState().show(`${moved} plan${moved === 1 ? '' : 's'} from this device added to your account`);
}

/** The server says this device is no longer logged in. Keep the plans on the device, ask to log in again. */
function expired() {
  stopSync();
  setCachedUser(null);
  useAuth.setState({ user: null, recoveryCode: null });
  useAppStore.getState().switchUser(null);
}

/** Called once when the app opens. Works offline: a remembered login opens right away. */
export function initAuth() {
  const cached = useAuth.getState().user;
  if (cached) startSync(cached.id, expired);
  authApi
    .me()
    .then(({ user }) => {
      const cur = useAuth.getState().user;
      if (!user) {
        if (cur) expired(); // this device was logged out (e.g. account deleted elsewhere)
        return;
      }
      if (!cur || cur.id !== user.id) loggedIn(user);
      else if (cur.name !== user.name) {
        setCachedUser(user);
        useAuth.setState({ user });
      }
    })
    .catch((e) => {
      if (e.status === 401 && useAuth.getState().user) expired();
      // offline / server down: keep the remembered login
    });
}

/** Log out on this device. Sends unsynced changes first; then removes this account's plans from the device. */
export async function logout(opts: { force?: boolean } = {}): Promise<{ ok: boolean; unsynced?: number }> {
  const user = useAuth.getState().user;
  if (!user) return { ok: true };
  await syncNow();
  const pending = useSync.getState().pending;
  if (pending > 0 && !opts.force) return { ok: false, unsynced: pending };
  try {
    await authApi.logout();
  } catch {
    /* offline: the device forgets the login anyway */
  }
  stopSync();
  setCachedUser(null);
  useAuth.setState({ user: null, recoveryCode: null });
  useAppStore.getState().switchUser(null); // saves and leaves this account's data first…
  removeData(userDataKey(user.id)); // …then removes it from the device
  forgetSyncData(user.id);
  return { ok: true };
}

export function accountDeleted() {
  const user = useAuth.getState().user;
  stopSync();
  setCachedUser(null);
  useAuth.setState({ user: null, recoveryCode: null });
  useAppStore.getState().switchUser(null);
  if (user) {
    removeData(userDataKey(user.id));
    forgetSyncData(user.id);
  }
}
