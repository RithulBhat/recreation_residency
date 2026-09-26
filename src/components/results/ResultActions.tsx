import { useEffect, useMemo, useState } from 'react';
import { Home, RotateCcw, Settings2 } from 'lucide-react';
import type { GameState } from '@/types';
import { Button, toast } from '@/components/ui';
import { buildChallengeUrl } from '@/game/challenge';
import { getPack } from '@/lib/catalog';
import { R } from '@/routes';
import { rankFor } from '@/stats/rank';
import { challengeShareText, shareOrCopy } from '@/stats/share';
import { prepareShareCard, shareCard, type ShareCardOptions } from '@/stats/shareCard';
import { useSettingsStore } from '@/store/settingsStore';
import { useStatsStore } from '@/store/statsStore';
import { ShareMenu } from './ShareMenu';

export interface ResultActionsProps {
  state: GameState;
  onPlayAgain: () => void;
  loading: boolean;
}

/** `encodeChallenge` keeps this many track ids; the online-duel `init` has the same cap. */
const MAX_CHALLENGE_TRACKS = 60;

/**
 * Track ids for a challenge link: the whole run (played rounds + still-queued tracks), not just the
 * answers. The friend's engine orders them with the same seed, so they hear the same songs — and the
 * autocomplete pool is no longer the answer sheet.
 */
export function challengeTrackIds(state: GameState): number[] {
  return [...state.rounds.map((r) => r.track.id), ...state.queue.map((t) => t.id)].slice(0, MAX_CHALLENGE_TRACKS);
}

/** `Pop Hits`, `Pop Hits + Burna Boy` — pack names for the card's brag line. */
export function packLabel(packIds: readonly string[]): string {
  const names = packIds.map((id) => getPack(id)?.name ?? id).filter((n) => n.length > 0);
  return names.join(' + ');
}

/** The share card's footer + caption point at the game, not the residency root. */
function siteUrl(): string {
  return `${location.origin}${location.pathname}#${R.songooner.home}`;
}

function reportShare(outcome: 'shared' | 'copied' | 'failed', what: string): void {
  if (outcome === 'copied') toast.success(`${what} copied`, 'Paste it anywhere.');
  else if (outcome === 'failed') toast.error("Couldn't share", 'Your browser blocked the clipboard.');
}

/** Run `cb` once the screen has settled (idle callback, or a short delay where there is none). */
function whenIdle(cb: () => void): () => void {
  if (typeof window.requestIdleCallback === 'function') {
    const id = window.requestIdleCallback(cb, { timeout: 1500 });
    return () => window.cancelIdleCallback(id);
  }
  const id = window.setTimeout(cb, 400);
  return () => window.clearTimeout(id);
}

export function ResultActions({ state, onPlayAgain, loading }: ResultActionsProps) {
  const playerName = useSettingsStore((s) => s.playerName);
  const totals = useStatsStore((s) => s.totals);
  const [busy, setBusy] = useState(false);
  const { settings } = state;

  const cardOptions = useMemo<ShareCardOptions>(
    () => ({ url: siteUrl(), packLabel: packLabel(settings.packIds), rank: rankFor(totals.xp), clubCount: totals.byClipBucket['0.1']?.correct ?? 0 }),
    [settings.packIds, totals.xp, totals.byClipBucket],
  );

  // Paint the card while the tickers run so the share sheet opens inside the tap's gesture window.
  useEffect(() => whenIdle(() => void prepareShareCard(state, cardOptions).catch(() => undefined)), [state, cardOptions]);

  const card = async () => {
    setBusy(true);
    try {
      const outcome = await shareCard(state, cardOptions);
      if (outcome === 'downloaded') toast.success('Card saved', 'Caption copied — post them together.');
      else if (outcome === 'copied') toast.success('Caption copied', "This browser wouldn't save the picture.");
      else if (outcome === 'failed') toast.error("Couldn't build the card", 'Try again in a moment.');
    } finally {
      setBusy(false);
    }
  };

  const challenge = async () => {
    if (!settings.seed) {
      toast.error("Can't build a challenge", 'This game was not seeded.');
      return;
    }
    const url = buildChallengeUrl({
      v: 1,
      seed: settings.seed,
      settings: {
        mode: settings.mode,
        packIds: settings.packIds,
        difficulty: settings.difficulty,
        clipMode: settings.clipMode,
        clipLength: settings.clipLength,
        stages: settings.stages,
        tries: settings.tries,
        rounds: settings.rounds,
        startPosition: settings.startPosition,
        guessTarget: settings.guessTarget,
        hintsEnabled: settings.hintsEnabled,
        roundTimer: settings.roundTimer,
        modifiers: settings.modifiers,
        explicitFilter: settings.explicitFilter,
      },
      by: playerName || 'A friend',
      score: state.totalScore,
      trackIds: challengeTrackIds(state),
    });
    const outcome = await shareOrCopy(challengeShareText(playerName || 'A friend', state.totalScore, url));
    reportShare(outcome, 'Challenge link');
  };

  return (
    <section className="flex flex-col gap-2" aria-label="What next" data-testid="result-actions">
      <div className="grid grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] gap-2 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Button variant="glow" size="lg" leadingIcon={<RotateCcw />} onClick={onPlayAgain} loading={loading} data-testid="play-again">
          Play again
        </Button>
        <ShareMenu onCard={card} onChallenge={challenge} busy={busy} />
      </div>
      <div className="flex flex-wrap items-center justify-center gap-x-1">
        <Button variant="ghost" size="sm" leadingIcon={<Settings2 />} to={R.songooner.setup}>
          Change settings
        </Button>
        <Button variant="ghost" size="sm" leadingIcon={<Home />} to={R.songooner.home}>
          Home
        </Button>
      </div>
    </section>
  );
}
