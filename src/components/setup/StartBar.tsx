import { useMemo } from 'react';
import { Play, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Portal } from '@/components/ui/internal';
import { useSettingsStore } from '@/store/settingsStore';
import type { UseStartGame } from '@/hooks/useStartGame';
import { useIsDesktop } from '@/hooks/useMediaQuery';
import { resolvePacks } from './PackPicker';
import { MODE_LABEL, poolEstimate, settingsSummary } from './summary';

export interface StartBarProps {
  game: UseStartGame;
}

/** Bottom offset for floating bars: above the mobile tab bar, a small margin on desktop. */
export function useBarBottom(): string {
  const desktop = useIsDesktop();
  return `calc(env(safe-area-inset-bottom, 0px) + ${desktop ? '1rem' : '5.25rem'})`;
}

/** Fixed bottom bar: live settings summary + the big Start button + reset. Portaled to <body>. */
export function StartBar({ game }: StartBarProps) {
  const settings = useSettingsStore((s) => s.settings);
  const reset = useSettingsStore((s) => s.reset);
  const packs = useMemo(() => resolvePacks(settings.packIds), [settings.packIds]);
  const songs = poolEstimate(packs.map((p) => p.approxSize));
  const summary = settingsSummary(settings, packs.map((p) => p.name));
  const bottom = useBarBottom();

  return (
    <Portal>
    <div className="pointer-events-none fixed inset-x-0 z-40 px-3 md:px-6" style={{ bottom }} data-testid="start-bar">
      <div className="glass-strong pointer-events-auto mx-auto flex w-full max-w-6xl flex-col gap-2 rounded-3xl bg-bg-elevated/96 p-2 pl-4 shadow-xl sm:flex-row sm:items-center sm:gap-3">
        <div className="min-w-0 flex-1 py-1">
          {game.error ? (
            <p className="text-sm font-semibold text-danger" role="alert">
              {game.error}
            </p>
          ) : (
            <>
              <p className="truncate text-sm font-bold text-fg">
                <span className="text-gradient">{MODE_LABEL[settings.mode]}</span>
                <span className="text-muted"> · </span>
                <span className="font-mono text-xs font-medium tabular text-fg/85 sm:text-sm" data-testid="settings-summary">
                  {summary}
                </span>
              </p>
              <p className="hidden text-xs text-muted sm:block">
                {game.loading ? `Loading ${songs > 0 ? `~${songs.toLocaleString()} ` : ''}songs…` : songs > 0 ? `~${songs.toLocaleString()} songs in the pool` : 'Pick a pack to start'}
              </p>
            </>
          )}
        </div>
        <div className="flex items-center gap-2 sm:shrink-0">
          {game.error ? (
            <>
              <button type="button" onClick={game.clearError} className="h-11 px-2 text-xs font-semibold text-muted hover:text-fg">
                Dismiss
              </button>
              <Button size="lg" variant="glow" leadingIcon={<RotateCcw />} onClick={() => void game.start(settings)} loading={game.loading}>
                Retry
              </Button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={reset}
                className="inline-flex h-11 items-center gap-1.5 whitespace-nowrap rounded-xl px-2.5 text-xs font-semibold text-muted transition-colors hover:text-fg"
              >
                <RotateCcw className="size-3.5" aria-hidden />
                Reset to defaults
              </button>
              <Button
                size="lg"
                variant="glow"
                leadingIcon={<Play className="fill-current" />}
                onClick={() => void game.start(settings)}
                loading={game.loading}
                className="flex-1 sm:flex-none sm:min-w-40"
                data-testid="start-game"
              >
                {game.loading ? `Loading ${songs > 0 ? `~${songs.toLocaleString()} ` : ''}songs…` : 'Start'}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
    </Portal>
  );
}
