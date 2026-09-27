/**
 * Pure text for the Highlight Scout lobby, daily and stats screens: the start-bar one-liner,
 * the difficulty copy, the session-format phrasings and the little "N players" lines.
 * Framework-free so it unit tests.
 *
 * Scout's equivalent of `@/components/setup/summary` — deliberately the same shapes (`MODE_LABEL`,
 * `packsSummary`, `settingsSummary`) so the two lobbies read identically.
 *
 * The rule the whole file obeys: a line may only name a setting the SESSION FORMAT actually reads.
 * `formatUses` from `@/scout/formats` is the single gate, here and in the controls, so a blitz run is
 * never described with a round count it ignores and a duel is never promised hints it does not have.
 */

import type { DuelStyle } from '@/types/game';
import {
  BLITZ_LADDER_RUNGS,
  BLITZ_MISS_PENALTY_MS,
  BLITZ_RUNG,
  DUEL_BUZZ_KEYS,
  GAUNTLET_SIZE,
  SCOUT_FORMATS,
  SCOUT_FORMAT_LIMITS,
  SURVIVAL_TIER_STEP,
  formatUses,
  resolveScoutPlayers,
  scoutBlitzDuration,
  scoutDuelStyle,
  scoutFormat,
  scoutFormatInfo,
  scoutLives,
  type ScoutFormatInfo,
} from '@/scout/formats';
import { SCOUT_MODES, scoutMode, scoutPack } from '@/scout/packs';
import {
  FACE_ZOOM_MAX,
  FACE_ZOOM_MIN,
  LOGO_ZOOM_MAX,
  LOGO_ZOOM_MIN,
  SILHOUETTE_MAX,
  visualLadder,
} from '@/scout/stages';
import type { ScoutDifficulty, ScoutFormat, ScoutMode, ScoutSettings } from '@/scout/types';

export const SCOUT_MODE_LABEL: Readonly<Record<ScoutMode, string>> = Object.fromEntries(
  SCOUT_MODES.map((m) => [m.id, m.name]),
) as Record<ScoutMode, string>;

export const SCOUT_MODE_EMOJI: Readonly<Record<ScoutMode, string>> = Object.fromEntries(
  SCOUT_MODES.map((m) => [m.id, m.emoji]),
) as Record<ScoutMode, string>;

/** Plain English for each tier, keyed to the fame windows in CLAUDE.md. */
export const SCOUT_DIFFICULTY_INFO: Readonly<
  Record<ScoutDifficulty, { label: string; hint: string; fame: string }>
> = {
  any: {
    label: 'Any',
    hint: 'Every tier mixed together — posters, starters and camp bodies.',
    fame: 'fame 0–100',
  },
  star: {
    label: 'Superstars',
    hint: 'Household names. If they have a jersey in the stands, they qualify.',
    fame: 'fame 80+',
  },
  starter: {
    label: 'Starters',
    hint: 'Week-one starters. You know the name, maybe not the face.',
    fame: 'fame 55–79',
  },
  rotation: {
    label: 'Rotation',
    hint: 'Role players and rotational depth. Fantasy managers only.',
    fame: 'fame 30–54',
  },
  deepCut: {
    label: 'Deep cuts',
    hint: 'Practice-squad energy. Nobody knows these. Sickos only.',
    fame: 'fame under 30',
  },
};

export const SCOUT_DIFFICULTY_ORDER: readonly ScoutDifficulty[] = [
  'any',
  'star',
  'starter',
  'rotation',
  'deepCut',
];

/** A mode's display name, falling back to the raw id if a mode is ever removed. */
export function scoutModeName(mode: ScoutMode): string {
  return scoutMode(mode)?.name ?? mode;
}

/** The mode's one-line "how it plays", with the draft's try count folded in. */
export function scoutModeHow(mode: ScoutMode, tries: number): string {
  const info = scoutMode(mode);
  if (!info) return `${tries} ${tryWord(tries)}`;
  return `${info.how} ${tries} ${tryWord(tries)}.`;
}

export function tryWord(n: number): string {
  return n === 1 ? 'try' : 'tries';
}

export function roundsLabel(rounds: number): string {
  return rounds === 0 ? '∞ rounds' : `${rounds} ${rounds === 1 ? 'round' : 'rounds'}`;
}

export function triesLabel(tries: number): string {
  return `${tries} ${tryWord(tries)}`;
}

export function timerLabel(seconds: number): string {
  return seconds === 0 ? 'no timer' : `${seconds}s timer`;
}

