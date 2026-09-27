import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Broadcast, BroadcastCue } from '@/types';
import type { ScoutState } from '@/scout/types';
import { makeScoutRun } from '@/scout/statsTestFactory';
import { DEFAULT_SCOUT_BROADCAST, useScoutSettingsStore, useScoutStore } from '@/store/scoutStore';
import { useSettingsStore } from '@/store/settingsStore';

/** A Broadcast that records what it was asked to do. */
function spyBroadcast(): Broadcast & { cues: BroadcastCue[]; bedStarts: number; bedStops: number } {
  const calls = {
    cues: [] as BroadcastCue[],
    bedStarts: 0,
    bedStops: 0,
    enabled: true,
    bedEnabled: false,
    volume: 1,
    running: false,
  };
  return {
    cues: calls.cues,
    get bedStarts() {
      return calls.bedStarts;
    },
    get bedStops() {
      return calls.bedStops;
    },
    play: (cue) => calls.cues.push(cue),
    startBed: () => {
      calls.bedStarts += 1;
      calls.running = calls.bedEnabled;
    },
    stopBed: () => {
      calls.bedStops += 1;
      calls.running = false;
    },
    isBedRunning: () => calls.running,
    duck: () => undefined,
    setEnabled: (on) => {
      calls.enabled = on;
    },
    isEnabled: () => calls.enabled,
    setBedEnabled: (on) => {
      calls.bedEnabled = on;
    },
    isBedEnabled: () => calls.bedEnabled,
    setVolume: (v) => {
      calls.volume = v;
    },
  } as Broadcast & { cues: BroadcastCue[]; bedStarts: number; bedStops: number };
}

let broadcast = spyBroadcast();
const unlock = vi.fn(() => Promise.resolve());

vi.mock('@/audio', () => ({
  getBroadcast: () => broadcast,
  getAudioEngine: () => ({ unlock }),
}));

const { useBroadcastScore, appVolume, roundCue, isRoundLive, isFreshRun } = await import('./useBroadcastScore');

/** A run in progress: the first `ended` rounds are finished, the next one is live. */
function liveRun(over: Parameters<typeof makeScoutRun>[0] = {}): ScoutState {
  const run = makeScoutRun({ status: 'playing', ...over });
  return { ...run, finishedAt: undefined, endReason: undefined };
}

