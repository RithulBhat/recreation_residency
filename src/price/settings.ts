/**
 * Price Guess settings: defaults, limits, validation and presets.
 *
 * One schema drives four things — the settings UI, the validator, the share link and a party
 * room's config — so a value that cannot be expressed here cannot leak in from a crafted link
 * or a malicious room host either. `validateSettings` therefore CLAMPS rather than rejects:
 * an out-of-range round count coming off the wire should start a sane game, not a broken one.
 *
 * Pure and framework-free.
 */

import type { PlayerConfig } from '@/types/game';
import { DEFAULT_PLAYERS } from '@/game/presets';
import type {
  PriceDifficulty,
  PriceHint,
  PriceInput,
  PriceScoring,
  PriceSettings,
  GuessVisibility,
} from './types';

export const ROUND_LIMITS = { min: 1, max: 50 } as const;
export const TIMER_LIMITS = { min: 0, max: 300 } as const;
export const LADDER_TRY_LIMITS = { min: 1, max: 10 } as const;
export const LADDER_TOLERANCE_LIMITS = { min: 0.001, max: 0.5 } as const;
export const PLAYER_LIMITS = { min: 1, max: 12 } as const;

export const PRICE_INPUTS: readonly PriceInput[] = ['exact', 'slider', 'choice', 'ladder'];
export const PRICE_SCORINGS: readonly PriceScoring[] = ['closeness', 'priceIsRight', 'elimination'];
export const PRICE_DIFFICULTIES: readonly PriceDifficulty[] = ['easy', 'medium', 'hard', 'chaos'];
export const PRICE_HINTS: readonly PriceHint[] = ['category', 'bracket', 'firstDigit'];
export const GUESS_VISIBILITIES: readonly GuessVisibility[] = ['off', 'afterLock', 'live'];
export const CURRENCIES = ['usd', 'gbp', 'eur'] as const;

/**
 * Tolerance bands per difficulty — what still counts as a respectable guess. These widen the
 * accuracy bonus rather than changing the curve, so the scoring stays comparable across games.
 */
export const DIFFICULTY_TOLERANCE: Record<PriceDifficulty, number> = {
  easy: 0.25,
  medium: 0.15,
  hard: 0.08,
  chaos: 0.2,
};

/**
 * The solo identity and the party roster are REUSED from Songooner's presets rather than
 * re-declared — Highlight Scout does the same. One set of names, emoji and colours across every
 * game on the site, so a player keeps their identity moving between them.
 */
export const SOLO_PLAYER: PlayerConfig = { id: 'you', name: 'You', emoji: '💸', color: '#fbbf24' };
export const PARTY_PLAYERS: readonly PlayerConfig[] = DEFAULT_PLAYERS;

/**
 * The canonical settings object.
 *
 * Defined THROUGH `reconcile` rather than as a bare literal: the defaults are just another
 * settings object, and nothing guarantees a hand-written one obeys the consistency rules. The
 * first draft of this literal paired `timer: 0` with `speedBonus: true` — a bonus that can never
 * pay out — and a test caught it. Routing the defaults through the same gate as user input means
 * that class of drift cannot come back. (`reconcile` is a function declaration, so it is hoisted
 * and callable here.)
 */
export const DEFAULT_SETTINGS: PriceSettings = reconcile({
  rounds: 10,
  // Untimed by default: Price Guess rewards thinking about the item, not reflexes. Turning a
  // timer on in setup is what makes the speed bonus available.
  timer: 0,
  packIds: [],
  difficulty: 'medium',
  input: 'exact',
  scoring: 'closeness',
  ladderTries: 6,
  ladderTolerance: 0.05,
  hints: PRICE_HINTS,
  currency: 'usd',
  inflationAdjust: false,
  speedBonus: true,
  streakMultiplier: true,
  guessVisibility: 'afterLock',
  twists: { bidWar: false, bluffRound: false, teamMode: false },
  players: [SOLO_PLAYER],
  duelStyle: 'turns',
});

function clamp(v: unknown, min: number, max: number, fallback: number): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return fallback;
  return Math.min(max, Math.max(min, v));
}

