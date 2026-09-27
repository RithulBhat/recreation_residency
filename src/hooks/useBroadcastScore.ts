/**
 * Wires Highlight Scout's BROADCAST SCORE (`@/audio/broadcast`) to the run in `useScoutStore`.
 *
 * Highlight Scout only — Songooner never mounts this, and the hook reads nothing but the Scout store,
 * so there is no path by which a Songooner game could trigger a cue.
 *
 *   kickoff   a session starts (a new run id reaches 'playing')
 *   bigCall   a subject named on the FIRST rung — the hardest one, least revealed
 *   turnover  a round ends any way but won
 *   halftime  a new round opens
 *   bed       loops while a round is live, and stops on the reveal
 *
 * Gating, in order: the app's `sfxEnabled` and volume (a muted app is silent, full stop), then the
 * player's own two toggles, then the context — a cue is only ever scheduled on a context a user
 * gesture has already unlocked (`Broadcast.play` drops it otherwise, and never resumes one itself).
 *
 * BLITZ gets the kickoff and the big calls but neither the bumper nor the fall: its rounds turn over
 * every couple of seconds, and a 0.7 s brass figure on each one would bury the game's own feedback —
 * which is the one thing the score must never do.
 */

import { useCallback, useEffect, useRef } from 'react';
import type { BroadcastCue } from '@/types';
import type { ScoutRound, ScoutState } from '@/scout/types';
import { getAudioEngine, getBroadcast } from '@/audio';
import { type ScoutBroadcastPrefs, useScoutSettingsStore, useScoutStore } from '@/store/scoutStore';
import { useSettingsStore } from '@/store/settingsStore';

/**
 * Effective 0..1 app volume. The header control writes `sg:volume` / `sg:muted` and the settings
 * store is the fallback — the same contract `@/components/play/useGameAudio` reads, restated here so
 * a Scout hook does not have to import Songooner's Play internals.
 */
export function appVolume(): number {
  let volume = useSettingsStore.getState().volume;
  try {
    const raw = localStorage.getItem('sg:volume');
    const v = raw === null ? Number.NaN : Number(raw);
    if (Number.isFinite(v)) volume = Math.min(1, Math.max(0, v));
    if (localStorage.getItem('sg:muted') === '1') volume = 0;
  } catch {
    /* storage unavailable */
  }
  return volume;
}

/**
 * Push the player's preferences onto the score. The app's own audio prefs come FIRST: a muted app or
 * `sfxEnabled: false` silences the whole thing whatever the two toggles say. Exported because the
 * lobby control needs the same gating before it previews a cue.
 */
export function applyBroadcastPrefs(prefs: ScoutBroadcastPrefs, sfxEnabled: boolean): void {
  const broadcast = getBroadcast();
  const v = appVolume();
  const audible = sfxEnabled && v > 0;
  broadcast.setEnabled(audible && (prefs.stings || prefs.bed));
  broadcast.setBedEnabled(audible && prefs.bed);
  broadcast.setVolume(v * prefs.volume);
}

/**
 * Fire a cue, unlocking first. `unlock()` is idempotent and can only ever resume a context the player
 * has already permitted, so this keeps the kickoff (which lands a tick after the Start tap) while
 * staying silent forever on a screen nobody has touched.
 */
export function fireCue(cue: BroadcastCue): void {
  void getAudioEngine()
    .unlock()
    .then(() => getBroadcast().play(cue))
    .catch(() => undefined);
}

/** What the score has already reacted to, so no event fires twice as the state re-renders. */
interface Seen {
  runId: string | null;
  ended: Set<number>;
  opened: Set<number>;
}

function freshSeen(runId: string | null): Seen {
  return { runId, ended: new Set(), opened: new Set() };
}

/** The cue a finished round deserves, or null when the game's own sfx says enough. */
export function roundCue(round: ScoutRound, blitz: boolean): BroadcastCue | null {
  if (round.status === 'playing') return null;
  if (round.status === 'won') {
    // Only the hardest rung earns the big call; an ordinary win keeps the 'correct' chime it has.
    const hit = round.guesses.find((g) => g.verdict === 'correct');
    return hit !== undefined && hit.tryIndex === 0 ? 'bigCall' : null;
  }
  return blitz ? null : 'turnover';
}

/**
 * A run still on its first subject with nothing decided yet.
 *
 * This is what separates a SESSION STARTING from the hook merely meeting a run it has not seen: come
 * back to the play screen on round seven (the resume banner, or a trip to the lobby and back) and the
 * score picks up quietly instead of blowing the kickoff over a game already in progress.
 */
export function isFreshRun(state: ScoutState): boolean {
  return state.currentRound === 0 && !state.rounds.some((r) => r.status !== 'playing');
}

/** A round is live and being played right now (so the bed should be running). */
export function isRoundLive(state: ScoutState): boolean {
  return state.status === 'playing' && state.rounds[state.currentRound]?.status === 'playing';
}

export function useBroadcastScore(): void {
  const state = useScoutStore((s) => s.state);
  const prefs = useScoutSettingsStore((s) => s.broadcast);
  const sfxEnabled = useSettingsStore((s) => s.sfxEnabled);
  const volume = useSettingsStore((s) => s.volume);
  const seen = useRef<Seen>(freshSeen(null));
  const stings = useRef(prefs.stings);
  stings.current = prefs.stings;

  useEffect(() => {
    applyBroadcastPrefs(prefs, sfxEnabled);
  }, [prefs, sfxEnabled, volume]);

  const fire = useCallback((cue: BroadcastCue) => {
    if (!stings.current) return;
    fireCue(cue);
  }, []);

  useEffect(() => {
    const memo = seen.current;
    if (state.status === 'idle' || state.status === 'loading') {
      if (memo.runId !== null) {
        getBroadcast().stopBed();
        seen.current = freshSeen(null);
      }
      return;
    }
    if (state.id !== memo.runId) {
      const fresh = freshSeen(state.id);
      // Everything already on the board is history, not news. Without this a remount mid-run would
      // replay a cue for every round that had ever ended, all at once, on the next state change.
      for (const round of state.rounds) if (round.status !== 'playing') fresh.ended.add(round.index);
      fresh.opened.add(state.currentRound); // the kickoff IS this round's bumper
      seen.current = fresh;
      if (isFreshRun(state)) fire('kickoff');
      return;
    }

    const blitz = state.settings.format === 'blitz';
    for (const round of state.rounds) {
      if (round.status === 'playing' || memo.ended.has(round.index)) continue;
      memo.ended.add(round.index);
      const cue = roundCue(round, blitz);
      if (cue) fire(cue);
    }
    // A new round on screen gets the bumper — never in blitz, which never pauses between them.
    const current = state.currentRound;
    if (!blitz && state.status === 'playing' && !memo.opened.has(current)) {
      memo.opened.add(current);
      fire('halftime');
    }
  }, [state, fire]);

  // The bed runs with the round and stops on the reveal, so the answer is never scored over.
  const live = isRoundLive(state);
  useEffect(() => {
    const broadcast = getBroadcast();
    if (live && prefs.bed) broadcast.startBed();
    else broadcast.stopBed();
  }, [live, prefs.bed]);

  // Leaving the screen takes the bed with it.
  useEffect(() => () => getBroadcast().stopBed(), []);
}