/** Push a state into the store and let the promise-based cue firing settle. */
async function push(state: ScoutState): Promise<void> {
  await act(async () => {
    useScoutStore.setState({ state });
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  broadcast = spyBroadcast();
  unlock.mockClear();
  localStorage.clear();
  useScoutStore.getState().reset();
  useScoutSettingsStore.setState({ broadcast: { ...DEFAULT_SCOUT_BROADCAST } });
  useSettingsStore.setState({ sfxEnabled: true, volume: 0.8 });
});

afterEach(() => {
  useScoutStore.getState().reset();
});

describe('roundCue', () => {
  const round = (over: Parameters<typeof makeScoutRun>[0]): ScoutState['rounds'][number] =>
    makeScoutRun(over).rounds[0];

  it('saves the big call for a name taken on the first rung', () => {
    expect(roundCue(round({ rounds: [{ shape: 'won', rung: 0 }] }), false)).toBe('bigCall');
    expect(roundCue(round({ rounds: [{ shape: 'won', rung: 2 }] }), false)).toBeNull();
  });

  it('calls a turnover on anything but a win, except in blitz', () => {
    for (const shape of ['lost', 'skipped', 'timeout'] as const) {
      expect(roundCue(round({ rounds: [{ shape }] }), false)).toBe('turnover');
      expect(roundCue(round({ rounds: [{ shape }] }), true)).toBeNull();
    }
  });

  it('says nothing about a round still being played', () => {
    expect(roundCue(round({ rounds: [{ shape: 'unresolved' }] }), false)).toBeNull();
  });
});

describe('isRoundLive', () => {
  it('is true only while the current round is being played', () => {
    expect(isRoundLive(liveRun({ rounds: [{ shape: 'unresolved' }] }))).toBe(true);
    expect(isRoundLive(makeScoutRun({ rounds: [{ shape: 'won' }] }))).toBe(false);
    expect(isRoundLive({ ...liveRun({ rounds: [{ shape: 'won' }] }), status: 'round-over' })).toBe(false);
  });
});

describe('isFreshRun', () => {
  it('is true only while the run is on its first subject with nothing decided', () => {
    expect(isFreshRun(liveRun({ rounds: [{ shape: 'unresolved' }] }))).toBe(true);
    const mid = liveRun({ rounds: [{ shape: 'won' }, { shape: 'unresolved' }] });
    expect(isFreshRun({ ...mid, currentRound: 1 })).toBe(false); // past the first subject
    expect(isFreshRun(mid)).toBe(false); // round 0 is already decided
  });
});

describe('appVolume', () => {
  it('prefers the header control and treats mute as zero', () => {
    expect(appVolume()).toBeCloseTo(0.8);
    localStorage.setItem('sg:volume', '0.35');
    expect(appVolume()).toBeCloseTo(0.35);
    localStorage.setItem('sg:muted', '1');
    expect(appVolume()).toBe(0);
  });
});

describe('useBroadcastScore', () => {
  it('kicks off once when a session starts, and again only for a new run', async () => {
    renderHook(() => useBroadcastScore());
    expect(broadcast.cues).toEqual([]);

    await push(liveRun({ id: 'run-a', rounds: [{ shape: 'unresolved' }] }));
    expect(broadcast.cues).toEqual(['kickoff']);

    // Same run, re-rendered: no second kickoff, and no bumper for the round it opened on.
    await push(liveRun({ id: 'run-a', rounds: [{ shape: 'unresolved' }] }));
    expect(broadcast.cues).toEqual(['kickoff']);

    await push(liveRun({ id: 'run-b', rounds: [{ shape: 'unresolved' }] }));
    expect(broadcast.cues).toEqual(['kickoff', 'kickoff']);
  });

  it('calls the first-rung answer and bumps into the next round', async () => {
    renderHook(() => useBroadcastScore());
    await push(liveRun({ id: 'r', rounds: [{ shape: 'unresolved' }] }));
    expect(broadcast.cues).toEqual(['kickoff']);

    // Round 0 is named on the first rung; round 1 is now the live one.
    const next = liveRun({ id: 'r', rounds: [{ shape: 'won', rung: 0 }, { shape: 'unresolved' }] });
    await push({ ...next, currentRound: 1 });
    expect(broadcast.cues).toEqual(['kickoff', 'bigCall', 'halftime']);
  });

  it('calls a turnover when a round is lost', async () => {
    renderHook(() => useBroadcastScore());
    await push(liveRun({ id: 'r', rounds: [{ shape: 'unresolved' }] }));
    const over = liveRun({ id: 'r', rounds: [{ shape: 'lost' }] });
    await push({ ...over, status: 'round-over' });
    expect(broadcast.cues).toEqual(['kickoff', 'turnover']);
  });

  it('leaves blitz alone but for the kickoff and the big calls', async () => {
    renderHook(() => useBroadcastScore());
    const settings = { format: 'blitz' as const };
    await push(liveRun({ id: 'b', settings, rounds: [{ shape: 'unresolved' }] }));
    const next = liveRun({
      id: 'b',
      settings,
      rounds: [{ shape: 'lost' }, { shape: 'won', rung: 0 }, { shape: 'unresolved' }],
    });
    await push({ ...next, currentRound: 2 });
    expect(broadcast.cues).toEqual(['kickoff', 'bigCall']);
  });

  it('never fires a sting while the stings toggle is off', async () => {
    useScoutSettingsStore.setState({ broadcast: { ...DEFAULT_SCOUT_BROADCAST, stings: false } });
    renderHook(() => useBroadcastScore());
    await push(liveRun({ id: 'r', rounds: [{ shape: 'unresolved' }] }));
    await push({ ...liveRun({ id: 'r', rounds: [{ shape: 'lost' }] }), status: 'round-over' });
    expect(broadcast.cues).toEqual([]);
    expect(unlock).not.toHaveBeenCalled();
  });

  it('runs the bed only while a round is live, and only when it is switched on', async () => {
    renderHook(() => useBroadcastScore());
    await push(liveRun({ id: 'r', rounds: [{ shape: 'unresolved' }] }));
    expect(broadcast.bedStarts).toBe(0); // the bed defaults to off
    expect(broadcast.isBedEnabled()).toBe(false);

    await act(async () => {
      useScoutSettingsStore.setState({ broadcast: { ...DEFAULT_SCOUT_BROADCAST, bed: true } });
      await Promise.resolve();
    });
    expect(broadcast.isBedEnabled()).toBe(true);
    expect(broadcast.bedStarts).toBe(1);

    // The reveal stops it.
    await push({ ...liveRun({ id: 'r', rounds: [{ shape: 'won', rung: 1 }] }), status: 'round-over' });
    expect(broadcast.isBedRunning()).toBe(false);
    expect(broadcast.bedStops).toBeGreaterThan(0);
  });

  it('stays silent in a muted app, whatever the toggles say', async () => {
    localStorage.setItem('sg:muted', '1');
    useScoutSettingsStore.setState({ broadcast: { stings: true, bed: true, volume: 1 } });
    renderHook(() => useBroadcastScore());
    expect(broadcast.isEnabled()).toBe(false);
    expect(broadcast.isBedEnabled()).toBe(false);

    await act(async () => {
      useSettingsStore.setState({ sfxEnabled: false });
      await Promise.resolve();
    });
    expect(broadcast.isEnabled()).toBe(false);
  });

  it('scales its own volume by the app volume', async () => {
    useScoutSettingsStore.setState({ broadcast: { stings: true, bed: false, volume: 0.5 } });
    localStorage.setItem('sg:volume', '0.6');
    const spy = vi.spyOn(broadcast, 'setVolume');
    renderHook(() => useBroadcastScore());
    expect(spy).toHaveBeenLastCalledWith(0.3);
  });

  it('picks a run back up quietly instead of replaying every round that already ended', async () => {
    // The player leaves the play screen on round 3 and comes back: the hook has never seen this run.
    const midRun = liveRun({
      id: 'resumed',
      rounds: [{ shape: 'won', rung: 0 }, { shape: 'lost' }, { shape: 'unresolved' }],
    });
    await push({ ...midRun, currentRound: 2 });
    renderHook(() => useBroadcastScore());
    await act(async () => {
      await Promise.resolve();
    });
    expect(broadcast.cues).toEqual([]); // no kickoff over a game in progress

    // ...and the rounds already on the board stay history when the next one lands.
    const after = liveRun({
      id: 'resumed',
      rounds: [{ shape: 'won', rung: 0 }, { shape: 'lost' }, { shape: 'lost' }, { shape: 'unresolved' }],
    });
    await push({ ...after, currentRound: 3 });
    expect(broadcast.cues).toEqual(['turnover', 'halftime']);
  });

  it('stops the bed when the run is dropped, and when the screen goes away', async () => {
    useScoutSettingsStore.setState({ broadcast: { ...DEFAULT_SCOUT_BROADCAST, bed: true } });
    const view = renderHook(() => useBroadcastScore());
    await push(liveRun({ id: 'r', rounds: [{ shape: 'unresolved' }] }));
    expect(broadcast.isBedRunning()).toBe(true);

    await act(async () => {
      useScoutStore.getState().reset();
      await Promise.resolve();
    });
    expect(broadcast.isBedRunning()).toBe(false);

    const stops = broadcast.bedStops;
    view.unmount();
    expect(broadcast.bedStops).toBeGreaterThan(stops);
  });
});
