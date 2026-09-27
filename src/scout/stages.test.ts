import { describe, expect, it } from 'vitest';
import { createRng } from '@/game/rng';
import {
  CARD_VISUAL_MAX,
  DEPTH_CHART_VISUAL_MIN,
  DRAFT_CLASS_VISUAL_MIN,
  FACE_ZOOM_MAX,
  FACE_ZOOM_MIN,
  GROUP_LABELS,
  GROUP_PEOPLE_LABELS,
  GROUP_PERSON_LABELS,
  LOGO_ZOOM_MAX,
  LOGO_ZOOM_MIN,
  MIN_VISIBLE_CARDS,
  ODD_ONE_OUT_VISUAL_MAX,
  SILHOUETTE_MAX,
  TEAMMATES_VISUAL_MIN,
  buildFocusStages,
  buildStages,
  clueCounts,
  clueOrderFor,
  cropFocus,
  newClues,
  ruledOutCardIds,
  visibleCardCount,
  visibleCards,
  visualLadder,
} from './stages';
import {
  DEPTH_CHART_CARDS,
  ODD_TRAIT_PROMPTS,
  SCOUT_PUZZLE_MODES,
  buildPuzzleIndex,
  buildScoutPuzzleSpecs,
  depthChartPuzzle,
} from './puzzles';
import { makePuzzleDataset } from './puzzleTestFactory';
import {
  FIXTURE_PLAYS,
  FIXTURE_STAT_LINES,
  FIXTURE_TEAMS,
  findFixturePlayer,
  findFixtureTeam,
  makePlayer,
} from './fixtures';
import { buildPlayerSubject, buildPuzzleSubject, buildTeamSubject } from './subjects';
import type { PositionGroup, ScoutMode, ScoutPuzzleMode, ScoutStage, ScoutSubject } from './types';

function teamFor(teamId: string) {
  return FIXTURE_TEAMS.find((t) => t.id === teamId);
}

function mahomes(): ScoutSubject {
  const p = findFixturePlayer('Patrick Mahomes');
  return buildPlayerSubject(p, teamFor(p.teamId), {
    play: FIXTURE_PLAYS.find((x) => x.playerId === p.id),
    statLine: FIXTURE_STAT_LINES.find((x) => x.playerId === p.id),
  });
}

const PLAYER = mahomes();
const TEAM = buildTeamSubject(findFixtureTeam('KC'));

const ALL_MODES: ScoutMode[] = ['silhouette', 'faceZoom', 'highlight', 'teamTrivia', 'statLine', 'careerPath', 'logoZoom'];

function subjectFor(mode: ScoutMode): ScoutSubject {
  return mode === 'teamTrivia' || mode === 'logoZoom' ? TEAM : PLAYER;
}

function labels(stage: ScoutStage | undefined): string[] {
  return (stage?.clues ?? []).map((c) => c.label);
}