function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  return Math.round(clamp(v, min, max, fallback));
}

function oneOf<T extends string>(v: unknown, allowed: readonly T[], fallback: T): T {
  return typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
}

function bool(v: unknown, fallback: boolean): boolean {
  return typeof v === 'boolean' ? v : fallback;
}

function stringList(v: unknown, max: number): readonly string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const entry of v) {
    if (typeof entry === 'string' && entry.trim() !== '' && !out.includes(entry)) out.push(entry);
    if (out.length >= max) break;
  }
  return out;
}

const HEX = /^#[0-9a-fA-F]{6}$/;

function validatePlayers(v: unknown): readonly PlayerConfig[] {
  if (!Array.isArray(v)) return [SOLO_PLAYER];
  const out: PlayerConfig[] = [];
  for (const entry of v) {
    if (typeof entry !== 'object' || entry === null) continue;
    const p = entry as Partial<PlayerConfig>;
    if (typeof p.id !== 'string' || p.id.trim() === '') continue;
    if (out.some((existing) => existing.id === p.id)) continue;
    const fallback = PARTY_PLAYERS[out.length % PARTY_PLAYERS.length];
    out.push({
      id: p.id.slice(0, 32),
      name: typeof p.name === 'string' && p.name.trim() !== '' ? p.name.slice(0, 24) : fallback.name,
      emoji: typeof p.emoji === 'string' && p.emoji !== '' ? p.emoji.slice(0, 8) : fallback.emoji,
      // a colour off the wire is painted into the UI, so only a real hex is accepted
      color: typeof p.color === 'string' && HEX.test(p.color) ? p.color : fallback.color,
    });
    if (out.length >= PLAYER_LIMITS.max) break;
  }
  return out.length > 0 ? out : [SOLO_PLAYER];
}

/**
 * Rebuild a settings object from untrusted input, clamping everything into range.
 *
 * Deliberately total: any input at all produces a playable game. Settings arrive from share
 * links and from a party host over PeerJS, and neither is trusted — the same
 * rebuild-don't-trust discipline `src/net/protocol.ts` uses for wire messages.
 */
export function validateSettings(raw: unknown): PriceSettings {
  const s = (typeof raw === 'object' && raw !== null ? raw : {}) as Partial<PriceSettings>;
  const twists = (typeof s.twists === 'object' && s.twists !== null ? s.twists : {}) as Partial<
    PriceSettings['twists']
  >;

  const hints = Array.isArray(s.hints)
    ? PRICE_HINTS.filter((h) => (s.hints as readonly unknown[]).includes(h))
    : DEFAULT_SETTINGS.hints;

  const settings: PriceSettings = {
    rounds: clampInt(s.rounds, ROUND_LIMITS.min, ROUND_LIMITS.max, DEFAULT_SETTINGS.rounds),
    timer: clampInt(s.timer, TIMER_LIMITS.min, TIMER_LIMITS.max, DEFAULT_SETTINGS.timer),
    packIds: stringList(s.packIds, 24),
    difficulty: oneOf(s.difficulty, PRICE_DIFFICULTIES, DEFAULT_SETTINGS.difficulty),
    input: oneOf(s.input, PRICE_INPUTS, DEFAULT_SETTINGS.input),
    scoring: oneOf(s.scoring, PRICE_SCORINGS, DEFAULT_SETTINGS.scoring),
    ladderTries: clampInt(
      s.ladderTries,
      LADDER_TRY_LIMITS.min,
      LADDER_TRY_LIMITS.max,
      DEFAULT_SETTINGS.ladderTries,
    ),
    ladderTolerance: clamp(
      s.ladderTolerance,
      LADDER_TOLERANCE_LIMITS.min,
      LADDER_TOLERANCE_LIMITS.max,
      DEFAULT_SETTINGS.ladderTolerance,
    ),
    hints,
    currency: oneOf(s.currency, CURRENCIES, DEFAULT_SETTINGS.currency),
    inflationAdjust: bool(s.inflationAdjust, DEFAULT_SETTINGS.inflationAdjust),
    speedBonus: bool(s.speedBonus, DEFAULT_SETTINGS.speedBonus),
    streakMultiplier: bool(s.streakMultiplier, DEFAULT_SETTINGS.streakMultiplier),
    guessVisibility: oneOf(s.guessVisibility, GUESS_VISIBILITIES, DEFAULT_SETTINGS.guessVisibility),
    twists: {
      bidWar: bool(twists.bidWar, false),
      bluffRound: bool(twists.bluffRound, false),
      teamMode: bool(twists.teamMode, false),
    },
    players: validatePlayers(s.players),
    duelStyle: oneOf(s.duelStyle, ['buzzer', 'turns'] as const, DEFAULT_SETTINGS.duelStyle),
  };

  if (typeof s.seed === 'string' && s.seed.trim() !== '') settings.seed = s.seed.slice(0, 64);

  return reconcile(settings);
}

