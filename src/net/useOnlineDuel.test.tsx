import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GameAction, GameState, PlayerConfig, Track } from '@/types';
import { createInitialState, reduce } from '@/game/engine';
import { makeTrack, makeTracks } from '@/game/fixtures';
import { normalizeSettings } from '@/game/presets';
import { currentRound } from '@/game/selectors';
import { createDuelSession, type DuelSession } from './duel';
import { type NetMessage, peerIdFor } from './protocol';
import { createFakeNetwork, type FakeNetwork } from './testUtils/fakePeer';
import { COUNTDOWN_MS, GO_LINGER_MS, resetOnlineDuel, useOnlineDuel } from './useOnlineDuel';

const CODE = 'ABCDEF';
const T0 = 1_700_000_000_000;

const hostMe: PlayerConfig = { id: 'you', name: 'Rithul', emoji: '🎵', color: '#a855f7' };
const guestMe: PlayerConfig = { id: 'you', name: 'Maanu', emoji: '🦊', color: '#f97316' };

let opponentSession: DuelSession | null = null;

/** The hook always plays the host here; the opponent is a plain session on the fake network. */
function setup(): { net: FakeNetwork; opponentMessages: NetMessage[] } {
  const net = createFakeNetwork();
  const opponentMessages: NetMessage[] = [];
  return { net, opponentMessages };
}

function joinAsOpponent(net: FakeNetwork, sink: NetMessage[]): DuelSession {
  const session = createDuelSession({ role: 'guest', code: CODE, me: guestMe, peerFactory: net.peerFactory });
  session.on('message', (m) => sink.push(m));
  opponentSession = session;
  return session;
}

function finishedGame(): GameState {
  const settings = normalizeSettings({ mode: 'fixed', clipMode: 'fixed', rounds: 1, tries: 2, seed: 's' });
  const pool: Track[] = [makeTrack({ id: 1, title: 'Hello', artist: 'Adele' })];
  let s = reduce(createInitialState(), { type: 'start', settings, tracks: pool, now: T0 });
  const actions: GameAction[] = [
    { type: 'play', now: T0 },
    { type: 'guess', text: currentRound(s)!.track.title, now: T0 + 800 },
    { type: 'next', now: T0 + 900 },
  ];
  s = actions.reduce((acc, a) => reduce(acc, a), s);
  return s;
}

/** Record every distinct countdown value the hook publishes. */
function subscribeCountdown(result: { current: { countdown: number | null } }, sink: Array<number | null>): () => void {
  let last: number | null | undefined;
  const id = setInterval(() => {
    if (result.current.countdown !== last) {
      last = result.current.countdown;
      sink.push(result.current.countdown);
    }
  }, 20);
  return () => clearInterval(id);
}

afterEach(() => {
  opponentSession?.close();
  opponentSession = null;
  resetOnlineDuel();
  vi.useRealTimers();
});

describe('useOnlineDuel — lobby', () => {
  it('starts idle', () => {
    const { result } = renderHook(() => useOnlineDuel());
    expect(result.current.status).toBe('idle');
    expect(result.current.code).toBeNull();
    expect(result.current.opponent).toBeNull();
    expect(result.current.outcome).toBe('pending');
    expect(result.current.isHost).toBe(false);
  });

  it('hosts a room and picks up the guest', async () => {
    const { net, opponentMessages } = setup();
    const { result } = renderHook(() => useOnlineDuel());

    act(() => result.current.host(hostMe, { peerFactory: net.peerFactory, code: CODE }));
    expect(result.current.role).toBe('host');
    expect(result.current.isHost).toBe(true);
    expect(result.current.code).toBe(CODE);

    await act(async () => {
      await net.flush();
    });
    expect(result.current.status).toBe('waiting');

    joinAsOpponent(net, opponentMessages);
    await act(async () => {
      await net.flush();
    });
    expect(result.current.status).toBe('connected');
    expect(result.current.connected).toBe(true);
    expect(result.current.opponent).toMatchObject({ name: 'Maanu', emoji: '🦊' });
  });

  it('rejects a malformed room code before touching the network', () => {
    const net = createFakeNetwork();
    const { result } = renderHook(() => useOnlineDuel());
    act(() => result.current.join('nope', guestMe, { peerFactory: net.peerFactory }));
    expect(result.current.status).toBe('error');
    expect(result.current.error).toMatch(/room code/i);
    expect(net.created).toHaveLength(0);
  });

  it('joins a live room as the guest', async () => {
    const net = createFakeNetwork();
    const host = createDuelSession({ role: 'host', code: CODE, me: hostMe, peerFactory: net.peerFactory });
    opponentSession = host;
    await net.flush();

    const { result } = renderHook(() => useOnlineDuel());
    act(() => result.current.join('abc-def', guestMe, { peerFactory: net.peerFactory }));
    await act(async () => {
      await net.flush();
    });
    expect(result.current.role).toBe('guest');
    expect(result.current.code).toBe(CODE);
    expect(result.current.status).toBe('connected');
    expect(result.current.opponent?.name).toBe('Rithul');
  });
});

