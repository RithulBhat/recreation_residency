/**
 * Text normalization for fuzzy song / artist matching.
 *
 * All functions are pure and Unicode-aware: Latin diacritics are stripped, but Hangul / CJK /
 * Cyrillic letters survive so non-Latin titles remain matchable. Nothing here decides a match —
 * see `match.ts` for the comparison rules built on top of these primitives.
 */

// ---------------------------------------------------------------------------------------------
// Diacritics & special letters
// ---------------------------------------------------------------------------------------------

const SPECIAL_LETTERS: Record<string, string> = {
  ø: 'o',
  æ: 'ae',
  œ: 'oe',
  ß: 'ss',
  ł: 'l',
  đ: 'd',
  ð: 'd',
  þ: 'th',
  ı: 'i',
  ŋ: 'n',
  ħ: 'h',
  ŧ: 't',
};

/** NFD-decompose, drop combining marks, map letters that do not decompose (ø → o, ß → ss, …). */
export function stripDiacritics(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[øæœßłđðþıŋħŧ]/g, (c) => SPECIAL_LETTERS[c] ?? c)
    .normalize('NFC');
}

// ---------------------------------------------------------------------------------------------
// Version / edition keywords (token form: lowercase, apostrophes removed, punctuation → space)
// ---------------------------------------------------------------------------------------------

export const VERSION_KEYWORDS: readonly string[] = [
  'feat',
  'ft',
  'featuring',
  'with',
  'remaster',
  'remastered',
  'remix',
  'remixed',
  'edit',
  'version',
  'ver',
  'live',
  'mix',
  'radio',
  'acoustic',
  'deluxe',
  'bonus',
  'from',
  'soundtrack',
  'ost',
  'mono',
  'stereo',
  'single',
  'album',
  'sped up',
  'slowed',
  'instrumental',
  'demo',
  'explicit',
  'clean',
  'original',
  'extended',
  're recorded',
  'rerecorded',
  'taylors version',
  'anniversary',
  'karaoke',
  'edition',
  'reprise',
  'unplugged',
  'dub',
  'vip',
  'rework',
  'remake',
  'session',
  'sessions',
];

