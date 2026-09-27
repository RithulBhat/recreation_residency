/**
 * Pure reads the stage components share.
 *
 * They live outside the components so they can be unit-tested without a DOM, and so the ONE piece of
 * cross-checking between a payload and a clue list (has the ladder handed out one of the two Higher
 * or Lower numbers yet?) has a single tested implementation.
 */

import type { ScoutClue, ScoutHigherLowerPuzzle } from '@/scout/types';

/**
 * Which side's number the ladder has already paid out, or `null` while both are still hidden.
 *
 * The `higherLower` ladder's last rung is `{ label: '<stat> · <name>', value: '<number>' }` (see
 * `@/scout/stages`), so a clue that names the stat AND carries one of the two display values is that
 * rung — and the card it belongs to can show its number.
 */
export function revealedValueIndex(puzzle: ScoutHigherLowerPuzzle, clues: readonly ScoutClue[] = []): 0 | 1 | null {
  for (const clue of clues) {
    if (!clue.label.includes(puzzle.statLabel)) continue;
    if (clue.value === puzzle.values[0]) return 0;
    if (clue.value === puzzle.values[1]) return 1;
  }
  return null;
}

/** 0 → 1 relative luminance of a `#rgb` / `#rrggbb` colour. */
export function hexLuminance(hex: string): number {
  const raw = hex.replace('#', '').trim();
  const full = raw.length === 3 ? raw.split('').map((c) => c + c).join('') : raw.slice(0, 6);
  if (!/^[0-9a-f]{6}$/i.test(full)) return 0.5;
  const channel = (i: number): number => {
    const v = Number.parseInt(full.slice(i * 2, i * 2 + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2);
}

/**
 * The luminance at which black ink starts beating white ink (√(1.05 × 0.05) − 0.05, the crossover of
 * the two WCAG contrast ratios). Measured, not eyeballed: Seattle's action green (L ≈ 0.40) takes
 * black at 9:1 where white would manage 2.3:1, and Kansas City's red (L ≈ 0.17) takes white.
 */
export const INK_CROSSOVER = 0.179;

/**
 * Ink that stays readable on a club colour.
 *
 * Team colours come from the DATASET, not from the theme, so this is the one place a literal colour
 * is correct: Seattle's action green and Pittsburgh's black cannot take the same ink, and no theme
 * token knows which one the round is about.
 */
export function inkOn(hex: string): string {
  return hexLuminance(hex) > INK_CROSSOVER ? '#0b0b12' : '#ffffff';
}

/** Has the ladder paid out the value the three `oddOneOut` cards share? */
export function sharedValueRevealed(puzzle: { sharedValue: string }, clues: readonly ScoutClue[] = []): boolean {
  return clues.some((c) => c.value === puzzle.sharedValue);
}

/**
 * Is this key event already going somewhere that eats keystrokes?
 *
 * The tap-only modes bind bare number keys, and `event.target` is not always an element — a keydown
 * dispatched at `window` has no `tagName` at all — so this narrows before it asks.
 */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (target === null || !(typeof target === 'object') || !('tagName' in target)) return false;
  const el = target as { tagName?: unknown; isContentEditable?: unknown };
  const tag = typeof el.tagName === 'string' ? el.tagName.toLowerCase() : '';
  return tag === 'input' || tag === 'textarea' || tag === 'select' || el.isContentEditable === true;
}

/**
 * A stat label as it reads in a question.
 *
 * The dataset's labels are scoreboard shorthand ('Rec', 'TFL', 'Pass def'), which is right on a chip
 * and wrong in a sentence — "Who had more Rec?" is not a question anyone asks out loud.
 */
export const STAT_PHRASES: Readonly<Record<string, string>> = {
  Rec: 'receptions',
  'Rec yds': 'receiving yards',
  'Rec TD': 'receiving touchdowns',
  'Rush yds': 'rushing yards',
  'Rush TD': 'rushing touchdowns',
  'Pass yds': 'passing yards',
  'Pass TD': 'passing touchdowns',
  Carries: 'carries',
  Targets: 'targets',
  Tackles: 'tackles',
  Solo: 'solo tackles',
  Sacks: 'sacks',
  TFL: 'tackles for loss',
  'QB hits': 'hits on the quarterback',
  INT: 'interceptions',
  'Pass def': 'passes defended',
  'Forced FUM': 'forced fumbles',
  TD: 'touchdowns',
  Longest: 'yards on his longest play',
  Rating: 'passer rating',
  'Yds/rec': 'yards per catch',
  'Yds/carry': 'yards per carry',
  'Yds/att': 'yards per attempt',
  'Comp %': 'completion percentage',
};

export function statPhrase(label: string): string {
  return STAT_PHRASES[label] ?? label.toLowerCase();
}