describe('useOnlineDuel — race setup', () => {
  async function connectedHost() {
    const { net, opponentMessages } = setup();
    const hook = renderHook(() => useOnlineDuel());
    act(() => hook.result.current.host(hostMe, { peerFactory: net.peerFactory, code: CODE }));
    await act(async () => {
      await net.flush();
    });
    const opponent = joinAsOpponent(net, opponentMessages);
    await act(async () => {
      await net.flush();
    });
    return { net, opponent, opponentMessages, result: hook.result };
  }

  it('seeds the init automatically and shares the exact same payload with the guest', async () => {
    const { net, opponentMessages, result } = await connectedHost();
    const tracks = makeTracks(70);

    await act(async () => {
      result.current.sendInit({ mode: 'classic', packIds: ['pop-hits'], rounds: 4 }, tracks);
      await net.flush();
    });

    const mine = result.current.initPayload;
    expect(mine).not.toBeNull();
    expect(mine?.settings.seed).toBeTruthy();
    expect(mine?.tracks).toHaveLength(60); // pool capped for the wire
    const theirs = opponentMessages.find((m) => m.type === 'init');
    if (theirs?.type !== 'init') throw new Error('guest never got the init');
    expect(theirs.settings).toEqual(mine?.settings);
    expect(theirs.tracks.map((t) => t.id)).toEqual(mine?.tracks.map((t) => t.id));
  });

  it('honours an explicit seed', async () => {
    const { net, result } = await connectedHost();
    await act(async () => {
      result.current.sendInit({ mode: 'classic', packIds: ['p'], seed: 'my-seed' }, [makeTrack({ id: 1 })]);
      await net.flush();
    });
    expect(result.current.initPayload?.settings.seed).toBe('my-seed');
  });

  it('tracks the guest going ready', async () => {
    const { net, opponent, result } = await connectedHost();
    expect(result.current.opponentReady).toBe(false);
    await act(async () => {
      opponent.send({ type: 'ready' });
      await net.flush();
    });
    expect(result.current.opponentReady).toBe(true);
  });

  it('counts down on both sides and lands on 0', async () => {
    vi.useFakeTimers();
    const net = createFakeNetwork();
    const hook = renderHook(() => useOnlineDuel());
    act(() => hook.result.current.host(hostMe, { peerFactory: net.peerFactory, code: CODE }));
    await act(async () => {
      await net.flush();
    });
    const messages: NetMessage[] = [];
    joinAsOpponent(net, messages);
    await act(async () => {
      await net.flush();
    });

    await act(async () => {
      hook.result.current.start();
      await net.flush();
    });
    expect(hook.result.current.countdown).toBe(COUNTDOWN_MS / 1000);
    expect(hook.result.current.status).toBe('playing');
    const start = messages.find((m) => m.type === 'start');
    expect(start?.type).toBe('start');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1100);
    });
    expect(hook.result.current.countdown).toBe(2);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(hook.result.current.countdown).toBe(0);
    expect(hook.result.current.startAt).toBe(Date.now() - 100);
  });

  it('lets go of the countdown a second after "GO" so no screen can be left covered', async () => {
    vi.useFakeTimers();
    const net = createFakeNetwork();
    const hook = renderHook(() => useOnlineDuel());
    act(() => hook.result.current.host(hostMe, { peerFactory: net.peerFactory, code: CODE }));
    await act(async () => {
      await net.flush();
    });
    joinAsOpponent(net, []);
    await act(async () => {
      await net.flush();
    });

    const seen: Array<number | null> = [];
    const stop = subscribeCountdown(hook.result, seen);
    await act(async () => {
      hook.result.current.start();
      await net.flush();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(COUNTDOWN_MS + 200);
    });
    expect(hook.result.current.countdown).toBe(0);
    expect(hook.result.current.startAt).not.toBeNull();

    // ...and a second later it is gone, startAt with it.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(GO_LINGER_MS + 100);
    });
    expect(hook.result.current.countdown).toBeNull();
    expect(hook.result.current.startAt).toBeNull();

    // A whole race later it is still null (this is what used to park a "GO" overlay on the lobby).
    await act(async () => {
      hook.result.current.sendProgress(finishedGame());
      hook.result.current.sendFinished(finishedGame());
      await net.flush();
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(hook.result.current.countdown).toBeNull();
    stop();
    // 0 is emitted exactly once, so the `> 0 → 0` hand-off fires once on each peer.
    expect(seen.filter((c) => c === 0)).toHaveLength(1);
    expect(seen).toEqual([3, 2, 1, 0, null]);
  });

  it('tracks my own readiness and clears it for every new init', async () => {
    const net = createFakeNetwork();
    const host = createDuelSession({ role: 'host', code: CODE, me: hostMe, peerFactory: net.peerFactory });
    opponentSession = host;
    await net.flush();

    const hook = renderHook(() => useOnlineDuel());
    act(() => hook.result.current.join(CODE, guestMe, { peerFactory: net.peerFactory }));
    await act(async () => {
      await net.flush();
    });
    expect(hook.result.current.myReady).toBe(false);

    await act(async () => {
      host.send({ type: 'init', settings: normalizeSettings({ mode: 'fixed', seed: 'one' }), tracks: [makeTrack({ id: 1 })] });
      await net.flush();
    });
    expect(hook.result.current.myReady).toBe(false);

    await act(async () => {
      hook.result.current.ready();
      await net.flush();
    });
    expect(hook.result.current.myReady).toBe(true);

    // A rematch init means the guest has to ready up again.
    await act(async () => {
      host.send({ type: 'init', settings: normalizeSettings({ mode: 'fixed', seed: 'two' }), tracks: [makeTrack({ id: 1 })] });
      await net.flush();
    });
    expect(hook.result.current.myReady).toBe(false);
  });

  it('falls back to a local countdown when the peers’ clocks disagree', async () => {
    const { net, opponent, result } = await connectedHost();
    await act(async () => {
      opponent.send({ type: 'start', startAt: Date.now() + 5 * 60 * 1000 }); // 5 minutes of skew
      await net.flush();
    });
    expect(result.current.countdown).toBe(COUNTDOWN_MS / 1000);
    expect(result.current.startAt).toBeLessThanOrEqual(Date.now() + COUNTDOWN_MS);
  });
});

