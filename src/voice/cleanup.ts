/**
 * Turn a raw speech transcript into something the guess matcher can use.
 *
 * Speech engines hand us conversational sentences ("um, I think it's Bohemian
 * Rhapsody by Queen") where the game wants a bare guess ("Bohemian Rhapsody -
 * Queen"). This module is pure and framework-free so it can be unit tested.
 */

/** Hesitation noises that are never part of a song title — stripped anywhere. */
const HESITATIONS = /\b(?:u+m+|u+h+m+|e+r+m+|h+m+|m+h+m+|ahem)\b/gi;

/**
 * Conversational lead-ins, longest first (JS alternation is first-match).
 * Applied repeatedly at the head of the string, never down to empty.
 */
const LEAD_IN_PARTS = [
  "i(?:'m| am) (?:pretty |fairly |really |quite )?sure (?:it(?:'s| is)|that(?:'s| is)|its)",
  "i(?:'m| am) (?:pretty |fairly |really |quite )?sure",
  "i think (?:it(?:'s| is)|its|that(?:'s| is)|the (?:song|answer|title|track) is)",
  'i think',
  "i(?:'d| would| will|'ll) say",
  'my (?:final answer|guess|answer) is',
  "the (?:song|title|track|answer|name)(?:'s| is)",
  'that (?:would|must|might|could) be',
  'it (?:must|might|could|has to|gotta) be',
  "it(?:'s| is)|its",
  "that(?:'s| is)",
  'this is',
  'is (?:it|this)',
  'could (?:it|this) be',
  'sounds like',
  'i know this(?: one)?',
  "maybe it(?:'s| is)",
  'obviously|definitely|probably|maybe',
  'okay|ok|so|well|oh|uh|er|like|yeah|yep|yup|alright',
];
const LEAD_IN = new RegExp(`^(?:${LEAD_IN_PARTS.join('|')})\\b[\\s,.!?:;-]*`, 'i');

/**
 * Trailing hedges. Deliberately excludes "maybe" and "right" — "Call Me Maybe"
 * and "Mr. Right" are real titles.
 */
const TAIL = new RegExp(
  `[\\s,.!?:;-]*\\b(?:${[
    'i think',
    'i guess',
    'i believe',
    "i(?:'m| am) not sure",
    'not sure',
    'or something(?: like that)?',
    'or whatever',
    'for sure',
    'final answer',
    'u+m+',
    'u+h+',
    'h+m+',
  ].join('|')})[\\s,.!?:;]*$`,
  'i',
);

/** Verbs that turn "X <verb> by Y" into the plain "X by Y" form. */
const BY_VERBS = /\b(?:performed|sung|sang|played|written|recorded|covered|produced)\s+by\b/gi;

/** Spoken punctuation → symbol, longest phrase first. */
const SPOKEN_PUNCTUATION: ReadonlyArray<readonly [string, string]> = [
  ['exclamation mark', '!'],
  ['exclamation point', '!'],
  ['question mark', '?'],
  ['quotation mark', '"'],
  ['open parenthesis', '('],
  ['close parenthesis', ')'],
  ['open paren', '('],
  ['close paren', ')'],
  ['forward slash', '/'],
  ['dollar sign', '$'],
  ['percent sign', '%'],
  ['plus sign', '+'],
  ['at sign', '@'],
  ['pound sign', '#'],
  ['number sign', '#'],
  ['hash tag', '#'],
  ['hashtag', '#'],
  ['ampersand', '&'],
  ['asterisk', '*'],
  ['apostrophe', "'"],
  ['underscore', '_'],
  ['semicolon', ';'],
  ['hyphen', '-'],
  ['dash', '-'],
  ['comma', ','],
  ['period', '.'],
  ['colon', ':'],
  ['dot', '.'],
];

const PUNCTUATION_RULES: ReadonlyArray<readonly [RegExp, string]> = SPOKEN_PUNCTUATION.map(
  ([phrase, symbol]) => [new RegExp(`\\b${phrase.replace(/ /g, '\\s+')}\\b`, 'gi'), symbol] as const,
);

