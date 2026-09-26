/**
 * Pure text helpers for the setup screens: the StartBar one-liner, clip/stage sentences and the
 * per-option hint copy. Framework-free so it can be unit tested.
 */
import type { Difficulty, GameMode, GameSettings, Modifiers, StartPosition } from '@/types';
import { normalizeSettings } from '@/game/presets';
import { formatClip } from '@/components/ui/Slider';

export const MODE_LABEL: Record<GameMode, string> = {
  classic: 'Classic',
  fixed: 'Fixed clip',
  blitz: 'Blitz',
  survival: 'Survival',
  duel: 'Duel',
  party: 'Party',
};

export const DIFFICULTY_INFO: Record<Difficulty, { label: string; hint: string }> = {
  any: { label: 'Any', hint: 'The whole pool — every popularity tier mixed together.' },
  easy: { label: 'Easy', hint: 'The 25% most-streamed tracks. Everyone knows these.' },
  medium: { label: 'Medium', hint: 'Popularity 25–50%. Hits you half remember.' },
  hard: { label: 'Hard', hint: 'Popularity 50–75%. Deeper cuts and album tracks.' },
  expert: { label: 'Expert', hint: 'Popularity 75–95%. For the heads.' },
  impossible: { label: 'Impossible', hint: 'The bottom 5%. Nobody knows these. Nobody.' },
};

export const START_POSITION_INFO: Record<StartPosition, { label: string; hint: string }> = {
  start: { label: 'Intro', hint: 'Clips start at 0:00 of the preview' },
  random: { label: 'Random', hint: 'Anywhere in the 30 s preview' },
  middle: { label: 'Middle', hint: '10–20 s in — usually the chorus' },
  end: { label: 'End', hint: 'The last 10 s' },
};

/** Human labels for every non-neutral modifier, e.g. `['1.5× speed', 'reversed']`. */
export function modifierLabels(m: Modifiers): string[] {
  const out: string[] = [];
  if (m.speed !== 1) out.push(`${m.speed}× speed`);
  if (m.reverse) out.push('reversed');
  if (m.lofi) out.push('lo-fi');
  if (m.bitcrush) out.push('bitcrushed');
  if (m.pitch !== 0) out.push(`pitch ${m.pitch > 0 ? '+' : ''}${m.pitch}`);
  return out;
}

/** `-12` → `demon`, `0` → `normal`, `+12` → `chipmunk`. */
export function pitchLabel(semitones: number): string {
  if (semitones <= -7) return 'demon';
  if (semitones < 0) return 'lower';
  if (semitones === 0) return 'normal';
  if (semitones < 7) return 'higher';
  return 'chipmunk';
}

export function tryWord(n: number): string {
  return n === 1 ? 'try' : 'tries';
}

/** `0.1s→10s · 7 tries` (escalating) or `0.5s×3 tries` (fixed). */
export function clipSummary(s: Pick<GameSettings, 'mode' | 'clipMode' | 'clipLength' | 'tries' | 'stages'>): string {
  if (s.clipMode === 'escalating' && s.stages.length > 0) {
    const first = s.stages[0] ?? 0;
    const last = s.stages[s.stages.length - 1] ?? first;
    return `${formatClip(first)}→${formatClip(last)} · ${s.stages.length} ${tryWord(s.stages.length)}`;
  }
  if (s.mode === 'blitz') return `${formatClip(s.clipLength)} clips`;
  return `${formatClip(s.clipLength)}×${s.tries} ${tryWord(s.tries)}`;
}

/** `You'll hear 0.1s, then 0.3s, then 1s… (7 tries)` */
export function stagesSentence(stages: readonly number[]): string {
  if (stages.length === 0) return 'Pick at least two stages.';
  const parts = stages.map((v) => formatClip(v));
  const head = parts.slice(0, 3).join(', then ');
  const more = parts.length > 3 ? '…' : '';
  return `You'll hear ${head}${more} (${stages.length} ${tryWord(stages.length)})`;
}

export function roundsSummary(s: Pick<GameSettings, 'mode' | 'rounds' | 'blitzDuration' | 'lives'>): string {
  if (s.mode === 'blitz') return `${s.blitzDuration}s blitz`;
  if (s.mode === 'survival') return `${s.lives} ${s.lives === 1 ? 'life' : 'lives'}`;
  return s.rounds === 0 ? '∞ rounds' : `${s.rounds} rounds`;
}

/** `Pop Hits`, `Pop Hits + Burna Boy`, `Pop Hits + K-Pop +1` — up to two names, then a count. */
export function packsSummary(names: readonly string[]): string {
  const [first, second] = names;
  if (first === undefined) return 'No packs';
  if (second === undefined) return first;
  const shown = `${first} + ${second}`;
  return names.length === 2 ? shown : `${shown} +${names.length - 2}`;
}

/**
 * The Mode card's one-liner for `mode`, derived from the current draft so it never contradicts
 * the Start bar: `0.5s→4s · 4 tries`, `90s blitz · 1s clips`, `3 lives · 2s×3 tries`, …
 */
export function modeHow(draft: GameSettings, mode: GameMode): string {
  const s = normalizeSettings({ ...draft, mode });
  switch (mode) {
    case 'blitz':
    case 'survival':
      return `${roundsSummary(s)} · ${clipSummary(s)}`;
    case 'duel':
      return `${s.duelStyle === 'buzzer' ? 'Buzzer A / L' : 'Turns'} · ${clipSummary(s)}`;
    case 'party':
      return `${s.players.length} players · ${clipSummary(s)}`;
    default:
      return clipSummary(s);
  }
}

/** The StartBar one-liner: `10 rounds · 0.1s→10s · 7 tries · Pop Hits + K-Pop +1 · Medium · reversed`. */
export function settingsSummary(s: GameSettings, packNames: readonly string[]): string {
  const parts = [roundsSummary(s), clipSummary(s), packsSummary(packNames)];
  if (s.difficulty !== 'any') parts.push(DIFFICULTY_INFO[s.difficulty].label);
  if (s.mode === 'duel') parts.push(s.duelStyle === 'buzzer' ? 'buzzer duel' : 'turn-based duel');
  if (s.mode === 'party') parts.push(`${s.players.length} players`);
  parts.push(...modifierLabels(s.modifiers));
  return parts.join(' · ');
}

/** Sum of `approxSize` across packs — the "Loading N songs…" estimate. */
export function poolEstimate(sizes: ReadonlyArray<number | undefined>): number {
  return sizes.reduce<number>((n, size) => n + (size ?? 0), 0);
}
