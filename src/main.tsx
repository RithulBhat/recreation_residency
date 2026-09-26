import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router';
import './index.css';
import App from './App';
import { PACKS } from '@/data/packs';
import { applyTheme, getStoredTheme } from './hooks/useTheme';
import { setPackMeta } from '@/store/statsStore';

// Apply the persisted theme before first paint to avoid a flash.
applyTheme(getStoredTheme());

// Register pack metadata (tags → languages / decades) so those achievements can unlock.
setPackMeta(PACKS);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </StrictMode>,
);
