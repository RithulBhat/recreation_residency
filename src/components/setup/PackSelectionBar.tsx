import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Play, RotateCcw, Settings2 } from 'lucide-react';
import type { Pack } from '@/types';
import { Button } from '@/components/ui/Button';
import { Portal } from '@/components/ui/internal';
import { useBarBottom } from './StartBar';
import { poolEstimate } from './summary';

export interface PackSelectionBarProps {
  selected: readonly Pack[];
  loading: boolean;
  error: string | null;
  onPlay: () => void;
  onAddToSetup: () => void;
  onClear: () => void;
  onRetry: () => void;
}

/** Floating "Play N selected" bar for the pack browser. Also surfaces load state/errors. */
export function PackSelectionBar({ selected, loading, error, onPlay, onAddToSetup, onClear, onRetry }: PackSelectionBarProps) {
  const reduce = useReducedMotion();
  const visible = selected.length > 0 || loading || error !== null;
  const songs = poolEstimate(selected.map((p) => p.approxSize));
  const bottom = useBarBottom();

  return (
    <Portal>
    <AnimatePresence>
      {visible && (
        <motion.div
          key="bar"
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, y: 24 }}
          transition={{ type: 'spring', stiffness: 400, damping: 34 }}
          className="pointer-events-none fixed inset-x-0 z-40 flex justify-center px-3 md:px-6"
          data-testid="pack-selection-bar"
          style={{ bottom }}
        >
          <div className="glass-strong pointer-events-auto flex w-full max-w-2xl flex-wrap items-center justify-end gap-2 rounded-3xl bg-bg-elevated/95 p-2 pl-4 shadow-xl">
            {/* Full first row on phones; shares the row with the buttons from sm up. */}
            <div className="min-w-0 basis-full pt-1 sm:flex-1 sm:basis-0 sm:pt-0">
              {error ? (
                <p className="text-sm font-semibold text-danger" role="alert">
                  {error}
                </p>
              ) : loading ? (
                <p className="text-sm font-semibold text-fg" aria-live="polite">
                  Loading {songs > 0 ? `~${songs.toLocaleString()} ` : ''}songs…
                </p>
              ) : (
                <>
                  <p className="truncate text-sm font-bold text-fg">
                    {selected.length} selected{songs > 0 ? ` · ~${songs.toLocaleString()} songs` : ''}
                  </p>
                  <p className="truncate text-xs text-muted">{selected.map((p) => `${p.emoji} ${p.name}`).join(' · ')}</p>
                </>
              )}
            </div>
            {error ? (
              <Button size="sm" variant="secondary" leadingIcon={<RotateCcw />} onClick={onRetry}>
                Retry
              </Button>
            ) : (
              <>
                {selected.length > 0 && !loading && (
                  <button type="button" onClick={onClear} className="touch-hit-44 h-9 px-2 text-xs font-semibold text-muted hover:text-fg">
                    Clear
                  </button>
                )}
                {selected.length > 0 && (
                  <Button size="sm" variant="secondary" leadingIcon={<Settings2 />} onClick={onAddToSetup} disabled={loading}>
                    Add to setup
                  </Button>
                )}
                <Button size="md" pill leadingIcon={<Play className="fill-current" />} onClick={onPlay} loading={loading} disabled={selected.length === 0 && !loading}>
                  {selected.length > 0 ? `Play ${selected.length}` : 'Play'}
                </Button>
              </>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
    </Portal>
  );
}
