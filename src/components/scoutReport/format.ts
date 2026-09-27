/**
 * Pure presentation maths for the Scout Report Card.
 *
 * Everything the report renders already exists in `@/scout/report` — this module only decides how a
 * number LOOKS: which band an accuracy falls into, which two cuts get called out, how hot a
 * franchise cell is tinted, and where a sparkline's points land. No React, no DOM, no clocks, so
 * every one of these is unit-tested directly.
 */

import type { CSSProperties } from 'react';
import type { BadgeTone } from '@/components/ui/Badge';
import type { ScoutRarity } from '@/scout/achievements';
import { SCOUT_GROUP_LABELS, scoutGroupLabel } from '@/scout/report';
import {
  BLIND_ACCURACY,
  ELITE_ACCURACY,
  MIN_CUT_SEEN,
  SHAKY_ACCURACY,
  SOLID_ACCURACY,
  type ScoutCut,
  type ScoutFormPoint,
  type ScoutTeamHeat,
  type ScoutVerdictTone,
} from '@/scout/report';

/** `0.824` → `82%`. Anything non-finite reads as an em dash. */
export function pct(value: number, digits = 0): string {
  if (!Number.isFinite(value)) return '—';
  const clamped = Math.max(0, Math.min(1, value));
  return `${(clamped * 100).toFixed(digits)}%`;
}

/* -------------------------------------------------------------------------------------- cuts */

/**
 * Which band a cut's accuracy sits in. `thin` means "not enough sightings to judge" and takes
 * priority over everything — the same floor `scoutVerdict` uses, so the bars never contradict the
 * verdict above them.
 */
export type CutBand = 'thin' | 'elite' | 'solid' | 'even' | 'shaky' | 'blind';

export function cutBand(cut: ScoutCut, minSeen: number = MIN_CUT_SEEN): CutBand {
  if (cut.seen < minSeen) return 'thin';
  if (cut.accuracy >= ELITE_ACCURACY) return 'elite';
  if (cut.accuracy >= SOLID_ACCURACY) return 'solid';
  if (cut.accuracy <= BLIND_ACCURACY) return 'blind';
  if (cut.accuracy <= SHAKY_ACCURACY) return 'shaky';
  return 'even';
}

export const CUT_BAND_LABEL: Readonly<Record<CutBand, string>> = {
  thin: 'Thin sample',
  elite: 'Elite',
  solid: 'Strong',
  even: 'Even',
  shaky: 'Shaky',
  blind: 'Blind',
};

/** The sharpest and weakest cut of one axis — only ever cuts with a real sample behind them. */
export interface CutExtremes {
  best: ScoutCut | null;
  worst: ScoutCut | null;
}

/**
 * Highest and lowest accuracy among the cuts with `minSeen` sightings, ties broken by sample size
 * (same rule as `scoutVerdict`). A single eligible cut is the best and never the worst: calling one
 * bar both would be noise.
 */
export function cutExtremes(cuts: readonly ScoutCut[], minSeen: number = MIN_CUT_SEEN): CutExtremes {
  const eligible = cuts.filter((c) => c.seen >= minSeen);
  if (eligible.length === 0) return { best: null, worst: null };
  let best = eligible[0];
  let worst = eligible[0];
  for (const c of eligible) {
    if (c.accuracy > best.accuracy || (c.accuracy === best.accuracy && c.seen > best.seen)) best = c;
    if (c.accuracy < worst.accuracy || (c.accuracy === worst.accuracy && c.seen > worst.seen)) worst = c;
  }
  return { best, worst: eligible.length > 1 && worst !== best ? worst : null };
}

/** Widest bar on the axis, so a 100%-on-six-rounds cut cannot make everything else look flat. */
export function barWidth(accuracy: number): number {
  if (!Number.isFinite(accuracy) || accuracy <= 0) return 0;
  // A sliver for "some, but nearly none", so a 3% row is still visible.
  return Math.max(0.035, Math.min(1, accuracy));
}

/**
 * The pack that drills a weak cut, so the verdict can hand you the rematch instead of just the bad
 * news. Only cuts a real pack exists for get one: the nine position groups (`pos-db`) and the deep
 * cut tier. Anything else returns null and the card simply says nothing.
 */
export interface DrillTarget {
  /** A `ScoutPack` id — the setup screen takes these in `?packs=`. */
  packId: string;
  /** Button copy: 'Drill defensive backs'. */
  label: string;
}

const GROUP_KEYS: ReadonlySet<string> = new Set(SCOUT_GROUP_LABELS.map((g) => g.group));

export function drillTarget(cut: ScoutCut | null): DrillTarget | null {
  if (!cut) return null;
  if (GROUP_KEYS.has(cut.key)) {
    const meta = scoutGroupLabel(cut.key as (typeof SCOUT_GROUP_LABELS)[number]['group']);
    return { packId: `pos-${cut.key.toLowerCase()}`, label: `Drill ${meta.many}` };
  }
  if (cut.key === 'deepCut') return { packId: 'deep-cuts', label: 'Drill deep cuts' };
  return null;
}

/* ------------------------------------------------------------------------------- league map */

/**
 * Tint for one franchise cell.
 *
 * The team's own colour, mixed down towards the page so `text-fg` stays readable on every theme:
 * the ceiling is 42%, which keeps the composite close to the background's lightness whether the
 * club plays in navy or in gold. Knowledge shows in the SOLID spine (`teamSpineStyle`), not in the
 * wash, exactly so contrast never depends on how well you know a roster.
 */
