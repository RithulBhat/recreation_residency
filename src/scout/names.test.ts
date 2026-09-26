import { describe, expect, it } from 'vitest';
import {
  CONFIDENCE,
  SubjectIndex,
  canonicalFirst,
  isAmbiguousSurname,
  matchSubject,
  nameTokens,
  normalizeName,
  subjectVariants,
  suggestSubjects,
  typoBudget,
} from './names';
import { FIXTURE_TEAMS, findFixturePlayer, findFixtureTeam, makeManyPlayers } from './fixtures';
import { buildPlayerSubject, buildTeamSubject } from './subjects';
import type { NflTeam, ScoutSubject, ScoutVerdict } from './types';

function teamFor(teamId: string): NflTeam | undefined {
  return FIXTURE_TEAMS.find((t) => t.id === teamId);
}

function ps(name: string): ScoutSubject {
  const p = findFixturePlayer(name);
  return buildPlayerSubject(p, teamFor(p.teamId));
}

function ts(abbr: string): ScoutSubject {
  return buildTeamSubject(findFixtureTeam(abbr));
}

const MAHOMES = ps('Patrick Mahomes');
const KELCE = ps('Travis Kelce');
const CMC = ps('Christian McCaffrey');
const JUSTIN = ps('Justin Jefferson');
const VAN = ps('Van Jefferson');
const JOSH = ps('Josh Allen');
const KEENAN = ps('Keenan Allen');
const NICK_BOSA = ps('Nick Bosa');
const JOEY_BOSA = ps('Joey Bosa');
const RICE = ps('Rashee Rice');
const WALKER = ps('Kenneth Walker III');
const SWIFT = ps("D'Andre Swift");
const NUNEZ = ps('Sebastián Núñez');

const KC = ts('KC');
const GB = ts('GB');
const SF = ts('SF');
const NYG = ts('NYG');
const NYJ = ts('NYJ');
const LAR = ts('LAR');

/** The whole fixture league: surname collisions live here on purpose. */
const LEAGUE: ScoutSubject[] = [MAHOMES, KELCE, CMC, JUSTIN, VAN, JOSH, KEENAN, NICK_BOSA, JOEY_BOSA, RICE, WALKER, SWIFT, NUNEZ];
const CITIES: ScoutSubject[] = [KC, GB, SF, NYG, NYJ, LAR];

function verdict(guess: string, subject: ScoutSubject, pool: ScoutSubject[] = []): ScoutVerdict {
  return matchSubject(guess, subject, pool).verdict;
}

describe('normalizeName', () => {
  it('lowercases, strips diacritics and punctuation, collapses spaces', () => {
    expect(normalizeName('  Patrick   MAHOMES  ')).toBe('patrick mahomes');
    expect(normalizeName('Sebastián Núñez')).toBe('sebastian nunez');
    expect(normalizeName("D'Andre Swift")).toBe('dandre swift');
    expect(normalizeName('P. Mahomes')).toBe('p mahomes');
    expect(normalizeName('Ka-imi  Fairbairn')).toBe('ka imi fairbairn');
  });

  it('drops generational suffixes but never the whole name', () => {
    expect(normalizeName('Mahomes Jr')).toBe('mahomes');
    expect(normalizeName('Kenneth Walker III')).toBe('kenneth walker');
    expect(normalizeName('Odell Beckham Jr.')).toBe('odell beckham');
    expect(normalizeName('Michael Pittman Sr')).toBe('michael pittman');
    expect(normalizeName('jr')).toBe('jr');
    expect(normalizeName('')).toBe('');
    expect(normalizeName('   ')).toBe('');
  });

  it('keeps digits (49ers) and tokenizes', () => {
    expect(normalizeName('San Francisco 49ers')).toBe('san francisco 49ers');
    expect(nameTokens('Kansas City Chiefs')).toEqual(['kansas', 'city', 'chiefs']);
    expect(nameTokens('')).toEqual([]);
  });
});

