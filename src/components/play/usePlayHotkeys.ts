import { useEffect } from 'react';
import type { UseVoiceGuess } from '@/voice';
import { isTypingTarget, useHotkeys } from '@/hooks/useHotkeys';

export interface PlayHotkeys {
  playing: boolean;
  roundOver: boolean;
  /** A dialog / sheet is open — every shortcut pauses. */
  modal: boolean;
  allowSkip: boolean;
  play: () => void;
  skip: () => void;
  next: () => void;
  buzzAt: (index: number) => void;
  /** Open the hint menu (and move focus into it). */
  openHints: () => void;
  openHelp: () => void;
  openQuit: () => void;
  voice: Pick<UseVoiceGuess, 'supported' | 'start' | 'stop'>;
}

/**
 * Space = play/replay · Enter = next (after the reveal) · → = skip · H = hints · M (hold) = talk ·
 * A / L = buzz · N = next · Esc = quit · ? = help. Shortcuts pause while typing, except Enter/Esc.
 */
export function usePlayHotkeys({ playing, roundOver, modal, allowSkip, play, skip, next, buzzAt, openHints, openHelp, openQuit, voice }: PlayHotkeys): void {
  const live = !modal && (playing || roundOver);

  // Space plays the clip — unless a button/link has focus, which keeps its native activation.
  useHotkeys(
    {
      space: (e) => {
        if (e.target instanceof HTMLElement && e.target !== document.body && e.target.closest('button, a, [role="button"]')) return;
        e.preventDefault();
        play();
      },
    },
    { enabled: !modal && playing, preventDefault: false },
  );

  useHotkeys(
    {
      right: () => {
        if (playing && allowSkip) skip();
      },
      h: () => {
        if (playing) openHints();
      },
      a: () => buzzAt(0),
      l: () => buzzAt(1),
      n: () => {
        if (roundOver) next();
      },
      '?': openHelp,
    },
    { enabled: live },
  );

  useHotkeys(
    {
      enter: () => {
        if (roundOver) next();
      },
      escape: openQuit,
    },
    { allowInInputs: true, enabled: live, preventDefault: false },
  );

  // Hold M to talk.
  const { supported, start, stop } = voice;
  useEffect(() => {
    if (!supported || !playing || modal) return;
    const down = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== 'm' || e.repeat || e.metaKey || e.ctrlKey || e.altKey || isTypingTarget(e.target)) return;
      e.preventDefault();
      start();
    };
    const up = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'm') stop();
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, [supported, playing, modal, start, stop]);
}
