/** Turning a finished Higher or Lower run into a shareable grid. */

import type { ShareCard, ShareMark } from '@/arcade/share';
import type { HiloState } from './types';

export function markFor(outcome: string | null): ShareMark {
  if (outcome === 'correct') return 'great';
  if (outcome === 'skipped') return 'skip';
  return 'miss';
}

export function shareCard(state: HiloState, opts: { daily?: string; url?: string } = {}): ShareCard {
  const correct = state.rounds.filter((r) => r.outcome === 'correct').length;
  return {
    title: opts.daily ? `Higher or Lower — Daily ${opts.daily}` : 'Higher or Lower',
    subtitle: `${correct} right · best streak ${state.bestStreak} · ${state.totalScore.toLocaleString()} points`,
    marks: state.rounds.map((r) => markFor(r.outcome)),
    url: opts.url,
  };
}
