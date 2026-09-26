import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import type { HintKind, PlayerState } from '@/types';
import { HostBubble, pickVoiceGuess, useVoiceGuess } from '@/voice';
import { toast } from '@/components/ui';
import {
  Feedback,
  GuessBox,
  HotkeysHelp,
  NoGame,
  OpponentPanel,
  PassPhoneDialog,
  PlayersBar,
  QuitDialog,
  RevealCard,
  Stage,
  StageStrip,
  TopBar,
  clipLabel,
  useGameAudio,
  useGameClock,
  useGameHost,
  useGamePool,
  useOnlineDuelSync,
  usePlayHotkeys,
  useSuggestions,
} from '@/components/play';
import { coverBlur } from '@/game/hints';
import { isBuzzerDuel, isMultiplayer } from '@/game/presets';
import { activePlayer, canGuess, currentClipLength, currentRound } from '@/game/selectors';
import { useGameStore } from '@/store/gameStore';
import { useResultStore } from '@/store/resultStore';
import { useSettingsStore } from '@/store/settingsStore';
// Registers the DEV `window.__songooner` hook (used by the e2e suite) even before Setup is visited.
import '@/lib/startGame';

/** Focus the guess field, but only where a keyboard is already out (never pop the mobile keyboard). */
function focusSoon(ref: React.RefObject<HTMLInputElement | null>): void {
  if (typeof window === 'undefined' || !window.matchMedia?.('(pointer: fine)').matches) return;
  requestAnimationFrame(() => ref.current?.focus());
}

