import { useState } from 'react';
import { Home, Link2, RotateCcw, Settings2, Share2 } from 'lucide-react';
import { Button, cn, toast } from '@/components/ui';
import { R } from '@/routes';
import { buildScoutChallengeUrl } from '@/scout/challenge';
import { scoutMode, scoutPack } from '@/scout/packs';
import { shareOrCopy } from '@/stats/share';
import type { ScoutState } from '@/scout/types';
import type { ScoutGameRecord } from '@/store/scoutResultStore';
import { useSettingsStore } from '@/store/settingsStore';

export interface ResultActionsProps {
  state: ScoutState;
  record: ScoutGameRecord;
  onPlayAgain: () => void;
  loading: boolean;
  className?: string;
}

/** `encodeScoutChallenge` keeps this many subject keys. */
const MAX_CHALLENGE_SUBJECTS = 60;

/**
 * Subject keys for a challenge link: the WHOLE run (played + still queued), not just the answers, so
 * the friend's engine draws the same subjects in the same seeded order.
 */
export function challengeSubjectKeys(state: ScoutState): string[] {
  return [
    ...state.rounds.map((r) => `${r.subject.kind}:${r.subject.id}`),
    ...state.queue.map((s) => `${s.kind}:${s.id}`),
  ].slice(0, MAX_CHALLENGE_SUBJECTS);
}

/** The shareable brag: mode, grid, tally, link. */
export function scoutShareText(record: ScoutGameRecord, url?: string): string {
  const mode = scoutMode(record.mode);
  const packs = record.packIds.map((id) => scoutPack(id)?.name ?? id).join(' + ');
  const head = `Highlight Scout · ${record.mixModes ? 'Mixed modes' : (mode?.name ?? record.mode)}${packs === '' ? '' : ` · ${packs}`}`;
  const tally = `${record.correct}/${record.played} · ${record.score.toLocaleString('en-US')} pts`;
  return [head, record.grid, tally, url].filter((s): s is string => typeof s === 'string' && s !== '').join('\n');
}

export function scoutChallengeText(name: string, score: number, url: string): string {
  const who = name.trim() === '' ? 'A friend' : name.trim();
  return `${who} scouted ${score.toLocaleString('en-US')} on Highlight Scout. Same players, same order — beat it.\n${url}`;
}

function report(outcome: 'shared' | 'copied' | 'failed', what: string): void {
  if (outcome === 'copied') toast.success(`${what} copied`, 'Paste it anywhere.');
  else if (outcome === 'failed') toast.error("Couldn't share", 'Your browser blocked the clipboard.');
}

/** Play again · Share · Challenge a friend · Change setup · Home. */
export function ResultActions({ state, record, onPlayAgain, loading, className }: ResultActionsProps) {
  const playerName = useSettingsStore((s) => s.playerName);
  const [busy, setBusy] = useState(false);
  const { settings } = state;

  const share = async () => {
    setBusy(true);
    try {
      const url = `${location.origin}${location.pathname}#${R.scout.home}`;
      report(await shareOrCopy(scoutShareText(record, url)), 'Result');
    } finally {
      setBusy(false);
    }
  };

  const challenge = async () => {
    if (!settings.seed) {
      toast.error("Can't build a challenge", 'This session was not seeded.');
      return;
    }
    setBusy(true);
    try {
      const url = buildScoutChallengeUrl({
        v: 1,
        seed: settings.seed,
        settings: {
          mode: settings.mode,
          packIds: settings.packIds,
          difficulty: settings.difficulty,
          tries: settings.tries,
          rounds: settings.rounds,
          roundTimer: settings.roundTimer,
          hintsEnabled: settings.hintsEnabled,
          mixModes: settings.mixModes,
        },
        by: playerName || 'A friend',
        score: record.score,
        subjects: challengeSubjectKeys(state),
      });
      report(await shareOrCopy(scoutChallengeText(playerName, record.score, url)), 'Challenge link');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className={cn('flex flex-col gap-2', className)} aria-label="What next" data-testid="scout-result-actions">
      {/* Phones: the primary action owns a row, the two shares split the next one. */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <Button
          variant="glow"
          size="lg"
          leadingIcon={<RotateCcw />}
          onClick={onPlayAgain}
          loading={loading}
          className="col-span-2 sm:col-span-1"
          data-testid="scout-play-again"
        >
          Play again
        </Button>
        <Button variant="secondary" size="lg" leadingIcon={<Share2 />} onClick={() => void share()} disabled={busy} data-testid="scout-share">
          Share
        </Button>
        <Button
          variant="secondary"
          size="lg"
          leadingIcon={<Link2 />}
          onClick={() => void challenge()}
          disabled={busy}
          data-testid="scout-challenge"
        >
          Challenge
        </Button>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-x-1">
        <Button variant="ghost" size="sm" leadingIcon={<Settings2 />} to={R.scout.setup}>
          Change setup
        </Button>
        <Button variant="ghost" size="sm" leadingIcon={<Home />} to={R.scout.home}>
          Home
        </Button>
      </div>
    </section>
  );
}