/** `Superstars`, `Superstars + Rookies`, `Superstars + Rookies +2`. */
export function scoutPacksSummary(names: readonly string[]): string {
  const [first, second] = names;
  if (first === undefined) return 'No packs';
  if (second === undefined) return first;
  const shown = `${first} + ${second}`;
  return names.length === 2 ? shown : `${shown} +${names.length - 2}`;
}

/** Names for a list of pack ids, unknown ids dropped. */
export function scoutPackNames(ids: readonly string[]): string[] {
  return ids.map((id) => scoutPack(id)?.name).filter((n): n is string => typeof n === 'string');
}

/**
 * Does the difficulty tier change anything for these settings?
 *
 * `buildPool` filters PLAYERS by {@link tierOf}; franchises have no fame score, so a run that only
 * ever deals teams (Franchise IQ, Logo Zoom) returns all 32 clubs at every tier. The lobby uses this
 * to hide the control rather than leave a dial that turns nothing — and the summaries below use it
 * so a tier left over from a player mode is not advertised on a run that ignores it.
 */
export function scoutDifficultyApplies(s: Pick<ScoutSettings, 'mode' | 'mixModes'>): boolean {
  return poolKind(s) !== 'team';
}

/** The tier label for a summary line, or `null` when the tier does nothing for these settings. */
export function scoutDifficultyLabel(s: Pick<ScoutSettings, 'mode' | 'mixModes' | 'difficulty'>): string | null {
  if (s.difficulty === 'any' || !scoutDifficultyApplies(s)) return null;
  return SCOUT_DIFFICULTY_INFO[s.difficulty].label;
}

/** `12 players`, `1 player`, `32 franchises` — the pool line under the Start button. */
export function poolLabel(count: number, kind: 'player' | 'team' | 'mixed'): string {
  const noun = kind === 'team' ? 'franchise' : kind === 'mixed' ? 'subject' : 'player';
  const plural = kind === 'team' ? 'franchises' : kind === 'mixed' ? 'subjects' : 'players';
  return `${count.toLocaleString()} ${count === 1 ? noun : plural}`;
}

/** What a run of these settings will be naming: players, franchises, or both. */
export function poolKind(s: Pick<ScoutSettings, 'mode' | 'mixModes'>): 'player' | 'team' | 'mixed' {
  if (s.mixModes) return 'mixed';
  return SCOUT_MODES.find((m) => m.id === s.mode)?.guesses ?? 'player';
}

/** Human copy when the pool comes back empty. */
export function emptyPoolMessage(s: ScoutSettings): string {
  const names = scoutPackNames(s.packIds);
  const where = names.length > 0 ? scoutPacksSummary(names) : 'these packs';
  const label = scoutDifficultyLabel(s);
  const tier = label === null ? '' : ` at ${label}`;
  const fix = label === null ? 'Add a pack.' : 'Add a pack or drop the difficulty.';
  return `Nobody in ${where}${tier} can be played as ${scoutModeName(s.mode)}. ${fix}`;
}

/** `0.82` → `82%`. */
export function pct(value: number, digits = 0): string {
  if (!Number.isFinite(value)) return '—';
  return `${(Math.max(0, Math.min(1, value)) * 100).toFixed(digits)}%`;
}

/**
 * The reveal ladder a visual mode will walk for `tries` rungs, 0 → 1, or null for the text modes
 * (whose ladder is clues, not pixels). Reads the same constants `@/scout/stages` builds rounds from.
 */
export function scoutRevealLadder(mode: ScoutMode, tries: number): number[] | null {
  const range = VISUAL_RANGE[mode];
  if (!range) return null;
  return visualLadder(tries, range.min, range.max);
}

const VISUAL_RANGE: Partial<Record<ScoutMode, { min: number; max: number }>> = {
  silhouette: { min: 0, max: SILHOUETTE_MAX },
  faceZoom: { min: FACE_ZOOM_MIN, max: FACE_ZOOM_MAX },
  logoZoom: { min: LOGO_ZOOM_MIN, max: LOGO_ZOOM_MAX },
};

// ---------------------------------------------------------------------------------------------
// Session formats
//
// `ScoutFormat` is the second axis of the lobby (see `@/scout/formats`): the puzzle type says what
// a round SHOWS, the format says how the whole run is SHAPED. Every line below reads the format
// metadata and the total resolvers, so a format can never be described with a setting it ignores —
// `formatUses` is the single gate, here and in the controls.
// ---------------------------------------------------------------------------------------------

export const SCOUT_FORMAT_LABEL: Readonly<Record<ScoutFormat, string>> = Object.fromEntries(
  SCOUT_FORMATS.map((f) => [f.id, f.name]),
) as Record<ScoutFormat, string>;

