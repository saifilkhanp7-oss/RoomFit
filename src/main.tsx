import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { startAutosave } from './store/useAppStore';
import { initAuth } from './auth/useAuth';
import './styles/base.css';

startAutosave();
initAuth();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
