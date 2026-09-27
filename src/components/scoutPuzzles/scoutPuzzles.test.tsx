import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { buildPuzzleIndex, buildScoutPuzzleSpecs, type ScoutPuzzleSpec } from '@/scout/puzzles';
import { makePuzzleDataset } from '@/scout/puzzleTestFactory';
import { buildPuzzleSubject } from '@/scout/subjects';
import { GROUP_PEOPLE_LABELS, GROUP_PERSON_LABELS, buildStages } from '@/scout/stages';
import type { ScoutPuzzleMode, ScoutStage, ScoutSubject } from '@/scout/types';
import { ScoutPuzzleStage } from './PuzzleStage';
import { INK_CROSSOVER, hexLuminance, inkOn, revealedValueIndex, sharedValueRevealed, statPhrase } from './puzzleReads';

/**
 * The boards are pure: a payload plus a rung. These tests drive them exactly as the Play screen will
 * — `buildPool`'s subject, `buildStages`' rung — so a change to either contract fails here first.
 */

const dataset = makePuzzleDataset();
const index = buildPuzzleIndex(dataset);
const SPECS: ScoutPuzzleSpec[] = buildScoutPuzzleSpecs({
  dataset,
  index,
  modes: ['teammates', 'depthChart', 'draftClass', 'higherLower', 'oddOneOut', 'jersey'],
  difficulty: 'any',
  seed: 'stage-seed',
  playerEligible: (p) => p.fame >= 55,
});

function roundFor(mode: ScoutPuzzleMode, tries = 4): { subject: ScoutSubject; stages: ScoutStage[] } {
  const spec = SPECS.find((s) => s.mode === mode);
  if (!spec) throw new Error(`no spec for ${mode}`);
  const subject = buildPuzzleSubject(spec);
  if (!subject) throw new Error(`no subject for ${mode}`);
  return { subject, stages: buildStages(mode, subject, tries) };
}

interface MountOptions {
  tries?: number;
  rung?: number;
  revealed?: boolean;
  onChoose?: (card: { playerId: string; name: string }) => void;
  pickedPlayerIds?: string[];
  disabled?: boolean;
  hotkeys?: boolean;
  onReady?: () => void;
}

function mount(mode: ScoutPuzzleMode, options: MountOptions = {}) {
  const { subject, stages } = roundFor(mode, options.tries ?? 4);
  const rung = options.rung ?? 0;
  const view = render(
    <ScoutPuzzleStage
      mode={mode}
      subject={subject}
      stage={stages[rung]}
      revealed={options.revealed}
      onChoose={options.onChoose}
      pickedPlayerIds={options.pickedPlayerIds}
      disabled={options.disabled}
      hotkeys={options.hotkeys}
      onReady={options.onReady}
    />,
  );
  return { ...view, subject, stages };
}

const cards = () => screen.queryAllByTestId('scout-puzzle-card');
const locked = () => screen.queryAllByTestId('scout-puzzle-locked');

// ---------------------------------------------------------------------------------------------
// The router
// ---------------------------------------------------------------------------------------------

