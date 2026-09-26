/**
 * Wires the voice host (SpeechSynthesis + text bubble) to game events. Enabled/personality/voice
 * come from the game settings + prefs; nothing is spoken when the host is off.
 */

import { useEffect, useRef } from 'react';
import type { GameState, HostEvent, HostPersonality } from '@/types';
import { useVoiceHost } from '@/voice';
import { getPack } from '@/lib/catalog';
import { isMultiplayer } from '@/game/presets';
import { activePlayer, clipLengthFor, isTie, leader, progress, wonRounds } from '@/game/selectors';
import { useGameStore } from '@/store/gameStore';
import { useSettingsStore } from '@/store/settingsStore';
import { initialGameEvents, useGameEvents, type GameEvent } from './gameEvents';

export interface GameHost {
  enabled: boolean;
  personality: HostPersonality;
  line: string;
  speaking: boolean;
}

function packName(state: GameState): string {
  const names = state.settings.packIds.map((id) => getPack(id)?.name).filter((n): n is string => !!n);
  if (names.length === 0) return 'your packs';
  if (names.length === 1) return names[0];
  return `${names[0]} and ${names.length - 1} more`;
}

/** Map a game event to the host's vocabulary (see `src/types/voice.ts`). Null = nothing to say. */
export function hostEventFor(event: GameEvent): HostEvent | null {
  const { state } = event;
  const { settings } = state;
  switch (event.type) {
    case 'gameStart':
      return { kind: 'gameStart', mode: settings.mode, packName: packName(state), clipLength: clipLengthFor(settings, 0) };
    case 'roundStart': {
      const p = progress(state);
      const player = isMultiplayer(settings) ? activePlayer(state) : undefined;
      return {
        kind: 'roundStart',
        round: p.round,
        total: p.total,
        clipLength: clipLengthFor(settings, 0, wonRounds(state)),
        ...(player ? { playerName: player.name } : {}),
      };
    }
    case 'buzz':
      return { kind: 'buzz', playerName: event.player.name };
    case 'guess': {
      const { guess, round } = event;
      const { title, artist } = round.track;
      if (guess.verdict === 'correct') {
        const streak = state.players.find((p) => p.id === guess.playerId)?.streak ?? state.streak;
        return { kind: 'correct', title, artist, tryIndex: guess.tryIndex, clipLength: guess.clipLength, streak };
      }
      if (guess.verdict === 'partial') return { kind: 'partial', artist };
      if (guess.verdict === 'timeout') return { kind: 'timeout' };
      if (round.status !== 'playing' && settings.mode !== 'blitz') return null; // the reveal speaks for a lost round
      if (guess.verdict === 'wrong') return { kind: 'wrong', tryIndex: guess.tryIndex, triesLeft: event.triesLeft };
      return { kind: 'skip' };
    }
    case 'roundOver':
      if (event.round.status === 'lost' && settings.mode !== 'blitz') {
        return { kind: 'reveal', title: event.round.track.title, artist: event.round.track.artist };
      }
      return null;
    case 'streak':
      return { kind: 'streak', streak: event.streak };
    case 'finished': {
      const winner = isMultiplayer(settings) && !isTie(state) ? leader(state)?.name : undefined;
      return {
        kind: 'gameOver',
        score: state.totalScore,
        correct: wonRounds(state),
        total: state.rounds.length,
        ...(winner ? { winnerName: winner } : {}),
      };
    }
    default:
      return null;
  }
}

export function useGameHost(): GameHost {
  const enabled = useGameStore((s) => s.state.settings.voiceHost);
  const gameId = useGameStore((s) => s.state.id);
  const personality = useSettingsStore((s) => s.hostPersonality);
  const voiceURI = useSettingsStore((s) => s.hostVoiceURI);
  const host = useVoiceHost({ enabled, personality, voiceURI });

  const announce = host.announce;
  useGameEvents((event) => {
    const e = hostEventFor(event);
    if (e) announce(e);
  });

  // The game usually starts before this screen listens — replay the opening lines once per game.
  const announced = useRef<string | null>(null);
  useEffect(() => {
    if (!enabled || announced.current === gameId) return;
    announced.current = gameId;
    for (const event of initialGameEvents(useGameStore.getState().state)) {
      const e = hostEventFor(event);
      if (e) announce(e);
    }
    // A remount (React StrictMode's simulated one in DEV, or revisiting the screen) disposes the host
    // controller and creates a fresh one, so the fresh one must get the opening lines too.
    return () => {
      announced.current = null;
    };
  }, [enabled, gameId, announce]);

  return { enabled, personality, line: host.line, speaking: host.speaking };
}
