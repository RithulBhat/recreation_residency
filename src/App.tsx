import { lazy, Suspense, useCallback, useState } from 'react';
import { Route, Routes, useLocation } from 'react-router';
import { ToastProvider } from '@/components/ui/Toast';
import { Aurora } from '@/components/Aurora';
import { AppShell } from '@/components/AppShell';
import { PageTransition } from '@/components/PageTransition';
import { BrandedLoader } from '@/components/BrandedLoader';
import { useTheme } from '@/hooks/useTheme';
import { R, isPlayPath } from '@/routes';

const Residency = lazy(() => import('@/screens/Residency'));
const Home = lazy(() => import('@/screens/Home'));
// The design-system showcase is a dev tool: not routed (and its chunk not referenced) in production.
const Gallery = import.meta.env.DEV ? lazy(() => import('@/screens/Gallery')) : null;
const Placeholder = lazy(() => import('@/screens/Placeholder'));
const ScoutHome = lazy(() => import('@/screens/scout/Home'));
const ScoutSetup = lazy(() => import('@/screens/scout/Setup'));
const ScoutPlay = lazy(() => import('@/screens/scout/Play'));
const ScoutResults = lazy(() => import('@/screens/scout/Results'));
const ScoutDaily = lazy(() => import('@/screens/scout/Daily'));
const ScoutStats = lazy(() => import('@/screens/scout/Stats'));
const ScoutChallenge = lazy(() => import('@/screens/scout/Challenge'));
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
  const immersive = isPlayPath(location.pathname);

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
              <Route path={R.residency} element={<Residency />} />

              <Route path={R.songooner.home} element={<Home />} />
              <Route path={R.songooner.packs} element={<Packs />} />
              <Route path={R.songooner.setup} element={<Setup />} />
              <Route path={R.songooner.play} element={<Play />} />
              <Route path={R.songooner.results} element={<Results />} />
              <Route path={R.songooner.daily} element={<Daily />} />
              <Route path={R.songooner.stats} element={<Stats />} />
              <Route path={R.songooner.duel} element={<Duel />} />
              <Route path={R.songooner.challenge} element={<Challenge />} />

              {/* Highlight Scout's screens land next; the routes exist now so the links work and
                  swapping each element in is a one-line change. */}
              <Route path={R.scout.home} element={<ScoutHome />} />
              <Route path={R.scout.setup} element={<ScoutSetup />} />
              <Route path={R.scout.play} element={<ScoutPlay />} />
              <Route path={R.scout.results} element={<ScoutResults />} />
              <Route path={R.scout.daily} element={<ScoutDaily />} />
              <Route path={R.scout.stats} element={<ScoutStats />} />
              <Route path={R.scout.challenge} element={<ScoutChallenge />} />

              {Gallery && <Route path={R.gallery} element={<Gallery />} />}
              <Route path="*" element={<Placeholder />} />
            </Routes>
          </Suspense>
        </PageTransition>
      </AppShell>
    </ToastProvider>
  );
}