export function teamTintStyle(team: ScoutTeamHeat): CSSProperties {
  if (team.seen === 0) return {};
  const wash = 12 + 30 * Math.max(0, Math.min(1, team.accuracy));
  const edge = 28 + 34 * Math.max(0, Math.min(1, team.accuracy));
  return {
    backgroundColor: `color-mix(in oklab, ${team.accent} ${wash.toFixed(1)}%, transparent)`,
    borderColor: `color-mix(in oklab, ${team.accent} ${edge.toFixed(1)}%, transparent)`,
  };
}

/** The saturated fill whose height carries how much of that roster you can name. */
export function teamSpineStyle(team: ScoutTeamHeat): CSSProperties {
  const known = Math.max(0, Math.min(1, team.accuracy));
  return {
    backgroundColor: team.accent,
    height: `${(known * 100).toFixed(1)}%`,
    opacity: team.seen === 0 ? 0 : 0.55 + 0.45 * known,
  };
}

/** `KC · 6 of 8 named (75%)` — the cell's title and accessible name. */
export function teamCellLabel(team: ScoutTeamHeat): string {
  if (team.seen === 0) return `${team.name}: never scouted`;
  return `${team.name}: ${team.correct} of ${team.seen} named, ${pct(team.accuracy)}`;
}

/** Conference blocks, each with its four divisions, in `SCOUT_TEAM_META` order. */
export interface MapDivision {
  key: string;
  name: string;
  teams: ScoutTeamHeat[];
  known: number;
  swept: boolean;
}
export interface MapConference {
  conference: string;
  divisions: MapDivision[];
  known: number;
}

export function groupTeamsByDivision(teams: readonly ScoutTeamHeat[]): MapConference[] {
  const out: MapConference[] = [];
  for (const team of teams) {
    let conf = out.find((c) => c.conference === team.conference);
    if (!conf) {
      conf = { conference: team.conference, divisions: [], known: 0 };
      out.push(conf);
    }
    let div = conf.divisions.find((d) => d.key === team.divisionKey);
    if (!div) {
      div = { key: team.divisionKey, name: team.divisionKey, teams: [], known: 0, swept: false };
      conf.divisions.push(div);
    }
    div.teams.push(team);
    if (team.correct > 0) {
      div.known += 1;
      conf.known += 1;
    }
    div.swept = div.teams.length > 0 && div.known === div.teams.length;
  }
  return out;
}

/* -------------------------------------------------------------------------------- sparkline */

export interface SparkDot {
  x: number;
  y: number;
  point: ScoutFormPoint;
}

export interface SparkGeometry {
  /** `M…L…` through every run's accuracy, oldest → newest. Empty when there is no history. */
  line: string;
  /** The same path closed along the baseline, for the soft fill. */
  area: string;
  dots: SparkDot[];
  /** y of the 50% reference line. */
  midY: number;
}

/**
 * Sparkline geometry in a fixed `w × h` viewBox (the SVG scales with `preserveAspectRatio="none"`).
 * `pad` keeps a 0% and a 100% run off the very edge so the stroke is never clipped.
 */
export function sparkGeometry(
  points: readonly ScoutFormPoint[],
  w = 100,
  h = 32,
  pad = 3,
): SparkGeometry {
  const top = pad;
  const bottom = h - pad;
  const midY = bottom - (bottom - top) * 0.5;
  if (points.length === 0) return { line: '', area: '', dots: [], midY };

  const dots: SparkDot[] = points.map((point, i) => {
    const x = points.length === 1 ? w / 2 : (i / (points.length - 1)) * w;
    const acc = Math.max(0, Math.min(1, point.accuracy));
    return { x, y: bottom - (bottom - top) * acc, point };
  });

  const line = dots.map((d, i) => `${i === 0 ? 'M' : 'L'}${d.x.toFixed(2)} ${d.y.toFixed(2)}`).join(' ');
  const first = dots[0];
  const last = dots[dots.length - 1];
  const area = `${line} L${last.x.toFixed(2)} ${h} L${first.x.toFixed(2)} ${h} Z`;
  return { line, area, dots, midY };
}

/** Mean accuracy of a slice of form points; 0 for an empty slice. */
export function formAverage(points: readonly ScoutFormPoint[]): number {
  if (points.length === 0) return 0;
  return points.reduce((n, p) => n + p.accuracy, 0) / points.length;
}

/**
 * Newest half against the older half — the arrow above the sparkline. `null` until there are four
 * runs to compare, because two runs is a coin flip, not a trend.
 */
export function formTrend(points: readonly ScoutFormPoint[]): number | null {
  if (points.length < 4) return null;
  const half = Math.floor(points.length / 2);
  return formAverage(points.slice(points.length - half)) - formAverage(points.slice(0, half));
}

/* ----------------------------------------------------------------------------------- labels */

/** Best call rung → copy. `rung` is 0-based, so rung 0 is the hardest information state. */
export function rungLabel(rung: number): string {
  if (rung <= 0) return 'first look';
  if (rung === 1) return 'second look';
  return `rung ${rung + 1}`;
}

export const SCOUT_RARITY_LABEL: Readonly<Record<ScoutRarity, string>> = {
  common: 'Common',
  rare: 'Rare',
  epic: 'Epic',
  legendary: 'Legendary',
};

export const SCOUT_RARITY_TONE: Readonly<Record<ScoutRarity, BadgeTone>> = {
  common: 'neutral',
  rare: 'accent',
  epic: 'gradient',
  legendary: 'warn',
};

/** Verdict tone → the text colour class that carries it. */
export const VERDICT_TONE_CLASS: Readonly<Record<ScoutVerdictTone, string>> = {
  insufficient: 'text-fg',
  strength: 'text-gradient',
  weakness: 'text-danger',
  balanced: 'text-fg',
  coverage: 'text-muted',
};
