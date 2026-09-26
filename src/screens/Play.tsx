import { useCallback, useEffect, useRef, useState } from 'react';
import type { PlayerState } from '@/types';
import { HostBubble, useVoiceGuess } from '@/voice';
import {
  CoachMarks,
  Feedback,
  GuessBox,
  HotkeysHelp,
  NoGame,
  OpponentPanel,
  PassPhoneDialog,
  PlaySidebar,
  PlayersBar,
  QuitDialog,
  RevealCard,
  RoundChips,
  Stage,
  StageStrip,
  TopBar,
  clipLabel,
  clubStampFor,
  useCoachMarks,
  useFinishGame,
  useGameAudio,
  useGameClock,
  useGameHost,
  useGamePool,
  useOnlineDuelSync,
  usePlayActions,
  usePlayHotkeys,
  useSuggestions,
  type HintMenuHandle,
} from '@/components/play';
import { coverBlur } from '@/game/hints';
import { isBuzzerDuel, isMultiplayer } from '@/game/presets';
import { currentClipLength, currentRound } from '@/game/selectors';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useGameStore } from '@/store/gameStore';
import { useStatsStore } from '@/store/statsStore';
// Registers the DEV `window.__songooner` hook (used by the e2e suite) even before Setup is visited.
import '@/lib/startGame';
import '@/components/play/play.css';

/** A rotated phone: record on the left, guess box on the right, nothing pushed below the fold. */
export const LANDSCAPE_PHONE = '(orientation: landscape) and (max-height: 520px)';
/** Tailwind's `lg`: the two-column layout with the rail. */
const TWO_COLUMN = '(min-width: 64rem)';

/** Play screen — the record, the guess box and everything that reacts to the engine. */
export default function Play() {
  const state = useGameStore((s) => s.state);
  const { skip, giveUp, quit } = useGameStore.getState();
  const perfectLifetime = useStatsStore((s) => s.totals.perfectRounds);
  const { settings, status } = state;
  const round = currentRound(state);
  const playing = status === 'playing';
  const roundOver = status === 'round-over';
  const multiplayer = isMultiplayer(settings);
  const buzzer = isBuzzerDuel(settings);
  const landscape = useMediaQuery(LANDSCAPE_PHONE);
  const twoColumn = useMediaQuery(TWO_COLUMN) && !landscape;

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
  const coach = useCoachMarks(playing && !duelActive);
  const inputRef = useRef<HTMLInputElement>(null);
  const hintRef = useRef<HintMenuHandle>(null);
  const modal = quitOpen || helpOpen || passTo !== null || coach.open;

  useFinishGame();

  const stopAudio = audio.stop;
  useEffect(() => {
    if (passTo) stopAudio(); // the pass-the-phone screen must not leak the answer through the speakers
  }, [passTo, stopAudio]);

  const onMiss = useCallback(() => setShakeKey((k) => k + 1), []);
  const actions = usePlayActions({ stopAudio, inputRef, setQuery, onMiss, onPass: setPassTo });
  const voice = useVoiceGuess({ onFinal: actions.submitVoice });

  usePlayHotkeys({
    playing,
    roundOver,
    modal,
    allowSkip: settings.allowSkip,
    play: audio.play,
    skip,
    next: actions.next,
    buzzAt: actions.buzzAt,
    openHints: () => hintRef.current?.open(),
    openHelp: () => setHelpOpen(true),
    openQuit: () => setQuitOpen(true),
    voice,
  });

  // ---------------------------------------------------------------- render

  if (status === 'idle' || !round) return <NoGame />;

  const blur = coverBlur(round, settings);
  const hearing = roundOver && audio.vinylState === 'playing';
  const stamp = roundOver ? clubStampFor(state, perfectLifetime) : null;
  const reveal = (className?: string) => (
    <RevealCard state={state} onNext={actions.next} onHear={audio.hear} onStop={audio.stop} hearing={hearing} className={className} />
  );
  const stage = (
    <Stage
      round={round}
      blur={blur}
      audio={audio}
      clipLabel={clipLabel(currentClipLength(state))}
      live={playing}
      onGiveUp={giveUp}
      compact={landscape}
      stamp={stamp}
      // Desktop: the verdict lands right under the record, inside the card.
      feedback={twoColumn ? <Feedback state={state} /> : undefined}
    />
  );
  const guessBox = (
    <GuessBox
      state={state}
      query={query}
      onQueryChange={setQuery}
      options={suggestions.options}
      loading={suggestions.loading}
      onSubmit={actions.submit}
      onSkip={skip}
      onGiveUp={giveUp}
      onHint={actions.hint}
      shakeKey={shakeKey}
      voice={voice}
      inputRef={inputRef}
      hintRef={hintRef}
      compact={landscape}
    />
  );
  const overlays = (
    <>
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
      <CoachMarks open={coach.open} onDismiss={coach.dismiss} settings={settings} />
    </>
  );

  if (landscape) {
    return (
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-2" data-layout="landscape">
        <TopBar state={state} now={now} onQuit={() => setQuitOpen(true)} onHelp={() => setHelpOpen(true)} />
        {multiplayer && <PlayersBar state={state} onBuzz={actions.buzz} />}
        {duelActive && <OpponentPanel duel={duel} state={state} />}
        <div className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-3">
          {stage}
          <div className="flex min-w-0 flex-col gap-2">
            <StageStrip state={state} />
            {host.enabled && <HostBubble personality={host.personality} line={host.line} speaking={host.speaking} />}
            <Feedback state={state} reserve={false} />
            {roundOver ? reveal() : guessBox}
          </div>
        </div>
        {overlays}
      </div>
    );
  }

  return (
    // Desktop: a flex row (not grid) so `min-h` + `items-center` really centres the pair vertically.
    <div className="mx-auto w-full max-w-6xl lg:flex lg:min-h-[calc(100dvh-6.5rem)] lg:items-center lg:justify-center lg:gap-6">
      <div className="flex min-h-[calc(100dvh-6.5rem)] flex-col gap-3 sm:gap-4 lg:min-h-0 lg:w-full lg:max-w-[720px] lg:shrink">
        <TopBar state={state} now={now} onQuit={() => setQuitOpen(true)} onHelp={() => setHelpOpen(true)} />
        {multiplayer && <PlayersBar state={state} onBuzz={actions.buzz} />}
        {duelActive && <OpponentPanel duel={duel} state={state} className="lg:hidden" />}
        <StageStrip state={state} className="lg:hidden" />
        {stage}
        <div className="mt-auto flex flex-col gap-2 pt-1 sm:gap-3">
          {host.enabled && <HostBubble personality={host.personality} line={host.line} speaking={host.speaking} />}
          {/* Phones: the verdict slot holds the round chips until a verdict lands, so nothing jumps. */}
          {!twoColumn && <Feedback state={state} fallback={<RoundChips state={state} />} />}
          {roundOver ? reveal('lg:hidden') : guessBox}
        </div>
      </div>

      <aside className="hidden lg:flex lg:w-[380px] lg:min-w-[300px] lg:shrink lg:flex-col lg:gap-4">
        {duelActive && <OpponentPanel duel={duel} state={state} />}
        {roundOver ? reveal() : <PlaySidebar state={state} buzzer={buzzer} />}
      </aside>
      {overlays}
    </div>
  );
}
