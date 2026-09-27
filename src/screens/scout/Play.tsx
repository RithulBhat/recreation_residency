import { useCallback, useEffect, useRef, useState } from 'react';
import { LoaderCircle } from 'lucide-react';
import { getSfx } from '@/audio';
import { cn } from '@/components/ui';
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

  const visual = isVisualMode(round.mode);
  const subjectStage = (
    <SubjectStage
      mode={round.mode}
      subject={round.subject}
      stage={stage}
      lastStage={lastStage}
      revealed={round.status !== 'playing'}
      seed={settings.seed}
      onReady={onStageReady}
      // The stage is the hero: it takes every pixel the column has left after the bar, the price
      // ladder and the guess box (≥280 px on a phone, ≥380 px on desktop — the treatments were
      // measured at those sizes). An image mode stays square and is sized by the height it is
      // given; a text mode fills the slot outright.
      className={cn(
        'w-full min-h-[280px] lg:min-h-[380px]',
        visual ? 'mx-auto lg:w-[var(--scout-hero)]' : 'flex-1 lg:h-full',
      )}
    />
  );
  const reveal = <RevealCard state={state} clips={clips} onNext={next} tapeSignal={tapeSignal} className="lg:h-full" />;
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
    // Desktop: one row, both columns full height. The hero column holds the thing you are looking
    // at and the thing you type into, in that order and nothing between them; the aside holds every
    // standing fact — and fills, rather than floating at the top of a dead column.
    <div
      // `--scout-hero` is the side of the square stage: every pixel the hero column has left once
      // the bar, the price ladder, the verdict line and the guess box have taken theirs. The guess
      // box is capped to the SAME number, which is what puts it directly under the stage rather than
      // spanning past it — and the top bar and the ladder still span the whole column.
      className="mx-auto w-full max-w-6xl [--scout-hero:clamp(17.5rem,calc(100dvh-25.5rem),42rem)] lg:flex lg:h-[calc(100dvh-6.5rem)] lg:items-stretch lg:gap-6"
    >
      <div
        className={cn(
          'flex min-w-0 flex-col gap-3 sm:gap-4 lg:min-h-0 lg:flex-1',
          // A finished round is BOUNDED on a phone, not merely tall enough: the reveal card scrolls
          // inside itself and pins "Next round", so the answer and the way onward are on screen the
          // moment the round ends instead of below a fold that nothing was scrolling to.
          roundOver ? 'max-lg:h-[calc(100dvh-6.5rem)] max-lg:min-h-0' : 'min-h-[calc(100dvh-6.5rem)]',
        )}
      >
        {/* The screen's title is the round itself; on screen the top bar already says all of this. */}
        <h1 className="sr-only">
          {scoutMode(round.mode)?.name ?? 'Highlight Scout'} — round {state.currentRound + 1}
          {settings.rounds > 0 ? ` of ${settings.rounds}` : ''}, name the {round.subject.kind}
        </h1>
        <TopBar state={state} now={now} onQuit={() => setQuitOpen(true)} onHelp={() => setHelpOpen(true)} />
        <TryLadder round={round} tries={settings.tries} />
        {/* The hero slot. A finished round hands it to the reveal card — on a phone that is what
            keeps the answer and Next above the fold, and on a laptop it is what gives the tape room. */}
        <div className="flex min-h-0 flex-col justify-center max-lg:flex-1 lg:flex-1">
          {roundOver ? reveal : subjectStage}
        </div>
        {!twoColumn && !roundOver && <ClueRail clues={rail} newCount={newRail} total={railTotal} layout="row" />}
        {!roundOver && (
          <div className="mt-auto flex w-full flex-col gap-2 pt-1 sm:gap-3 lg:mx-auto lg:mt-0 lg:max-w-[var(--scout-hero)]">
            <Feedback state={state} pool={suggestions.pool} />
            {guessBox}
          </div>
        )}
        {roundOver && !twoColumn && (
          <Feedback state={state} pool={suggestions.pool} reserve={false} className="mt-auto pt-1" />
        )}
      </div>

      {/* Exactly one clue rail lives in the DOM at a time: a hidden second copy would double every
          testid. The rail draws the clues still to come as locked slots, so the aside is full height
          from the first frame and nothing under it jumps as they unlock. */}
      {twoColumn && (
        <aside className="flex w-[21rem] shrink-0 flex-col gap-4 xl:w-[23rem]">
          <ClueRail
            clues={rail}
            newCount={newRail}
            total={railTotal}
            layout="column"
            className="glass min-h-0 rounded-4xl p-4"
          />
          {/* The rail is as tall as its ladder; the session panel takes whatever is left, so the
              aside is a full column of panels rather than two cards floating over dead background.
              (Franchise IQ and Paper Trail put every clue on the stage, so their rail is empty and
              the panel takes the lot.) */}
          <SessionPanel state={state} className="min-h-0 flex-1" />
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