describe('typoBudget', () => {
  it('scales with length and refuses short strings', () => {
    expect(typoBudget(2)).toBe(0);
    expect(typoBudget(4)).toBe(0);
    expect(typoBudget(5)).toBe(0);
    expect(typoBudget(6)).toBe(1);
    expect(typoBudget(11)).toBe(1);
    expect(typoBudget(12)).toBe(2);
  });
});

describe('canonicalFirst', () => {
  it('folds common nicknames', () => {
    expect(canonicalFirst('pat')).toBe('patrick');
    expect(canonicalFirst('mike')).toBe('michael');
    expect(canonicalFirst('josh')).toBe('joshua');
    expect(canonicalFirst('trey')).toBe('trey');
  });
});

describe('matchSubject — players, correct', () => {
  const cases: Array<[string, ScoutSubject]> = [
    ['patrick mahomes', MAHOMES],
    ['Patrick Mahomes', MAHOMES],
    ['PATRICK MAHOMES', MAHOMES],
    ['  patrick   mahomes  ', MAHOMES],
    ['p mahomes', MAHOMES],
    ['P. Mahomes', MAHOMES],
    ['pat mahomes', MAHOMES],
    ['Mahomes Jr', MAHOMES],
    ['patrick mahomes jr', MAHOMES],
    ['mahoms', MAHOMES],
    ['patrik mahomes', MAHOMES],
    ['showtime', MAHOMES],
    ['cmc', CMC],
    ['CMC', CMC],
    ['run cmc', CMC],
    ['christian mccaffrey', CMC],
    ['mccaffrey', CMC],
    ['c mccaffrey', CMC],
    ['mcaffrey', CMC],
    ['kelce', KELCE],
    ['travis kelce', KELCE],
    ['rice', RICE],
    ['rashee rice', RICE],
    ['kenneth walker', WALKER],
    ['kenneth walker iii', WALKER],
    ['walker', WALKER],
    ['k walker', WALKER],
    ["d'andre swift", SWIFT],
    ['dandre swift', SWIFT],
    ['swift', SWIFT],
    ['sebastián núñez', NUNEZ],
    ['sebastian nunez', NUNEZ],
    ['nunez', NUNEZ],
  ];
  it.each(cases)('%s → correct', (guess, subject) => {
    expect(verdict(guess, subject, LEAGUE)).toBe('correct');
  });

  it('bare surname is correct when the pool holds nobody else with it', () => {
    expect(verdict('mahomes', MAHOMES, LEAGUE)).toBe('correct');
    expect(verdict('jefferson', JUSTIN, [JUSTIN, MAHOMES])).toBe('correct');
    expect(verdict('jeffersen', JUSTIN, [JUSTIN, MAHOMES])).toBe('correct');
    expect(verdict('bosa', NICK_BOSA, [NICK_BOSA])).toBe('correct');
  });

  it('works with no pool at all', () => {
    expect(verdict('mahomes', MAHOMES)).toBe('correct');
    expect(verdict('patrick mahomes', MAHOMES)).toBe('correct');
  });
});

describe('matchSubject — players, close (so close)', () => {
  const cases: Array<[string, ScoutSubject]> = [
    ['jefferson', JUSTIN],
    ['jefferson', VAN],
    ['jeffersen', JUSTIN],
    ['van jefferson', JUSTIN],
    ['justin jefferson', VAN],
    ['allen', JOSH],
    ['allen', KEENAN],
    ['keenan allen', JOSH],
    ['josh allen', KEENAN],
    ['bosa', NICK_BOSA],
    ['bosa', JOEY_BOSA],
    ['joey bosa', NICK_BOSA],
    ['nick bosa', JOEY_BOSA],
  ];
  it.each(cases)('%s → close', (guess, subject) => {
    expect(verdict(guess, subject, LEAGUE)).toBe('close');
  });

  it('is close for the right surname with a wrong first name, even without a pool', () => {
    expect(verdict('jordan mahomes', MAHOMES)).toBe('close');
    expect(verdict('tyler kelce', KELCE)).toBe('close');
  });

  it('reports a lower confidence than a correct match', () => {
    const close = matchSubject('jefferson', JUSTIN, LEAGUE);
    const right = matchSubject('justin jefferson', JUSTIN, LEAGUE);
    expect(close.confidence).toBeLessThan(right.confidence);
    expect(close.confidence).toBe(CONFIDENCE.closeSurname);
  });
});

