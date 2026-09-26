import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router';
import './index.css';
import App from './App';
import { applyTheme, getStoredTheme } from './hooks/useTheme';

// Apply the persisted theme before first paint to avoid a flash.
applyTheme(getStoredTheme());

/**
 * Register pack metadata (tags → languages / decades) so those achievements can unlock.
 *
 * Deliberately deferred: `packs.json` is ~57 kB and the stats store drags in the achievement engine,
 * and neither is needed to paint. The registry is only read when a finished game is recorded — by
 * which point the catalog (and this import) has long resolved — so loading it after boot keeps both
 * out of the entry chunk without changing behaviour.
 */
export const packMetaReady: Promise<void> = Promise.all([import('@/data/packs'), import('@/store/statsStore')]).then(
  ([{ PACKS }, { setPackMeta }]) => setPackMeta(PACKS),
);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </StrictMode>,
);
