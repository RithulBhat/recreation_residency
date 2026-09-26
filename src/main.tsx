import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router';
import './index.css';
import App from './App';
import { applyTheme, getStoredTheme } from './hooks/useTheme';

// Apply the persisted theme before first paint to avoid a flash.
applyTheme(getStoredTheme());

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </StrictMode>,
);
