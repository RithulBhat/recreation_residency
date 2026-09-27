/**
 * The Play screen's one `h1`.
 *
 * The regression this guards: `/songooner/play` shipped with NO `h1` at all — an audit of the idle,
 * played, hints, wrong, win-reveal and lose-reveal states found zero on every one of them, while every
 * other route has exactly one. Scout's play screen names itself after the round; this is the same
 * heading for Songooner, rendered `sr-only` because the top bar already says it on screen.
 */
import { describe, expect, it } from 'vitest';
import { makeTrack } from '@/game/fixtures';
import { normalizeSettings } from '@/game/presets';
import { createInitialState, reduce } from '@/game/engine';
import type { GameSettings, GameState, Round } from '@/types';
import { playTitle } from './Play';

function stateOf(over: Partial<GameSettings>): GameState {
  const settings = normalizeSettings({ packIds: ['pop-hits'], rounds: 3, seed: 'h1', ...over });
  const tracks = [makeTrack({ id: 1 }), makeTrack({ id: 2 }), makeTrack({ id: 3 })];
  return reduce(createInitialState(), { type: 'start', settings, tracks, now: 0 });
}

const roundAt = (state: GameState, index: number): Round => {
  const round = state.rounds[index];
  if (!round) throw new Error(`no round ${index}`);
  return round;
};

describe('playTitle', () => {
  it('names the mode, the round and what the guess box wants', () => {
    const state = stateOf({ mode: 'fixed', guessTarget: 'title' });
    expect(playTitle(state, roundAt(state, 0))).toBe('Fixed clip — round 1 of 3, name the song');
  });

  it('counts the round the player is actually on', () => {
    const state = stateOf({ mode: 'classic' });
    // Rounds are created as they open, so the third one is the first with its index moved on.
    expect(playTitle(state, { ...roundAt(state, 0), index: 2 })).toContain('round 3 of 3');
  });

  it('follows the guess target', () => {
    expect(playTitle(stateOf({ guessTarget: 'artist' }), roundAt(stateOf({ guessTarget: 'artist' }), 0))).toContain(
      'name the artist',
    );
    const both = stateOf({ guessTarget: 'both' });
    expect(playTitle(both, roundAt(both, 0))).toContain('name the artist and the song');
  });

  it('does not promise a round count Blitz does not have', () => {
    const blitz = stateOf({ mode: 'blitz' });
    const title = playTitle(blitz, roundAt(blitz, 0));
    expect(title).toContain('Blitz — round 1,');
    expect(title).not.toContain(' of ');
  });
});
