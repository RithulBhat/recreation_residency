import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LoaderCircle } from 'lucide-react';
import { getSfx } from '@/audio';
import { cn } from '@/components/ui';
import {
  BlitzFlash,
  ChoiceActions,
  ClueRail,
  Feedback,
  FranchiseBoard,
  GuessBox,
  HandoverCard,
  HotkeysHelp,
  NoSession,
  QuitDialog,
  RevealCard,
  SeatBar,
  SessionPanel,
  SubjectStage,
  SurvivalRail,
  TopBar,
  TryLadder,
  isVisualMode,
  pickedCardIds,
  railClues,
  useFinishScoutGame,
  useScoutClips,
  useScoutClock,
  useScoutStarting,
  useScoutSuggestions,
} from '@/components/scout';
import { ScoutPuzzleStage } from '@/components/scoutPuzzles';
import { useConfetti } from '@/hooks/useConfetti';
import { useHotkeys, type HotkeyMap } from '@/hooks/useHotkeys';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { isScoutBuzzerDuel, isScoutMultiplayer, scoutFormatInfo } from '@/scout/formats';
import { scoutMode, scoutModeAnswer, scoutModeIsChoice } from '@/scout/packs';
import { isScoutPuzzleMode } from '@/scout/puzzles';
import {
  activePlayer,
  currentFormat,
  currentStage,
  handover,
  isMultiplayerRun,
  roundRungs,
  standings,
} from '@/scout/selectors';
import type { ScoutPersonCard, ScoutState } from '@/scout/types';
import { useScoutStore } from '@/store/scoutStore';

/** Tailwind's `lg`: the stage keeps a clue rail beside it. */
const TWO_COLUMN = '(min-width: 64rem)';

/** Focus the guess field, but only where a keyboard is already out. */
function focusSoon(el: HTMLInputElement | null): void {
  if (!el || typeof window === 'undefined' || !window.matchMedia?.('(pointer: fine)').matches) return;
  requestAnimationFrame(() => el.focus());
}

/**
 * Who a guess belongs to, or undefined in the solo formats (where the engine wants no player id).
 *
 * In a buzzer duel that is whoever holds the buzzer — and nobody, until somebody buzzes, which is why
 * the guess box is dead until then. In a party (or a duel on turns) it is simply whose turn it is.
 */
function guessingSeatId(s: ScoutState): string | undefined {
  if (!isScoutMultiplayer(s.settings)) return undefined;
  const round = s.rounds[s.currentRound];
  if (isScoutBuzzerDuel(s.settings)) return round?.activePlayerId;
  return round?.activePlayerId ?? activePlayer(s)?.id;
}

/**
 * Highlight Scout — the core loop, for all six SESSION FORMATS and all thirteen PUZZLE TYPES.
 *
 * All the rules live in `@/scout/engine`; this screen renders state and dispatches verbs. What changes
 * per format is the chrome around the stage, and every bit of it is read through `@/scout/selectors`:
 *   blitz     the clock is the hero (`TopBar` hands the slot to `BlitzClock`), there is no reveal, and
 *             the answer of each finished subject gets a `BlitzFlash` instead.
 *   survival  `SurvivalRail` — hearts, and the tier escalation drawn as a ladder.
 *   gauntlet  `FranchiseBoard` — the 32 clubs, because that board IS the progress.
 *   duel      `SeatBar` — two seats, scores, lockouts and the A / L buzzers.
 *   party     the same seats, plus a `HandoverCard` curtain between rounds.
 * What changes per puzzle type is the stage: the seven reveal modes keep `SubjectStage`, the six
 * choice-shaped ones get `ScoutPuzzleStage`, and the two that are answered by TAPPING A CARD replace
 * the guess box outright with `ChoiceActions`.
 */
