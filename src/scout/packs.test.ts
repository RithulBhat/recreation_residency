import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SCOUT_PACK_ID,
  SCOUT_MODES,
  SCOUT_PACKS,
  SCOUT_PRESETS,
  SCOUT_PUZZLE_PRESETS,
  SCOUT_TEAM_META,
  featuredScoutPacks,
  scoutMode,
  scoutModeAnswer,
  scoutModeIsChoice,
  scoutPack,
  scoutPacksOfKind,
  scoutPreset,
} from './packs';
import { normalizeScoutSettings } from './presets';
import { subjectKindForMode } from './subjects';
import type { Conference, DivisionName, PositionGroup, ScoutMode } from './types';

describe('SCOUT_PACKS', () => {
  it('ships at least 40 packs with unique ids and accents', () => {
    expect(SCOUT_PACKS.length).toBeGreaterThanOrEqual(40);
    const ids = SCOUT_PACKS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    const accents = SCOUT_PACKS.map((p) => p.accent);
    expect(new Set(accents).size).toBe(accents.length);
  });

  it('gives every pack an emoji, a short tagline, a hex accent and tags', () => {
    for (const p of SCOUT_PACKS) {
      expect(p.emoji.length).toBeGreaterThan(0);
      expect(p.name.length).toBeGreaterThan(0);
      expect(p.tagline.length).toBeGreaterThan(0);
      expect(p.tagline.length).toBeLessThanOrEqual(60);
      expect(p.accent).toMatch(/^#[0-9a-f]{6}$/);
      expect(p.tags.length).toBeGreaterThan(0);
      expect(p.kind === 'player' || p.kind === 'team').toBe(true);
      expect(Object.keys(p.filter).length).toBeGreaterThan(0);
    }
  });

  it('covers every position group', () => {
    const groups: PositionGroup[] = ['QB', 'RB', 'WR', 'TE', 'OL', 'DL', 'LB', 'DB', 'ST'];
    for (const g of groups) {
      const pack = scoutPack(`pos-${g.toLowerCase()}`);
      expect(pack?.filter.groups).toEqual([g]);
    }
  });

  it('covers all eight divisions and both conferences', () => {
    const confs: Conference[] = ['AFC', 'NFC'];
    const divs: DivisionName[] = ['East', 'North', 'South', 'West'];
    for (const c of confs) {
      expect(scoutPack(`conf-${c.toLowerCase()}`)?.filter.conferences).toEqual([c]);
      for (const d of divs) {
        const pack = scoutPack(`div-${c.toLowerCase()}-${d.toLowerCase()}`);
        expect(pack?.filter.conferences).toEqual([c]);
        expect(pack?.filter.divisions).toEqual([d]);
      }
    }
  });

  it('covers all 32 franchises as roster packs, with real ESPN ids', () => {
    expect(SCOUT_TEAM_META).toHaveLength(32);
    const ids = SCOUT_TEAM_META.map((t) => t.id);
    expect(new Set(ids).size).toBe(32);
    for (const id of ids) expect(Number(id)).toBeGreaterThan(0);
    expect(SCOUT_TEAM_META.find((t) => t.abbr === 'KC')?.id).toBe('12');
    for (const t of SCOUT_TEAM_META) {
      const pack = scoutPack(`team-${t.abbr.toLowerCase()}`);
      expect(pack?.kind).toBe('player');
      expect(pack?.filter.teamIds).toEqual([t.id]);
    }
    const perConf = (c: Conference) => SCOUT_TEAM_META.filter((t) => t.conf === c).length;
    expect(perConf('AFC')).toBe(16);
    expect(perConf('NFC')).toBe(16);
  });

  it('ships the fame, experience and draft cuts', () => {
    expect(scoutPack('superstars')?.filter.minFame).toBe(80);
    expect(scoutPack('deep-cuts')?.filter.maxFame).toBeLessThan(30);
    expect(scoutPack('rookies')?.filter.maxExp).toBe(1);
    expect(scoutPack('veterans')?.filter.minExp).toBe(10);
    expect(scoutPack('first-rounders')).toBeDefined();
    expect(scoutPack('undrafted')).toBeDefined();
  });

  it('ships the team-guessing packs', () => {
    const all = scoutPack('franchises-all');
    expect(all?.kind).toBe('team');
    expect(all?.filter.teamIds).toHaveLength(32);
    expect(scoutPack('franchises-afc')?.filter.conferences).toEqual(['AFC']);
    expect(scoutPack('franchises-nfc')?.filter.conferences).toEqual(['NFC']);
    expect(scoutPacksOfKind('team').length).toBe(3);
    expect(scoutPacksOfKind('player').length).toBe(SCOUT_PACKS.length - 3);
  });

  it('features roughly ten packs', () => {
    const featured = featuredScoutPacks();
    expect(featured.length).toBeGreaterThanOrEqual(8);
    expect(featured.length).toBeLessThanOrEqual(14);
  });

  it('has a valid default pack', () => {
    expect(scoutPack(DEFAULT_SCOUT_PACK_ID)?.kind).toBe('player');
    expect(scoutPack('nope')).toBeUndefined();
  });
});

describe('SCOUT_MODES', () => {
  it('describes all thirteen modes exactly once', () => {
    const ids: ScoutMode[] = [
      // the reveal seven
      'silhouette',
      'faceZoom',
      'highlight',
      'teamTrivia',
      'statLine',
      'careerPath',
      'logoZoom',
      // the choice-shaped six
      'teammates',
      'depthChart',
      'draftClass',
      'higherLower',
      'oddOneOut',
      'jersey',
    ];
    expect(SCOUT_MODES).toHaveLength(13);
    expect(SCOUT_MODES.map((m) => m.id).sort()).toEqual([...ids].sort());
    for (const m of SCOUT_MODES) {
      expect(m.name.length).toBeGreaterThan(0);
      expect(m.emoji.length).toBeGreaterThan(0);
      expect(m.blurb.length).toBeGreaterThan(0);
      expect(m.how.length).toBeGreaterThan(0);
      expect(m.guesses).toBe(subjectKindForMode(m.id));
      expect(scoutMode(m.id)).toBe(m);
      expect(['player', 'team', 'year', 'option']).toContain(m.answer);
      expect(['text', 'choice']).toContain(m.input);
      // a typed answer must be namable: only the year mode answers something that is not a subject
      if (m.input === 'text' && m.answer !== 'year') expect(m.answer).toBe(m.guesses);
      // and only the two card-tapping modes may say 'option'
      expect(m.answer === 'option').toBe(m.input === 'choice');
    }
  });
});

describe('the choice-shaped modes', () => {
  it('names the six, and only higherLower / oddOneOut are answered by tapping', () => {
    const puzzles: ScoutMode[] = ['teammates', 'depthChart', 'draftClass', 'higherLower', 'oddOneOut', 'jersey'];
    for (const id of puzzles) expect(scoutMode(id)).toBeDefined();
    const choice = SCOUT_MODES.filter((m) => scoutModeIsChoice(m.id)).map((m) => m.id);
    expect(choice.sort()).toEqual(['higherLower', 'oddOneOut']);
    expect(scoutModeAnswer('draftClass')).toBe('year');
    expect(scoutModeAnswer('depthChart')).toBe('team');
    expect(scoutModeAnswer('jersey')).toBe('player');
    expect(scoutModeIsChoice('silhouette')).toBe(false);
  });

  it('ships a pack for every one of them and a preset that reaches it', () => {
    expect(scoutPack('household-names')?.filter.minFame).toBe(55);
    expect(scoutPack('skill-stats')?.filter.groups).toEqual(['QB', 'RB', 'WR', 'TE']);
    expect((scoutPack('draft-2011-on')?.filter as { minDraftYear?: number }).minDraftYear).toBe(2011);
    const byMode = new Map(SCOUT_PUZZLE_PRESETS.map((p) => [p.settings.mode, p]));
    for (const id of ['teammates', 'depthChart', 'draftClass', 'higherLower', 'oddOneOut', 'jersey'] as ScoutMode[]) {
      const preset = byMode.get(id);
      expect(preset, `preset for ${id}`).toBeDefined();
      const settings = normalizeScoutSettings(preset!.settings);
      expect(settings.mode).toBe(id);
      expect(settings.packIds.some((pid) => scoutPack(pid)?.kind === subjectKindForMode(id))).toBe(true);
    }
    // a two-way question gets exactly one try; a second would be a free win
    expect(scoutPreset('higher-or-lower')?.settings.tries).toBe(1);
    // and every puzzle preset is part of the headline list
    for (const p of SCOUT_PUZZLE_PRESETS) expect(SCOUT_PRESETS).toContain(p);
  });
});

describe('SCOUT_PRESETS', () => {
  it('covers the headline presets and normalizes cleanly', () => {
    const ids = SCOUT_PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const want of ['silhouette-sprint', 'face-off', 'film-room', 'franchise-iq', 'draft-board', 'mixed-bag']) {
      expect(ids).toContain(want);
    }
    for (const p of SCOUT_PRESETS) {
      const settings = normalizeScoutSettings(p.settings);
      expect(settings.tries).toBeGreaterThanOrEqual(1);
      expect(settings.tries).toBeLessThanOrEqual(6);
      expect(settings.packIds.length).toBeGreaterThan(0);
      expect(p.blurb.length).toBeGreaterThan(0);
      expect(scoutPreset(p.id)).toBe(p);
    }
  });

  it('mixed bag really mixes', () => {
    expect(scoutPreset('mixed-bag')?.settings.mixModes).toBe(true);
    expect(normalizeScoutSettings(scoutPreset('mixed-bag')!.settings).mixModes).toBe(true);
  });

  it('every preset resolves to a pack of the kind its mode needs', () => {
    for (const p of SCOUT_PRESETS) {
      const settings = normalizeScoutSettings(p.settings);
      const kind = subjectKindForMode(settings.mode);
      expect(settings.packIds.some((id) => scoutPack(id)?.kind === kind)).toBe(true);
    }
  });
});
