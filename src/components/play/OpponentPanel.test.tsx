import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { UseOnlineDuel } from '@/net';
import { createInitialState } from '@/game/engine';
import { OpponentPanel } from './OpponentPanel';
import { isDuelActive } from './useOnlineDuelSync';

function duelStub(partial: Partial<UseOnlineDuel>): UseOnlineDuel {
  const noop = vi.fn();
  return {
    status: 'playing', code: 'ABCDEF', role: 'guest', me: null,
    opponent: { id: 'host', name: 'Maya', emoji: '🦊', color: '#f97316' },
    latencyMs: 82, error: null, startAt: null, countdown: 0, initPayload: null, opponentReady: true, myReady: false,
    opponentProgress: { type: 'progress', round: 3, score: 1240, streak: 2, correct: 2, status: 'playing', lastVerdict: 'correct', at: 0 },
    opponentFinished: null, myFinished: null, rematchOffer: null, rematchSeed: null, rematchPending: false,
    incomingEmotes: [{ id: 'e1', emoji: '🔥', at: 0 }],
    host: noop, join: noop, sendInit: noop, ready: noop, start: noop, sendProgress: noop, sendFinished: noop,
    emote: vi.fn(), rematch: noop, acceptRematch: noop, clearEmotes: noop, leave: noop,
    isHost: false, connected: true, outcome: 'pending',
    ...partial,
  };
}

describe('OpponentPanel', () => {
  it('shows the opponent, their progress, latency and incoming emotes; sends emotes', () => {
    const duel = duelStub({});
    const state = { ...createInitialState(), totalScore: 900 };
    render(<OpponentPanel duel={duel} state={state} />);
    expect(screen.getByText('Maya')).toBeInTheDocument();
    expect(screen.getByText('1,240')).toBeInTheDocument();
    expect(screen.getByText('round 3')).toBeInTheDocument();
    expect(screen.getByText('82 ms')).toBeInTheDocument();
    expect(screen.getByText('Correct')).toBeInTheDocument();
    expect(screen.getByLabelText('Maya sent 🔥')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Send 😂' }));
    expect(duel.emote).toHaveBeenCalledWith('😂');
  });

  it('isDuelActive is true while a session exists (role + opponent/init) and not idle, closed or failed', () => {
    const init = { type: 'init' as const, settings: createInitialState().settings, tracks: [] };
    const opponent = { id: 'host', name: 'Maya', emoji: '🦊', color: '#f97316' };
    // no session at all
    expect(isDuelActive({ role: null, status: 'idle', opponent: null, initPayload: null })).toBe(false);
    expect(isDuelActive({ role: null, status: 'playing', opponent, initPayload: init })).toBe(false);
    // hosting alone: nobody to race yet
    expect(isDuelActive({ role: 'host', status: 'waiting', opponent: null, initPayload: null })).toBe(false);
    // the rematch handshake passes through 'connected' — still live
    expect(isDuelActive({ role: 'guest', status: 'connected', opponent, initPayload: init })).toBe(true);
    expect(isDuelActive({ role: 'host', status: 'connected', opponent, initPayload: null })).toBe(true);
    expect(isDuelActive({ role: 'guest', status: 'playing', opponent, initPayload: init })).toBe(true);
    expect(isDuelActive({ role: 'guest', status: 'finished', opponent, initPayload: init })).toBe(true);
    // over
    for (const status of ['closed', 'error'] as const) {
      expect(isDuelActive({ role: 'guest', status, opponent, initPayload: init })).toBe(false);
    }
  });
});