describe('visualLadder / clueCounts', () => {
  it('spans min → max across the rungs', () => {
    expect(visualLadder(1, 0, 0.85)).toEqual([0]);
    expect(visualLadder(2, 0, 0.85)).toEqual([0, 0.85]);
    expect(visualLadder(6, 0, 0.85)[5]).toBe(0.85);
    expect(visualLadder(6, 0, 0.85)[0]).toBe(0);
  });

  it('starts at base, ends at n, never goes backwards', () => {
    expect(clueCounts(5, 6, 0)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(clueCounts(5, 1, 0)).toEqual([0]);
    expect(clueCounts(5, 3, 1)).toEqual([1, 3, 5]);
    for (const n of [0, 1, 3, 5, 8]) {
      for (const tries of [1, 2, 3, 4, 5, 6]) {
        for (const base of [0, 1]) {
          const counts = clueCounts(n, tries, base);
          expect(counts).toHaveLength(tries);
          expect(counts[0]).toBe(Math.min(base, n));
          // a one-try run only ever gets rung 0 (the hardest); otherwise the last rung shows all
          expect(counts[counts.length - 1]).toBe(tries === 1 ? Math.min(base, n) : n);
          for (let i = 1; i < counts.length; i++) expect(counts[i]).toBeGreaterThanOrEqual(counts[i - 1]);
        }
      }
    }
  });
});

describe('buildStages — shape, for every mode', () => {
  for (const mode of ALL_MODES) {
    describe(mode, () => {
      it('produces exactly `tries` rungs for 1–6 tries', () => {
        for (const tries of [1, 2, 3, 4, 5, 6]) {
          expect(buildStages(mode, subjectFor(mode), tries, createRng('s')).length).toBe(tries);
        }
      });

      it('clamps a silly `tries` into 1–6', () => {
        expect(buildStages(mode, subjectFor(mode), 0, createRng('s')).length).toBe(1);
        expect(buildStages(mode, subjectFor(mode), 99, createRng('s')).length).toBe(6);
        expect(buildStages(mode, subjectFor(mode), Number.NaN, createRng('s')).length).toBe(1);
      });

      it('adds information monotonically (clues are cumulative, visual never shrinks)', () => {
        const stages = buildStages(mode, subjectFor(mode), 6, createRng('s'));
        for (let i = 1; i < stages.length; i++) {
          expect(stages[i].clues.length).toBeGreaterThanOrEqual(stages[i - 1].clues.length);
          expect(stages[i].clues.slice(0, stages[i - 1].clues.length)).toEqual(stages[i - 1].clues);
          expect(stages[i].visual).toBeGreaterThanOrEqual(stages[i - 1].visual);
        }
      });

      it('respects the visual bounds', () => {
        for (const stage of buildStages(mode, subjectFor(mode), 6, createRng('s'))) {
          expect(stage.visual).toBeGreaterThanOrEqual(0);
          expect(stage.visual).toBeLessThanOrEqual(1);
        }
      });

      it('is deterministic for a seed and stable across calls', () => {
        const a = buildStages(mode, subjectFor(mode), 5, createRng('seed-1'));
        const b = buildStages(mode, subjectFor(mode), 5, createRng('seed-1'));
        expect(a).toEqual(b);
      });

      it('ends with at least one clue (the last rung is the most generous)', () => {
        const stages = buildStages(mode, subjectFor(mode), 5, createRng('s'));
        expect(stages[stages.length - 1].clues.length).toBeGreaterThan(0);
      });
    });
  }
});

describe('buildStages — visual ladders', () => {
  it('silhouette goes from pure black to 0.85, never a full reveal', () => {
    const stages = buildStages('silhouette', PLAYER, 6, createRng('s'));
    expect(stages[0].visual).toBe(0);
    expect(stages[5].visual).toBe(SILHOUETTE_MAX);
    for (const s of stages) expect(s.visual).toBeLessThanOrEqual(SILHOUETTE_MAX);
    for (let i = 1; i < stages.length; i++) expect(stages[i].visual).toBeGreaterThan(stages[i - 1].visual);
  });

  it('faceZoom starts at an extreme crop and stops short of the whole photo', () => {
    const stages = buildStages('faceZoom', PLAYER, 5, createRng('s'));
    expect(stages[0].visual).toBe(FACE_ZOOM_MIN);
    expect(stages[4].visual).toBe(FACE_ZOOM_MAX);
    expect(FACE_ZOOM_MAX).toBeLessThan(1);
  });

  it('logoZoom uses its own band', () => {
    const stages = buildStages('logoZoom', TEAM, 4, createRng('s'));
    expect(stages[0].visual).toBe(LOGO_ZOOM_MIN);
    expect(stages[3].visual).toBe(LOGO_ZOOM_MAX);
  });

  it('text modes keep visual at 0', () => {
    for (const mode of ['highlight', 'teamTrivia', 'statLine', 'careerPath'] as ScoutMode[]) {
      for (const s of buildStages(mode, subjectFor(mode), 5, createRng('s'))) expect(s.visual).toBe(0);
    }
  });
});

describe('buildStages — clue ladders', () => {
  it('silhouette: nothing at rung 0, then position → conference → experience → jersey → initial', () => {
    const stages = buildStages('silhouette', PLAYER, 6, createRng('s'));
    expect(stages[0].clues).toEqual([]);
    expect(labels(stages[1])).toEqual(['Position']);
    expect(labels(stages[2])).toEqual(['Position', 'Conference']);
    expect(labels(stages[3])).toEqual(['Position', 'Conference', 'Experience']);
    expect(labels(stages[4])).toEqual(['Position', 'Conference', 'Experience', 'Jersey']);
    expect(labels(stages[5])).toEqual(['Position', 'Conference', 'Experience', 'Jersey', 'First initial']);
    expect(stages[5].clues[0].value).toBe('Quarterback');
    expect(stages[5].clues[4].value).toBe('P.');
  });

  it('faceZoom shares the silhouette clue ladder', () => {
    const a = buildStages('silhouette', PLAYER, 6, createRng('s')).map((s) => s.clues);
    const b = buildStages('faceZoom', PLAYER, 6, createRng('s')).map((s) => s.clues);
    expect(b).toEqual(a);
  });

  it('highlight shows only the redacted play at rung 0, never the raw text', () => {
    const stages = buildStages('highlight', PLAYER, 5, createRng('s'));
    expect(stages[0].clues).toHaveLength(1);
    expect(stages[0].clues[0].kind).toBe('play');
    expect(stages[0].clues[0].value).toBe(PLAYER.play?.redacted);
    expect(stages[0].clues[0].value).not.toContain('Mahomes');
    const all = labels(stages[4]);
    expect(all[0]).toBe('The play');
    expect(all).toContain('Team');
    expect(all).toContain('Situation');
    expect(all).toContain('Position');
    expect(all[all.length - 1]).toBe('First initial');
  });

  it('teamTrivia opens on the most obscure fact and ends on the colours', () => {
    const team = findFixtureTeam('KC');
    const stages = buildStages('teamTrivia', TEAM, 6, createRng('s'));
    expect(stages[0].clues).toHaveLength(1);
    expect(stages[0].clues[0].kind).toBe('fact');
    expect(stages[0].clues[0].value).toBe(team.facts[0]);
    const last = stages[5].clues;
    expect(last[last.length - 1].kind).toBe('colors');
    // the colours are the LAST thing the player gets, never earlier
    for (let i = 0; i < 5; i++) expect(stages[i].clues.some((c) => c.kind === 'colors')).toBe(false);
    expect(labels(stages[5])).toContain('Home venue');
    expect(labels(stages[5])).toContain('Super Bowls');
    expect(labels(stages[5])).toContain('Franchise legend');
  });

  it('teamTrivia picks its legend from the rng (same seed → same legend)', () => {
    const a = buildStages('teamTrivia', TEAM, 6, createRng('alpha'));
    const b = buildStages('teamTrivia', TEAM, 6, createRng('alpha'));
    const legend = (stages: ScoutStage[]) => stages[5].clues.find((c) => c.kind === 'legend')?.value;
    expect(legend(a)).toBe(legend(b));
    expect(findFixtureTeam('KC').legends).toContain(legend(a));
  });

  it('statLine reveals stat pairs one at a time, then position and team', () => {
    const stages = buildStages('statLine', PLAYER, 6, createRng('s'));
    expect(stages[0].clues).toHaveLength(1);
    expect(stages[0].clues[0].kind).toBe('stat');
    expect(stages[0].clues[0].label).toBe('Pass yds');
    const last = labels(stages[5]);
    expect(last).toContain('Position');
    expect(last[last.length - 1]).toBe('Team');
  });

  it('careerPath walks the paperwork: draft year → slot → college → team → jersey', () => {
    const stages = buildStages('careerPath', PLAYER, 6, createRng('s'));
    expect(labels(stages[0])).toEqual(['Draft year']);
    expect(stages[0].clues[0].value).toBe('2017');
    const last = labels(stages[5]);
    expect(last.slice(0, 4)).toEqual(['Draft year', 'Draft slot', 'College', 'Team']);
    expect(last[last.length - 1]).toBe('Jersey');
  });

  it('careerPath survives an undrafted player', () => {
    const p = findFixturePlayer('Austin Ekeler');
    const subject = buildPlayerSubject(p, teamFor(p.teamId));
    const stages = buildStages('careerPath', subject, 5, createRng('s'));
    expect(stages).toHaveLength(5);
    expect(stages[0].clues[0].value).toBe('Undrafted');
    expect(labels(stages[4])).toContain('College');
  });

  it('logoZoom adds conference → division → venue', () => {
    const stages = buildStages('logoZoom', TEAM, 4, createRng('s'));
    expect(stages[0].clues).toEqual([]);
    const last = labels(stages[3]);
    expect(last.slice(0, 3)).toEqual(['Conference', 'Division', 'Home venue']);
  });

  it('drops clues the data cannot support and still fills the ladder', () => {
    const bare = makePlayer({ id: 'bare', name: 'Ghost Player', fame: 10, pos: 'LB' });
    const subject = buildPlayerSubject(bare);
    const stages = buildStages('silhouette', subject, 6, createRng('s'));
    expect(stages).toHaveLength(6);
    for (const s of stages) {
      expect(s.clues.some((c) => c.kind === 'jersey')).toBe(false);
      expect(s.clues.some((c) => c.kind === 'conference')).toBe(false);
    }
    expect(labels(stages[5])).toEqual(['Position', 'First initial']);
  });

  it('clueOrderFor is empty when the subject lacks the data a mode needs', () => {
    // a team subject has no player, so every player ladder comes back empty
    expect(clueOrderFor('silhouette', TEAM, 5).clues).toEqual([]);
    expect(clueOrderFor('faceZoom', TEAM, 5).clues).toEqual([]);
    expect(clueOrderFor('statLine', TEAM, 5).clues).toEqual([]);
    // the KIND gate is canRender (subjects.ts), not the ladder
    expect(clueOrderFor('teamTrivia', PLAYER, 5).clues.length).toBeGreaterThan(0);
  });
});

describe('newClues', () => {
  it('returns only what a rung added', () => {
    const stages = buildStages('silhouette', PLAYER, 6, createRng('s'));
    expect(newClues(stages, 0)).toEqual([]);
    expect(newClues(stages, 1).map((c) => c.label)).toEqual(['Position']);
    expect(newClues(stages, 3).map((c) => c.label)).toEqual(['Experience']);
    expect(newClues(stages, 99).length).toBeGreaterThan(0);
  });
});

describe('cropFocus', () => {
  it('is deterministic per seed and stays in the face band', () => {
    const a = cropFocus(PLAYER, 'faceZoom', 'seed-a');
    const b = cropFocus(PLAYER, 'faceZoom', 'seed-a');
    expect(a).toEqual(b);
    expect(a.x).toBeGreaterThanOrEqual(0.36);
    expect(a.x).toBeLessThanOrEqual(0.64);
    expect(a.y).toBeGreaterThanOrEqual(0.16);
    expect(a.y).toBeLessThanOrEqual(0.44);
  });

  it('moves the spot for a different seed or subject', () => {
    const base = cropFocus(PLAYER, 'faceZoom', 'seed-a');
    const other = cropFocus(PLAYER, 'faceZoom', 'seed-b');
    const otherSubject = cropFocus(TEAM, 'logoZoom', 'seed-a');
    expect(other).not.toEqual(base);
    expect(otherSubject).not.toEqual(base);
  });

  it('is attached to every stage and identical across the rungs of one round', () => {
    const stages = buildFocusStages('faceZoom', PLAYER, 5, createRng('seed-x'));
    const first = stages[0].focus;
    for (const s of stages) expect(s.focus).toEqual(first);
    expect(first).toEqual(cropFocus(PLAYER, 'faceZoom', 'seed-x'));
  });

  it('centres text modes', () => {
    expect(cropFocus(PLAYER, 'highlight')).toEqual({ x: 0.5, y: 0.5 });
  });
});

// ---------------------------------------------------------------------------------------------
// The choice-shaped ladders
// ---------------------------------------------------------------------------------------------

describe('the choice-shaped ladders', () => {
  const dataset = makePuzzleDataset();
  const index = buildPuzzleIndex(dataset);
  const specs = buildScoutPuzzleSpecs({
    dataset,
    index,
    modes: [...SCOUT_PUZZLE_MODES],
    difficulty: 'any',
    seed: 'ladder-seed',
    playerEligible: (p) => p.fame >= 55,
  });

  function subjectFor(mode: ScoutPuzzleMode): ScoutSubject {
    const spec = specs.find((s) => s.mode === mode);
    if (!spec) throw new Error(`no spec for ${mode}`);
    const subject = buildPuzzleSubject(spec);
    if (!subject) throw new Error(`no subject for ${mode}`);
    return subject;
  }

  const SUBJECTS = new Map<ScoutPuzzleMode, ScoutSubject>(
    ([...SCOUT_PUZZLE_MODES] as ScoutPuzzleMode[]).map((m) => [m, subjectFor(m)]),
  );

  it('returns exactly `tries` rungs with cumulative clues, for every mode and every try count', () => {
    for (const [mode, subject] of SUBJECTS) {
      for (const tries of [1, 2, 3, 4, 5, 6]) {
        const stages = buildStages(mode, subject, tries);
        expect(stages, `${mode} × ${tries}`).toHaveLength(tries);
        for (let i = 1; i < stages.length; i++) {
          expect(stages[i].clues.length).toBeGreaterThanOrEqual(stages[i - 1].clues.length);
          expect(stages[i].clues.slice(0, stages[i - 1].clues.length)).toEqual(stages[i - 1].clues);
          expect(stages[i].visual).toBeGreaterThanOrEqual(stages[i - 1].visual);
        }
      }
    }
  });

  it('gives every rung something new — a clue, another card, or a strike-out', () => {
    for (const [mode, subject] of SUBJECTS) {
      for (const tries of [3, 4]) {
        const stages = buildStages(mode, subject, tries);
        for (let i = 1; i < stages.length; i++) {
          const gained =
            stages[i].clues.length > stages[i - 1].clues.length ||
            visibleCards(subject.puzzle, stages[i].visual).length > visibleCards(subject.puzzle, stages[i - 1].visual).length ||
            ruledOutCardIds(subject.puzzle, stages[i].visual).length > ruledOutCardIds(subject.puzzle, stages[i - 1].visual).length;
          expect(gained, `${mode} × ${tries} rung ${i}`).toBe(true);
        }
      }
    }
  });

  it('opens the card modes on two cards and ends on all of them', () => {
    for (const mode of ['teammates', 'depthChart', 'draftClass'] as ScoutPuzzleMode[]) {
      const subject = SUBJECTS.get(mode)!;
      const total = visibleCards(subject.puzzle, 1).length;
      expect(total).toBe(mode === 'depthChart' ? DEPTH_CHART_CARDS : 4);
      const stages = buildStages(mode, subject, 4);
      expect(visibleCards(subject.puzzle, stages[0].visual)).toHaveLength(MIN_VISIBLE_CARDS);
      expect(visibleCards(subject.puzzle, stages[3].visual)).toHaveLength(total);
      // and the cards only ever grow, in payload order
      let previous = 0;
      for (const stage of stages) {
        const shown = visibleCards(subject.puzzle, stage.visual);
        expect(shown.length).toBeGreaterThanOrEqual(previous);
        expect(shown).toEqual(visibleCards(subject.puzzle, 1).slice(0, shown.length));
        previous = shown.length;
      }
    }
  });

  it('shows both higherLower cards from rung 0 and never hides one', () => {
    const subject = SUBJECTS.get('higherLower')!;
    for (const tries of [1, 3, 6]) {
      for (const stage of buildStages('higherLower', subject, tries)) {
        expect(stage.visual).toBe(0);
        expect(visibleCards(subject.puzzle, stage.visual)).toHaveLength(2);
        expect(ruledOutCardIds(subject.puzzle, stage.visual)).toEqual([]);
      }
    }
  });

  it('strikes out at most two of the three wrong odd-one-out cards', () => {
    const subject = SUBJECTS.get('oddOneOut')!;
    const puzzle = subject.puzzle!;
    if (puzzle.type !== 'oddOneOut') throw new Error('expected an oddOneOut payload');
    for (const tries of [1, 2, 3, 4, 5, 6]) {
      const stages = buildStages('oddOneOut', subject, tries);
      expect(ruledOutCardIds(puzzle, stages[0].visual)).toEqual([]);
      const last = ruledOutCardIds(puzzle, stages[stages.length - 1].visual);
      expect(last.length).toBeLessThanOrEqual(2);
      for (const stage of stages) {
        const out = ruledOutCardIds(puzzle, stage.visual);
        expect(out).not.toContain(puzzle.answerPlayerId);
        expect(out).toEqual(puzzle.ruleOutIds.slice(0, out.length));
      }
      if (tries >= 3) expect(last.length).toBeGreaterThan(0);
    }
    // rung 0 names the category; the next rung pays out the value the three share
    const stages = buildStages('oddOneOut', subject, 4);
    expect(stages[0].clues).toHaveLength(1);
    expect(stages[0].clues[0].value).toBe(ODD_TRAIT_PROMPTS[puzzle.trait]);
    const values = stages[3].clues.map((c) => c.value);
    expect(values).toContain(puzzle.sharedValue);
  });

  it('never names the club in a depth-chart ladder', () => {
    for (const team of dataset.teams) {
      const spec = { mode: 'depthChart' as const, puzzle: depthChartPuzzle(index, team, { seed: 's' })!, team };
      const subject = buildPuzzleSubject(spec)!;
      const text = buildStages('depthChart', subject, 6)
        .flatMap((s) => s.clues)
        .map((c) => `${c.label} ${c.value}`)
        .join(' | ')
        .toLowerCase();
      expect(text).not.toContain(team.name.toLowerCase());
      expect(text).not.toContain(team.location.toLowerCase());
      expect(text).not.toContain(team.displayName.toLowerCase());
    }
  });

  it('never names the club in a teammates or jersey ladder either', () => {
    for (const mode of ['teammates', 'jersey'] as ScoutPuzzleMode[]) {
      const subject = SUBJECTS.get(mode)!;
      const team = subject.team!;
      const text = buildStages(mode, subject, 6)
        .flatMap((s) => s.clues)
        .map((c) => c.value)
        .join(' | ')
        .toLowerCase();
      expect(text).not.toContain(team.name.toLowerCase());
      expect(text).not.toContain(team.location.toLowerCase());
    }
  });

  it('narrows a draft class from a decade to two years, consistently', () => {
    for (const spec of specs.filter((s) => s.mode === 'draftClass')) {
      const subject = buildPuzzleSubject(spec)!;
      if (spec.puzzle.type !== 'draftClass') continue;
      const year = spec.puzzle.year;
      const clues = buildStages('draftClass', subject, 5)[4].clues;
      const value = (label: string) => clues.find((c) => c.label === label)?.value;
      expect(value('Era')).toBe(`${Math.floor(year / 10) * 10}s`);
      const band = value('Somewhere in')!.split('–').map(Number);
      expect(year).toBeGreaterThanOrEqual(band[0]);
      expect(year).toBeLessThanOrEqual(band[1]);
      expect(value('Parity')).toBe(year % 2 === 0 ? 'Even year' : 'Odd year');
      // parity plus the two-year window pins the answer exactly
      const pair = value('Down to two')!.split(' or ').map(Number);
      expect(pair).toContain(year);
      expect(pair.filter((y) => y % 2 === year % 2)).toEqual([year]);
      // and the answer itself is the year, not the anchor's name
      expect(subject.name).toBe(String(year));
      expect(subject.player).toBeUndefined();
    }
  });

  it('prices a higherLower round in information: the gap, then one of the two numbers', () => {
    const subject = SUBJECTS.get('higherLower')!;
    const puzzle = subject.puzzle!;
    if (puzzle.type !== 'higherLower') throw new Error('expected a higherLower payload');
    const clues = buildStages('higherLower', subject, 4)[3].clues;
    expect(clues[0].value).toBe(GROUP_LABELS[puzzle.group]);
    expect(clues.some((c) => c.value === String(puzzle.season))).toBe(true);
    const gap = Math.abs(puzzle.numbers[0] - puzzle.numbers[1]);
    expect(clues.some((c) => c.label === 'The gap' && c.value.replace(/,/g, '') === String(Math.round(gap * 10) / 10))).toBe(true);
    const last = clues[clues.length - 1];
    expect(last.label).toBe(`${puzzle.statLabel} · ${puzzle.cards[0].name}`);
    expect(last.value).toBe(puzzle.values[0]);
    // rung 0 gives nothing away
    expect(buildStages('higherLower', subject, 4)[0].clues).toEqual([]);
  });

  it('keeps the documented visual bounds for every choice-shaped mode', () => {
    const bounds: Record<string, { min: number; max: number }> = {
      teammates: { min: TEAMMATES_VISUAL_MIN, max: CARD_VISUAL_MAX },
      depthChart: { min: DEPTH_CHART_VISUAL_MIN, max: CARD_VISUAL_MAX },
      draftClass: { min: DRAFT_CLASS_VISUAL_MIN, max: CARD_VISUAL_MAX },
      higherLower: { min: 0, max: 0 },
      oddOneOut: { min: 0, max: ODD_ONE_OUT_VISUAL_MAX },
      jersey: { min: 0, max: 0 },
    };
    for (const [mode, subject] of SUBJECTS) {
      const order = clueOrderFor(mode, subject, 4);
      expect(order.visual.min, mode).toBeCloseTo(bounds[mode].min, 6);
      expect(order.visual.max, mode).toBeCloseTo(bounds[mode].max, 6);
      const stages = buildStages(mode, subject, 4);
      expect(stages[0].visual).toBeCloseTo(bounds[mode].min, 2);
      expect(stages[3].visual).toBeCloseTo(bounds[mode].max, 2);
    }
  });

  it('reads a card count off any visual, and clamps the silly ones', () => {
    const subject = SUBJECTS.get('depthChart')!;
    expect(visibleCardCount(5, 0)).toBe(MIN_VISIBLE_CARDS);
    expect(visibleCardCount(5, 1)).toBe(5);
    expect(visibleCardCount(5, 2)).toBe(5);
    expect(visibleCardCount(5, Number.NaN)).toBe(MIN_VISIBLE_CARDS);
    expect(visibleCardCount(2, 0)).toBe(2);
    expect(visibleCardCount(0, 1)).toBe(0);
    expect(visibleCards(undefined, 1)).toEqual([]);
    expect(ruledOutCardIds(undefined, 1)).toEqual([]);
    expect(ruledOutCardIds(subject.puzzle, 1)).toEqual([]);
  });

  it('is deterministic: the same subject and try count build the same ladder', () => {
    for (const [mode, subject] of SUBJECTS) {
      expect(buildStages(mode, subject, 4)).toEqual(buildStages(mode, subject, 4));
    }
  });
});

describe('position group labels', () => {
  it('names every group as a unit and as a man', () => {
    const groups: PositionGroup[] = ['QB', 'RB', 'WR', 'TE', 'OL', 'DL', 'LB', 'DB', 'ST'];
    for (const g of groups) {
      expect(GROUP_LABELS[g].length).toBeGreaterThan(0);
      expect(GROUP_PERSON_LABELS[g].length).toBeGreaterThan(0);
      expect(GROUP_PEOPLE_LABELS[g].length).toBeGreaterThan(GROUP_PERSON_LABELS[g].length - 1);
      // a person label is lower case, so it drops into the middle of a sentence
      expect(GROUP_PERSON_LABELS[g]).toBe(GROUP_PERSON_LABELS[g].toLowerCase());
    }
    // the unit and the man are genuinely different words where it matters
    expect(GROUP_PERSON_LABELS.DL).toBe('defensive lineman');
    expect(GROUP_PEOPLE_LABELS.DL).toBe('defensive linemen');
    expect(GROUP_LABELS.DL).toBe('Defensive line');
  });
});
