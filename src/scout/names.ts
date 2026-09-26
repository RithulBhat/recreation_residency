/**
 * NFL name matching for Highlight Scout.
 *
 * `normalizeName` is the single normalization used by the matcher AND the suggestion index:
 * lowercase, diacritics stripped, apostrophes dropped, every other punctuation mark turned into a
 * space, generational suffixes (Jr / Sr / II–V) removed, spaces collapsed.
 *
 * `matchSubject(guess, subject, pool?)` returns a {@link ScoutMatchResult}:
 *   correct — the guess names this subject. Accepted forms:
 *       full name ('patrick mahomes'), surname alone when unambiguous in the pool ('mahomes'),
 *       'f last' / 'f. last' ('p mahomes'), any `subject.accepted` spelling or nickname ('cmc'),
 *       and 1–2 character typos scaled to length (never for strings under 6 characters, so
 *       'boss' does not match 'bosa' and 'kc' does not match 'kr').
 *       Teams also accept city, nickname, city + nickname, abbreviation and dataset aliases
 *       ('kc', 'chiefs', 'kansas city chiefs', 'niners', 'the pack').
 *   close  — the near miss worth telling the player about: the right surname on the wrong player
 *       ('jordan love' for Jordan Love's namesake, 'van jefferson' for Justin Jefferson), an
 *       ambiguous bare surname when two players in the pool share it, or the right city with the
 *       wrong franchise ('new york giants' when the answer is the Jets).
 *   wrong  — everything else; `confidence` then carries a closeness value in [0, 0.5).
 *
 * `suggestSubjects(query, pool, limit)` ranks a pool for the autocomplete. It builds a normalized
 * {@link SubjectIndex} once per pool array identity (WeakMap cache), so 2000 subjects stay well
 * under a keystroke's budget.
 */

import { damerauLevenshtein } from '@/game/match';
import { stripDiacritics } from '@/game/normalize';
import type { ScoutMatchResult, ScoutSubject } from './types';

/** Generational suffixes dropped from both guesses and canonical names. */
export const NAME_SUFFIXES: readonly string[] = ['jr', 'jnr', 'sr', 'snr', 'ii', 'iii', 'iv', 'v', 'vi'];

const SUFFIX_SET = new Set(NAME_SUFFIXES);

/** Words that carry no identity on their own and are ignored at the head of a guess. */
const LEADING_NOISE = new Set(['the', 'a']);

export const CONFIDENCE = {
  exact: 1,
  alias: 0.98,
  surname: 0.95,
  initials: 0.9,
  typo1: 0.85,
  typo2: 0.7,
  closeSurname: 0.55,
  closeCity: 0.5,
  wrongMax: 0.45,
} as const;

/**
 * Lowercase, de-accent, drop apostrophes, punctuation → space, suffixes removed, spaces collapsed.
 * Digits survive ('49ers'), so do non-Latin letters (they are simply passed through).
 */
