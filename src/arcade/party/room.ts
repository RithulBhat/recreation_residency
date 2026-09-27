/**
 * The party-room reducer.
 *
 * Pure, framework-free, and the single authority on room state. The host runs it and broadcasts
 * the result; clients only render what they are sent. Every case the brief names — late joiners,
 * disconnects and reconnects, the host leaving, kicking — is a transition here rather than
 * something the networking layer improvises, which is what makes them testable without a socket.
 *
 * Two rules shape most of it:
 *   A seat is HELD on disconnect, not freed. Someone whose phone sleeps mid-round comes back to
 *   their score and their place, because dropping them would be indistinguishable from cheating
 *   them. Only an explicit leave or kick frees a seat.
 *   The host is never nobody. If the host leaves, the longest-present connected player inherits
 *   it. A room with no host cannot advance a round and would simply hang.
 */

import type { PartyPlayer, PartyRoomState, PartyGame } from './protocol';
import { MAX_PLAYERS } from './protocol';

export type RoomAction =
  | { type: 'join'; playerId: string; name: string; emoji: string; color: string }
  | { type: 'rejoin'; playerId: string }
  | { type: 'disconnect'; playerId: string }
  | { type: 'leave'; playerId: string }
  | { type: 'kick'; by: string; playerId: string }
  | { type: 'start'; by: string; settings: unknown; seed: string; totalRounds: number }
  | { type: 'answer'; playerId: string; value: number }
  | { type: 'score'; scores: Readonly<Record<string, number>> }
  | { type: 'reveal'; by: string }
  | { type: 'advance'; by: string }
  | { type: 'finish' };

export function createRoom(
  code: string,
  game: PartyGame,
  host: Omit<PartyPlayer, 'connected' | 'score' | 'answered' | 'host'>,
): PartyRoomState {
  return {
    code,
    game,
    phase: 'lobby',
    players: [{ ...host, connected: true, score: 0, answered: false, host: true }],
    round: 0,
    totalRounds: 0,
    settings: null,
    seed: '',
    answers: {},
  };
}

export function hostOf(state: PartyRoomState): PartyPlayer | undefined {
  return state.players.find((p) => p.host);
}

function isHost(state: PartyRoomState, playerId: string): boolean {
  return hostOf(state)?.id === playerId;
}

/**
 * Hand the room to the longest-present connected player.
 *
 * Order in `players` is join order, so the first connected non-host is the one who has been here
 * longest — the least arbitrary choice available without a clock.
 */
function reassignHost(players: readonly PartyPlayer[]): PartyPlayer[] {
  const next = players.map((p) => ({ ...p, host: false }));
  const heir = next.find((p) => p.connected) ?? next[0];
  if (heir) heir.host = true;
  return next;
}

/** Everyone still in the room who is expected to answer. */
export function activePlayers(state: PartyRoomState): readonly PartyPlayer[] {
  return state.players.filter((p) => p.connected);
}

/** True once every connected player has answered the live round. */
export function everyoneAnswered(state: PartyRoomState): boolean {
  const active = activePlayers(state);
  return active.length > 0 && active.every((p) => p.answered);
}

export function reduce(state: PartyRoomState, action: RoomAction): PartyRoomState {
  switch (action.type) {
    case 'join': {
      const existing = state.players.find((p) => p.id === action.playerId);
      // A returning player reclaims their seat and score rather than starting again.
      if (existing) {
        return {
          ...state,
          players: state.players.map((p) =>
            p.id === action.playerId ? { ...p, connected: true, name: action.name } : p,
          ),
        };
      }
      if (state.players.length >= MAX_PLAYERS) return state;
      const player: PartyPlayer = {
        id: action.playerId,
        name: action.name,
        emoji: action.emoji,
        color: action.color,
        connected: true,
        score: 0,
        // A late joiner is not expected to answer the round already in flight.
        answered: state.phase === 'question',
        host: state.players.length === 0,
      };
      return { ...state, players: [...state.players, player] };
    }

    case 'rejoin':
      return {
        ...state,
        players: state.players.map((p) =>
          p.id === action.playerId ? { ...p, connected: true } : p,
        ),
      };

    case 'disconnect': {
      // The seat is held, not freed: a sleeping phone must not cost someone their score.
      const players = state.players.map((p) =>
        p.id === action.playerId ? { ...p, connected: false } : p,
      );
      const wasHost = isHost(state, action.playerId);
      return { ...state, players: wasHost ? reassignHost(players) : players };
    }

    case 'leave': {
      const players = state.players.filter((p) => p.id !== action.playerId);
      if (players.length === 0) return { ...state, players, phase: 'finished' };
      const answers = { ...state.answers };
      delete answers[action.playerId];
      const wasHost = isHost(state, action.playerId);
      return { ...state, players: wasHost ? reassignHost(players) : players, answers };
    }

    case 'kick': {
      if (!isHost(state, action.by)) return state;
      // A host cannot kick themselves; leaving is the way out, and it migrates the host.
      if (action.by === action.playerId) return state;
      const answers = { ...state.answers };
      delete answers[action.playerId];
      return { ...state, players: state.players.filter((p) => p.id !== action.playerId), answers };
    }

    case 'start': {
      if (!isHost(state, action.by)) return state;
      if (state.phase !== 'lobby' && state.phase !== 'finished') return state;
      if (activePlayers(state).length === 0) return state;
      return {
        ...state,
        phase: 'question',
        round: 0,
        totalRounds: Math.max(1, Math.round(action.totalRounds)),
        settings: action.settings,
        seed: action.seed,
        answers: {},
        players: state.players.map((p) => ({ ...p, score: 0, answered: false })),
      };
    }

    case 'answer': {
      if (state.phase !== 'question') return state;
      const player = state.players.find((p) => p.id === action.playerId);
      if (!player || !player.connected) return state;
      // One sealed answer per round — a second is ignored rather than overwriting the first.
      if (player.answered) return state;
      if (!Number.isFinite(action.value)) return state;
      return {
        ...state,
        answers: { ...state.answers, [action.playerId]: action.value },
        players: state.players.map((p) =>
          p.id === action.playerId ? { ...p, answered: true } : p,
        ),
      };
    }

    case 'score':
      return {
        ...state,
        players: state.players.map((p) => ({
          ...p,
          score: p.score + Math.max(0, Math.round(action.scores[p.id] ?? 0)),
        })),
      };

    case 'reveal': {
      if (!isHost(state, action.by)) return state;
      if (state.phase !== 'question') return state;
      return { ...state, phase: 'reveal' };
    }

    case 'advance': {
      if (!isHost(state, action.by)) return state;
      if (state.phase !== 'reveal') return state;
      const round = state.round + 1;
      if (round >= state.totalRounds) return { ...state, phase: 'finished', answers: {} };
      return {
        ...state,
        phase: 'question',
        round,
        answers: {},
        players: state.players.map((p) => ({ ...p, answered: false })),
      };
    }

    case 'finish':
      return { ...state, phase: 'finished', answers: {} };

    default:
      return state;
  }
}

export function reduceAll(state: PartyRoomState, actions: readonly RoomAction[]): PartyRoomState {
  return actions.reduce(reduce, state);
}

/** Standings, highest first, ties broken by join order so the board never jitters. */
export function leaderboard(state: PartyRoomState): readonly PartyPlayer[] {
  return [...state.players].sort(
    (a, b) => b.score - a.score || state.players.indexOf(a) - state.players.indexOf(b),
  );
}
