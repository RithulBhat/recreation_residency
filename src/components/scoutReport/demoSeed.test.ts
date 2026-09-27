/**
 * The DEV demo seed is what every review of this page is judged on, so it is tested like production
 * code: if the fixture stops exercising a state the Report Card can be in, this fails.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { MIN_CUT_SEEN, MIN_SCOUT_REPORT_ROUNDS } from '@/scout/report';
import { SCOUT_ACHIEVEMENTS } from '@/scout/achievements';
import { scoutRankFor } from '@/scout/progress';
import { scoutReportOf, useScoutStatsStore } from '@/store/scoutStatsStore';
import { seedScoutReportDemo } from './demoSeed';
import { cutExtremes } from './format';

const report = () => scoutReportOf(useScoutStatsStore.getState());

describe('seedScoutReportDemo', () => {
  beforeEach(() => {
    useScoutStatsStore.getState().reset();
  });

  it('records every run through the real store, and replaces any history already there', () => {
    expect(seedScoutReportDemo()).toBe(13);
    const first = report();
    // seeding again resets first, so the numbers are identical rather than doubled
    expect(seedScoutReportDemo()).toBe(13);
    expect(report().rounds).toBe(first.rounds);
    expect(report().runs).toBe(13);
  });

  it('clears completely on reset', () => {
    seedScoutReportDemo();
    useScoutStatsStore.getState().reset();
    const empty = report();
    expect(empty.runs).toBe(0);
    expect(empty.rounds).toBe(0);
    expect(empty.enoughData).toBe(false);
    expect(empty.teamsSeen).toBe(0);
    expect(useScoutStatsStore.getState().achievements).toEqual([]);
  });

  it('clears the verdict floor with room to spare', () => {
    seedScoutReportDemo();
    const r = report();
    expect(r.rounds).toBeGreaterThan(MIN_SCOUT_REPORT_ROUNDS * 3);
    expect(r.enoughData).toBe(true);
    expect(r.roundsToVerdict).toBe(0);
    expect(r.accuracy).toBeGreaterThan(0.5);
    expect(r.accuracy).toBeLessThan(0.9);
  });

  it('earns a rank worth showing off but leaves the ladder unfinished', () => {
    seedScoutReportDemo();
    const rank = scoutRankFor(report().xp);
    expect(rank.level).toBeGreaterThan(5);
    expect(rank.next).not.toBeNull();
    expect(rank.progress).toBeGreaterThan(0);
    expect(rank.progress).toBeLessThan(1);
  });

  it('produces a verdict with a real strength and a real weakness', () => {
    seedScoutReportDemo();
    const r = report();
    const tones = r.verdict.map((l) => l.tone);
    expect(tones).toContain('strength');
    expect(tones).toContain('weakness');
    expect(tones).toContain('coverage');
    expect(r.verdictLine).not.toBe('');
    expect(r.verdict.some((l) => l.tone === 'insufficient')).toBe(false);
  });

  it('makes defensive backs the blind spot and a skill position the strongest room', () => {
    seedScoutReportDemo();
    const { best, worst } = cutExtremes(report().byGroup);
    expect(worst?.key).toBe('DB');
    expect(worst?.accuracy).toBeLessThan(0.25);
    expect(best?.accuracy).toBeGreaterThan(0.8);
    expect(['QB', 'RB', 'WR', 'TE']).toContain(best?.key);
  });

  it('names deep cuts more often than not — the line that makes the page interesting', () => {
    seedScoutReportDemo();
    const deep = report().byTier.find((t) => t.key === 'deepCut');
    expect(deep?.seen).toBeGreaterThanOrEqual(MIN_CUT_SEEN);
    expect(deep?.accuracy).toBeGreaterThanOrEqual(0.5);
  });

  it('exercises every session format and the seven original puzzle types', () => {
    seedScoutReportDemo();
    const r = report();
    expect(r.byFormat.filter((c) => c.seen > 0)).toHaveLength(r.byFormat.length);
    // `SCOUT_MODE_KEYS` may grow; the fixture must at least cover the seven the card shipped with.
    expect(r.byMode.filter((c) => c.seen > 0).length).toBeGreaterThanOrEqual(7);
  });

  it('leaves the rarest puzzle types thin, so the thin-sample treatment is visible', () => {
    seedScoutReportDemo();
    expect(report().byMode.some((c) => c.seen > 0 && c.seen < MIN_CUT_SEEN)).toBe(true);
  });

  it('draws a league map with hot, grey and dark franchises', () => {
    seedScoutReportDemo();
    const r = report();
    expect(r.teamsSeen).toBe(25);
    expect(r.teamsKnown).toBe(22);
    expect(r.teams.filter((t) => t.seen === 0)).toHaveLength(7);
    // faced repeatedly and never once named
    expect(r.teams.filter((t) => t.seen > 0 && t.correct === 0)).toHaveLength(3);
    expect(r.divisionsSwept).toEqual(['AFC East', 'AFC West', 'NFC North']);
  });

  it('records a best call at the hardest rung, against a real player', () => {
    seedScoutReportDemo();
    const call = report().bestCall;
    expect(call?.rung).toBe(0);
    expect(call?.name).toBe('Nick Bosa');
    expect(call?.teamAbbr).toBe('SF');
  });

  it('leaves a nemesis list of subjects seen twice and never named', () => {
    seedScoutReportDemo();
    const nemeses = report().nemeses;
    expect(nemeses.length).toBeGreaterThan(0);
    for (const n of nemeses) {
      expect(n.timesCorrect).toBe(0);
      expect(n.timesSeen).toBeGreaterThanOrEqual(2);
    }
    expect(nemeses.map((n) => n.name)).toContain('Riq Woolen');
  });

  it('fills the sparkline with a full run of form points', () => {
    seedScoutReportDemo();
    const form = report().recentForm;
    expect(form).toHaveLength(12);
    // oldest → newest
    expect(form[0].at).toBeLessThan(form[form.length - 1].at);
    expect(form.some((p) => p.clean)).toBe(true);
  });

  it('unlocks a healthy spread of badges without emptying the cabinet', () => {
    seedScoutReportDemo();
    const unlocked = useScoutStatsStore.getState().achievements;
    expect(unlocked.length).toBeGreaterThan(20);
    expect(unlocked.length).toBeLessThan(SCOUT_ACHIEVEMENTS.length);
    const ids = new Set(unlocked.map((a) => a.id));
    // the rung-0 run pays for the epics
    expect(ids.has('pure-shadow')).toBe(true);
    expect(ids.has('film-room-read')).toBe(true);
    // and the fixture finishes at 2pm, so the small-hours badge stays locked
    expect(ids.has('midnight-film')).toBe(false);
    expect(ids.has('gold-jacket')).toBe(false);
  });

  it('records two dailies', () => {
    seedScoutReportDemo();
    expect(Object.keys(useScoutStatsStore.getState().daily)).toHaveLength(2);
  });
});
