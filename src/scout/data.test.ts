/**
 * Integration tests against the REAL baked dataset in `src/data/nfl/*.json`.
 * These are the tests that catch a contract drift between the sync script and the engine.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { createRng } from '@/game/rng';
import {
  headshotUrl,
  loadBakedDataset,
  loadScoutBundle,
  loadScoutPool,
  logoUrl,
  resetScoutLoader,
  setScoutLoader,
} from './data';
import { matchSubject, suggestSubjects } from './names';
import { normalizeScoutSettings } from './presets';
import { buildStages } from './stages';
import { canRender, subjectKindForMode, tierOf } from './subjects';
import { fixtureBundle } from './fixtures';
import type { ScoutMode } from './types';

const MODES: ScoutMode[] = ['silhouette', 'faceZoom', 'highlight', 'teamTrivia', 'statLine', 'careerPath', 'logoZoom'];

afterEach(() => {
  resetScoutLoader();
});

describe('loadScoutBundle', () => {
  it('loads 32 teams plus players, plays and stat lines', async () => {
    const data = await loadScoutBundle();
    expect(data.teams).toHaveLength(32);
    expect(data.players.length).toBeGreaterThan(1500);
    expect(data.plays?.length ?? 0).toBeGreaterThan(100);
    expect(data.statLines?.length ?? 0).toBeGreaterThan(50);
    expect(typeof data.season).toBe('number');
  });

  it('caches the dataset', async () => {
    const a = await loadScoutBundle();
    const b = await loadScoutBundle();
    expect(a).toBe(b);
  });

  it('ships the fields every mode needs', async () => {
    const data = await loadBakedDataset();
    for (const team of data.teams) {
      expect(team.abbr.length).toBeGreaterThan(0);
      expect(team.logo).toContain('espncdn.com');
      expect(team.conference === 'AFC' || team.conference === 'NFC').toBe(true);
      expect(['East', 'North', 'South', 'West']).toContain(team.division);
      expect(team.facts.length).toBeGreaterThan(0);
      expect(team.aliases.length).toBeGreaterThan(0);
    }
    for (const p of data.players.slice(0, 200)) {
      expect(p.name.length).toBeGreaterThan(0);
      expect(p.headshot).toContain('espncdn.com');
      expect(p.fame).toBeGreaterThanOrEqual(0);
      expect(p.fame).toBeLessThanOrEqual(100);
      expect(['QB', 'RB', 'WR', 'TE', 'OL', 'DL', 'LB', 'DB', 'ST']).toContain(p.group);
    }
    for (const play of (data.plays ?? []).slice(0, 200)) {
      expect(play.redacted).toContain('[?]');
      expect(play.playerId.length).toBeGreaterThan(0);
    }
  });

  it('can be swapped for another loader', async () => {
    setScoutLoader(async () => fixtureBundle());
    const data = await loadScoutBundle();
    expect(data.teams.length).toBe(fixtureBundle().teams.length);
    resetScoutLoader();
    expect((await loadScoutBundle()).teams).toHaveLength(32);
  });

  it('does not cache a failure', async () => {
    let calls = 0;
    setScoutLoader(async () => {
      calls += 1;
      throw new Error('boom');
    });
    await expect(loadScoutBundle()).rejects.toThrow('boom');
    await expect(loadScoutBundle()).rejects.toThrow('boom');
    expect(calls).toBe(2);
  });
});

describe('the real dataset plays', () => {
  it.each(MODES)('%s builds a pool whose subjects all render', async (mode) => {
    const packIds = subjectKindForMode(mode) === 'team' ? ['franchises-all'] : ['conf-afc', 'conf-nfc'];
    const settings = normalizeScoutSettings({ mode, packIds, tries: 5, seed: 'real' });
    const subjects = await loadScoutPool(settings, createRng('real'));
    expect(subjects.length).toBeGreaterThan(5);
    for (const s of subjects.slice(0, 40)) {
      expect(canRender(mode, s)).toBe(true);
      const stages = buildStages(mode, s, 5, createRng(`${mode}|${s.id}`));
      expect(stages).toHaveLength(5);
      expect(stages[4].clues.length).toBeGreaterThan(0);
      for (let i = 1; i < stages.length; i++) {
        expect(stages[i].clues.length).toBeGreaterThanOrEqual(stages[i - 1].clues.length);
      }
    }
  });

  it('honours the difficulty tiers on real fame scores', async () => {
    const settings = normalizeScoutSettings({ packIds: ['conf-afc', 'conf-nfc'], difficulty: 'star', seed: 'x' });
    const stars = await loadScoutPool(settings, createRng('x'));
    expect(stars.length).toBeGreaterThan(5);
    for (const s of stars) {
      expect(s.tier).toBe('star');
      expect(s.player && tierOf(s.player)).toBe('star');
      expect(s.player?.fame ?? 0).toBeGreaterThanOrEqual(80);
    }
  });

  it('matches real names, surnames and team guesses', async () => {
    const data = await loadScoutBundle();
    const settings = normalizeScoutSettings({ packIds: ['conf-afc', 'conf-nfc'], seed: 'names' });
    const pool = await loadScoutPool(settings, createRng('names'));
    const pick = (name: string) => {
      const subject = pool.find((s) => s.name === name);
      if (!subject) throw new Error(`no ${name} in the real pool`);
      return subject;
    };
    const mahomes = pick('Patrick Mahomes');
    expect(matchSubject('Patrick Mahomes', mahomes, pool).verdict).toBe('correct');
    expect(matchSubject('mahomes', mahomes, pool).verdict).toBe('correct');
    expect(matchSubject('p mahomes', mahomes, pool).verdict).toBe('correct');
    expect(matchSubject('mahoms', mahomes, pool).verdict).toBe('correct');
    expect(matchSubject('josh allen', mahomes, pool).verdict).toBe('wrong');
    expect(suggestSubjects('mahom', pool, 5)[0]).toBe(mahomes);

    // real shared surnames must read as `close`, never `correct`
    const surnames = new Map<string, number>();
    for (const s of pool) {
      const last = s.player?.last ?? '';
      if (last) surnames.set(last, (surnames.get(last) ?? 0) + 1);
    }
    const shared = [...surnames.entries()].find(([, n]) => n > 1);
    expect(shared).toBeDefined();
    if (shared) {
      const twin = pool.find((s) => s.player?.last === shared[0]);
      expect(twin).toBeDefined();
      if (twin) expect(matchSubject(shared[0], twin, pool).verdict).toBe('close');
    }

    const teamSettings = normalizeScoutSettings({ mode: 'teamTrivia', packIds: ['franchises-all'], seed: 'teams' });
    const teams = await loadScoutPool(teamSettings, createRng('teams'));
    const kc = teams.find((s) => s.team?.abbr === 'KC');
    expect(kc).toBeDefined();
    if (kc) {
      for (const guess of ['chiefs', 'kc', 'kansas city chiefs', 'kansas city']) {
        expect(matchSubject(guess, kc, teams).verdict).toBe('correct');
      }
      expect(matchSubject('chargers', kc, teams).verdict).toBe('wrong');
    }
    const gb = teams.find((s) => s.team?.abbr === 'GB');
    if (gb) expect(matchSubject('the pack', gb, teams).verdict).toBe('correct');
    const sf = teams.find((s) => s.team?.abbr === 'SF');
    if (sf) expect(matchSubject('niners', sf, teams).verdict).toBe('correct');
    // the shared-city franchises must be `close`, not `correct`
    const nyg = teams.find((s) => s.team?.abbr === 'NYG');
    if (nyg) expect(matchSubject('new york', nyg, teams).verdict).toBe('close');
    expect(data.teams.filter((t) => t.location === 'New York')).toHaveLength(2);
  });

  it('suggests from 2000+ real subjects fast enough to type against', async () => {
    const settings = normalizeScoutSettings({ packIds: ['conf-afc', 'conf-nfc'], seed: 'perf' });
    const pool = await loadScoutPool(settings, createRng('perf'));
    expect(pool.length).toBeGreaterThan(1500);
    suggestSubjects('a', pool, 8);
    let worst = 0;
    for (const q of ['j', 'ja', 'jal', 'jale', 'jalen', 'mah', 'mahom', 'smith', 'zzzz']) {
      const t0 = performance.now();
      suggestSubjects(q, pool, 8);
      worst = Math.max(worst, performance.now() - t0);
    }
    expect(worst).toBeLessThan(20);
  });
});

describe('image urls', () => {
  it('points at the CORS-enabled CDN', () => {
    expect(headshotUrl('3139477')).toBe('https://a.espncdn.com/i/headshots/nfl/players/full/3139477.png');
    expect(logoUrl('KC')).toBe('https://a.espncdn.com/i/teamlogos/nfl/500/kc.png');
  });
});
