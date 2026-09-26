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
import { rematchCopy } from './DuelOutcome';
import { blitzSummary, fastestWinSec, headline, heroLead } from './ResultsHero';
import { summarizeGame } from '@/stats/aggregate';
import { blitzGame, classicGame, duelGame, partyGame } from '@/stats/testFactory';

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
    myReady: false,
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
    expect(navigate).toHaveBeenCalledWith('/songooner/play');
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

describe('blitzSummary', () => {
  it('reads "N songs in 60 s · fastest · best streak"', () => {
    const game = blitzGame(7, 2);
    const record = summarizeGame(game);
    expect(blitzSummary(game, record)).toBe('7 songs in 90 s · fastest 1.5 s · best streak 7');
    const shutout = blitzGame(0, 3);
    expect(blitzSummary(shutout, summarizeGame(shutout))).toBe('0 songs in 90 s · best streak 0');
    expect(fastestWinSec(shutout)).toBeNull();
  });
});

describe('rematchCopy', () => {
  it('says who everyone is waiting for', () => {
    expect(rematchCopy('idle', 'Maya', null, true)).toEqual({ label: 'Rematch', note: null });
    expect(rematchCopy('pending', 'Maya', null, true).label).toBe('Waiting for Maya to accept…');
    expect(rematchCopy('offer', 'Maya', null, false)).toEqual({ label: 'Accept rematch', note: 'Maya wants a rematch!' });
    expect(rematchCopy('countdown', 'Maya', 3, true).label).toBe('Starting rematch in 3…');
    expect(rematchCopy('ready', 'Maya', null, false).note).toContain('Maya is starting');
    expect(rematchCopy('waitingReady', 'Maya', null, true).label).toBe('Waiting for Maya…');
  });
});

describe('useRematch phases', () => {
  it('reports the handshake phase from the duel state', () => {
    const old = init('old');
    const render = (d: UseOnlineDuel) => renderHook(() => useRematch(d, true), { wrapper }).result.current;
    expect(render(duelStub({ initPayload: old, countdown: null }))).toBe('idle');
    expect(render(duelStub({ initPayload: old, countdown: null, rematchPending: true }))).toBe('pending');
    expect(render(duelStub({ initPayload: old, countdown: null, rematchOffer: 'x' }))).toBe('offer');
    expect(render(duelStub({ initPayload: old, countdown: null, rematchSeed: 'x' }))).toBe('setup');
    expect(render(duelStub({ initPayload: old, countdown: 2 }))).toBe('countdown');
    // The guest's `myReady` still reflects the game just played: not a rematch phase…
    expect(render(duelStub({ initPayload: old, countdown: null, role: 'guest', isHost: false, myReady: true }))).toBe('idle');
    // …until a fresh init arrives and the hook readies up for it.
    let d = duelStub({ initPayload: old, countdown: null, role: 'guest', isHost: false, myReady: true });
    const { result, rerender } = renderHook(({ duel }: { duel: UseOnlineDuel }) => useRematch(duel, true), { wrapper, initialProps: { duel: d } });
    expect(result.current).toBe('idle');
    d = duelStub({ initPayload: init('fresh'), countdown: null, role: 'guest', isHost: false, myReady: true, ready: d.ready });
    rerender({ duel: d });
    expect(d.ready).toHaveBeenCalledTimes(1);
    rerender({ duel: d }); // the store's `myReady` write re-renders the screen; the stub needs a nudge
    expect(result.current).toBe('ready');
  });
});

describe('heroLead', () => {
  it('leads a solo game with the verdict and the score', () => {
    const game = classicGame();
    const lead = heroLead(game, summarizeGame(game));
    expect(lead).toMatchObject({ title: 'Golden ears.', score: 5640, winner: null, tie: false });
    expect(headline(summarizeGame(game), game.endReason)).toBe('Golden ears.');
  });

  it('leads a party with the winner and their score, not the combined total', () => {
    const party = partyGame();
    const lead = heroLead(party, summarizeGame(party));
    expect(lead.title).toBe('Rithul takes it.');
    expect(lead.score).toBe(2400);
    expect(lead.winner?.name).toBe('Rithul');
    expect(lead.tie).toBe(false);
  });

  it('calls a tie', () => {
    const duel = duelGame([900, 900]);
    const lead = heroLead(duel, summarizeGame(duel));
    expect(lead.title).toBe("It's a tie!");
    expect(lead.score).toBe(900);
    expect(lead.tie).toBe(true);
  });
});