describe('useOnlineDuel — racing', () => {
  async function racing() {
    const { net, opponentMessages } = setup();
    const hook = renderHook(() => useOnlineDuel());
    act(() => hook.result.current.host(hostMe, { peerFactory: net.peerFactory, code: CODE }));
    await act(async () => {
      await net.flush();
    });
    const opponent = joinAsOpponent(net, opponentMessages);
    await act(async () => {
      await net.flush();
      hook.result.current.sendInit({ mode: 'fixed', packIds: ['p'], rounds: 1, tries: 2 }, [
        makeTrack({ id: 1, title: 'Hello', artist: 'Adele' }),
      ]);
      hook.result.current.start();
      await net.flush();
    });
    return { net, opponent, opponentMessages, result: hook.result };
  }

  it('broadcasts my progress and mirrors theirs', async () => {
    const { net, opponent, opponentMessages, result } = await racing();
    const state = finishedGame();

    await act(async () => {
      result.current.sendProgress(state);
      await net.flush();
    });
    const sent = opponentMessages.find((m) => m.type === 'progress');
    if (sent?.type !== 'progress') throw new Error('progress never arrived');
    expect(sent.correct).toBe(1);

    await act(async () => {
      opponent.send({
        type: 'progress',
        round: 1,
        score: 999,
        streak: 1,
        correct: 1,
        status: 'round-over',
        lastVerdict: 'correct',
        at: Date.now(),
      });
      await net.flush();
    });
    expect(result.current.opponentProgress?.score).toBe(999);
  });

  it('resolves the outcome once both sides report finished', async () => {
    const { net, opponent, result } = await racing();
    const state = finishedGame();

    await act(async () => {
      result.current.sendFinished(state);
      await net.flush();
    });
    expect(result.current.myFinished?.correct).toBe(1);
    expect(result.current.outcome).toBe('pending');

    await act(async () => {
      opponent.send({ type: 'finished', score: 1, correct: 0, rounds: 1, durationMs: 400 });
      await net.flush();
    });
    expect(result.current.opponentFinished?.score).toBe(1);
    expect(result.current.outcome).toBe('win');
    expect(result.current.status).toBe('finished');
  });

  it('collects incoming emotes with unique ids and expires them', async () => {
    vi.useFakeTimers();
    const { net, opponent, result } = await racing();

    await act(async () => {
      opponent.send({ type: 'emote', emoji: '🔥' });
      opponent.send({ type: 'emote', emoji: '🔥' });
      await net.flush();
    });
    expect(result.current.incomingEmotes).toHaveLength(2);
    expect(result.current.incomingEmotes[0].emoji).toBe('🔥');
    expect(new Set(result.current.incomingEmotes.map((e) => e.id)).size).toBe(2);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(result.current.incomingEmotes).toHaveLength(0);
  });

  it('sends my own emotes without echoing them into my own list', async () => {
    const { net, opponentMessages, result } = await racing();
    await act(async () => {
      result.current.emote('💀');
      await net.flush();
    });
    expect(opponentMessages.some((m) => m.type === 'emote' && m.emoji === '💀')).toBe(true);
    expect(result.current.incomingEmotes).toHaveLength(0);
  });
});