describe('ScoutPuzzleStage', () => {
  it('renders a board for every choice-shaped mode', () => {
    const ids: Record<ScoutPuzzleMode, string> = {
      teammates: 'scout-stage-teammates',
      depthChart: 'scout-stage-depth-chart',
      draftClass: 'scout-stage-draft-class',
      higherLower: 'scout-stage-higher-lower',
      oddOneOut: 'scout-stage-odd-one-out',
      jersey: 'scout-stage-jersey',
    };
    for (const [mode, testId] of Object.entries(ids) as Array<[ScoutPuzzleMode, string]>) {
      const view = mount(mode);
      expect(screen.getByTestId(testId)).toBeInTheDocument();
      // the Play screen owns the page's only <h1>
      expect(document.querySelector('h1')).toBeNull();
      view.unmount();
    }
  });

  it('renders nothing for a reveal mode, or when the payload does not match the round', () => {
    const { subject, stages } = roundFor('teammates');
    const plain = render(<ScoutPuzzleStage mode="silhouette" subject={subject} stage={stages[0]} />);
    expect(plain.container).toBeEmptyDOMElement();
    plain.unmount();
    const mismatched = render(<ScoutPuzzleStage mode="jersey" subject={subject} stage={stages[0]} />);
    expect(mismatched.container).toBeEmptyDOMElement();
    mismatched.unmount();
    const bare: ScoutSubject = { ...subject, puzzle: undefined };
    const none = render(<ScoutPuzzleStage mode="teammates" subject={bare} stage={stages[0]} />);
    expect(none.container).toBeEmptyDOMElement();
  });

  it('tells the round clock the board is up, once', () => {
    const onReady = vi.fn();
    mount('oddOneOut', { onReady });
    expect(onReady).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------------------------
// The card sets
// ---------------------------------------------------------------------------------------------

describe('the card-set boards', () => {
  it('opens on two cards and fills the set as the ladder pays out', () => {
    const { stages, subject } = mount('teammates', { rung: 0 });
    expect(cards()).toHaveLength(2);
    expect(locked()).toHaveLength(2);
    expect(screen.getByTestId('scout-puzzle-mystery')).toHaveAttribute('data-revealed', 'false');
    expect(screen.getByText('Who is he?')).toBeInTheDocument();
    expect(screen.getByText('2 of 4 shown')).toBeInTheDocument();
    // …and the last rung has the whole set
    const last = render(
      <ScoutPuzzleStage mode="teammates" subject={subject} stage={stages[stages.length - 1]} />,
    );
    expect(last.container.querySelectorAll('[data-testid="scout-puzzle-card"]')).toHaveLength(4);
    expect(last.container.querySelectorAll('[data-testid="scout-puzzle-locked"]')).toHaveLength(0);
  });

  it('names the man on the reveal, and shows every card', () => {
    const { subject } = mount('teammates', { rung: 0, revealed: true });
    expect(cards()).toHaveLength(4);
    expect(locked()).toHaveLength(0);
    const mystery = screen.getByTestId('scout-puzzle-mystery');
    expect(mystery).toHaveAttribute('data-revealed', 'true');
    expect(mystery).toHaveTextContent(subject.name);
  });

  it('never prints the club a depth chart is asking about', () => {
    for (const spec of SPECS.filter((s) => s.mode === 'depthChart')) {
      const subject = buildPuzzleSubject(spec)!;
      const stages = buildStages('depthChart', subject, 5);
      for (const stage of stages) {
        const view = render(<ScoutPuzzleStage mode="depthChart" subject={subject} stage={stage} />);
        const text = view.container.textContent ?? '';
        expect(text).not.toContain(spec.team!.name);
        expect(text).not.toContain(spec.team!.location);
        expect(text).not.toContain(spec.team!.abbr);
        view.unmount();
      }
      // and the reveal does say it
      const revealed = render(<ScoutPuzzleStage mode="depthChart" subject={subject} stage={stages[0]} revealed />);
      expect(revealed.container.textContent).toContain(spec.team!.name);
      revealed.unmount();
    }
  });

  it('never SHOWS the club either: a live depth chart prints masked photographs', () => {
    // The five men wear the answer. A full-colour bust — Kansas City red, the arrowhead on the
    // collar — hands the round over before a clue is spent, so every live card is masked, and the
    // photographs only come back at the reveal.
    const spec = SPECS.find((s) => s.mode === 'depthChart')!;
    const subject = buildPuzzleSubject(spec)!;
    const stages = buildStages('depthChart', subject, 5);
    for (const stage of stages) {
      const view = render(<ScoutPuzzleStage mode="depthChart" subject={subject} stage={stage} />);
      const plates = view.container.querySelectorAll('[data-testid="scout-puzzle-card"] [data-photo]');
      expect(plates.length).toBeGreaterThan(0);
      for (const plate of plates) expect(plate).toHaveAttribute('data-photo', 'masked');
      view.unmount();
    }
    const revealed = render(<ScoutPuzzleStage mode="depthChart" subject={subject} stage={stages[0]} revealed />);
    for (const plate of revealed.container.querySelectorAll('[data-testid="scout-puzzle-card"] [data-photo]')) {
      expect(plate).toHaveAttribute('data-photo', 'plain');
    }
    revealed.unmount();

    // Everywhere else the uniform is not the answer, so the photograph is the photograph.
    const room = mount('teammates', { rung: 2 });
    for (const plate of room.container.querySelectorAll('[data-testid="scout-puzzle-card"] [data-photo]')) {
      expect(plate).toHaveAttribute('data-photo', 'plain');
    }
  });

  it('never prints the year a draft class is asking about, until the reveal', () => {
    const spec = SPECS.find((s) => s.mode === 'draftClass')!;
    if (spec.puzzle.type !== 'draftClass') throw new Error('expected a draftClass payload');
    const year = String(spec.puzzle.year);
    const subject = buildPuzzleSubject(spec)!;
    const stages = buildStages('draftClass', subject, 4);
    for (const stage of stages) {
      const view = render(<ScoutPuzzleStage mode="draftClass" subject={subject} stage={stage} />);
      expect(view.container.textContent ?? '').not.toContain(year);
      view.unmount();
    }
    const revealed = render(<ScoutPuzzleStage mode="draftClass" subject={subject} stage={stages[0]} revealed />);
    expect(revealed.container.textContent).toContain(year);
  });
});

// ---------------------------------------------------------------------------------------------
// Higher or lower
// ---------------------------------------------------------------------------------------------

describe('HigherLowerStage', () => {
  it('asks the question, hides both numbers and answers to a tap', () => {
    const onChoose = vi.fn();
    const { subject } = mount('higherLower', { onChoose });
    const puzzle = subject.puzzle!;
    if (puzzle.type !== 'higherLower') throw new Error('expected a higherLower payload');
    // the question reads as English, not as scoreboard shorthand ('Rec' → 'receptions')
    expect(screen.getByText(`Who had more ${statPhrase(puzzle.statLabel)}?`)).toBeInTheDocument();
    expect(screen.getByTestId('scout-stage-higher-lower')).toHaveTextContent(GROUP_PEOPLE_LABELS[puzzle.group]);
    const text = screen.getByTestId('scout-stage-higher-lower').textContent ?? '';
    expect(text).not.toContain(puzzle.values[0]);
    expect(text).not.toContain(puzzle.values[1]);

    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(2);
    expect(buttons[0]).toHaveAttribute('aria-label', `Pick ${puzzle.cards[0].name}`);
    fireEvent.click(buttons[1]);
    expect(onChoose).toHaveBeenCalledWith(puzzle.cards[1]);
  });

  it('takes 1 / 2 and the arrow keys, and stops taking them when the round is over', () => {
    const onChoose = vi.fn();
    const view = mount('higherLower', { onChoose });
    const puzzle = view.subject.puzzle!;
    if (puzzle.type !== 'higherLower') throw new Error('expected a higherLower payload');
    fireEvent.keyDown(window, { key: '1' });
    expect(onChoose).toHaveBeenLastCalledWith(puzzle.cards[0]);
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(onChoose).toHaveBeenLastCalledWith(puzzle.cards[1]);
    fireEvent.keyDown(window, { key: '9' });
    expect(onChoose).toHaveBeenCalledTimes(2);
    view.unmount();

    const quiet = vi.fn();
    mount('higherLower', { onChoose: quiet, revealed: true });
    fireEvent.keyDown(window, { key: '1' });
    expect(quiet).not.toHaveBeenCalled();
  });

  it('can have its hotkeys turned off, and never fires while disabled', () => {
    const onChoose = vi.fn();
    const view = mount('higherLower', { onChoose, hotkeys: false });
    fireEvent.keyDown(window, { key: '1' });
    expect(onChoose).not.toHaveBeenCalled();
    view.unmount();
    mount('higherLower', { onChoose, disabled: true });
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  it('shows both numbers and marks the answer on the reveal', () => {
    const { subject } = mount('higherLower', { revealed: true });
    const puzzle = subject.puzzle!;
    if (puzzle.type !== 'higherLower') throw new Error('expected a higherLower payload');
    const board = screen.getByTestId('scout-stage-higher-lower');
    expect(board).toHaveTextContent(puzzle.values[0]);
    expect(board).toHaveTextContent(puzzle.values[1]);
    const answer = cards().find((el) => el.getAttribute('data-player') === puzzle.answerPlayerId);
    expect(answer).toHaveAttribute('data-state', 'answer');
    // the card nobody picked steps back out of the light — dimmed, never marked as a miss nobody made
    const loser = cards().find((el) => el.getAttribute('data-player') !== puzzle.answerPlayerId);
    expect(loser).toHaveAttribute('data-state', 'dimmed');
  });

  it('puts one number on a card once the ladder has paid it out', () => {
    const { subject, stages } = roundFor('higherLower', 4);
    const puzzle = subject.puzzle!;
    if (puzzle.type !== 'higherLower') throw new Error('expected a higherLower payload');
    const last = stages[stages.length - 1];
    expect(revealedValueIndex(puzzle, last.clues)).toBe(0);
    expect(revealedValueIndex(puzzle, stages[0].clues)).toBeNull();
    const view = render(<ScoutPuzzleStage mode="higherLower" subject={subject} stage={last} />);
    expect(view.container.textContent).toContain(puzzle.values[0]);
    expect(view.container.textContent).not.toContain(puzzle.values[1]);
  });

  it('marks a card the player already tried and missed', () => {
    const { subject } = roundFor('higherLower');
    const puzzle = subject.puzzle!;
    if (puzzle.type !== 'higherLower') throw new Error('expected a higherLower payload');
    const wrong = puzzle.cards.find((c) => c.playerId !== puzzle.answerPlayerId)!;
    const view = mount('higherLower', { onChoose: vi.fn(), pickedPlayerIds: [wrong.playerId] });
    expect(cards().find((c) => c.getAttribute('data-player') === wrong.playerId)).toHaveAttribute('data-state', 'missed');
    view.unmount();
    // …and it stays marked once the round is over
    mount('higherLower', { revealed: true, pickedPlayerIds: [wrong.playerId] });
    expect(cards().find((c) => c.getAttribute('data-player') === wrong.playerId)).toHaveAttribute('data-state', 'missed');
  });
});

// ---------------------------------------------------------------------------------------------
// Odd one out
// ---------------------------------------------------------------------------------------------

describe('OddOneOutStage', () => {
  it('asks the category, offers four cards and answers to a tap or a number key', () => {
    const onChoose = vi.fn();
    const { subject } = mount('oddOneOut', { onChoose });
    const puzzle = subject.puzzle!;
    if (puzzle.type !== 'oddOneOut') throw new Error('expected an oddOneOut payload');
    expect(screen.getByTestId('scout-stage-odd-one-out')).toHaveTextContent('Three of these four share');
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(4);
    fireEvent.click(buttons[2]);
    expect(onChoose).toHaveBeenLastCalledWith(puzzle.cards[2]);
    fireEvent.keyDown(window, { key: '4' });
    expect(onChoose).toHaveBeenLastCalledWith(puzzle.cards[3]);
  });

  it('strikes out a wrong card as the ladder pays out, and will not let it be picked', () => {
    const { subject, stages } = roundFor('oddOneOut', 4);
    const puzzle = subject.puzzle!;
    if (puzzle.type !== 'oddOneOut') throw new Error('expected an oddOneOut payload');
    const onChoose = vi.fn();
    const view = render(
      <ScoutPuzzleStage mode="oddOneOut" subject={subject} stage={stages[3]} onChoose={onChoose} />,
    );
    const struck = view.container.querySelectorAll('[data-state="ruledOut"]');
    expect(struck.length).toBe(2);
    for (const el of struck) {
      expect(el.tagName.toLowerCase()).not.toBe('button');
      expect(el.getAttribute('data-player')).not.toBe(puzzle.answerPlayerId);
    }
    // a struck-out card's number key does nothing
    const struckIndex = puzzle.cards.findIndex((c) => c.playerId === struck[0].getAttribute('data-player'));
    fireEvent.keyDown(window, { key: String(struckIndex + 1) });
    expect(onChoose).not.toHaveBeenCalled();
  });

  it('shows the shared value once the ladder pays it out, and never before', () => {
    const { subject, stages } = roundFor('oddOneOut', 4);
    const puzzle = subject.puzzle!;
    if (puzzle.type !== 'oddOneOut') throw new Error('expected an oddOneOut payload');
    expect(sharedValueRevealed(puzzle, stages[0].clues)).toBe(false);
    const rung0 = render(<ScoutPuzzleStage mode="oddOneOut" subject={subject} stage={stages[0]} />);
    expect(rung0.container.textContent).not.toContain(puzzle.sharedValue);
    rung0.unmount();
    const later = stages.find((s) => sharedValueRevealed(puzzle, s.clues))!;
    const view = render(<ScoutPuzzleStage mode="oddOneOut" subject={subject} stage={later} />);
    expect(view.container.textContent).toContain(puzzle.sharedValue);
  });

  it('never prints the trait it is asking about on the cards', () => {
    for (const spec of SPECS.filter((s) => s.mode === 'oddOneOut').slice(0, 12)) {
      const puzzle = spec.puzzle;
      if (puzzle.type !== 'oddOneOut') continue;
      const subject = buildPuzzleSubject(spec)!;
      const stages = buildStages('oddOneOut', subject, 4);
      const view = render(<ScoutPuzzleStage mode="oddOneOut" subject={subject} stage={stages[0]} />);
      const text = view.container.textContent ?? '';
      if (puzzle.trait === 'team') {
        for (const card of puzzle.cards) expect(text).not.toContain(card.teamAbbr ?? '@@');
      }
      if (puzzle.trait === 'positionGroup') {
        for (const card of puzzle.cards) expect(text).not.toContain(card.pos);
      }
      view.unmount();
    }
  });

  it('marks the outlier on the reveal and drops the strike-outs', () => {
    const { subject } = mount('oddOneOut', { rung: 3, revealed: true });
    const puzzle = subject.puzzle!;
    if (puzzle.type !== 'oddOneOut') throw new Error('expected an oddOneOut payload');
    expect(document.querySelectorAll('[data-state="ruledOut"]')).toHaveLength(0);
    const answer = cards().find((c) => c.getAttribute('data-player') === puzzle.answerPlayerId);
    expect(answer).toHaveAttribute('data-state', 'answer');
    // …and the three who belong together are dimmed rather than left looking pickable
    for (const c of cards().filter((el) => el.getAttribute('data-player') !== puzzle.answerPlayerId)) {
      expect(c).toHaveAttribute('data-state', 'dimmed');
    }
  });
});

// ---------------------------------------------------------------------------------------------
// Jersey
// ---------------------------------------------------------------------------------------------

describe('JerseyStage', () => {
  it('shows the number, the position and the club colours — and no photograph', () => {
    const { subject } = mount('jersey');
    const puzzle = subject.puzzle!;
    if (puzzle.type !== 'jersey') throw new Error('expected a jersey payload');
    const board = screen.getByTestId('scout-stage-jersey');
    expect(board).toHaveTextContent(puzzle.number);
    expect(board).toHaveTextContent(puzzle.colors[0]);
    expect(board).toHaveTextContent(puzzle.colors[1]);
    expect(board.querySelectorAll('img')).toHaveLength(0);
    expect(board.textContent).not.toContain(subject.name);
    // jsdom normalizes a hex background to rgb(), so compare the triple the club colour resolves to
    const rgb = (hex: string) => {
      const n = Number.parseInt(hex.slice(1), 16);
      return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
    };
    const plate = screen.getByTestId('scout-jersey-plate');
    expect(plate.getAttribute('style')).toContain(rgb(puzzle.colors[0]));
  });

  it('asks for a man, not for a unit', () => {
    const { subject } = mount('jersey');
    const puzzle = subject.puzzle!;
    if (puzzle.type !== 'jersey') throw new Error('expected a jersey payload');
    // 'Which defensive line wears this?' is not English; 'defensive lineman' is
    expect(screen.getByText(`Which ${GROUP_PERSON_LABELS[puzzle.group]} wears this?`)).toBeInTheDocument();
  });

  it('names the man on the reveal', () => {
    const { subject } = mount('jersey', { revealed: true });
    expect(screen.getByTestId('scout-stage-jersey')).toHaveTextContent(subject.name);
  });
});

// ---------------------------------------------------------------------------------------------
// The pure reads
// ---------------------------------------------------------------------------------------------

describe('puzzleReads', () => {
  it('keeps club colours readable whichever way round they are', () => {
    expect(hexLuminance('#ffffff')).toBeCloseTo(1, 2);
    expect(hexLuminance('#000000')).toBeCloseTo(0, 2);
    expect(hexLuminance('#fff')).toBeCloseTo(1, 2);
    expect(hexLuminance('not a colour')).toBe(0.5);
    // gold, navy, action green, Chiefs red: the ink flips with the colour, not with the theme
    expect(inkOn('#ffb612')).toBe('#0b0b12');
    expect(inkOn('#0c2340')).toBe('#ffffff');
    expect(inkOn('#69be28')).toBe('#0b0b12');
    expect(inkOn('#e31837')).toBe('#ffffff');
    expect(hexLuminance('#69be28')).toBeGreaterThan(INK_CROSSOVER);
    expect(hexLuminance('#e31837')).toBeLessThan(INK_CROSSOVER);
  });

  it('spots the one paid-out number, and only in a clue that names the stat', () => {
    const { subject } = roundFor('higherLower');
    const puzzle = subject.puzzle!;
    if (puzzle.type !== 'higherLower') throw new Error('expected a higherLower payload');
    expect(revealedValueIndex(puzzle, [])).toBeNull();
    expect(revealedValueIndex(puzzle, [{ kind: 'stat', label: 'Season', value: puzzle.values[1] }])).toBeNull();
    expect(
      revealedValueIndex(puzzle, [{ kind: 'stat', label: `${puzzle.statLabel} · x`, value: puzzle.values[1] }]),
    ).toBe(1);
  });
});