/**
 * Settings that contradict each other are resolved here rather than surprising the player
 * mid-game. Each rule exists because the combination is genuinely unplayable, not merely odd.
 */
export function reconcile(s: PriceSettings): PriceSettings {
  const out = { ...s, twists: { ...s.twists } };

  // Elimination needs somebody to eliminate.
  if (out.scoring === 'elimination' && out.players.length < 2) out.scoring = 'closeness';

  // The ladder input already is a guess-by-guess feedback loop; showing rivals' guesses live
  // would hand over the answer, and Price Is Right's single sealed bid is meaningless with it.
  if (out.input === 'ladder') {
    out.guessVisibility = 'off';
    if (out.scoring === 'priceIsRight') out.scoring = 'closeness';
  }

  // Multiple choice has no notion of "without going over" — every option is a fixed number.
  if (out.input === 'choice' && out.scoring === 'priceIsRight') out.scoring = 'closeness';

  // Team averaging and a strict turn-based bid war cannot both own the guessing order.
  if (out.twists.teamMode && out.twists.bidWar) out.twists.bidWar = false;

  // Party twists need a party.
  if (out.players.length < 3) {
    out.twists.bidWar = false;
    out.twists.bluffRound = false;
    out.twists.teamMode = false;
  }

  // A speed bonus with no clock would pay for nothing.
  if (out.timer === 0) out.speedBonus = false;

  return out;
}

export interface PricePreset {
  id: string;
  name: string;
  emoji: string;
  blurb: string;
  settings: PriceSettings;
}

function preset(
  id: string,
  name: string,
  emoji: string,
  blurb: string,
  over: Partial<PriceSettings>,
): PricePreset {
  return { id, name, emoji, blurb, settings: reconcile({ ...DEFAULT_SETTINGS, ...over }) };
}

export const PRESETS: readonly PricePreset[] = [
  preset('quick-5', 'Quick 5', '⚡', 'Five rounds, twenty seconds each. One coffee long.', {
    rounds: 5,
    timer: 20,
  }),
  preset('daily', 'Daily', '📅', 'Six items, one attempt, the same for everyone today.', {
    rounds: 6,
    timer: 0,
    input: 'ladder',
    ladderTries: 6,
  }),
  preset('price-is-right', 'Price Is Right', '🎰', 'Closest without going over. A penny over is nothing.', {
    rounds: 10,
    timer: 30,
    scoring: 'priceIsRight',
  }),
  preset('chaos-cart', 'Chaos Cart', '🛒', 'Two-dollar sweets next to two-million-dollar houses.', {
    rounds: 12,
    timer: 15,
    difficulty: 'chaos',
    streakMultiplier: true,
  }),
  preset('luxury-only', 'Luxury Only', '💎', 'Nothing here is reasonably priced.', {
    rounds: 10,
    difficulty: 'hard',
    hints: ['bracket'],
  }),
  preset('team-showdown', 'Team Showdown', '🤝', 'Two teams, guesses averaged. Argue first.', {
    rounds: 10,
    timer: 45,
    twists: { bidWar: false, bluffRound: false, teamMode: true },
    players: PARTY_PLAYERS.slice(0, 4),
  }),
];

export function presetById(id: string): PricePreset | undefined {
  return PRESETS.find((p) => p.id === id);
}
