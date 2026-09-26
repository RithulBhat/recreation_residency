import { Home, Link2, RotateCcw, Settings2, Share2 } from 'lucide-react';
import type { GameState } from '@/types';
import { Button, toast } from '@/components/ui';
import { buildChallengeUrl } from '@/game/challenge';
import { challengeShareText, shareOrCopy, shareText } from '@/stats/share';
import { useSettingsStore } from '@/store/settingsStore';

export interface ResultActionsProps {
  state: GameState;
  onPlayAgain: () => void;
  loading: boolean;
}

function reportShare(outcome: 'shared' | 'copied' | 'failed', what: string): void {
  if (outcome === 'copied') toast.success(`${what} copied`, 'Paste it anywhere.');
  else if (outcome === 'failed') toast.error("Couldn't share", 'Your browser blocked the clipboard.');
}

export function ResultActions({ state, onPlayAgain, loading }: ResultActionsProps) {
  const playerName = useSettingsStore((s) => s.playerName);
  const { settings } = state;

  const share = async () => {
    const outcome = await shareOrCopy(shareText(state, { url: `${location.origin}${location.pathname}` }));
    reportShare(outcome, 'Result');
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
      trackIds: state.rounds.map((r) => r.track.id),
    });
    const outcome = await shareOrCopy(challengeShareText(playerName || 'A friend', state.totalScore, url));
    reportShare(outcome, 'Challenge link');
  };

  return (
    <section className="flex flex-col gap-2" aria-label="What next" data-testid="result-actions">
      <div className="grid grid-cols-2 gap-2">
        <Button variant="glow" size="lg" leadingIcon={<RotateCcw />} onClick={onPlayAgain} loading={loading}>
          Play again
        </Button>
        <Button variant="secondary" size="lg" leadingIcon={<Share2 />} onClick={share}>
          Share
        </Button>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Button variant="secondary" leadingIcon={<Link2 />} onClick={challenge} className="px-2">
          Challenge
        </Button>
        <Button variant="secondary" leadingIcon={<Settings2 />} to="/setup" className="px-2">
          Settings
        </Button>
        <Button variant="ghost" leadingIcon={<Home />} to="/" className="px-2">
          Home
        </Button>
      </div>
    </section>
  );
}