/** Play screen — the record, the guess box and everything that reacts to the engine. */
export default function Play() {
  const navigate = useNavigate();
  const state = useGameStore((s) => s.state);
  const { guess, skip, giveUp, hint, next, buzz, quit } = useGameStore.getState();
  const { settings, status } = state;
  const round = currentRound(state);
  const playing = status === 'playing';
  const roundOver = status === 'round-over';
  const multiplayer = isMultiplayer(settings);
  const buzzer = isBuzzerDuel(settings);

  const now = useGameClock(playing, settings.mode === 'blitz' || settings.roundTimer > 0);
  const audio = useGameAudio();
  const host = useGameHost();
  const { duel, active: duelActive } = useOnlineDuelSync();
  const pool = useGamePool(state);
  const [query, setQuery] = useState('');
  const suggestions = useSuggestions(query, pool);
  const [shakeKey, setShakeKey] = useState(0);
  const [quitOpen, setQuitOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [passTo, setPassTo] = useState<PlayerState | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const hintRef = useRef<HTMLButtonElement>(null);
  const modal = quitOpen || helpOpen || passTo !== null;

  // ---------------------------------------------------------------- actions

  const submit = useCallback(
    (text: string) => {
      const t = text.trim();
      if (!t) return;
      const s = useGameStore.getState().state;
      const r = currentRound(s);
      if (!r || s.status !== 'playing') return;
      if (!canGuess(s)) {
        toast({ title: 'Buzz in first', description: 'Press A or L to grab the buzzer.', tone: 'warn', duration: 1800 });
        return;
      }
      const before = r.guesses.length;
      guess(t, isBuzzerDuel(s.settings) ? r.activePlayerId : undefined);
      const after = useGameStore.getState().state.rounds[r.index];
      const last = after?.guesses[after.guesses.length - 1];
      if (after && after.guesses.length > before && last?.verdict === 'wrong') setShakeKey((k) => k + 1);
      setQuery('');
    },
    [guess],
  );

  // Transcript cleanup is lossy ("Stand By Me" → "Stand - Me", "It's My Life" → …): try every form of
  // what was said against this round's track and submit the one the matcher accepts.
  const submitVoice = useCallback(
    (cleaned: string, raw: string) => {
      const s = useGameStore.getState().state;
      const r = currentRound(s);
      submit(r ? pickVoiceGuess(cleaned, raw, r.track, s.settings.guessTarget) : cleaned);
    },
    [submit],
  );
  const voice = useVoiceGuess({ onFinal: submitVoice });

  const onNext = useCallback(() => {
    if (useGameStore.getState().state.status !== 'round-over') return;
    audio.stop();
    next();
    setQuery('');
    const s = useGameStore.getState().state;
    if (s.status === 'playing' && isMultiplayer(s.settings) && !isBuzzerDuel(s.settings)) {
      const p = activePlayer(s);
      if (p) setPassTo(p);
    } else if (s.status === 'playing' && !isBuzzerDuel(s.settings)) focusSoon(inputRef);
  }, [next, audio]);

  const onHint = useCallback((kind: HintKind) => hint(kind), [hint]);
  const onBuzz = useCallback(
    (playerId: string) => {
      buzz(playerId);
      if (canGuess(useGameStore.getState().state)) focusSoon(inputRef);
    },
    [buzz],
  );
  const buzzAt = useCallback(
    (i: number) => {
      const s = useGameStore.getState().state;
      const p = s.players[i];
      if (p && isBuzzerDuel(s.settings)) onBuzz(p.id);
    },
    [onBuzz],
  );

  // ---------------------------------------------------------------- finish → results

  useEffect(() => {
    if (status !== 'finished') return;
    useResultStore.getState().record(state);
    useSettingsStore.getState().pushRecentTracks(state.rounds.map((r) => r.track.id));
    navigate('/results', { replace: true });
  }, [status, state, navigate]);

  usePlayHotkeys({
    playing,
    roundOver,
    modal,
    allowSkip: settings.allowSkip,
    play: audio.play,
    skip,
    next: onNext,
    buzzAt,
    focusHint: () => hintRef.current?.focus(),
    openHelp: () => setHelpOpen(true),
    openQuit: () => setQuitOpen(true),
    voice,
  });

  // ---------------------------------------------------------------- render

  if (status === 'idle' || !round) return <NoGame />;

  const blur = coverBlur(round, settings);
  const hearing = roundOver && audio.vinylState === 'playing';
  const reveal = (className?: string) => (
    <RevealCard state={state} onNext={onNext} onHear={audio.hear} onStop={audio.stop} hearing={hearing} className={className} />
  );

  return (
    <div className="mx-auto w-full max-w-6xl lg:grid lg:grid-cols-[minmax(0,720px)_minmax(300px,380px)] lg:items-start lg:justify-center lg:gap-6">
      <div className="flex min-h-[calc(100dvh-6.5rem)] flex-col gap-3 sm:gap-4 lg:min-h-0">
        <TopBar state={state} now={now} onQuit={() => setQuitOpen(true)} onHelp={() => setHelpOpen(true)} />
        {multiplayer && <PlayersBar state={state} onBuzz={onBuzz} />}
        {duelActive && <OpponentPanel duel={duel} state={state} className="lg:hidden" />}
        <StageStrip state={state} />
        <Stage round={round} blur={blur} audio={audio} clipLabel={clipLabel(currentClipLength(state))} live={playing} onGiveUp={giveUp} />

        <div className="mt-auto flex flex-col gap-2 pt-1 sm:gap-3">
          {host.enabled && <HostBubble personality={host.personality} line={host.line} speaking={host.speaking} />}
          <Feedback state={state} />
          {roundOver ? (
            reveal('lg:hidden')
          ) : (
            <>
              <GuessBox
                state={state}
                query={query}
                onQueryChange={setQuery}
                options={suggestions.options}
                loading={suggestions.loading}
                onSubmit={submit}
                onSkip={skip}
                onGiveUp={giveUp}
                onHint={onHint}
                shakeKey={shakeKey}
                voice={voice}
                inputRef={inputRef}
                hintRef={hintRef}
              />
            </>
          )}
        </div>
      </div>

      <aside className="hidden lg:flex lg:flex-col lg:gap-4 lg:pt-1">
        {duelActive && <OpponentPanel duel={duel} state={state} />}
        {roundOver ? (
          reveal()
        ) : (
          <div className="glass rounded-3xl p-4 text-sm text-muted">
            <p className="font-mono text-[11px] uppercase tracking-widest">Now playing</p>
            <p className="mt-1 text-fg">
              {buzzer ? 'First to buzz gets the guess. A wrong answer locks you out for the round.' : "Press Space to listen, type your guess and hit Enter. Skip if you need a longer clip."}
            </p>
            <p className="mt-2">
              Press <kbd className="rounded-md border border-border-strong bg-surface-strong px-1.5 font-mono text-xs text-fg">?</kbd> for all shortcuts.
            </p>
          </div>
        )}
      </aside>

      <QuitDialog
        open={quitOpen}
        onClose={() => setQuitOpen(false)}
        onQuit={() => {
          setQuitOpen(false);
          quit();
        }}
      />
      <HotkeysHelp open={helpOpen} onClose={() => setHelpOpen(false)} settings={settings} voiceSupported={voice.supported} />
      <PassPhoneDialog player={passTo} onReady={() => setPassTo(null)} />
    </div>
  );
}