export const SCOUT_FORMAT_EMOJI: Readonly<Record<ScoutFormat, string>> = Object.fromEntries(
  SCOUT_FORMATS.map((f) => [f.id, f.emoji]),
) as Record<ScoutFormat, string>;

/** One accent per format, so the six cards read as six different games. */
export const SCOUT_FORMAT_ACCENT: Readonly<Record<ScoutFormat, string>> = {
  standard: '#a855f7',
  blitz: '#fbbf24',
  survival: '#fb7185',
  gauntlet: '#34d399',
  duel: '#22d3ee',
  party: '#f472b6',
};

/** A format's display name, falling back to the raw id if a format is ever removed. */
export function scoutFormatName(format: ScoutFormat): string {
  return scoutFormatInfo(format)?.name ?? format;
}

export function livesLabel(n: number): string {
  return `${n} ${n === 1 ? 'life' : 'lives'}`;
}

export function clockLabel(seconds: number): string {
  return `${seconds}s clock`;
}

export function seatsLabel(n: number): string {
  return `${n} ${n === 1 ? 'player' : 'players'}`;
}

export const SCOUT_DUEL_STYLE_LABEL: Readonly<Record<DuelStyle, string>> = {
  buzzer: 'Buzz-in',
  turns: 'Turns',
};

export function duelStyleLabel(style: DuelStyle): string {
  return SCOUT_DUEL_STYLE_LABEL[style];
}

/** How many humans a format seats, for its card: `Solo`, `2 players`, `2–8 players`. */
export function formatSeatsLabel(seats: ScoutFormatInfo['seats']): string {
  if (seats === 'solo') return 'Solo';
  if (seats === 'pair') return '2 players';
  return `${SCOUT_FORMAT_LIMITS.players.min}–${SCOUT_FORMAT_LIMITS.players.max} players`;
}

/**
 * The facts that belong to the FORMAT rather than the puzzle: the blitz clock, survival lives, the
 * gauntlet board, the duel style, the party roster — plus the round count, but only for the formats
 * that actually read one (`blitz`, `survival` and `gauntlet` force `rounds: 0`).
 */
export function scoutFormatFacts(s: ScoutSettings): string[] {
  const format = scoutFormat(s);
  const out: string[] = [];
  switch (format) {
    case 'blitz':
      out.push(clockLabel(scoutBlitzDuration(s)));
      break;
    case 'survival':
      out.push(livesLabel(scoutLives(s)));
      break;
    case 'gauntlet':
      out.push(`${GAUNTLET_SIZE} franchises`);
      break;
    case 'duel':
      out.push(duelStyleLabel(scoutDuelStyle(s)));
      break;
    case 'party':
      out.push(seatsLabel(resolveScoutPlayers(s).length));
      break;
    default:
      break;
  }
  if (formatUses(format, 'rounds')) out.push(roundsLabel(s.rounds));
  return out;
}

/**
 * The start-bar one-liner — the whole run in one honest line, format first:
 * `Survival · 3 lives · Silhouette · Superstars · 5 tries`.
 *
 * Nothing the format ignores is ever named: a blitz line has no round count or try count, a gauntlet
 * line has no packs (they are chosen for it) and no tier, a duel line has no hints.
 */
export function scoutSettingsSummary(s: ScoutSettings, packNames?: readonly string[]): string {
  const format = scoutFormat(s);
  const parts = [scoutFormatName(format), ...scoutFormatFacts(s)];
  parts.push(s.mixModes ? 'Mixed bag' : scoutModeName(s.mode));
  if (formatUses(format, 'packIds')) {
    parts.push(scoutPacksSummary(packNames ?? scoutPackNames(s.packIds)));
  }
  const tier = formatUses(format, 'difficulty') ? scoutDifficultyLabel(s) : null;
  if (tier !== null) parts.push(tier);
  if (formatUses(format, 'tries')) parts.push(triesLabel(s.tries));
  if (formatUses(format, 'roundTimer') && s.roundTimer > 0) parts.push(timerLabel(s.roundTimer));
  if (formatUses(format, 'hintsEnabled') && !s.hintsEnabled) parts.push('no hints');
  return parts.join(' · ');
}

/** `2s`, `5s` — the blitz miss penalty, read from the engine constant rather than retyped. */
export const BLITZ_PENALTY_LABEL = `${Math.round(BLITZ_MISS_PENALTY_MS / 1000)}s`;

/** What blitz freezes every subject at: `rung 2 of 5`. */
export const BLITZ_RUNG_LABEL = `rung ${BLITZ_RUNG} of ${BLITZ_LADDER_RUNGS}`;

