import { describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import type { UseOnlineDuel } from '@/net';
import type { InitMsg } from '@/net/protocol';
import { normalizeSettings } from '@/game/presets';
import { challengeLine } from './ChallengeBanner';
import { msUntilMidnight } from './DailyCard';
import { useRematch } from './useRematch';

const navigate = vi.fn();
const startLoadedGame = vi.fn();
vi.mock('react-router', async (orig) => ({ ...(await orig<typeof import('react-router')>()), useNavigate: () => navigate }));
vi.mock('@/lib/startGame', () => ({ startLoadedGame: (...args: unknown[]) => startLoadedGame(...args) }));

describe('challengeLine', () => {
  it('compares the score with the challenger', () => {
    expect(challengeLine({ by: 'Maya', score: 6420 }, 7000)).toEqual({ text: "You beat Maya's 6,420!", beat: true });
    expect(challengeLine({ by: 'Maya', score: 6420 }, 100)).toEqual({ text: 'Maya still leads with 6,420.', beat: false });
    expect(challengeLine({ by: '', score: 5 }, 5).text).toBe('Dead heat with Your friend at 5.');
  });
});

describe('msUntilMidnight', () => {
  it('counts to the next local midnight', () => {
    const now = new Date(2026, 8, 26, 23, 59, 0);
    expect(msUntilMidnight(now)).toBe(60_000);
  });
});

function duelStub(partial: Partial<UseOnlineDuel>): UseOnlineDuel {
  const noop = vi.fn();
  return {
    status: 'finished',
    code: 'ABCDEF',
    role: 'host',
    me: null,
    opponent: null,
    latencyMs: 0,
    error: null,
    startAt: null,
    countdown: 0,
    initPayload: null,
    opponentReady: true,
    opponentProgress: null,
    opponentFinished: null,
    myFinished: null,
    rematchOffer: null,
    rematchSeed: null,
    rematchPending: false,
    incomingEmotes: [],
    host: noop,
    join: noop,
    sendInit: vi.fn(),
    ready: vi.fn(),
    start: vi.fn(),
    sendProgress: noop,
    sendFinished: noop,
    emote: noop,
    rematch: noop,
    acceptRematch: noop,
    clearEmotes: noop,
    leave: noop,
    isHost: true,
    connected: true,
    outcome: 'win',
    ...partial,
  };
}

const wrapper = ({ children }: { children: ReactNode }) => <MemoryRouter>{children}</MemoryRouter>;
const init = (seed: string): InitMsg => ({ type: 'init', settings: normalizeSettings({ seed }), tracks: [] });

describe('useRematch', () => {
  it('host: re-sends init on rematchSeed, starts once the guest is ready, launches at countdown 0', () => {
    const old = init('old');
    let duel = duelStub({ initPayload: old });
    const { rerender } = renderHook(({ d }: { d: UseOnlineDuel }) => useRematch(d, true), { wrapper, initialProps: { d: duel } });
    expect(duel.sendInit).not.toHaveBeenCalled();

    duel = duelStub({ initPayload: old, rematchSeed: 'fresh', opponentReady: false, countdown: null });
    rerender({ d: duel });
    expect(duel.sendInit).toHaveBeenCalledTimes(1);
    expect(duel.sendInit).toHaveBeenCalledWith(old.settings, old.tracks);

    const fresh = init('fresh');
    duel = duelStub({ initPayload: fresh, rematchSeed: null, opponentReady: false, countdown: null, start: duel.start, sendInit: duel.sendInit });
    rerender({ d: duel });
    expect(duel.start).not.toHaveBeenCalled();
    duel = duelStub({ initPayload: fresh, opponentReady: true, countdown: null, start: duel.start });
    rerender({ d: duel });
    expect(duel.start).toHaveBeenCalledTimes(1);

    for (const countdown of [3, 2, 1]) {
      duel = duelStub({ initPayload: fresh, opponentReady: true, countdown, start: duel.start });
      rerender({ d: duel });
    }
    expect(startLoadedGame).not.toHaveBeenCalled();
    duel = duelStub({ initPayload: fresh, opponentReady: true, countdown: 0, start: duel.start });
    act(() => rerender({ d: duel }));
    expect(startLoadedGame).toHaveBeenCalledWith(fresh);
    expect(navigate).toHaveBeenCalledWith('/play');
  });

  it('guest: acknowledges a new init with ready(), ignores the one already played', () => {
    const old = init('old');
    let duel = duelStub({ initPayload: old, role: 'guest', isHost: false });
    const { rerender } = renderHook(({ d }: { d: UseOnlineDuel }) => useRematch(d, true), { wrapper, initialProps: { d: duel } });
    expect(duel.ready).not.toHaveBeenCalled();
    const fresh = init('fresh');
    duel = duelStub({ initPayload: fresh, role: 'guest', isHost: false, countdown: null });
    rerender({ d: duel });
    expect(duel.ready).toHaveBeenCalledTimes(1);
  });
});
