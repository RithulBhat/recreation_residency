import { useCallback, useEffect, useRef, useState } from 'react';
import { LoaderCircle } from 'lucide-react';
import { getSfx } from '@/audio';
import { Kbd, cn } from '@/components/ui';
import {
  ClueRail,
  Feedback,
  GuessBox,
  HotkeysHelp,
  NoSession,
  QuitDialog,
  RevealCard,
  SessionPanel,
  SubjectStage,
  TopBar,
  TryLadder,
  isVisualMode,
  railClues,
  useFinishScoutGame,
  useScoutClips,
  useScoutClock,
  useScoutStarting,
  useScoutSuggestions,
} from '@/components/scout';
import { useConfetti } from '@/hooks/useConfetti';
import { useHotkeys } from '@/hooks/useHotkeys';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { scoutMode } from '@/scout/packs';
import { currentStage } from '@/scout/selectors';
import { useScoutStore } from '@/store/scoutStore';

/** Tailwind's `lg`: the stage keeps a clue rail beside it. */
const TWO_COLUMN = '(min-width: 64rem)';

/** Focus the guess field, but only where a keyboard is already out. */
function focusSoon(el: HTMLInputElement | null): void {
  if (!el || typeof window === 'undefined' || !window.matchMedia?.('(pointer: fine)').matches) return;
  requestAnimationFrame(() => el.focus());
}

/**
 * Highlight Scout — the core loop. The stage, the clue rail, the guess box and everything that
 * reacts to the engine. All the rules live in `@/scout/engine`; this screen only renders state and
 * dispatches verbs.
 */
