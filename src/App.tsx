import { useEffect } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { useRoute, navigate } from './router';
import { HomeList } from './pages/HomeList';
import { Editor } from './pages/Editor';
import { SharedViewer } from './pages/SharedViewer';
import { Help } from './pages/Help';
import { Toast } from './components/Toast';
import { useAppStore } from './store/useAppStore';
import { useResolvedTheme } from './hooks/useTheme';
import { useAuth } from './auth/useAuth';
import { AuthScreen, RecoveryCodeScreen } from './auth/AuthScreen';

export default function App() {
  const route = useRoute();
  useResolvedTheme(); // keep <html data-theme> in sync on every page
  const saveFailed = useAppStore((s) => s.saveFailed);
  const loadStatus = useAppStore((s) => s.loadStatus);
  const otherTab = useAppStore((s) => s.otherTabChanged);
  const user = useAuth((s) => s.user);

  // Offline support: when a new version is deployed, offer to reload.
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({ immediate: true });

  useEffect(() => {
    if (route.name === 'notfound') navigate('/', true);
  }, [route.name]);

  return (
    <>
      {(saveFailed || loadStatus === 'unavailable') && (
        <div className="banner top-banner" role="alert">
          <AlertTriangle size={18} />
          Can't save in this browser (private mode or storage full). Download a backup to keep your plan.
        </div>
      )}
      {otherTab && (
        <div className="banner top-banner info" role="alert">
          <AlertTriangle size={18} />
          <span>Your plans changed in another tab.</span>
          <button className="btn" onClick={() => location.reload()}>
            Reload
          </button>
        </div>
      )}
      {needRefresh && (
        <div className="update-toast" role="status">
          <span>A new version of RoomFit is ready.</span>
          <button className="btn btn-primary" onClick={() => updateServiceWorker(true)}>
            <RefreshCw size={16} /> Update
          </button>
        </div>
      )}
      {!user && route.name !== 'shared' && route.name !== 'help' ? (
        <AuthScreen />
      ) : route.name === 'edit' ? (
        <Editor homeId={route.homeId} layoutId={route.layoutId} show3d={route.show3d} />
      ) : route.name === 'shared' ? (
        <SharedViewer data={route.data} />
      ) : route.name === 'help' ? (
        <Help />
      ) : (
        <HomeList />
      )}
      <RecoveryCodeScreen />
      <Toast />
    </>
  );
}