describe('matchSubject — players, wrong', () => {
  const cases: Array<[string, ScoutSubject]> = [
    ['', MAHOMES],
    ['   ', MAHOMES],
    ['patrick', MAHOMES],
    ['travis', KELCE],
    ['kelce', MAHOMES],
    ['mahomes', KELCE],
    ['josh allen', MAHOMES],
    ['jalen hurts', MAHOMES],
    ['qqqqqqq', MAHOMES],
    ['boss', NICK_BOSA],
    ['bose', NICK_BOSA],
    ['race', RICE],
    ['ric', RICE],
    ['love', RICE],
    ['swif', SWIFT],
    ['mahomes', CMC],
  ];
  it.each(cases)('%s → wrong', (guess, subject) => {
    expect(verdict(guess, subject, LEAGUE)).toBe('wrong');
  });

  it('never lets one 4-letter surname match another', () => {
    expect(verdict('rice', NICK_BOSA, LEAGUE)).toBe('wrong');
    expect(verdict('bosa', RICE, LEAGUE)).toBe('wrong');
  });

  it('keeps wrong confidence below 0.5', () => {
    expect(matchSubject('boss', NICK_BOSA, LEAGUE).confidence).toBeLessThan(0.5);
    expect(matchSubject('qqqqqqq', MAHOMES).confidence).toBeLessThan(0.5);
  });
});

describe('matchSubject — teams', () => {
  const correct: Array<[string, ScoutSubject]> = [
    ['kc', KC],
    ['KC', KC],
    ['chiefs', KC],
    ['the chiefs', KC],
    ['kansas city', KC],
    ['kansas city chiefs', KC],
    ['cheifs', KC],
    ['kansas city chefs', KC],
    ['packers', GB],
    ['the pack', GB],
    ['pack', GB],
    ['gb', GB],
    ['green bay', GB],
    ['green bay packers', GB],
    ['cheeseheads', GB],
    ['niners', SF],
    ['the niners', SF],
    ['49ers', SF],
    ['san francisco', SF],
    ['sf', SF],
    ['forty niners', SF],
    ['giants', NYG],
    ['new york giants', NYG],
    ['big blue', NYG],
    ['jets', NYJ],
    ['gang green', NYJ],
    ['rams', LAR],
    ['la rams', LAR],
  ];
  it.each(correct)('%s → correct', (guess, subject) => {
    expect(verdict(guess, subject, CITIES)).toBe('correct');
  });

  const wrong: Array<[string, ScoutSubject]> = [
    ['kansas', KC],
    ['kr', KC],
    ['chargers', KC],
    ['chiefs', GB],
    ['bears', GB],
    ['', KC],
    ['seattle', SF],
  ];
  it.each(wrong)('%s → wrong', (guess, subject) => {
    expect(verdict(guess, subject, CITIES)).toBe('wrong');
  });

  it('is close for the right city with the wrong franchise', () => {
    expect(verdict('new york jets', NYG, CITIES)).toBe('close');
    expect(verdict('new york giants', NYJ, CITIES)).toBe('close');
    expect(verdict('new york', NYG, CITIES)).toBe('close');
    expect(verdict('new york', NYJ, CITIES)).toBe('close');
    expect(verdict('los angeles', LAR, [...CITIES, ts('LAC')])).toBe('close');
  });

  it('accepts a city alone when only one franchise plays there', () => {
    expect(verdict('kansas city', KC, CITIES)).toBe('correct');
    expect(verdict('los angeles', LAR, [LAR])).toBe('correct');
  });
});

describe('isAmbiguousSurname', () => {
  it('detects shared surnames and shared cities', () => {
    expect(isAmbiguousSurname(JUSTIN, LEAGUE)).toBe(true);
    expect(isAmbiguousSurname(MAHOMES, LEAGUE)).toBe(false);
    expect(isAmbiguousSurname(NYG, CITIES)).toBe(true);
    expect(isAmbiguousSurname(KC, CITIES)).toBe(false);
    expect(isAmbiguousSurname(MAHOMES, [])).toBe(false);
  });
});

