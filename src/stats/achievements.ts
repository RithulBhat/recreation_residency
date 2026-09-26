/**
 * Achievements. Every entry is a pure predicate over one finished game plus the
 * lifetime totals *after* that game has been folded in, so "first ever" style
 * checks can lean on `totals`.
 */

import type { GameState, Modifiers, Round } from '@/types/game';
import { bucketClip, playedRounds, roundOutcome, triesAvailable } from './aggregate';
import type { GameRecord, PackMeta, StatsTotals, TrackRecord } from './types';

export type Rarity = 'common' | 'rare' | 'epic' | 'legendary';

export const RARITIES: readonly Rarity[] = ['common', 'rare', 'epic', 'legendary'];

export interface AchievementContext {
  /** the finished game */
  state: GameState;
  /** its condensed record */
  record: GameRecord;
  /** lifetime totals, already including this game */
  totals: StatsTotals;
  /** per-track history, already including this game */
  tracks: ReadonlyMap<number, TrackRecord>;
  /** pack metadata, when the app has registered it (language / decade checks) */
  packs?: ReadonlyMap<string, PackMeta>;
  /** distinct dailies completed, including this one */
  dailies?: number;
  /** stored records, newest first, including this game */
  records?: readonly GameRecord[];
}

export interface Achievement {
  id: string;
  name: string;
  emoji: string;
  description: string;
  rarity: Rarity;
  /** not shown in the list until unlocked */
  hidden?: boolean;
  check: (ctx: AchievementContext) => boolean;
}

const EPS = 1e-6;

/** Tags we treat as languages for the polyglot badge. */
const LANGUAGE_TAGS = new Set([
  'english',
  'spanish',
  'hindi',
  'punjabi',
  'tamil',
  'telugu',
  'malayalam',
  'kannada',
  'bengali',
  'marathi',
  'urdu',
  'korean',
  'japanese',
  'mandarin',
  'cantonese',
  'chinese',
  'french',
  'german',
  'italian',
  'portuguese',
  'arabic',
  'turkish',
  'russian',
  'swedish',
  'dutch',
  'thai',
  'indonesian',
  'tagalog',
  'vietnamese',
  'afrikaans',
  'hebrew',
  'greek',
  'polish',
]);

const DECADE_TAG = /^(?:\d{2}|\d{4})s$/;

/** Rounds of this game that were won, with the winning guess. */
function wins(state: GameState): { round: Round; clipLength: number; tryIndex: number; at: number }[] {
  const out: { round: Round; clipLength: number; tryIndex: number; at: number }[] = [];
  for (const round of playedRounds(state)) {
    const o = roundOutcome(round, state.settings);
    if (o.won && o.correctGuess) {
      out.push({
        round,
        clipLength: o.correctGuess.clipLength,
        tryIndex: o.correctGuess.tryIndex,
        at: o.correctGuess.at,
      });
    }
  }
  return out;
}

function winsAtOrUnder(state: GameState, seconds: number): number {
  return wins(state).filter((w) => w.clipLength <= seconds + EPS).length;
}

function hintsUsedTotal(state: GameState): number {
  return playedRounds(state).reduce((n, r) => n + r.hintsUsed.length, 0);
}

function activeModifiers(m: Modifiers): number {
  let n = 0;
  if (m.speed !== 1) n += 1;
  if (m.reverse) n += 1;
  if (m.lofi) n += 1;
  if (m.bitcrush) n += 1;
  if (m.pitch !== 0) n += 1;
  return n;
}

/** Local-time hour a game finished at. */
function hourOf(record: GameRecord): number {
  return new Date(record.finishedAt).getHours();
}

