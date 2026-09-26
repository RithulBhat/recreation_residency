/**
 * Guess matching and autocomplete search.
 *
 * `matchGuess(text, track, target)` decides whether a free-text guess names the track's title and/or
 * artist. Accepted forms: "title", "artist - title", "title - artist", "title by artist",
 * "artist: title", and "title + artist name" without a separator.
 *
 * Title rules (any title variant vs any guess variant):
 *   - normalized equality, or loose (letters+digits only) equality
 *   - Damerau-Levenshtein distance ≤ max(1, floor(len × 0.2)) when both sides are ≥ 4 chars
 *   - token-set Jaccard ≥ 0.85
 *   - the guess equals the title with its trailing parenthetical removed
 *   - never a plain prefix/containment match ("Stay" ≠ "Stay With Me")
 * Artist rules: any credited artist (primary, split on feat/&/,/x, featured in the title) or alias,
 *   equal, loose-equal, or within distance 1 (≥ 5 chars) / 2 (≥ 12 chars).
 *
 * Verdict: target 'title' → correct iff title; 'artist' → correct iff artist;
 *   'both' → correct iff title (artist optional), 'partial' when only the artist matched.
 * Confidence: strength of the matched component (1 = exact). For a wrong verdict it is a
 *   closeness value in [0, 0.5) so the UI can nudge ("so close!").
 */

import type { GuessTarget, MatchResult, Track } from '@/types';
import {
  artistVariants,
  bracketContents,
  featuredArtists,
  hasVersionKeyword,
  latinOnly,
  nonLatinOnly,
  normalizeArtist,
  normalizeName,
  normalizeTitle,
  numberVariants,
  splitArtists,
  squash,
  stripAllBrackets,
  stripDashSuffix,
  tokens,
  unique,
} from './normalize';

// ---------------------------------------------------------------------------------------------
// String distance
// ---------------------------------------------------------------------------------------------

/**
 * Optimal-string-alignment (restricted Damerau-Levenshtein) distance.
 * With `max`, returns `max + 1` as soon as the distance is known to exceed it.
 */
