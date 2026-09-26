import { lazy, Suspense, useCallback, useState } from 'react';
import { Route, Routes, useLocation } from 'react-router';
import { ToastProvider } from '@/components/ui/Toast';
import { Aurora } from '@/components/Aurora';
import { AppShell } from '@/components/AppShell';
import { PageTransition } from '@/components/PageTransition';
import { BrandedLoader } from '@/components/BrandedLoader';
import { useTheme } from '@/hooks/useTheme';

const Home = lazy(() => import('@/screens/Home'));
// The design-system showcase is a dev tool: not routed (and its chunk not referenced) in production.
const Gallery = import.meta.env.DEV ? lazy(() => import('@/screens/Gallery')) : null;
const Placeholder = lazy(() => import('@/screens/Placeholder'));
const Packs = lazy(() => import('@/screens/Packs'));
const Setup = lazy(() => import('@/screens/Setup'));
const Play = lazy(() => import('@/screens/Play'));
const Results = lazy(() => import('@/screens/Results'));
const Daily = lazy(() => import('@/screens/Daily'));
const Stats = lazy(() => import('@/screens/Stats'));
const Duel = lazy(() => import('@/screens/Duel'));
const Challenge = lazy(() => import('@/screens/Challenge'));

const VOLUME_KEY = 'sg:volume';
const MUTED_KEY = 'sg:muted';

function readNumber(key: string, fallback: number): number {
  try {
    const v = Number(localStorage.getItem(key));
    return Number.isFinite(v) && localStorage.getItem(key) !== null ? v : fallback;
  } catch {
    return fallback;
  }
}

function useLocalVolume(): [number, (v: number) => void, boolean, (m: boolean) => void] {
  const [volume, setVolumeState] = useState(() => Math.min(1, Math.max(0, readNumber(VOLUME_KEY, 0.8))));
  const [muted, setMutedState] = useState(() => readNumber(MUTED_KEY, 0) === 1);
  const setVolume = useCallback((v: number) => {
    setVolumeState(v);
    try {
      localStorage.setItem(VOLUME_KEY, String(v));
    } catch {
      /* ignore */
    }
  }, []);
  const setMuted = useCallback((m: boolean) => {
    setMutedState(m);
    try {
      localStorage.setItem(MUTED_KEY, m ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, []);
  return [volume, setVolume, muted, setMuted];
}

export default function App() {
  const [theme, setTheme] = useTheme();
  const [volume, setVolume, muted, setMuted] = useLocalVolume();
  const location = useLocation();
  const immersive = location.pathname === '/play';

  return (
    <ToastProvider>
      <Aurora />
      <AppShell
        theme={theme}
        onThemeChange={setTheme}
        volume={volume}
        onVolumeChange={setVolume}
        muted={muted}
        onMutedChange={setMuted}
        immersive={immersive}
      >
        <PageTransition>
          <Suspense fallback={<BrandedLoader fullscreen />}>
            <Routes location={location}>
              <Route path="/" element={<Home />} />
              <Route path="/packs" element={<Packs />} />
              <Route path="/setup" element={<Setup />} />
              <Route path="/play" element={<Play />} />
              <Route path="/results" element={<Results />} />
              <Route path="/daily" element={<Daily />} />
              <Route path="/stats" element={<Stats />} />
              <Route path="/duel" element={<Duel />} />
              <Route path="/c/:code" element={<Challenge />} />
              {Gallery && <Route path="/gallery" element={<Gallery />} />}
              <Route path="*" element={<Placeholder />} />
            </Routes>
          </Suspense>
        </PageTransition>
      </AppShell>
    </ToastProvider>
  );
}