export default function ScoutPlay() {
  const state = useScoutStore((s) => s.state);
  const { settings, status } = state;
  const round = state.rounds[state.currentRound];
  const stage = currentStage(state);
  const playing = status === 'playing' && round?.status === 'playing';
  const roundOver = status === 'round-over' || (round !== undefined && round.status !== 'playing' && status !== 'finished');
  const twoColumn = useMediaQuery(TWO_COLUMN);
  const { starting, error } = useScoutStarting();
  const clips = useScoutClips();
  const confetti = useConfetti();

  const [query, setQuery] = useState('');
  const [shakeKey, setShakeKey] = useState(0);
  const [quitOpen, setQuitOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [tapeSignal, setTapeSignal] = useState(0);
  const [readyRound, setReadyRound] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const modal = quitOpen || helpOpen;

  const kind = round?.subject.kind ?? 'player';
  const suggestions = useScoutSuggestions(kind, query);

  // The engine starts a round's clock on its first tick, so hold the tick back until the stage is
  // actually on screen: a slow headshot must never burn the round timer.
  const stageReady = readyRound === state.currentRound;
  const onStageReady = useCallback(() => setReadyRound(useScoutStore.getState().state.currentRound), []);
  const now = useScoutClock(Boolean(playing) && stageReady, settings.roundTimer > 0);

  useFinishScoutGame();

  // ---------------------------------------------------------------- verbs

  const submit = useCallback((text: string) => {
    const t = text.trim();
    if (t === '') return;
    const store = useScoutStore.getState();
    const s = store.state;
    const r = s.rounds[s.currentRound];
    if (!r || s.status !== 'playing' || r.status !== 'playing') return;
    const before = r.guesses.length;
    store.guess(t);
    const after = useScoutStore.getState().state.rounds[r.index];
    const last = after?.guesses[after.guesses.length - 1];
    if (after && after.guesses.length > before && last?.verdict === 'wrong') setShakeKey((k) => k + 1);
    setQuery('');
  }, []);

  const next = useCallback(() => {
    if (useScoutStore.getState().state.status !== 'round-over') return;
    useScoutStore.getState().next();
    setQuery('');
    focusSoon(inputRef.current);
  }, []);

  const skip = useCallback(() => useScoutStore.getState().skip(), []);
  const giveUp = useCallback(() => useScoutStore.getState().giveUp(), []);

  // ---------------------------------------------------------------- sound + confetti

  const sigRef = useRef('');
  useEffect(() => {
    const r = state.rounds[state.currentRound];
    if (!r) return;
    const sig = `${state.id}:${r.index}:${r.guesses.length}:${r.status}`;
    if (sig === sigRef.current) return;
    const firstRun = sigRef.current === '';
    sigRef.current = sig;
    const g = r.guesses[r.guesses.length - 1];
    if (firstRun || !g) return;
    const sfx = getSfx();
    if (g.verdict === 'correct') {
      sfx.play('correct');
      confetti.fire(g.tryIndex === 0 ? 'big' : 'win');
    } else if (g.verdict === 'close') {
      sfx.play('partial');
    } else if (g.verdict === 'skipped') {
      sfx.play(r.status === 'playing' ? 'skip' : 'gameover');
    } else if (g.verdict === 'timeout') {
      sfx.play('buzz');
    } else {
      sfx.play(r.status === 'playing' ? 'wrong' : 'gameover');
    }
  }, [state, confetti]);

  // ---------------------------------------------------------------- hotkeys

  const live = !modal && (Boolean(playing) || roundOver);
  useHotkeys(
    {
      right: () => {
        if (playing) skip();
      },
      s: () => {
        if (playing) skip();
      },
      g: () => {
        if (playing) giveUp();
      },
      n: () => {
        if (roundOver) next();
      },
      t: () => {
        if (roundOver) setTapeSignal((k) => k + 1);
      },
      '?': () => setHelpOpen(true),
    },
    { enabled: live },
  );
  useHotkeys(
    {
      enter: () => {
        if (roundOver) next();
      },
      escape: () => setQuitOpen(true),
    },
    { allowInInputs: true, enabled: live, preventDefault: false },
  );

  // ---------------------------------------------------------------- render

  if (starting || status === 'loading') {
    return (
      <div className="mx-auto flex min-h-[60dvh] max-w-md flex-col items-center justify-center gap-4 py-10 text-center">
        <LoaderCircle className="size-8 animate-spin text-accent" aria-hidden />
        <h1 className="font-display text-xl font-bold text-fg">Rolling the tape…</h1>
        <p className="text-sm text-muted">Pulling rosters, headshots and play-by-play out of the archive.</p>
      </div>
    );
  }
  if (status === 'idle' || !round || !stage) {
    return (
      <>
        <NoSession />
        {error !== null && (
          <p role="alert" className="mx-auto mt-3 max-w-md text-center text-sm text-danger">
            {error}
          </p>
        )}
      </>
    );
  }

  const lastStage = round.stages[round.stages.length - 1];
  const rail = railClues(round.mode, stage.clues);
  const prevRail = round.tryIndex > 0 ? railClues(round.mode, round.stages[round.tryIndex - 1]?.clues ?? []) : [];
  const railTotal = railClues(round.mode, lastStage?.clues ?? []).length;
  const newRail = Math.max(0, rail.length - prevRail.length);

  const subjectStage = (
    <SubjectStage
      mode={round.mode}
      subject={round.subject}
      stage={stage}
      lastStage={lastStage}
      revealed={round.status !== 'playing'}
      seed={settings.seed}
      onReady={onStageReady}
      // ≥280 px on a phone, ≥380 px on desktop (the treatments were measured at those sizes).
      // Text modes take whatever height is going on a phone; the image modes stay square.
      className={cn('min-h-[280px] w-full lg:min-h-[380px]', !isVisualMode(round.mode) && 'max-lg:flex-1')}
    />
  );
  const reveal = <RevealCard state={state} clips={clips} onNext={next} tapeSignal={tapeSignal} />;
  const guessBox = (
    <GuessBox
      state={state}
      kind={kind}
      query={query}
      onQueryChange={setQuery}
      options={suggestions.options}
      loading={suggestions.loading}
      onSubmit={submit}
      onSkip={skip}
      onGiveUp={giveUp}
      shakeKey={shakeKey}
      inputRef={inputRef}
    />
  );

  return (
    <div className="mx-auto w-full max-w-6xl lg:flex lg:min-h-[calc(100dvh-6.5rem)] lg:items-start lg:justify-center lg:gap-6">
      <div className="flex min-h-[calc(100dvh-6.5rem)] flex-col gap-3 sm:gap-4 lg:min-h-0 lg:w-full lg:max-w-[440px] lg:shrink">
        {/* The screen's title is the round itself; on screen the top bar already says all of this. */}
        <h1 className="sr-only">
          {scoutMode(round.mode)?.name ?? 'Highlight Scout'} — round {state.currentRound + 1}
          {settings.rounds > 0 ? ` of ${settings.rounds}` : ''}, name the {round.subject.kind}
        </h1>
        <TopBar state={state} now={now} onQuit={() => setQuitOpen(true)} onHelp={() => setHelpOpen(true)} />
        <TryLadder round={round} tries={settings.tries} />
        {subjectStage}
        {!twoColumn && <ClueRail clues={rail} newCount={newRail} total={railTotal} layout="row" />}
        <div className="mt-auto flex flex-col gap-2 pt-1 sm:gap-3">
          <Feedback state={state} pool={suggestions.pool} />
          {roundOver ? (
            twoColumn ? (
              <p className="text-center text-xs text-muted">
                <Kbd size="sm">Enter</Kbd> for the next round · <Kbd size="sm">T</Kbd> for the tape
              </p>
            ) : (
              reveal
            )
          ) : (
            guessBox
          )}
        </div>
      </div>

      {/* Exactly one clue rail and one reveal card live in the DOM at a time: a hidden second copy
          would double every testid and, worse, mount a second YouTube frame. */}
      {twoColumn && (
        <aside className="flex w-[380px] min-w-[300px] shrink flex-col gap-4">
          {roundOver ? (
            reveal
          ) : (
            <>
              <ClueRail clues={rail} newCount={newRail} total={railTotal} layout="column" className="glass rounded-4xl p-4" />
              <SessionPanel state={state} />
            </>
          )}
        </aside>
      )}

      <QuitDialog
        open={quitOpen}
        onClose={() => setQuitOpen(false)}
        onQuit={() => {
          setQuitOpen(false);
          useScoutStore.getState().quit();
        }}
      />
      <HotkeysHelp open={helpOpen} onClose={() => setHelpOpen(false)} settings={settings} />
    </div>
  );
}