export function normalizeName(s: string): string {
  if (typeof s !== 'string' || s === '') return '';
  const base = stripDiacritics(s)
    .toLowerCase()
    .replace(/[‘’'`´]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
  if (base === '') return '';
  const parts = base.split(' ').filter(Boolean);
  const kept: string[] = [];
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    // a suffix only counts as a suffix when something already precedes it
    if (i > 0 && SUFFIX_SET.has(p)) continue;
    kept.push(p);
  }
  return (kept.length > 0 ? kept : parts).join(' ');
}

/** Normalized tokens of a name. */
export function nameTokens(s: string): string[] {
  const n = normalizeName(s);
  return n === '' ? [] : n.split(' ');
}

/** Drop a leading 'the' / 'a' ('the pack' → 'pack'). Returns the input when nothing changes. */
export function stripLeadingNoise(n: string): string {
  const parts = n.split(' ');
  if (parts.length > 1 && LEADING_NOISE.has(parts[0])) return parts.slice(1).join(' ');
  return n;
}

/** Allowed edit distance for a string of `len` characters: 0 under 6, 1 under 12, else 2. */
export function typoBudget(len: number): number {
  if (len >= 12) return 2;
  if (len >= 6) return 1;
  return 0;
}

// ---------------------------------------------------------------------------------------------
// First-name nicknames
// ---------------------------------------------------------------------------------------------

/** nickname → canonical first name. Both directions are canonicalized before comparing. */
export const FIRST_NAME_ALIASES: Readonly<Record<string, string>> = {
  mike: 'michael',
  micah: 'micah',
  matt: 'matthew',
  matty: 'matthew',
  nick: 'nicholas',
  nicky: 'nicholas',
  tony: 'anthony',
  joe: 'joseph',
  joey: 'joseph',
  dave: 'david',
  davy: 'david',
  rob: 'robert',
  robby: 'robert',
  bob: 'robert',
  bobby: 'robert',
  jim: 'james',
  jimmy: 'james',
  will: 'william',
  bill: 'william',
  billy: 'william',
  willy: 'william',
  tom: 'thomas',
  tommy: 'thomas',
  ken: 'kenneth',
  kenny: 'kenneth',
  dan: 'daniel',
  danny: 'daniel',
  ben: 'benjamin',
  benny: 'benjamin',
  sam: 'samuel',
  sammy: 'samuel',
  greg: 'gregory',
  jeff: 'jeffrey',
  steve: 'steven',
  stephen: 'steven',
  andy: 'andrew',
  drew: 'andrew',
  zac: 'zachary',
  zach: 'zachary',
  zack: 'zachary',
  josh: 'joshua',
  jake: 'jacob',
  alex: 'alexander',
  chris: 'christopher',
  cam: 'cameron',
  ty: 'tyler',
  tyreek: 'tyreek',
  pat: 'patrick',
  patty: 'patrick',
  rick: 'richard',
  ricky: 'richard',
  dick: 'richard',
  tim: 'timothy',
  tj: 'tj',
  aj: 'aj',
  cj: 'cj',
  dj: 'dj',
  jj: 'jj',
};

export function canonicalFirst(first: string): string {
  return FIRST_NAME_ALIASES[first] ?? first;
}

// ---------------------------------------------------------------------------------------------
// Subject variants
// ---------------------------------------------------------------------------------------------

export interface SubjectVariants {
  kind: ScoutSubject['kind'];
  /** Canonical normalized name ('patrick mahomes', 'kansas city chiefs'). */
  full: string;
  first: string;
  last: string;
  /** 'p mahomes' (players only). */
  initials: string;
  /** Team nickname ('chiefs') — empty for players. */
  nickname: string;
  /** Team city ('kansas city') — empty for players. */
  city: string;
  /** Team abbreviation ('kc') — empty for players. */
  abbr: string;
  /** Every spelling accepted outright (normalized, leading 'the' also stored bare). */
  exact: Set<string>;
  /** Long-enough strings that may be typo-matched. */
  fuzzy: string[];
}

const variantCache = new WeakMap<ScoutSubject, SubjectVariants>();

function addExact(set: Set<string>, raw: string): void {
  const n = normalizeName(raw);
  if (n === '') return;
  set.add(n);
  const bare = stripLeadingNoise(n);
  if (bare !== '') set.add(bare);
}

/** Every normalized spelling of a subject. Cached per subject object. */
export function subjectVariants(subject: ScoutSubject): SubjectVariants {
  const cached = variantCache.get(subject);
  if (cached) return cached;

  const full = normalizeName(subject.name);
  const tokens = full === '' ? [] : full.split(' ');
  const exact = new Set<string>();
  addExact(exact, subject.name);
  for (const a of subject.accepted) addExact(exact, a);

  let first = '';
  let last = '';
  let initials = '';
  let nickname = '';
  let city = '';
  let abbr = '';

  if (subject.kind === 'player') {
    const p = subject.player;
    first = normalizeName(p?.first ?? tokens[0] ?? '');
    // ESPN sometimes carries the suffix in `last` ('Walker III'), and normalizeName drops suffixes
    // only when something precedes them — so fall back to the canonical name's last token.
    const fromFull = tokens.length > 1 ? tokens[tokens.length - 1] : (tokens[0] ?? '');
    last = normalizeName(p?.last ?? fromFull);
    if (last === '' || SUFFIX_SET.has(last)) last = fromFull;
    if (first !== '' && last !== '') {
      initials = `${first[0]} ${last}`;
      exact.add(initials);
      exact.add(`${full}`);
    }
  } else {
    const t = subject.team;
    nickname = normalizeName(t?.name ?? (tokens.length > 1 ? tokens[tokens.length - 1] : (tokens[0] ?? '')));
    city = normalizeName(t?.location ?? '');
    abbr = normalizeName(t?.abbr ?? '');
    for (const v of [nickname, city, abbr, [city, nickname].filter(Boolean).join(' ')]) {
      if (v !== '') exact.add(v);
    }
    for (const a of t?.aliases ?? []) addExact(exact, a);
    last = nickname;
    first = city;
  }

  const fuzzy: string[] = [];
  for (const v of exact) if (v.length >= 6) fuzzy.push(v);

  const variants: SubjectVariants = {
    kind: subject.kind,
    full,
    first,
    last,
    initials,
    nickname,
    city,
    abbr,
    exact,
    fuzzy,
  };
  variantCache.set(subject, variants);
  return variants;
}

function result(verdict: ScoutMatchResult['verdict'], confidence: number): ScoutMatchResult {
  return { verdict, confidence: Math.max(0, Math.min(1, Math.round(confidence * 1000) / 1000)) };
}

/** Closeness in [0, wrongMax) so a wrong guess can still nudge the UI. */
function wrongWith(guess: string, variants: SubjectVariants): ScoutMatchResult {
  let best = 0;
  for (const v of variants.exact) {
    const len = Math.max(v.length, guess.length);
    if (len === 0) continue;
    const d = damerauLevenshtein(guess, v, Math.ceil(len * 0.6));
    const sim = 1 - Math.min(d, len) / len;
    if (sim > best) best = sim;
  }
  return result('wrong', Math.min(CONFIDENCE.wrongMax, best * CONFIDENCE.wrongMax));
}

function withinBudget(a: string, b: string): number | null {
  const budget = typoBudget(Math.min(a.length, b.length));
  if (budget === 0) return a === b ? 0 : null;
  // a long/short mismatch is never a typo
  if (Math.abs(a.length - b.length) > budget) return null;
  const d = damerauLevenshtein(a, b, budget);
  return d <= budget ? d : null;
}

function typoConfidence(d: number): number {
  return d <= 1 ? CONFIDENCE.typo1 : CONFIDENCE.typo2;
}

/** Does the guess's leading part name this player's first name (nickname/initial/typo aware)? */
export function firstNameMatches(guessFirst: string, variants: SubjectVariants): boolean {
  const gf = guessFirst.trim();
  if (gf === '' || variants.first === '') return false;
  if (gf === variants.first) return true;
  if (gf.length === 1) return gf === variants.first[0];
  if (canonicalFirst(gf) === canonicalFirst(variants.first)) return true;
  return withinBudget(gf, variants.first) !== null;
}

function surnameMatch(guessLast: string, variants: SubjectVariants): number | null {
  if (variants.last === '') return null;
  if (guessLast === variants.last) return 0;
  return withinBudget(guessLast, variants.last);
}

function sameId(a: ScoutSubject, b: ScoutSubject): boolean {
  return a.kind === b.kind && a.id === b.id;
}

/** Another subject in the pool shares this subject's surname (players) or city (teams). */
export function isAmbiguousSurname(subject: ScoutSubject, pool: readonly ScoutSubject[]): boolean {
  if (pool.length === 0) return false;
  const v = subjectVariants(subject);
  const key = subject.kind === 'player' ? v.last : v.city;
  if (key === '') return false;
  for (const other of pool) {
    if (other.kind !== subject.kind) continue;
    if (sameId(other, subject)) continue;
    const ov = subjectVariants(other);
    const okey = other.kind === 'player' ? ov.last : ov.city;
    if (okey === key) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------------------------
// matchSubject
// ---------------------------------------------------------------------------------------------

function matchPlayer(g: string, subject: ScoutSubject, v: SubjectVariants, pool: readonly ScoutSubject[]): ScoutMatchResult {
  const gTokens = g.split(' ');

  // A bare surname is judged FIRST, because two players in the pool sharing it makes it `close`
  // even though `accepted` may list it outright. A one-word alias that is not the surname
  // ('cmc') keeps priority over this branch.
  if (gTokens.length === 1 && !(v.exact.has(g) && g !== v.last)) {
    const d = surnameMatch(g, v);
    if (d !== null) {
      const conf = d === 0 ? CONFIDENCE.surname : typoConfidence(d);
      return isAmbiguousSurname(subject, pool)
        ? result('close', CONFIDENCE.closeSurname)
        : result('correct', conf);
    }
  }

  if (v.exact.has(g)) return result('correct', g === v.full ? CONFIDENCE.exact : CONFIDENCE.alias);

  // 'first last' / 'f last' / 'f. last' — and the "right surname, wrong player" near miss
  if (gTokens.length >= 2) {
    const gLast = gTokens[gTokens.length - 1];
    const gFirst = gTokens.slice(0, -1).join(' ');
    const d = surnameMatch(gLast, v);
    if (d !== null) {
      if (firstNameMatches(gFirst, v)) {
        const conf = d === 0 ? (gFirst.length === 1 ? CONFIDENCE.initials : CONFIDENCE.exact) : typoConfidence(d);
        return result('correct', conf);
      }
      return result('close', CONFIDENCE.closeSurname);
    }
  }

  // typo against the whole name or any accepted spelling
  for (const cand of v.fuzzy) {
    const d = withinBudget(g, cand);
    if (d !== null && d > 0) return result('correct', typoConfidence(d));
  }

  // named a different player in the pool who happens to share the surname
  for (const other of pool) {
    if (other.kind !== 'player' || sameId(other, subject)) continue;
    const ov = subjectVariants(other);
    if (ov.exact.has(g) && ov.last !== '' && ov.last === v.last) return result('close', CONFIDENCE.closeSurname);
  }

  return wrongWith(g, v);
}

function matchTeam(g: string, subject: ScoutSubject, v: SubjectVariants, pool: readonly ScoutSubject[]): ScoutMatchResult {
  const bare = stripLeadingNoise(g);

  // city alone is judged FIRST: correct when only one franchise in the pool plays there,
  // `close` when the city is shared (New York, Los Angeles).
  if (v.city !== '' && (g === v.city || bare === v.city)) {
    return isAmbiguousSurname(subject, pool)
      ? result('close', CONFIDENCE.closeCity)
      : result('correct', CONFIDENCE.surname);
  }

  if (v.exact.has(g) || v.exact.has(bare)) {
    const isFull = g === v.full || bare === v.full;
    return result('correct', isFull ? CONFIDENCE.exact : CONFIDENCE.alias);
  }

  // nickname and full-name typos ('cheifs', 'kansas city chefs') — checked BEFORE the city-prefix
  // near miss, so a misspelt nickname is still the right team.
  for (const cand of v.fuzzy) {
    const d = withinBudget(bare, cand) ?? withinBudget(g, cand);
    if (d !== null && d > 0) return result('correct', typoConfidence(d));
  }

  // right city, wrong nickname ('new york giants' when the answer is the Jets)
  if (v.city !== '' && bare.startsWith(`${v.city} `)) return result('close', CONFIDENCE.closeCity);

  // named a different franchise from the same city
  for (const other of pool) {
    if (other.kind !== 'team' || sameId(other, subject)) continue;
    const ov = subjectVariants(other);
    if ((ov.exact.has(g) || ov.exact.has(bare)) && ov.city !== '' && ov.city === v.city) {
      return result('close', CONFIDENCE.closeCity);
    }
  }

  return wrongWith(bare, v);
}

/**
 * Decide whether `guess` names `subject`. `pool` (the round's other subjects) is optional and only
 * used to judge ambiguity — a bare surname shared by two players in the pool is `close`, not
 * `correct`.
 */
export function matchSubject(
  guess: string,
  subject: ScoutSubject,
  pool: readonly ScoutSubject[] = [],
): ScoutMatchResult {
  const g = normalizeName(guess);
  if (g === '') return result('wrong', 0);
  const v = subjectVariants(subject);
  if (v.full === '' && v.exact.size === 0) return result('wrong', 0);
  return subject.kind === 'team' ? matchTeam(g, subject, v, pool) : matchPlayer(g, subject, v, pool);
}

// ---------------------------------------------------------------------------------------------
// Suggestion index
// ---------------------------------------------------------------------------------------------

/** Letters and digits only — 'kansas city chiefs' → 'kansascitychiefs'. */
export function squashName(s: string): string {
  return s.replace(/[^\p{L}\p{N}]+/gu, '');
}

interface IndexEntry {
  subject: ScoutSubject;
  key: string;
  name: string;
  squash: string;
  first: string;
  last: string;
  initials: string;
  tokens: string[];
  extra: string[];
  rank: number;
}

export interface SubjectHit {
  subject: ScoutSubject;
  score: number;
}

function rankOf(subject: ScoutSubject): number {
  if (subject.kind === 'player') return subject.player?.fame ?? 0;
  const sb = subject.team?.superBowls.length ?? 0;
  return 60 + sb * 4;
}

function allTokensPrefix(qTokens: readonly string[], target: readonly string[]): boolean {
  if (qTokens.length === 0) return false;
  for (const qt of qTokens) {
    let found = false;
    for (const t of target) {
      if (t.startsWith(qt)) {
        found = true;
        break;
      }
    }
    if (!found) return false;
  }
  return true;
}

/** Precomputed normalized fields for per-keystroke search over thousands of subjects. */
export class SubjectIndex {
  private entries: IndexEntry[] = [];

  get size(): number {
    return this.entries.length;
  }

  build(pool: readonly ScoutSubject[]): this {
    const seen = new Set<string>();
    const entries: IndexEntry[] = [];
    for (const subject of pool) {
      const key = `${subject.kind}:${subject.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const v = subjectVariants(subject);
      const extra: string[] = [];
      for (const e of v.exact) {
        if (e !== v.full && e !== v.last && e.length >= 2) extra.push(e);
      }
      entries.push({
        subject,
        key,
        name: v.full,
        squash: squashName(v.full),
        first: v.first,
        last: v.last,
        initials: v.initials,
        tokens: v.full === '' ? [] : v.full.split(' '),
        extra,
        rank: rankOf(subject),
      });
    }
    this.entries = entries;
    return this;
  }

  searchScored(query: string, limit = 8): SubjectHit[] {
    const q = normalizeName(query);
    if (q === '') return [];
    const qTokens = q.split(' ');
    const qSquash = squashName(q);
    const fuzzy = q.length >= 4;
    const thr = Math.max(1, Math.floor(q.length * 0.25));

    const hits: Array<{ e: IndexEntry; score: number }> = [];
    for (const e of this.entries) {
      let score = 0;
      if (e.name === q || e.last === q) score = 100;
      else if (e.name.startsWith(q)) score = 92;
      else if (e.last.startsWith(q)) score = 88;
      else if (e.initials !== '' && e.initials.startsWith(q)) score = 84;
      else if (e.first.startsWith(q)) score = 78;
      else if (e.extra.some((x) => x === q)) score = 96;
      else if (e.extra.some((x) => x.startsWith(q))) score = 74;
      else if (allTokensPrefix(qTokens, e.tokens)) score = 70;
      else if (qSquash.length >= 3 && e.squash.startsWith(qSquash)) score = 66;
      else if (fuzzy) {
        const cut = e.name.length > q.length + 1 ? e.name.slice(0, q.length + 1).trimEnd() : e.name;
        const d = damerauLevenshtein(q, cut, thr);
        if (d <= thr) score = 55 - d * 3;
        else if (e.last.length >= 4) {
          const d2 = damerauLevenshtein(q, e.last, thr);
          if (d2 <= thr) score = 50 - d2 * 3;
        }
      }
      if (score > 0) hits.push({ e, score });
    }

    hits.sort((a, b) => b.score - a.score || b.e.rank - a.e.rank || a.e.name.length - b.e.name.length);
    const out: SubjectHit[] = [];
    for (const h of hits) {
      out.push({ subject: h.e.subject, score: h.score });
      if (out.length >= limit) break;
    }
    return out;
  }

  search(query: string, limit = 8): ScoutSubject[] {
    return this.searchScored(query, limit).map((h) => h.subject);
  }
}

const indexCache = new WeakMap<readonly ScoutSubject[], SubjectIndex>();

/** Ranked autocomplete suggestions. The index is cached per `pool` array identity. */
export function suggestSubjects(query: string, pool: readonly ScoutSubject[], limit = 8): ScoutSubject[] {
  let index = indexCache.get(pool);
  if (!index) {
    index = new SubjectIndex().build(pool);
    indexCache.set(pool, index);
  }
  return index.search(query, limit);
}