describe('subjectVariants', () => {
  it('derives the initial form and caches per subject', () => {
    const v = subjectVariants(MAHOMES);
    expect(v.full).toBe('patrick mahomes');
    expect(v.last).toBe('mahomes');
    expect(v.initials).toBe('p mahomes');
    expect(subjectVariants(MAHOMES)).toBe(v);
  });

  it('derives city / nickname / abbr for teams', () => {
    const v = subjectVariants(KC);
    expect(v.city).toBe('kansas city');
    expect(v.nickname).toBe('chiefs');
    expect(v.abbr).toBe('kc');
    expect(v.exact.has('kansas city chiefs')).toBe(true);
  });
});

describe('suggestSubjects', () => {
  it('ranks the obvious answer first', () => {
    expect(suggestSubjects('mah', LEAGUE, 5)[0]).toBe(MAHOMES);
    expect(suggestSubjects('patrick', LEAGUE, 5)[0]).toBe(MAHOMES);
    expect(suggestSubjects('cmc', LEAGUE, 5)[0]).toBe(CMC);
    expect(suggestSubjects('p mah', LEAGUE, 5)[0]).toBe(MAHOMES);
  });

  it('returns every candidate for an ambiguous surname, famous first', () => {
    const hits = suggestSubjects('jeff', LEAGUE, 5);
    expect(hits).toContain(JUSTIN);
    expect(hits).toContain(VAN);
    expect(hits[0]).toBe(JUSTIN);
  });

  it('tolerates a typo', () => {
    expect(suggestSubjects('mahoms', LEAGUE, 5)[0]).toBe(MAHOMES);
    expect(suggestSubjects('mccafrey', LEAGUE, 5)[0]).toBe(CMC);
  });

  it('honours the limit and ignores an empty query', () => {
    expect(suggestSubjects('', LEAGUE, 5)).toEqual([]);
    expect(suggestSubjects('   ', LEAGUE, 5)).toEqual([]);
    expect(suggestSubjects('a', LEAGUE, 2).length).toBeLessThanOrEqual(2);
  });

  it('searches 2000 subjects in well under 20 ms per keystroke', () => {
    const players = makeManyPlayers(2000);
    const pool = players.map((p) => buildPlayerSubject(p, teamFor(p.teamId)));
    const index = new SubjectIndex().build(pool);
    expect(index.size).toBe(2000);
    const queries = ['j', 'ja', 'jal', 'jale', 'jalen', 'jalen w', 'whitf', 'okafor', 'sandersn', 'zzz'];
    let worst = 0;
    for (const q of queries) {
      const t0 = performance.now();
      index.search(q, 8);
      worst = Math.max(worst, performance.now() - t0);
    }
    expect(worst).toBeLessThan(20);
  });

  it('judges a guess against a 2000-subject pool in a couple of milliseconds', () => {
    const players = makeManyPlayers(2000);
    const pool = players.map((p) => buildPlayerSubject(p, teamFor(p.teamId)));
    const subject = pool[1000];
    // warm the variant cache the way a real round would
    matchSubject('warmup', subject, pool);
    let worst = 0;
    for (const guess of [subject.name, subject.player!.last, 'totally wrong name', 'jalen whitfield']) {
      const t0 = performance.now();
      matchSubject(guess, subject, pool);
      worst = Math.max(worst, performance.now() - t0);
    }
    expect(worst).toBeLessThan(20);
  });

  it('caches the index per pool identity', () => {
    const players = makeManyPlayers(400);
    const pool = players.map((p) => buildPlayerSubject(p, teamFor(p.teamId)));
    suggestSubjects('ja', pool, 5);
    const t0 = performance.now();
    for (let i = 0; i < 50; i++) suggestSubjects('jal', pool, 5);
    expect(performance.now() - t0).toBeLessThan(200);
  });
});
