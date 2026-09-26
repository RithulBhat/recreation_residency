import { Play, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Portal } from '@/components/ui/internal';
import { useIsDesktop } from '@/hooks/useMediaQuery';
import { useScoutSettingsStore } from '@/store/scoutStore';
import type { UseStartScout } from './useStartScout';
import { poolKind, poolLabel, scoutSettingsSummary } from './summary';

/** Bottom offset for the floating bar: above the mobile tab bar, a small margin on desktop. */
export function useScoutBarBottom(): string {
  const desktop = useIsDesktop();
  return `calc(env(safe-area-inset-bottom, 0px) + ${desktop ? '1rem' : '5.25rem'})`;
}

export interface ScoutStartBarProps {
  game: UseStartScout;
  /** Exact pool size for the current settings, or null while the dataset loads. */
  poolSize: number | null;
  datasetLoading: boolean;
}

/** Sticky summary + the big Start button. Portaled to `<body>` so it never affects page layout. */
export function ScoutStartBar({ game, poolSize, datasetLoading }: ScoutStartBarProps) {
  const settings = useScoutSettingsStore((s) => s.settings);
  const reset = useScoutSettingsStore((s) => s.reset);
  const bottom = useScoutBarBottom();
  const summary = scoutSettingsSummary(settings);
  const kind = poolKind(settings);
  const emptyPool = poolSize === 0;

  const poolLine = datasetLoading
    ? 'Loading the NFL dataset…'
    : poolSize === null
      ? 'Pick a pack to start'
      : emptyPool
        ? 'Nothing in this pool — widen the packs'
        : `${poolLabel(poolSize, kind)} in the pool`;

  return (
    <Portal>
      <div
        className="pointer-events-none fixed inset-x-0 z-40 px-3 md:px-6"
        style={{ bottom }}
        data-testid="scout-start-bar"
      >
        <div className="glass-strong pointer-events-auto mx-auto flex w-full max-w-6xl flex-col gap-2 rounded-3xl bg-bg-elevated/96 p-2 pl-4 shadow-xl sm:flex-row sm:items-center sm:gap-3">
          <div className="min-w-0 flex-1 py-1">
            {game.error ? (
              <p className="text-sm font-semibold text-danger" role="alert" data-testid="scout-start-error">
                {game.error}
              </p>
            ) : (
              <>
                <p className="truncate text-sm font-bold text-fg">
                  <span className="font-mono text-xs font-medium tabular text-fg/90 sm:text-sm" data-testid="scout-settings-summary">
                    {summary}
                  </span>
                </p>
                <p className="hidden text-xs text-muted sm:block">{poolLine}</p>
              </>
            )}
          </div>
          <div className="flex items-center gap-2 sm:shrink-0">
            {game.error ? (
              <>
                <button
                  type="button"
                  onClick={game.clearError}
                  className="touch-hit-44 h-11 px-2 text-xs font-semibold text-muted hover:text-fg"
                >
                  Dismiss
                </button>
                <Button
                  size="lg"
                  variant="glow"
                  leadingIcon={<RotateCcw />}
                  loading={game.loading}
                  onClick={() => void game.start(settings)}
                  data-testid="scout-retry"
                >
                  Try again
                </Button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={reset}
                  className="touch-hit-44 inline-flex h-11 items-center gap-1.5 whitespace-nowrap rounded-xl px-2.5 text-xs font-semibold text-muted transition-colors hover:text-fg"
                >
                  <RotateCcw className="size-3.5" aria-hidden />
                  Reset
                </button>
                <Button
                  size="lg"
                  variant="glow"
                  leadingIcon={<Play className="fill-current" />}
                  loading={game.loading || datasetLoading}
                  disabled={emptyPool}
                  onClick={() => void game.start(settings)}
                  className="flex-1 sm:flex-none sm:min-w-40"
                  data-testid="scout-start"
                >
                  {game.loading ? 'Building the pool…' : datasetLoading ? 'Loading roster…' : 'Start'}
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </Portal>
  );
}