function normalizeQuotes(input: string): string {
  return input
    .normalize('NFKC')
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-');
}

function collapse(input: string): string {
  return input.replace(/\s+/g, ' ').trim();
}

/** Punctuation left behind once a filler is removed ("hmm, uh, Africa"). */
const LEADING_JUNK = /^[\s,.;:!?-]+/;

function stripLeadIns(input: string): string {
  let s = input.replace(LEADING_JUNK, '');
  for (let guard = 0; guard < 8; guard += 1) {
    const match = LEAD_IN.exec(s);
    if (!match || match[0].length === 0) break;
    const rest = s.slice(match[0].length).replace(LEADING_JUNK, '').trim();
    // Never strip the whole guess away — "It's" alone stays "It's".
    if (rest.length === 0) break;
    s = rest;
  }
  return s;
}

function stripTails(input: string): string {
  let s = input;
  for (let guard = 0; guard < 8; guard += 1) {
    const next = s.replace(TAIL, '').trim();
    if (next === s || next.length === 0) break;
    s = next;
  }
  return s;
}

function applyPunctuation(input: string): string {
  let s = input;
  for (const [re, symbol] of PUNCTUATION_RULES) s = s.replace(re, ` ${symbol} `);
  s = collapse(s);
  // Tighten punctuation back onto the word it belongs to.
  s = s.replace(/\s+([,.!?;:)\]}%])/g, '$1');
  s = s.replace(/([([{@#$])\s+/g, '$1');
  // A spoken apostrophe belongs to the word before it: "rock n apostrophe roll".
  s = s.replace(/([A-Za-z0-9])\s+'/g, "$1'");
  s = s.replace(/\s+&\s+/g, ' & ');
  // Join spoken initialisms: "p dot y dot t" -> "p.y.t", but leave "P.S. I Love You".
  s = s.replace(
    /\b[A-Za-z]\.(?:\s*[A-Za-z]\.)+(?:\s*[A-Za-z](?!\s*[A-Za-z]))?/g,
    (m) => m.replace(/\s+/g, ''),
  );
  return collapse(s);
}

/** "X by Y" -> "X - Y", using the LAST " by " so "Stand by Me by Ben E King" works. */
function applyBySeparator(input: string): string {
  if (input.includes(' - ')) return input;
  let last: { index: number; length: number } | null = null;
  for (const match of input.matchAll(/\s+by\s+/gi)) {
    if (match.index === undefined) continue;
    last = { index: match.index, length: match[0].length };
  }
  if (!last) return input;
  const left = input.slice(0, last.index).trim();
  const right = input.slice(last.index + last.length).trim();
  if (left.length === 0 || right.length === 0) return input;
  return `${left} - ${right}`;
}

function trimEdges(input: string): string {
  return input.replace(/^[\s,;:.\-]+/, '').replace(/[\s,;:\-]+$/, '').trim();
}

function unwrapQuotes(input: string): string {
  const match = /^"(.+)"$/.exec(input);
  return match ? match[1].trim() : input;
}

/**
 * Clean a spoken guess.
 *
 * - drops fillers and conversational lead-ins/hedges
 * - turns spoken punctuation into symbols
 * - rewrites "title by artist" as "title - artist"
 * - collapses whitespace
 *
 * Casing is preserved; the matcher is responsible for case folding.
 */
export function cleanTranscript(t: string): string {
  if (typeof t !== 'string') return '';
  let s = collapse(normalizeQuotes(t));
  if (s.length === 0) return '';

  s = unwrapQuotes(s);
  s = s.replace(BY_VERBS, 'by');
  s = collapse(s.replace(HESITATIONS, ' '));
  s = stripLeadIns(s);
  s = stripTails(s);
  s = applyPunctuation(s);
  s = applyBySeparator(s);
  s = trimEdges(collapse(s));

  // A guess that cleaned down to nothing means the filler *was* the guess.
  return s.length > 0 ? s : collapse(normalizeQuotes(t));
}
