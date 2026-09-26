import { useCallback, useSyncExternalStore } from 'react';

export type ThemeName = 'midnight' | 'vinyl' | 'y2k' | 'daylight';

export interface ThemeMeta {
  id: ThemeName;
  name: string;
  blurb: string;
  /** Preview swatches: bg, fg, accent, accent-2 */
  swatches: [string, string, string, string];
  dark: boolean;
}

export const THEMES: readonly ThemeMeta[] = [
  {
    id: 'midnight',
    name: 'Midnight Neon',
    blurb: 'Deep dark, violet → cyan → pink.',
    swatches: ['#0b0b12', '#f4f4f8', '#a855f7', '#22d3ee'],
    dark: true,
  },
  {
    id: 'vinyl',
    name: 'Vinyl',
    blurb: 'Warm amber, cream and brown.',
    swatches: ['#16100a', '#f8ecd8', '#f5a524', '#d9552b'],
    dark: true,
  },
  {
    id: 'y2k',
    name: 'Y2K',
    blurb: 'Chrome silver, electric blue, hot pink.',
    swatches: ['#dfe5ef', '#0b1233', '#1e5bff', '#ff2fa0'],
    dark: false,
  },
  {
    id: 'daylight',
    name: 'Daylight',
    blurb: 'Clean, bright and airy.',
    swatches: ['#f6f6fb', '#15152c', '#7c3aed', '#0891b2'],
    dark: false,
  },
];

export const THEME_STORAGE_KEY = 'sg:theme';
const DEFAULT_THEME: ThemeName = 'midnight';
const THEME_EVENT = 'sg:themechange';

function isThemeName(v: unknown): v is ThemeName {
  return typeof v === 'string' && THEMES.some((t) => t.id === v);
}

export function getStoredTheme(): ThemeName {
  try {
    const v = localStorage.getItem(THEME_STORAGE_KEY);
    if (isThemeName(v)) return v;
  } catch {
    /* storage unavailable */
  }
  return DEFAULT_THEME;
}

export function getCurrentTheme(): ThemeName {
  if (typeof document === 'undefined') return DEFAULT_THEME;
  const v = document.documentElement.dataset.theme;
  return isThemeName(v) ? v : getStoredTheme();
}

/** Sets `<html data-theme>` + theme-color meta and persists. Safe to call before React mounts. */
export function applyTheme(theme: ThemeName): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.dataset.theme = theme;
  const meta = THEMES.find((t) => t.id === theme);
  const tc = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (tc && meta) tc.content = meta.swatches[0];
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent(THEME_EVENT, { detail: theme }));
}

function subscribe(cb: () => void): () => void {
  window.addEventListener(THEME_EVENT, cb);
  window.addEventListener('storage', cb);
  return () => {
    window.removeEventListener(THEME_EVENT, cb);
    window.removeEventListener('storage', cb);
  };
}

/**
 * `const [theme, setTheme] = useTheme()`
 * Reads/writes localStorage['sg:theme'] and sets `<html data-theme>`.
 */
export function useTheme(): [ThemeName, (t: ThemeName) => void] {
  const theme = useSyncExternalStore(subscribe, getCurrentTheme, () => DEFAULT_THEME);
  const setTheme = useCallback((t: ThemeName) => applyTheme(t), []);
  return [theme, setTheme];
}