function baseTokens(s: string): string[] {
  return stripDiacritics(s.toLowerCase())
    .replace(/['’‘ʼ`´]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

/** True when the segment (inside brackets or after " - ") reads like a version/edition marker. */
export function hasVersionKeyword(segment: string): boolean {
  const padded = ` ${baseTokens(segment).join(' ')} `;
  if (padded.trim() === '') return false;
  return VERSION_KEYWORDS.some((k) => padded.includes(` ${k} `));
}

const BRACKET_RE = /\s*[([{]([^()[\]{}]*)[)\]}]/g;
const DASH_SPLIT_RE = /\s+[-–—]\s+/;
const FEAT_TAIL_RE = /\s+(?:feat|ft|featuring)\.?\s+.*$/i;

/** Remove bracketed segments and " - suffix" segments that contain version keywords. */
export function removeVersionSegments(s: string): string {
  let out = s;
  for (let pass = 0; pass < 2; pass++) {
    out = out.replace(BRACKET_RE, (m: string, inner: string) => (hasVersionKeyword(inner) ? ' ' : m));
  }
  const parts = out.split(DASH_SPLIT_RE);
  if (parts.length > 1) {
    out = parts.filter((p, i) => i === 0 || !hasVersionKeyword(p)).join(' - ');
  }
  out = out.replace(FEAT_TAIL_RE, '');
  return out.trim();
}

/** Remove every bracketed segment, version-y or not. */
export function stripAllBrackets(s: string): string {
  let out = s;
  for (let pass = 0; pass < 2; pass++) out = out.replace(BRACKET_RE, ' ');
  return out.trim();
}

/** The inner text of every bracketed segment. */
export function bracketContents(s: string): string[] {
  const out: string[] = [];
  for (const m of s.matchAll(BRACKET_RE)) {
    const inner = m[1]?.trim();
    if (inner) out.push(inner);
  }
  return out;
}

/** Everything before the first " - " separator. */
export function stripDashSuffix(s: string): string {
  const parts = s.split(DASH_SPLIT_RE);
  return (parts[0] ?? s).trim();
}

// ---------------------------------------------------------------------------------------------
// Core normalization
// ---------------------------------------------------------------------------------------------

const TOKEN_MAP: Record<string, string> = { pt: 'part', vol: 'volume' };

function mapTokens(s: string): string {
  const tokens = s.split(' ');
  return tokens
    .map((t, i) => {
      // "rock n roll" → "rock and roll", but leave the N of an initialism alone ("t n t")
      if (t === 'n' && i > 0 && i < tokens.length - 1 && tokens[i - 1].length >= 2 && tokens[i + 1].length >= 2) return 'and';
      return TOKEN_MAP[t] ?? t;
    })
    .join(' ');
}

/** lowercase → diacritics → `&`→`and` → strip apostrophes → punctuation→space → collapse. */
function basic(s: string): string {
  return stripDiacritics(s.toLowerCase())
    .replace(/\s*&\s*/g, ' and ')
    .replace(/\s+\+\s+/g, ' and ')
    .replace(/['’‘ʼ`´]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function dropLeadingThe(s: string): string {
  return s.replace(/^the\s+/, '');
}

/**
 * Normalize a song title for comparison: strips version segments ("(Remastered 2011)",
 * "- Radio Edit", "(feat. X)"), punctuation, apostrophes (`don't` → `dont`), a leading "the".
 * Never returns '' for a non-empty input (a title that is only a version word stays as-is).
 */
export function normalizeTitle(s: string): string {
  let n = basic(removeVersionSegments(s));
  if (!n) n = basic(s);
  n = stripTrailingVersionWords(n);
  return dropLeadingThe(mapTokens(n));
}

/** Bare version phrases typed without brackets: "love story taylors version" → "love story". */
const TRAILING_VERSION_RE =
  /\s+(?:taylors version|(?:\d{4}\s+)?remaster(?:ed)?(?:\s+\d{4})?|radio edit|sped up|slowed(?:\s+down)?|extended(?:\s+(?:mix|version))?|acoustic(?:\s+version)?|live version|instrumental(?:\s+version)?|remix|single version|album version|original mix|club mix|karaoke(?:\s+version)?|mono version|stereo version|demo version|explicit version|clean version|deluxe edition|bonus track)$/;

export function stripTrailingVersionWords(normalized: string): string {
  const out = normalized.replace(TRAILING_VERSION_RE, '').trim();
  return out || normalized;
}

/** Artist name normalization without alias canonicalization (used by search). */
export function normalizeName(s: string): string {
  return dropLeadingThe(mapTokens(basic(s)));
}

/** Loosest form: version-free, bracket-free, dash-suffix-free, letters+digits only, no spaces. */
export function normalizeLoose(s: string): string {
  return normalizeTitle(stripAllBrackets(stripDashSuffix(s))).replace(/\s+/g, '');
}

/** Letters+digits only, no spaces, of an already-normalized string. */
export function squash(s: string): string {
  return s.replace(/[^\p{L}\p{N}]+/gu, '');
}

// ---------------------------------------------------------------------------------------------
// Number words (compared as variants, never applied globally)
// ---------------------------------------------------------------------------------------------

const ONES = [
  'zero',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
  'eleven',
  'twelve',
  'thirteen',
  'fourteen',
  'fifteen',
  'sixteen',
  'seventeen',
  'eighteen',
  'nineteen',
];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
const ONES_INDEX = new Map<string, number>(ONES.map((w, i): [string, number] => [w, i]));
const TENS_INDEX = new Map<string, number>(
  TENS.map((w, i): [string, number] => [w, i * 10]).filter(([w]) => w !== ''),
);

function numberToWords(n: number): string | null {
  if (n < 0 || !Number.isInteger(n)) return null;
  if (n < 20) return ONES[n];
  if (n < 100) {
    const tens = TENS[Math.floor(n / 10)];
    const ones = n % 10;
    return ones ? `${tens} ${ONES[ones]}` : tens;
  }
  if (n === 100) return 'one hundred';
  if (n === 1000) return 'one thousand';
  return null;
}

/** "7 rings" → "seven rings" (only 0–99, 100, 1000). */
export function digitsToWords(s: string): string {
  return s
    .split(' ')
    .map((t) => (/^\d+$/.test(t) ? (numberToWords(Number(t)) ?? t) : t))
    .join(' ');
}

/** "seven rings" → "7 rings", "twenty one pilots" → "21 pilots". */
export function wordsToDigits(s: string): string {
  const tokens = s.split(' ');
  const out: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    const tens = TENS_INDEX.get(t);
    if (tens !== undefined) {
      const nextOnes = i + 1 < tokens.length ? ONES_INDEX.get(tokens[i + 1]) : undefined;
      if (nextOnes !== undefined && nextOnes > 0 && nextOnes < 10) {
        out.push(String(tens + nextOnes));
        i++;
      } else {
        out.push(String(tens));
      }
      continue;
    }
    const ones = ONES_INDEX.get(t);
    if (ones !== undefined) {
      out.push(String(ones));
      continue;
    }
    if (t === 'hundred') {
      out.push('100');
      continue;
    }
    if (t === 'thousand') {
      out.push('1000');
      continue;
    }
    out.push(t);
  }
  // "one hundred" → "1 100" would be silly; collapse the common cases
  return out.join(' ').replace(/\b1 100\b/g, '100').replace(/\b1 1000\b/g, '1000');
}

/** The string plus its digit↔word variants (unique, original first). */
export function numberVariants(s: string): string[] {
  return unique([s, wordsToDigits(s), digitsToWords(s)]);
}

// ---------------------------------------------------------------------------------------------
// Artists
// ---------------------------------------------------------------------------------------------

/**
 * Canonical artist name → accepted aliases (raw spellings; normalized at load time).
 * Lookups are symmetric: every member of a group maps to the whole group.
 */
export const artistAliases: Record<string, string[]> = {
  'Kanye West': ['Ye', 'Kanye', 'Yeezy'],
  'JAY-Z': ['Jay Z', 'Jayz', 'Hov', 'Hova', 'Shawn Carter'],
  'P!nk': ['Pink'],
  'The Weeknd': ['Weeknd', 'Abel Tesfaye'],
  Beyoncé: ['Beyonce', 'Queen Bey'],
  'A$AP Rocky': ['ASAP Rocky'],
  'A$AP Ferg': ['ASAP Ferg'],
  'Ke$ha': ['Kesha'],
  'Tyler, The Creator': ['Tyler The Creator', 'Tyler'],
  MØ: ['Mo'],
  'The Notorious B.I.G.': ['Notorious BIG', 'Biggie', 'Biggie Smalls'],
  '2Pac': ['Tupac', 'Tupac Shakur', 'Makaveli'],
  'MF DOOM': ['Doom', 'MF Doom'],
  "Guns N' Roses": ['Guns and Roses', 'GNR'],
  'Red Hot Chili Peppers': ['RHCP', 'Chili Peppers'],
  'J. Cole': ['J Cole', 'JCole'],
  'Lil Nas X': ['Lil Nas'],
  Diddy: ['Puff Daddy', 'P Diddy', 'P. Diddy', 'Sean Combs', 'Puffy'],
  'Juice WRLD': ['Juice World'],
  XXXTENTACION: ['XXX Tentacion', 'X Tentacion'],
  'Snoop Dogg': ['Snoop', 'Snoop Lion', 'Snoop Doggy Dogg'],
  'Childish Gambino': ['Donald Glover'],
  'The Chainsmokers': ['Chainsmokers'],
  '*NSYNC': ['NSYNC', 'N Sync'],
  'AC/DC': ['ACDC', 'AC DC'],
  'Machine Gun Kelly': ['MGK'],
  'Twenty One Pilots': ['21 Pilots', 'TØP'],
  '5 Seconds of Summer': ['5SOS', 'Five Seconds of Summer'],
  'One Direction': ['1D'],
  'G-Eazy': ['G Eazy', 'Geazy'],
  'A.R. Rahman': ['AR Rahman', 'A R Rahman', 'Rahman'],
  BLACKPINK: ['Black Pink', '블랙핑크'],
  BTS: ['Bangtan Boys', 'Bangtan Sonyeondan', '방탄소년단'],
  'Stray Kids': ['SKZ'],
  'TOMORROW X TOGETHER': ['TXT'],
  SEVENTEEN: ['SVT'],
  'NCT 127': ['NCT'],
  'Cardi B': ['Cardi'],
  'The Rolling Stones': ['Rolling Stones', 'Stones'],
  'The Beatles': ['Beatles'],
  'Led Zeppelin': ['Zeppelin', 'Led Zep'],
  'Lynyrd Skynyrd': ['Skynyrd'],
  'Panic! At The Disco': ['Panic At The Disco', 'PATD'],
  'Fall Out Boy': ['FOB'],
  'My Chemical Romance': ['MCR'],
  'System Of A Down': ['SOAD'],
  'Rage Against The Machine': ['RATM'],
  'Bad Bunny': ['Benito'],
  'J Balvin': ['J. Balvin', 'JBalvin'],
  'MC Hammer': ['Hammer'],
  'Earth, Wind & Fire': ['Earth Wind and Fire', 'EWF'],
  'Kool & The Gang': ['Kool and the Gang'],
  'Simon & Garfunkel': ['Simon and Garfunkel'],
  'Daryl Hall & John Oates': ['Hall and Oates', 'Hall & Oates'],
  'Florence + The Machine': ['Florence and the Machine', 'Florence'],
  'Mumford & Sons': ['Mumford and Sons'],
  'Macklemore & Ryan Lewis': ['Macklemore'],
  'Lil Uzi Vert': ['Uzi'],
  'Lil Wayne': ['Weezy'],
  'A Boogie Wit da Hoodie': ['A Boogie'],
  'Ty Dolla $ign': ['Ty Dolla Sign', 'Ty Dolla'],
  'Travis Scott': ['La Flame'],
  'Megan Thee Stallion': ['Meg Thee Stallion', 'Megan'],
  'Doja Cat': ['Doja'],
  'The Kid LAROI': ['Kid Laroi', 'Laroi'],
  'Post Malone': ['Posty'],
  'Yo Yo Honey Singh': ['Honey Singh'],
  'Diljit Dosanjh': ['Diljit'],
  'AP Dhillon': ['A P Dhillon'],
  'Anirudh Ravichander': ['Anirudh'],
  Ilaiyaraaja: ['Ilayaraja', 'Ilaiyaraja'],
  'The 1975': ['1975'],
  'The Killers': ['Killers'],
  'The Strokes': ['Strokes'],
  'blink-182': ['Blink 182', 'Blink'],
  'Wu-Tang Clan': ['Wu Tang Clan', 'Wu Tang'],
  'N.W.A.': ['NWA', 'N.W.A'],
  OutKast: ['Out Kast'],
  'Run-D.M.C.': ['Run DMC'],
  '50 Cent': ['Fifty Cent', 'Fiddy'],
  Eminem: ['Slim Shady', 'Marshall Mathers'],
  'Dr. Dre': ['Dr Dre', 'Dre'],
  'YoungBoy Never Broke Again': ['NBA YoungBoy', 'YoungBoy'],
  'Playboi Carti': ['Carti'],
  'Olivia Rodrigo': ['Liv Rodrigo'],
  'Billie Eilish': ['Billie'],
  'Taylor Swift': ['Tay Tay', 'Taylor', 'T Swift'],
  'Ariana Grande': ['Ari'],
  'Lady Gaga': ['Gaga'],
  'Bruno Mars': ['Bruno'],
  'Justin Bieber': ['Bieber'],
  'Selena Gomez & The Scene': ['Selena Gomez'],
  'Marshmello': ['Marshmellow'],
  'Ed Sheeran': ['Sheeran'],
  'Daddy Yankee': ['DY'],
  'Sean Paul': ['Sean Paul'],
  'The Police': ['Police'],
  'The Cure': ['Cure'],
  'The Smiths': ['Smiths'],
  'The Clash': ['Clash'],
  'The Doors': ['Doors'],
  'The Who': ['Who'],
  'The Eagles': ['Eagles'],
  Queen: ['Queen'],
  'Pink Floyd': ['Floyd'],
  'Black Sabbath': ['Sabbath'],
  'Iron Maiden': ['Maiden'],
  Metallica: ['Metalica'],
  'Foo Fighters': ['Foos'],
  'Linkin Park': ['LP'],
  'Arctic Monkeys': ['Arctic Monkey'],
};

const ALIAS_LOOKUP = new Map<string, string[]>();
for (const [canonical, aliases] of Object.entries(artistAliases)) {
  const group = unique([canonical, ...aliases].map(normalizeName).filter(Boolean));
  for (const member of group) {
    const existing = ALIAS_LOOKUP.get(member);
    ALIAS_LOOKUP.set(member, existing ? unique([...existing, ...group]) : group);
  }
}

/** Normalized artist name, canonicalized through the alias table ('ye' → 'kanye west'). */
export function normalizeArtist(s: string): string {
  const n = normalizeName(s);
  const group = ALIAS_LOOKUP.get(n);
  return group ? group[0] : n;
}

/** Every normalized spelling considered equivalent to the given artist (always includes itself). */
export function artistVariants(s: string): string[] {
  const n = normalizeName(s);
  const group = ALIAS_LOOKUP.get(n);
  return group ? unique([n, ...group]) : [n];
}

const ARTIST_SPLIT_RE =
  /\s*(?:,|&|\+|\/|;|\bfeat\.?\s+|\bft\.?\s+|\bfeaturing\s+|\bwith\s+|\bvs\.?\s+|\bversus\s+|\sx\s)\s*/i;

/** "A feat. B & C" → ['a', 'b', 'c'] (normalized, canonicalized, unique). */
export function splitArtists(s: string): string[] {
  return unique(
    s
      .split(ARTIST_SPLIT_RE)
      .map((p) => normalizeArtist(p))
      .filter(Boolean),
  );
}

const FEAT_BRACKET_RE = /[([{]\s*(?:feat|ft|featuring|with)\.?\s+([^)\]}]+)[)\]}]/gi;
const FEAT_TAIL_CAPTURE_RE = /\s+(?:feat|ft|featuring)\.?\s+(.+)$/i;

/** Featured artists mentioned in a title: "Levitating (feat. DaBaby)" → ['dababy']. */
export function featuredArtists(title: string): string[] {
  const names: string[] = [];
  for (const m of title.matchAll(FEAT_BRACKET_RE)) {
    if (m[1]) names.push(...splitArtists(m[1]));
  }
  const tail = stripAllBrackets(title).match(FEAT_TAIL_CAPTURE_RE);
  if (tail?.[1]) names.push(...splitArtists(tail[1]));
  return unique(names);
}

// ---------------------------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------------------------

export function unique<T>(arr: readonly T[]): T[] {
  return Array.from(new Set(arr));
}

export function tokens(s: string): string[] {
  return s.split(' ').filter(Boolean);
}

/** Only tokens made of ASCII letters/digits (drops Hangul/CJK/Cyrillic tokens). */
export function latinOnly(s: string): string {
  return tokens(s)
    .filter((t) => /^[a-z0-9]+$/.test(t))
    .join(' ');
}

/** Only tokens containing at least one non-ASCII letter. */
export function nonLatinOnly(s: string): string {
  return tokens(s)
    .filter((t) => !/^[a-z0-9]+$/.test(t))
    .join(' ');
}