/**
 * Three lines describing how a run of these settings actually plays, in order. Format-specific and
 * honest about the numbers the draft is carrying — the lobby's "How this run plays" card.
 */
export function scoutRunSteps(s: ScoutSettings): string[] {
  const format = scoutFormat(s);
  switch (format) {
    case 'blitz':
      return [
        `Every subject opens at the same rung — ${BLITZ_RUNG_LABEL}, about half the reveal and half the clues.`,
        `Name it and the next subject deals instantly. A miss or a skip burns ${BLITZ_PENALTY_LABEL} of clock.`,
        `The run ends when the ${clockLabel(scoutBlitzDuration(s))} hits zero — your score is how far you got.`,
      ];
    case 'survival':
      return [
        `You start on household names with ${livesLabel(scoutLives(s))} and ${triesLabel(s.tries)} a subject.`,
        `Every ${SURVIVAL_TIER_STEP} correct answers walks the league down a tier — superstars, starters, rotation, deep cuts — and drops a rung off the ladder.`,
        'A lost round costs a life. At zero lives the run is over.',
      ];
    case 'gauntlet':
      return [
        `The board is all ${GAUNTLET_SIZE} franchises, shuffled by the run's seed.`,
        `Each round deals a subject from a club you have not played yet — ${triesLabel(s.tries)} to name it.`,
        'Clear the whole board and the run is done. Every club counts exactly once.',
      ];
    case 'duel':
      return scoutDuelStyle(s) === 'buzzer'
        ? [
            `Nobody may answer until someone buzzes — ${DUEL_BUZZ_KEYS.map((k) => k.toUpperCase()).join(' for player one, ')} for player two.`,
            'A wrong buzz locks that player out of the round. Both locked out and the round is lost.',
            `${roundsLabel(s.rounds)}, and the higher score takes it.`,
          ]
        : [
            'The two of you alternate: one subject each, round by round.',
            `${triesLabel(s.tries)} on your own subject — a miss lifts the reveal for you, not for them.`,
            `${roundsLabel(s.rounds)}, and the higher score takes it.`,
          ];
    case 'party':
      return [
        'Everyone takes a turn in order, with a handover card covering the screen in between.',
        'The round count snaps to a multiple of the roster, so nobody gets an extra subject.',
        `${roundsLabel(s.rounds)} in total, and the highest score wins.`,
      ];
    default:
      return [
        'You open on the hardest rung — barely anything to go on.',
        `Every miss lifts the reveal and adds a clue. ${triesLabel(s.tries)} before the round is lost.`,
        'Solving on rung one is worth the most — the score falls with every try.',
      ];
  }
}

/**
 * The rules line for the collapsed settings panel — exactly the controls that panel renders for this
 * format, in the same order: `Buzz-in · Superstars · 10 rounds · 4 tries · no timer`.
 */
export function scoutRulesSummary(s: ScoutSettings): string {
  const format = scoutFormat(s);
  const parts: string[] = [];
  if (formatUses(format, 'duelStyle')) parts.push(duelStyleLabel(scoutDuelStyle(s)));
  if (formatUses(format, 'blitzDuration')) parts.push(clockLabel(scoutBlitzDuration(s)));
  if (formatUses(format, 'lives')) parts.push(livesLabel(scoutLives(s)));
  const tier = formatUses(format, 'difficulty') ? scoutDifficultyLabel(s) : null;
  if (tier !== null) parts.push(tier);
  if (formatUses(format, 'rounds')) parts.push(roundsLabel(s.rounds));
  if (formatUses(format, 'tries')) parts.push(triesLabel(s.tries));
  if (formatUses(format, 'roundTimer')) parts.push(timerLabel(s.roundTimer));
  if (formatUses(format, 'hintsEnabled') && !s.hintsEnabled) parts.push('no hints');
  return parts.join(' · ');
}

/**
 * What today's daily is one shot AT: `today's 8 subjects`, `today's 90 seconds`, `the whole board`.
 * The daily is seeded settings like any other run, so its copy has to read them rather than assume
 * the eight-round standard run it happened to ship with.
 */
export function dailyRunNoun(s: ScoutSettings): string {
  const format = scoutFormat(s);
  if (format === 'gauntlet') return 'the whole board';
  if (format === 'blitz') return `${scoutBlitzDuration(s)} seconds`;
  if (format === 'survival') return `${livesLabel(scoutLives(s))}`;
  return s.rounds > 0 ? `${s.rounds} subjects` : 'an endless run';
}