describe('useOnlineDuel — rematch and leaving', () => {
  async function finished() {
    const { net, opponentMessages } = setup();
    const hook = renderHook(() => useOnlineDuel());
    act(() => hook.result.current.host(hostMe, { peerFactory: net.peerFactory, code: CODE }));
    await act(async () => {
      await net.flush();
    });
    const opponent = joinAsOpponent(net, opponentMessages);
    await act(async () => {
      await net.flush();
    });
    // one step at a time, so both sides see the same order a real race produces
    await act(async () => {
      hook.result.current.sendInit({ mode: 'fixed', packIds: ['p'], rounds: 1 }, [makeTrack({ id: 1 })]);
      hook.result.current.start();
      await net.flush();
    });
    await act(async () => {
      hook.result.current.sendFinished(finishedGame());
      await net.flush();
    });
    await act(async () => {
      opponent.send({ type: 'finished', score: 1, correct: 0, rounds: 1, durationMs: 1 });
      await net.flush();
    });
    return { net, opponent, opponentMessages, result: hook.result };
  }

  it('offers a rematch and reuses the agreed seed on the next init', async () => {
    const { net, opponent, opponentMessages, result } = await finished();
    const firstSeed = result.current.initPayload?.settings.seed;

    await act(async () => {
      result.current.rematch();
      await net.flush();
    });
    expect(result.current.rematchPending).toBe(true);
    const offer = opponentMessages.find((m) => m.type === 'rematch');
    if (offer?.type !== 'rematch') throw new Error('offer never arrived');
    expect(offer.seed).not.toBe(firstSeed);

    await act(async () => {
      opponent.send({ type: 'rematchAccept' });
      await net.flush();
    });
    expect(result.current.rematchPending).toBe(false);
    expect(result.current.rematchSeed).toBe(offer.seed);
    expect(result.current.myFinished).toBeNull();
    expect(result.current.opponentFinished).toBeNull();
    expect(result.current.status).toBe('connected');

    // the host re-inits: the agreed seed wins even though the old settings still carry the old one
    await act(async () => {
      result.current.sendInit({ mode: 'fixed', packIds: ['p'], rounds: 1, seed: firstSeed }, [makeTrack({ id: 1 })]);
      await net.flush();
    });
    expect(result.current.initPayload?.settings.seed).toBe(offer.seed);
  });

  it('re-arms the countdown for a rematch once the first race is over', async () => {
    vi.useFakeTimers();
    const { net, opponent, result } = await finished();

    // race 1: the countdown runs out and lets go of itself
    await act(async () => {
      await vi.advanceTimersByTimeAsync(COUNTDOWN_MS + GO_LINGER_MS + 200);
    });
    expect(result.current.countdown).toBeNull();
    expect(result.current.startAt).toBeNull();
    expect(result.current.status).toBe('finished');

    await act(async () => {
      result.current.rematch();
      await net.flush();
    });
    await act(async () => {
      opponent.send({ type: 'rematchAccept' });
      await net.flush();
    });
    expect(result.current.rematchSeed).toBeTruthy();
    expect(result.current.myReady).toBe(false);
    expect(result.current.countdown).toBeNull();

    // race 2: a full, clean countdown again
    await act(async () => {
      result.current.sendInit({ mode: 'fixed', packIds: ['p'], rounds: 1 }, [makeTrack({ id: 1 })]);
      opponent.send({ type: 'ready' });
      result.current.start();
      await net.flush();
    });
    expect(result.current.countdown).toBe(COUNTDOWN_MS / 1000);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(COUNTDOWN_MS + 200);
    });
    expect(result.current.countdown).toBe(0);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(GO_LINGER_MS + 100);
    });
    expect(result.current.countdown).toBeNull();
    expect(result.current.startAt).toBeNull();
  });

  it('accepts an incoming rematch offer', async () => {
    const { net, opponent, opponentMessages, result } = await finished();
    await act(async () => {
      opponent.send({ type: 'rematch', seed: 'their-seed' });
      await net.flush();
    });
    expect(result.current.rematchOffer).toBe('their-seed');

    await act(async () => {
      result.current.acceptRematch();
      await net.flush();
    });
    expect(opponentMessages.some((m) => m.type === 'rematchAccept')).toBe(true);
    expect(result.current.rematchOffer).toBeNull();
    expect(result.current.rematchSeed).toBe('their-seed');

    await act(async () => {
      result.current.sendInit({ mode: 'fixed', packIds: ['p'], rounds: 1 }, [makeTrack({ id: 1 })]);
      await net.flush();
    });
    expect(result.current.initPayload?.settings.seed).toBe('their-seed');
  });

  it('leave() closes the session, frees the peer and resets to idle', async () => {
    const { net, opponent, result } = await finished();
    act(() => result.current.leave());
    await act(async () => {
      await net.flush();
    });
    expect(result.current.status).toBe('idle');
    expect(result.current.code).toBeNull();
    expect(result.current.initPayload).toBeNull();
    expect(net.peer(peerIdFor(CODE))).toBeUndefined();
    expect(opponent.status).toBe('closed');
  });

  it('surfaces a dropped opponent as an error', async () => {
    const { net, opponent, result } = await finished();
    act(() => {
      result.current.start();
    });
    await act(async () => {
      opponent.close();
      await net.flush();
    });
    expect(result.current.status).toBe('error');
    expect(result.current.error).toBeTruthy();
  });
});