/** Local `YYYY-MM-DD` for an epoch ms. Exported for the store + share text. */
export function localDateKey(at: number): string {
  const d = new Date(at);
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

/**
 * Whether the device owner (players[0]) is the unique top scorer.
 * Local multiplayer has no notion of "me", so we treat seat 1 as the owner.
 */
function ownerWon(state: GameState): boolean {
  if (state.players.length < 2) return false;
  const me = state.players[0];
  if (!me) return false;
  return state.players.every((p, i) => i === 0 || p.score < me.score);
}

function runnerUpScore(state: GameState): number {
  const scores = state.players.slice(1).map((p) => p.score);
  return scores.length > 0 ? Math.max(...scores) : 0;
}

/** Distinct values of `pick` across packs the player has ever answered in. */
function tagsFromWonPacks(ctx: AchievementContext, keep: (tag: string) => boolean): Set<string> {
  const found = new Set<string>();
  if (!ctx.packs) return found;
  for (const [packId, v] of Object.entries(ctx.totals.byPack)) {
    if (v.correct <= 0) continue;
    const meta = ctx.packs.get(packId);
    if (!meta) continue;
    for (const tag of meta.tags) {
      const t = tag.toLowerCase();
      if (keep(t)) found.add(t);
    }
  }
  return found;
}

function tracksThisGame(ctx: AchievementContext): TrackRecord[] {
  const out: TrackRecord[] = [];
  for (const round of playedRounds(ctx.state)) {
    const t = ctx.tracks.get(round.track.id);
    if (t) out.push(t);
  }
  return out;
}

/**
 * The full roster. Order is display order; ids are permanent (they are what gets
 * persisted in `AchievementUnlock`).
 */
export const ACHIEVEMENTS: readonly Achievement[] = [
  {
    id: 'needle-drop',
    name: 'Needle Drop',
    emoji: '🪡',
    description: 'Name your very first song.',
    rarity: 'common',
    check: ({ record, totals }) => record.correct >= 1 && totals.correct >= 1,
  },
  {
    id: 'on-the-board',
    name: 'On the Board',
    emoji: '🏁',
    description: 'Finish your first game.',
    rarity: 'common',
    check: ({ record, totals }) => totals.games >= 1 && record.rounds >= 1,
  },
  {
    id: 'point-one',
    name: 'Point-One',
    emoji: '🫧',
    description: 'Name a song from 0.1 seconds of audio.',
    rarity: 'epic',
    check: ({ state }) => winsAtOrUnder(state, 0.1) >= 1,
  },
  {
    id: 'dolphin-ears',
    name: 'Dolphin Ears',
    emoji: '🐬',
    description: 'Five correct at 0.25s or less in a single game.',
    rarity: 'legendary',
    check: ({ state }) => winsAtOrUnder(state, 0.25) >= 5,
  },
  {
    id: 'bat-hearing',
    name: 'Bat Hearing',
    emoji: '🦇',
    description: 'Three correct at 0.1s in a single game.',
    rarity: 'legendary',
    check: ({ state }) => winsAtOrUnder(state, 0.1) >= 3,
  },
  {
    id: 'streak-5',
    name: 'Warmed Up',
    emoji: '🔥',
    description: 'Five correct in a row.',
    rarity: 'common',
    check: ({ record }) => record.bestStreak >= 5,
  },
  {
    id: 'streak-10',
    name: 'On Fire',
    emoji: '🚒',
    description: 'Ten correct in a row.',
    rarity: 'rare',
    check: ({ record }) => record.bestStreak >= 10,
  },
  {
    id: 'streak-25',
    name: 'Volcanic',
    emoji: '🌋',
    description: 'Twenty-five correct in a row.',
    rarity: 'legendary',
    check: ({ record }) => record.bestStreak >= 25,
  },
  {
    id: 'flawless',
    name: 'Flawless',
    emoji: '💎',
    description: 'Win every round of a 5+ round game on the first try.',
    rarity: 'epic',
    check: ({ state, record }) => {
      if (record.rounds < 5 || record.correct !== record.rounds) return false;
      return playedRounds(state).every((r) => roundOutcome(r, state.settings).wonFirstTry);
    },
  },
  {
    id: 'clean-sweep',
    name: 'Clean Sweep',
    emoji: '🧹',
    description: 'Win every round of a 5+ round game.',
    rarity: 'rare',
    check: ({ record }) => record.rounds >= 5 && record.correct === record.rounds,
  },
  {
    id: 'blitz-15',
    name: 'Quickfire',
    emoji: '⚡',
    description: 'Fifteen songs in one blitz.',
    rarity: 'common',
    check: ({ record }) => record.mode === 'blitz' && record.correct >= 15,
  },
  {
    id: 'blitz-25',
    name: 'Storm Chaser',
    emoji: '🌩️',
    description: 'Twenty-five songs in one blitz.',
    rarity: 'rare',
    check: ({ record }) => record.mode === 'blitz' && record.correct >= 25,
  },
  {
    id: 'blitz-40',
    name: 'Sound Barrier',
    emoji: '🚀',
    description: 'Forty songs in one blitz. Absurd.',
    rarity: 'legendary',
    check: ({ record }) => record.mode === 'blitz' && record.correct >= 40,
  },
  {
    id: 'survival-20',
    name: 'Last One Standing',
    emoji: '🛡️',
    description: 'Survive twenty rounds.',
    rarity: 'epic',
    check: ({ record }) => record.mode === 'survival' && record.rounds >= 20,
  },
  {
    id: 'untouchable',
    name: 'Untouchable',
    emoji: '❤️',
    description: 'Ten survival rounds without losing a life.',
    rarity: 'epic',
    check: ({ state, record }) => {
      if (record.mode !== 'survival' || record.rounds < 10) return false;
      const lives = state.players[0]?.lives;
      return lives !== undefined && lives >= state.settings.lives;
    },
  },
  {
    id: 'duelist',
    name: 'Duelist',
    emoji: '⚔️',
    description: 'Win a duel.',
    rarity: 'rare',
    check: ({ state, record }) => record.mode === 'duel' && ownerWon(state),
  },
  {
    id: 'shutout',
    name: 'Shutout',
    emoji: '🥊',
    description: 'Win a duel without conceding a single point.',
    rarity: 'epic',
    check: ({ state, record }) =>
      record.mode === 'duel' && ownerWon(state) && runnerUpScore(state) <= 0,
  },
  {
    id: 'party-host',
    name: 'Party Host',
    emoji: '🎈',
    description: 'Play a game with four or more players.',
    rarity: 'common',
    check: ({ state }) => state.players.length >= 4,
  },
  {
    id: 'landslide',
    name: 'Landslide',
    emoji: '🏟️',
    description: 'Win a party game with double the runner-up’s score.',
    rarity: 'rare',
    check: ({ state, record }) => {
      if (record.mode !== 'party' || state.players.length < 3 || !ownerWon(state)) return false;
      const second = runnerUpScore(state);
      const me = state.players[0]?.score ?? 0;
      return second > 0 && me >= second * 2;
    },
  },
  {
    id: 'polyglot',
    name: 'Polyglot',
    emoji: '🌍',
    description: 'Answer correctly in packs from five different languages.',
    rarity: 'epic',
    check: (ctx) => tagsFromWonPacks(ctx, (t) => LANGUAGE_TAGS.has(t)).size >= 5,
  },
  {
    id: 'time-traveler',
    name: 'Time Traveler',
    emoji: '🕰️',
    description: 'Answer correctly in packs from four different decades.',
    rarity: 'rare',
    check: (ctx) => tagsFromWonPacks(ctx, (t) => DECADE_TAG.test(t)).size >= 4,
  },
  {
    id: 'night-owl',
    name: 'Night Owl',
    emoji: '🦉',
    description: 'Finish a game between 1am and 4am.',
    rarity: 'common',
    check: ({ record }) => {
      if (record.rounds < 1) return false;
      const h = hourOf(record);
      return h >= 1 && h < 4;
    },
  },
  {
    id: 'early-bird',
    name: 'Early Bird',
    emoji: '🐓',
    description: 'Finish a game between 5am and 7am.',
    rarity: 'common',
    check: ({ record }) => {
      if (record.rounds < 1) return false;
      const h = hourOf(record);
      return h >= 5 && h < 7;
    },
  },
  {
    id: 'marathon',
    name: 'Marathon',
    emoji: '🏃',
    description: 'Play fifty games.',
    rarity: 'epic',
    check: ({ totals }) => totals.games >= 50,
  },
  {
    id: 'centurion',
    name: 'Centurion',
    emoji: '💯',
    description: 'One hundred correct songs, all time.',
    rarity: 'rare',
    check: ({ totals }) => totals.correct >= 100,
  },
  {
    id: 'five-hundred-club',
    name: 'Five Hundred Club',
    emoji: '🧿',
    description: 'Five hundred correct songs, all time.',
    rarity: 'legendary',
    check: ({ totals }) => totals.correct >= 500,
  },
  {
    id: 'comeback-kid',
    name: 'Comeback Kid',
    emoji: '🪃',
    description: 'Win three rounds on your very last try in one game.',
    rarity: 'rare',
    check: ({ state }) => {
      const last = triesAvailable(state.settings) - 1;
      return wins(state).filter((w) => w.tryIndex >= last).length >= 3;
    },
  },
  {
    id: 'no-hints-needed',
    name: 'No Hints Needed',
    emoji: '🚫',
    description: 'Finish a 5+ round game with hints on and never touch one.',
    rarity: 'common',
    check: ({ state, record }) =>
      state.settings.hintsEnabled &&
      record.rounds >= 5 &&
      record.correct >= 1 &&
      hintsUsedTotal(state) === 0,
  },
  {
    id: 'hint-addict',
    name: 'Hint Addict',
    emoji: '🙈',
    description: 'Use a hint in every single round of a game.',
    rarity: 'common',
    hidden: true,
    check: ({ state, record }) =>
      record.rounds >= 5 && playedRounds(state).every((r) => r.hintsUsed.length > 0),
  },
  {
    id: 'reverse-card',
    name: 'Reverse Card',
    emoji: '🔄',
    description: 'Win a round with the audio playing backwards.',
    rarity: 'rare',
    check: ({ state, record }) => state.settings.modifiers.reverse && record.correct >= 1,
  },
  {
    id: 'speed-demon',
    name: 'Speed Demon',
    emoji: '🏎️',
    description: 'Win a round at 2× speed.',
    rarity: 'rare',
    check: ({ state, record }) => state.settings.modifiers.speed >= 2 && record.correct >= 1,
  },
  {
    id: 'slow-motion',
    name: 'Slow Motion',
    emoji: '🐌',
    description: 'Win a round at half speed.',
    rarity: 'common',
    check: ({ state, record }) => state.settings.modifiers.speed <= 0.5 && record.correct >= 1,
  },
  {
    id: 'chipmunk-mode',
    name: 'Chipmunk Mode',
    emoji: '🐿️',
    description: 'Win a round pitched up six semitones or more.',
    rarity: 'rare',
    check: ({ state, record }) => state.settings.modifiers.pitch >= 6 && record.correct >= 1,
  },
  {
    id: 'demon-voice',
    name: 'Demon Voice',
    emoji: '😈',
    description: 'Win a round pitched down six semitones or more.',
    rarity: 'rare',
    check: ({ state, record }) => state.settings.modifiers.pitch <= -6 && record.correct >= 1,
  },
  {
    id: 'lofi-beats',
    name: 'Lofi Beats to Guess To',
    emoji: '📼',
    description: 'Win a round with the lofi filter on.',
    rarity: 'common',
    check: ({ state, record }) => state.settings.modifiers.lofi && record.correct >= 1,
  },
  {
    id: 'eight-bit-ears',
    name: '8-Bit Ears',
    emoji: '🤖',
    description: 'Win a round through the bitcrusher.',
    rarity: 'rare',
    check: ({ state, record }) => state.settings.modifiers.bitcrush && record.correct >= 1,
  },
  {
    id: 'kitchen-sink',
    name: 'Kitchen Sink',
    emoji: '🧪',
    description: 'Win a round with four or more modifiers stacked.',
    rarity: 'epic',
    check: ({ state, record }) => activeModifiers(state.settings.modifiers) >= 4 && record.correct >= 1,
  },
  {
    id: 'daily-devotee',
    name: 'Daily Devotee',
    emoji: '📅',
    description: 'Complete seven dailies.',
    rarity: 'rare',
    check: ({ dailies }) => (dailies ?? 0) >= 7,
  },
  {
    id: 'daily-month',
    name: 'Month of Mondays',
    emoji: '🗓️',
    description: 'Complete thirty dailies.',
    rarity: 'legendary',
    check: ({ dailies }) => (dailies ?? 0) >= 30,
  },
  {
    id: 'daily-perfect',
    name: 'Perfect Daily',
    emoji: '⭐',
    description: 'Get every round of a daily right.',
    rarity: 'epic',
    check: ({ record }) =>
      record.daily !== undefined && record.rounds > 0 && record.correct === record.rounds,
  },
  {
    id: 'genre-hopper',
    name: 'Genre Hopper',
    emoji: '🧭',
    description: 'Play rounds from ten different packs.',
    rarity: 'rare',
    check: ({ totals }) => Object.keys(totals.byPack).length >= 10,
  },
  {
    id: 'impossible',
    name: 'Impossible',
    emoji: '☠️',
    description: 'Win a round on Impossible difficulty.',
    rarity: 'legendary',
    check: ({ record }) => record.difficulty === 'impossible' && record.correct >= 1,
  },
  {
    id: 'expert-sweep',
    name: 'Expert Sweep',
    emoji: '🧠',
    description: 'Sweep a 5+ round game on Expert or harder.',
    rarity: 'epic',
    check: ({ record }) =>
      (record.difficulty === 'expert' || record.difficulty === 'impossible') &&
      record.rounds >= 5 &&
      record.correct === record.rounds,
  },
  {
    id: 'deja-vu',
    name: 'Déjà Vu',
    emoji: '🌀',
    description: 'Run into the same song for the fifth time.',
    rarity: 'common',
    hidden: true,
    check: (ctx) => tracksThisGame(ctx).some((t) => t.timesSeen >= 5),
  },
  {
    id: 'nemesis',
    name: 'Nemesis',
    emoji: '😤',
    description: 'Miss the same song three times. It is personal now.',
    rarity: 'rare',
    hidden: true,
    check: (ctx) => tracksThisGame(ctx).some((t) => t.timesSeen >= 3 && t.timesCorrect === 0),
  },
  {
    id: 'one-and-done',
    name: 'One and Done',
    emoji: '🎯',
    description: 'Three correct in a fixed 0.1s game.',
    rarity: 'legendary',
    check: ({ record }) =>
      record.mode === 'fixed' && record.clipLength <= 0.1 + EPS && record.correct >= 3,
  },
  {
    id: 'encore',
    name: 'Encore',
    emoji: '🔁',
    description: 'Play five games in one day.',
    rarity: 'rare',
    check: ({ record, records }) => {
      if (!records) return false;
      const day = localDateKey(record.finishedAt);
      return records.filter((r) => localDateKey(r.finishedAt) === day).length >= 5;
    },
  },
  {
    id: 'six-pack',
    name: 'Six Pack',
    emoji: '🧃',
    description: 'Mix six or more packs into one game.',
    rarity: 'common',
    check: ({ record }) => record.packIds.length >= 6,
  },
  {
    id: 'high-roller',
    name: 'High Roller',
    emoji: '🤑',
    description: 'Score 10,000 points in a single game.',
    rarity: 'epic',
    check: ({ record }) => record.score >= 10000,
  },
  {
    id: 'bank-run',
    name: 'Bank Run',
    emoji: '💰',
    description: 'Bank 100,000 points all time.',
    rarity: 'rare',
    check: ({ totals }) => totals.score >= 100000,
  },
  {
    id: 'reflex',
    name: 'Reflex',
    emoji: '⚡',
    description: 'Answer within two seconds of the round starting.',
    rarity: 'rare',
    check: ({ state }) =>
      wins(state).some((w) => w.round.startedAt > 0 && w.at - w.round.startedAt <= 2000),
  },
  {
    id: 'sniper',
    name: 'Sniper',
    emoji: '🎯',
    description: 'Average 1.2 tries or fewer over five or more correct songs.',
    rarity: 'rare',
    check: ({ record }) => record.correct >= 5 && record.avgTries > 0 && record.avgTries <= 1.2,
  },
  {
    id: 'shortest-fuse',
    name: 'Shortest Fuse',
    emoji: '🧨',
    description: 'Land a correct answer in the 0.1s bucket ten times, all time.',
    rarity: 'epic',
    check: ({ totals }) => (totals.byClipBucket[bucketClip(0.1)]?.correct ?? 0) >= 10,
  },
];

export const ACHIEVEMENT_BY_ID: ReadonlyMap<string, Achievement> = new Map(
  ACHIEVEMENTS.map((a) => [a.id, a]),
);

export function achievementById(id: string): Achievement | undefined {
  return ACHIEVEMENT_BY_ID.get(id);
}

/**
 * Newly-earned achievements for this game, in roster order.
 * A throwing check is treated as "not earned" — a bad predicate must never
 * break game recording.
 */
export function evaluateAchievements(
  ctx: AchievementContext,
  alreadyUnlocked: ReadonlySet<string> = new Set(),
): Achievement[] {
  const out: Achievement[] = [];
  for (const a of ACHIEVEMENTS) {
    if (alreadyUnlocked.has(a.id)) continue;
    let ok = false;
    try {
      ok = a.check(ctx);
    } catch {
      ok = false;
    }
    if (ok) out.push(a);
  }
  return out;
}