export default function ScoutPlay() {
  const state = useScoutStore((s) => s.state);
  const { settings, status } = state;
  const round = state.rounds[state.currentRound];
  const stage = currentStage(state);
  const playing = status === 'playing' && round?.status === 'playing';
  const roundOver =
    status === 'round-over' || (round !== undefined && round.status !== 'playing' && status !== 'finished');
  const twoColumn = useMediaQuery(TWO_COLUMN);
  const { starting, error } = useScoutStarting();
  const clips = useScoutClips();
  const confetti = useConfetti();

  const format = currentFormat(state);
  const blitz = format === 'blitz';
  const gauntlet = format === 'gauntlet';
  const multiplayer = isMultiplayerRun(state);
  const buzzerDuel = isScoutBuzzerDuel(settings);
  const hand = handover(state);

  const [query, setQuery] = useState('');
  const [shakeKey, setShakeKey] = useState(0);
  const [quitOpen, setQuitOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [tapeSignal, setTapeSignal] = useState(0);
  const [readyRound, setReadyRound] = useState(-1);
  const [curtain, setCurtain] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const kind = round?.subject.kind ?? 'player';
  const answerShape = round ? scoutModeAnswer(round.mode) : 'player';
  // A `draftClass` answer is a YEAR, so the player index has nothing to offer it.
  const suggestions = useScoutSuggestions(kind, answerShape === 'year' ? '' : query);
  const choice = round !== undefined && scoutModeIsChoice(round.mode);
  const picked = useMemo(() => (round ? pickedCardIds(round) : []), [round]);
  const modal = quitOpen || helpOpen || curtain;

  // The engine starts a round's clock on its first tick, so hold the tick back until the stage is
  // actually on screen: a slow headshot must never burn the round timer.
  const stageReady = readyRound === state.currentRound;
  const onStageReady = useCallback(() => setReadyRound(useScoutStore.getState().state.currentRound), []);
  const now = useScoutClock(Boolean(playing) && stageReady, settings.roundTimer > 0 || blitz);

  useFinishScoutGame();

  // A new round always draws its own curtain from scratch.
  useEffect(() => setCurtain(false), [state.id, state.currentRound]);

  // ---------------------------------------------------------------- verbs

  const submit = useCallback((text: string) => {
    const t = text.trim();
    if (t === '') return;
    const store = useScoutStore.getState();
    const s = store.state;
    const r = s.rounds[s.currentRound];
    if (!r || s.status !== 'playing' || r.status !== 'playing') return;
    const before = r.guesses.length;
    const seat = guessingSeatId(s);
    if (seat !== undefined) store.guessAs(seat, t);
    else store.guess(t);
    const after = useScoutStore.getState().state.rounds[r.index];
    const last = after?.guesses[after.guesses.length - 1];
    if (after && after.guesses.length > before && last?.verdict === 'wrong') setShakeKey((k) => k + 1);
    setQuery('');
  }, []);

  /** A tap on a choice board. The card's name IS an accepted spelling, so it goes in as a guess. */
  const choose = useCallback((card: ScoutPersonCard) => submit(card.name), [submit]);

  const next = useCallback(() => {
    if (useScoutStore.getState().state.status !== 'round-over') return;
    useScoutStore.getState().next();
    setQuery('');
    setCurtain(false);
    focusSoon(inputRef.current);
  }, []);

  /** The reveal's primary button: a rotating format hands over first, everything else just advances. */
  const advance = useCallback(() => {
    const s = useScoutStore.getState().state;
    if (handover(s) !== null) {
      setCurtain(true);
      return;
    }
    next();
  }, [next]);

  const skip = useCallback(() => useScoutStore.getState().skip(), []);
  const giveUp = useCallback(() => useScoutStore.getState().giveUp(), []);

  const buzz = useCallback((playerId: string) => {
    useScoutStore.getState().buzz(playerId);
    focusSoon(inputRef.current);
  }, []);
  const buzzAt = useCallback(
    (i: number) => {
      const seat = (useScoutStore.getState().state.players ?? [])[i];
      if (seat) buzz(seat.id);
    },
    [buzz],
  );

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

  // Blitz never pauses, so by the time a verdict could be read the NEXT subject is already up: the
  // round that just ended sits one behind, and `BlitzFlash` is what names it.
  const justFinished = blitz && state.currentRound > 0 ? state.rounds[state.currentRound - 1] : undefined;
  const blitzOutcome = blitz ? justFinished : undefined;
  useEffect(() => {
    if (!blitzOutcome) return;
    const g = blitzOutcome.guesses[blitzOutcome.guesses.length - 1];
    if (blitzOutcome.status === 'won') return;
    if (g?.verdict === 'correct') return;
    getSfx().play('wrong');
  }, [blitzOutcome]);

  // ---------------------------------------------------------------- hotkeys

  const live = !modal && (Boolean(playing) || roundOver);
  const keys: HotkeyMap = {
    s: () => {
      if (playing) skip();
    },
    g: () => {
      if (playing) giveUp();
    },
    n: () => {
      if (roundOver) advance();
    },
    t: () => {
      if (roundOver) setTapeSignal((k) => k + 1);
    },
    '?': () => setHelpOpen(true),
  };
  // The two tap-only boards bind the arrow keys themselves (1 / 2 and ←/→), so the skip shortcut gives
  // the arrows up rather than firing a skip and a pick off one keystroke.
  if (!choice) {
    keys.right = () => {
      if (playing) skip();
    };
  }
  if (buzzerDuel) {
    keys.a = () => {
      if (playing) buzzAt(0);
    };
    keys.l = () => {
      if (playing) buzzAt(1);
    };
  }
  useHotkeys(keys, { enabled: live });
  useHotkeys(
    {
      enter: () => {
        if (roundOver) advance();
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

  const modeInfo = scoutMode(round.mode);
  const formatInfo = scoutFormatInfo(format);
  const title = `${modeInfo?.name ?? 'Highlight Scout'} — ${formatInfo?.name ?? 'Standard'} round ${
    state.currentRound + 1
  }${settings.rounds > 0 ? ` of ${settings.rounds}` : ''}, name the ${round.subject.kind}`;

  // The curtain owns the WHOLE screen: a dialog would leave the reveal (and the last answer) behind a
  // translucent backdrop, which is the one thing a pass-and-play handover exists to prevent.
  if (curtain && hand) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col lg:h-[calc(100dvh-6.5rem)]">
        <h1 className="sr-only">{title}</h1>
        <HandoverCard
          from={hand.from}
          to={hand.to}
          round={state.rounds.length + 1}
          standings={standings(state)}
          onReady={next}
        />
      </div>
    );
  }

  const lastStage = round.stages[round.stages.length - 1];
  const rail = railClues(round.mode, stage.clues);
  const prevRail = round.tryIndex > 0 ? railClues(round.mode, round.stages[round.tryIndex - 1]?.clues ?? []) : [];
  // Blitz freezes the ladder on one rung, so the clues above it never unlock: drawing them as locked
  // slots would promise a reveal that cannot happen.
  const railTotal = blitz ? rail.length : railClues(round.mode, lastStage?.clues ?? []).length;
  const newRail = Math.max(0, rail.length - prevRail.length);
  const rungs = roundRungs(round);

  const visual = isVisualMode(round.mode);
  const board = isScoutPuzzleMode(round.mode);
  // An image stage stays square and is sized by the height it is given. A text stage fills the slot
  // outright. A BOARD sizes to its cards and is centred in what is left — stretched to full height it
  // was mostly empty glass, and the cards are the thing to look at.
  const stageClass = cn(
    'w-full min-h-[280px]',
    visual ? 'mx-auto lg:w-[var(--scout-hero)] lg:min-h-[380px]' : board ? 'lg:min-h-[26rem]' : 'flex-1 lg:h-full lg:min-h-[380px]',
  );
  const subjectStage = board ? (
    <ScoutPuzzleStage
      mode={round.mode}
      subject={round.subject}
      stage={stage}
      revealed={round.status !== 'playing'}
      onChoose={choice ? choose : undefined}
      pickedPlayerIds={picked}
      disabled={!playing || (multiplayer && guessingSeatId(state) === undefined)}
      onReady={onStageReady}
      className={stageClass}
    />
  ) : (
    <SubjectStage
      mode={round.mode}
      subject={round.subject}
      stage={stage}
      lastStage={lastStage}
      revealed={round.status !== 'playing'}
      seed={settings.seed}
      onReady={onStageReady}
      className={stageClass}
    />
  );
  const reveal = (
    <RevealCard
      state={state}
      clips={clips}
      onNext={advance}
      nextLabel={hand ? `Pass to ${hand.to.name}` : undefined}
      tapeSignal={tapeSignal}
      className="lg:h-full"
    />
  );
  const guessBox = (
    <GuessBox
      state={state}
      kind={kind}
      answerShape={answerShape}
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

  // The rail under the top bar is the format's own instrument panel.
  const formatRail =
    format === 'survival' ? (
      <SurvivalRail state={state} />
    ) : multiplayer ? (
      <SeatBar state={state} onBuzz={buzz} />
    ) : gauntlet && !twoColumn ? (
      <FranchiseBoard state={state} variant="strip" />
    ) : null;

  return (
    // Desktop: one row, both columns full height. The hero column holds the thing you are looking
    // at and the thing you type into, in that order and nothing between them; the aside holds every
    // standing fact — and fills, rather than floating at the top of a dead column.
    <div
      // `--scout-hero` is the side of the square stage: every pixel the hero column has left once
      // the bar, the price ladder, the verdict line and the guess box have taken theirs.
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
        <h1 className="sr-only">{title}</h1>
        <TopBar state={state} now={now} onQuit={() => setQuitOpen(true)} onHelp={() => setHelpOpen(true)} />
        {formatRail}
        {blitz ? (
          <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted" data-testid="scout-blitz-rule">
            One fixed look per subject · a miss or a skip costs 5 seconds
          </p>
        ) : (
          <TryLadder round={round} tries={rungs} />
        )}
        {/* The hero slot. A finished round hands it to the reveal card — on a phone that is what
            keeps the answer and Next above the fold, and on a laptop it is what gives the tape room. */}
        <div className="flex min-h-0 flex-col justify-center max-lg:flex-1 lg:flex-1">
          {roundOver ? reveal : subjectStage}
        </div>
        {!twoColumn && !roundOver && <ClueRail clues={rail} newCount={newRail} total={railTotal} layout="row" />}
        {!roundOver && (
          <div
            className={cn(
              'mt-auto flex w-full flex-col gap-2 pt-1 sm:gap-3 lg:mt-0',
              visual && 'lg:mx-auto lg:max-w-[var(--scout-hero)]',
            )}
          >
            {blitz ? <BlitzFlash round={justFinished} /> : <Feedback state={state} pool={suggestions.pool} />}
            {choice ? (
              <ChoiceActions state={state} mode={round.mode} onSkip={skip} onGiveUp={giveUp} />
            ) : (
              guessBox
            )}
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
          {/* The gauntlet's board takes the panel's place: "round 12 of 32" says nothing about WHICH
              clubs are left, and that is the only question this format asks. Everywhere else the rail
              is as tall as its ladder and the session panel takes whatever is left, so the aside is a
              full column of panels rather than two cards floating over dead background. */}
          {gauntlet ? (
            <FranchiseBoard state={state} className="glass min-h-0 flex-1 overflow-y-auto rounded-4xl p-4" />
          ) : (
            <SessionPanel state={state} className="min-h-0 flex-1" />
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