export function damerauLevenshtein(a: string, b: string, max = Number.POSITIVE_INFINITY): number {
  if (a === b) return 0;
  const n = a.length;
  const m = b.length;
  if (n === 0) return m > max ? max + 1 : m;
  if (m === 0) return n > max ? max + 1 : n;
  if (Math.abs(n - m) > max) return max + 1;

  let prev2 = new Array<number>(m + 1).fill(0);
  let prev = new Array<number>(m + 1);
  let cur = new Array<number>(m + 1).fill(0);
  for (let j = 0; j <= m; j++) prev[j] = j;

  for (let i = 1; i <= n; i++) {
    cur[0] = i;
    let rowMin = i;
    const ai = a.charCodeAt(i - 1);
    for (let j = 1; j <= m; j++) {
      const cost = ai === b.charCodeAt(j - 1) ? 0 : 1;
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && ai === b.charCodeAt(j - 2) && a.charCodeAt(i - 2) === b.charCodeAt(j - 1)) {
        v = Math.min(v, prev2[j - 2] + 1);
      }
      cur[j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    const tmp = prev2;
    prev2 = prev;
    prev = cur;
    cur = tmp;
  }
  return prev[m];
}

/** 1 − distance / longest length, in [0, 1]. */
export function similarity(a: string, b: string): number {
  const len = Math.max(a.length, b.length);
  if (len === 0) return 1;
  return 1 - damerauLevenshtein(a, b) / len;
}

function jaccard(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const sa = new Set(a);
  const sb = new Set(b);
  let inter = 0;
  for (const t of sa) if (sb.has(t)) inter++;
  const union = sa.size + sb.size - inter;
  return union === 0 ? 0 : inter / union;
}

// ---------------------------------------------------------------------------------------------
// Variants
// ---------------------------------------------------------------------------------------------

/** All normalized spellings a track's title may be guessed as. Primary variant first. */
export function titleVariants(track: Pick<Track, 'title' | 'titleFull'>): string[] {
  const out: string[] = [];
  const raws = unique([track.title, track.titleFull].filter((s): s is string => Boolean(s)));
  for (const raw of raws) {
    const n = normalizeTitle(raw);
    if (!n) continue;
    out.push(n);
    // title with every bracketed segment removed ("I Wanna Dance with Somebody (Who Loves Me)")
    const noBrackets = normalizeTitle(stripAllBrackets(raw));
    if (noBrackets) out.push(noBrackets);
    // title before a " - " suffix ("Song - Part 2" → "song") only when the suffix is short-ish
    const beforeDash = normalizeTitle(stripDashSuffix(raw));
    if (beforeDash && beforeDash !== n) out.push(beforeDash);
    // mixed-script titles: "봄날 (Spring Day)" → "spring day" and "봄날"
    const latin = latinOnly(n);
    const nonLatin = nonLatinOnly(n);
    if (latin && nonLatin) {
      if (latin.length >= 2) out.push(latin);
      out.push(nonLatin);
    }
    // a non-version parenthetical alone, when the outer part is non-Latin ("강남스타일 (Gangnam Style)")
    if (!latinOnly(normalizeTitle(stripAllBrackets(raw)))) {
      for (const inner of bracketContents(raw)) {
        if (!hasVersionKeyword(inner)) {
          const ni = normalizeTitle(inner);
          if (ni.length >= 2) out.push(ni);
        }
      }
    }
  }
  const withNumbers: string[] = [];
  for (const v of unique(out)) withNumbers.push(...numberVariants(v));
  return unique(withNumbers).filter(Boolean);
}

/** Every normalized artist name credited on the track, expanded through aliases. */
export function creditedArtists(track: Pick<Track, 'artist' | 'title' | 'titleFull'>): string[] {
  const names = unique([
    normalizeArtist(track.artist),
    ...splitArtists(track.artist),
    ...featuredArtists(track.titleFull ?? ''),
    ...featuredArtists(track.title ?? ''),
  ]).filter(Boolean);
  const expanded: string[] = [];
  for (const n of names) expanded.push(...artistVariants(n));
  return unique(expanded).filter(Boolean);
}

function guessTitleVariants(text: string): string[] {
  const n = normalizeTitle(text);
  if (!n) return [];
  return unique(numberVariants(n));
}

// ---------------------------------------------------------------------------------------------
// Component matchers
// ---------------------------------------------------------------------------------------------

interface ComponentMatch {
  ok: boolean;
  /** match strength when ok (≤ 1); closeness in [0, 1] when not ok */
  score: number;
}

const NO_MATCH: ComponentMatch = { ok: false, score: 0 };

function fuzzyThreshold(len: number): number {
  return Math.max(1, Math.floor(len * 0.2));
}

/** Typos never "fix" numbers: "song 3" must not fuzzy-match "song 2". */
function sameDigits(a: string, b: string): boolean {
  const da = a.match(/\d+/g) ?? [];
  const db = b.match(/\d+/g) ?? [];
  if (da.length !== db.length) return false;
  for (let i = 0; i < da.length; i++) if (da[i] !== db[i]) return false;
  return true;
}

/** Compare a guess (already normalized) against the title variants. */
export function matchTitleVariants(guessVariants: readonly string[], variants: readonly string[]): ComponentMatch {
  if (guessVariants.length === 0 || variants.length === 0) return NO_MATCH;
  let best = 0;
  let bestClose = 0;
  for (const v of variants) {
    const vSquash = squash(v);
    const vTokens = tokens(v);
    for (const g of guessVariants) {
      if (g === v) return { ok: true, score: 1 };
      if (vSquash.length > 0 && squash(g) === vSquash) {
        best = Math.max(best, 0.98);
        continue;
      }
      if (g.length >= 4 && v.length >= 4 && sameDigits(g, v)) {
        const thr = fuzzyThreshold(v.length);
        const d = damerauLevenshtein(g, v, thr);
        if (d <= thr) {
          best = Math.max(best, Math.min(0.97, 1 - d / v.length));
          continue;
        }
      }
      const j = jaccard(tokens(g), vTokens);
      if (j >= 0.85) {
        best = Math.max(best, Math.min(0.96, j));
        continue;
      }
      bestClose = Math.max(bestClose, similarity(g, v), j);
    }
  }
  return best > 0 ? { ok: true, score: best } : { ok: false, score: bestClose };
}

function artistThreshold(len: number): number {
  if (len >= 12) return 2;
  if (len >= 5) return 1;
  return 0;
}

/** Compare a guess (raw text) against the credited artists (normalized + aliases). */
export function matchArtistNames(guessRaw: string, credited: readonly string[]): ComponentMatch {
  const gVariants = unique([...artistVariants(guessRaw), normalizeName(guessRaw)]).filter(Boolean);
  if (gVariants.length === 0 || credited.length === 0) return NO_MATCH;
  let best = 0;
  let bestClose = 0;
  for (const c of credited) {
    const cSquash = squash(c);
    for (const g of gVariants) {
      if (g === c) return { ok: true, score: 1 };
      if (cSquash.length > 0 && squash(g) === cSquash) {
        best = Math.max(best, 0.98);
        continue;
      }
      const thr = artistThreshold(c.length);
      if (thr > 0 && g.length >= 4) {
        const d = damerauLevenshtein(g, c, thr);
        if (d <= thr) {
          best = Math.max(best, Math.min(0.95, 1 - d / c.length));
          continue;
        }
      }
      bestClose = Math.max(bestClose, similarity(g, c));
    }
  }
  return best > 0 ? { ok: true, score: best } : { ok: false, score: bestClose };
}

const FILLER = new Set(['by', 'the', 'from', 'feat', 'ft', 'featuring', 'with', 'and', 'x', 'of']);

/** Remove an artist name (any spelling, with or without "the") from a normalized guess. */
export function stripArtistFromText(normalizedGuess: string, credited: readonly string[]): string | null {
  const padded = ` ${normalizedGuess} `;
  const candidates = unique(credited.flatMap((c) => [`the ${c}`, c]))
    .filter((c) => c.trim().length >= 2)
    .sort((a, b) => b.length - a.length);
  for (const c of candidates) {
    const needle = ` ${c} `;
    const idx = padded.indexOf(needle);
    if (idx === -1) continue;
    const rest = (padded.slice(0, idx) + ' ' + padded.slice(idx + needle.length)).trim().replace(/\s+/g, ' ');
    let parts = tokens(rest);
    while (parts.length && FILLER.has(parts[0])) parts = parts.slice(1);
    while (parts.length && FILLER.has(parts[parts.length - 1])) parts = parts.slice(0, -1);
    const out = parts.join(' ');
    return out.length > 0 ? out : null;
  }
  return null;
}

// ---------------------------------------------------------------------------------------------
// Guess forms
// ---------------------------------------------------------------------------------------------

interface GuessForm {
  title?: string;
  artist?: string;
}

const DASH_FORM_RE = /\s+[-–—|]\s+/;
const BY_FORM_RE = /\s+by\s+/i;
const COLON_FORM_RE = /\s*:\s+/;

export function parseGuessForms(text: string): GuessForm[] {
  const t = text.trim();
  const forms: GuessForm[] = [{ title: t, artist: t }];
  const dash = t.split(DASH_FORM_RE);
  if (dash.length === 2) {
    forms.push({ artist: dash[0], title: dash[1] }, { title: dash[0], artist: dash[1] });
  }
  const by = t.split(BY_FORM_RE);
  if (by.length === 2) forms.push({ title: by[0], artist: by[1] });
  const colon = t.split(COLON_FORM_RE);
  if (colon.length === 2) forms.push({ artist: colon[0], title: colon[1] });
  return forms;
}

// ---------------------------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------------------------

export function matchGuess(text: string, track: Track, target: GuessTarget): MatchResult {
  const trimmed = text.trim();
  if (!trimmed) return { verdict: 'wrong', matchedTitle: false, matchedArtist: false, confidence: 0 };

  const variants = titleVariants(track);
  const credited = creditedArtists(track);

  let matchedTitle = false;
  let matchedArtist = false;
  let titleScore = 0;
  let artistScore = 0;
  let closeness = 0;

  const consider = (form: GuessForm) => {
    if (form.title !== undefined) {
      const r = matchTitleVariants(guessTitleVariants(form.title), variants);
      if (r.ok) {
        matchedTitle = true;
        titleScore = Math.max(titleScore, r.score);
      } else {
        closeness = Math.max(closeness, r.score);
      }
    }
    if (form.artist !== undefined) {
      const r = matchArtistNames(form.artist, credited);
      if (r.ok) {
        matchedArtist = true;
        artistScore = Math.max(artistScore, r.score);
      } else {
        closeness = Math.max(closeness, r.score);
      }
    }
  };

  for (const form of parseGuessForms(trimmed)) consider(form);

  // "title + artist" without a separator: strip the artist and retry the remainder as a title
  if (!matchedTitle) {
    const whole = normalizeTitle(trimmed);
    const rest = stripArtistFromText(whole, credited);
    if (rest && rest !== whole) {
      const r = matchTitleVariants(unique(numberVariants(rest)), variants);
      if (r.ok) {
        matchedTitle = true;
        matchedArtist = true;
        titleScore = Math.max(titleScore, r.score);
        artistScore = Math.max(artistScore, 1);
      }
    }
  }

  let verdict: MatchResult['verdict'];
  if (target === 'title') verdict = matchedTitle ? 'correct' : 'wrong';
  else if (target === 'artist') verdict = matchedArtist ? 'correct' : 'wrong';
  else verdict = matchedTitle ? 'correct' : matchedArtist ? 'partial' : 'wrong';

  let confidence: number;
  if (verdict === 'wrong') confidence = Math.min(0.49, closeness * 0.5);
  else if (verdict === 'partial') confidence = artistScore;
  else if (target === 'artist') confidence = artistScore;
  else confidence = titleScore;

  return { verdict, matchedTitle, matchedArtist, confidence: round3(confidence) };
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

// ---------------------------------------------------------------------------------------------
// Autocomplete search
// ---------------------------------------------------------------------------------------------

interface IndexEntry {
  track: Track;
  /** normalized title (leading "the" dropped) */
  title: string;
  /** normalized title keeping a leading "the" */
  titleRaw: string;
  titleSquash: string;
  artist: string;
  artistRaw: string;
  artistTitle: string;
  artistTitleRaw: string;
  artistTitleSquash: string;
  titleArtist: string;
  tokens: string[];
  key: string;
  rank: number;
}

export interface SearchHit {
  track: Track;
  score: number;
}

function normalizeQuery(q: string): string {
  // keep a leading "the": the index stores both forms
  return normalizeName(`x ${q}`).replace(/^x\s*/, '');
}

function keepThe(s: string): string {
  return normalizeName(`x ${s}`).replace(/^x\s*/, '');
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

/** Precomputed normalized fields for fast per-keystroke search over thousands of tracks. */
export class TrackIndex {
  private entries: IndexEntry[] = [];

  get size(): number {
    return this.entries.length;
  }

  build(tracks: readonly Track[]): this {
    this.entries = tracks.map((track) => {
      const title = normalizeTitle(track.title || track.titleFull || '');
      const titleRaw = keepThe(stripAllBrackets(track.title || track.titleFull || '')) || title;
      const artist = normalizeName(track.artist);
      const artistRaw = keepThe(track.artist);
      const artistTitle = `${artist} ${title}`.trim();
      const artistTitleRaw = `${artistRaw} ${titleRaw}`.trim();
      return {
        track,
        title,
        titleRaw,
        titleSquash: squash(title),
        artist,
        artistRaw,
        artistTitle,
        artistTitleRaw,
        artistTitleSquash: squash(artistTitle),
        titleArtist: `${title} ${artist}`.trim(),
        tokens: unique([...tokens(titleRaw), ...tokens(artistRaw)]),
        key: `${artist}|${title}`,
        rank: track.rank,
      };
    });
    return this;
  }

  searchScored(query: string, limit = 8): SearchHit[] {
    const q = normalizeQuery(query);
    if (!q) return [];
    const qNoThe = q.replace(/^the\s+/, '');
    const qTokens = tokens(q);
    const qSquash = squash(q);
    const fuzzy = qNoThe.length >= 4;
    const thr = Math.max(1, Math.floor(qNoThe.length * 0.25));

    const hits: Array<{ e: IndexEntry; score: number }> = [];
    for (const e of this.entries) {
      let score = 0;
      if (e.title === q || e.titleRaw === q || e.title === qNoThe) score = 100;
      else if (e.title.startsWith(q) || e.titleRaw.startsWith(q) || e.title.startsWith(qNoThe)) score = 90;
      else if (e.artistTitle.startsWith(q) || e.artistTitleRaw.startsWith(q) || e.artistTitle.startsWith(qNoThe))
        score = 86;
      else if (e.titleArtist.startsWith(q) || e.titleArtist.startsWith(qNoThe)) score = 84;
      else if (e.artist === q || e.artist.startsWith(q) || e.artistRaw.startsWith(q) || e.artist.startsWith(qNoThe))
        score = 80;
      else if (allTokensPrefix(qTokens, e.tokens)) score = 70;
      else if (qSquash.length >= 2 && (e.titleSquash.startsWith(qSquash) || e.artistTitleSquash.startsWith(qSquash)))
        score = 65;
      else if (fuzzy) {
        // typo-tolerant prefix: compare against the title cut to the query length (+1)
        const cut = e.title.length > qNoThe.length + 1 ? e.title.slice(0, qNoThe.length + 1).trimEnd() : e.title;
        const d = damerauLevenshtein(qNoThe, cut, thr);
        if (d <= thr) score = 55 - d * 3;
        else {
          const cutAT =
            e.artistTitle.length > qNoThe.length + 1
              ? e.artistTitle.slice(0, qNoThe.length + 1).trimEnd()
              : e.artistTitle;
          const d2 = damerauLevenshtein(qNoThe, cutAT, thr);
          if (d2 <= thr) score = 50 - d2 * 3;
        }
      }
      if (score > 0) hits.push({ e, score });
    }

    hits.sort((a, b) => b.score - a.score || b.e.rank - a.e.rank || a.e.title.length - b.e.title.length);

    const seen = new Set<string>();
    const out: SearchHit[] = [];
    for (const h of hits) {
      if (seen.has(h.e.key)) continue;
      seen.add(h.e.key);
      out.push({ track: h.e.track, score: h.score });
      if (out.length >= limit) break;
    }
    return out;
  }

  search(query: string, limit = 8): Track[] {
    return this.searchScored(query, limit).map((h) => h.track);
  }
}

const indexCache = new WeakMap<readonly Track[], TrackIndex>();

/** Rank tracks for an autocomplete query. The index is cached per `tracks` array identity. */
export function suggestMatches(query: string, tracks: readonly Track[], limit = 8): Track[] {
  let index = indexCache.get(tracks);
  if (!index) {
    index = new TrackIndex().build(tracks);
    indexCache.set(tracks, index);
  }
  return index.search(query, limit);
}
