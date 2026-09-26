import { describe, expect, it } from 'vitest';
import { cleanTranscript, cleanTranscriptCandidates } from './cleanup';

describe('cleanTranscript', () => {
  const cases: ReadonlyArray<readonly [string, string]> = [
    // fillers + lead-ins
    ["um, I think it's Bohemian Rhapsody", 'Bohemian Rhapsody'],
    ['uh uh Africa', 'Africa'],
    ['Hmm, uh, Rolling in the Deep', 'Rolling in the Deep'],
    ['umm... Take On Me', 'Take On Me'],
    ['er, Take On Me', 'Take On Me'],
    ['the song is Levitating', 'Levitating'],
    ['the answer is Levitating', 'Levitating'],
    ["it's called Levitating", 'Levitating'],
    ['is it called Levitating', 'Levitating'],
    ["maybe it's Mr. Brightside", 'Mr. Brightside'],
    ['okay, Mr. Brightside', 'Mr. Brightside'],
    ['MY GUESS IS Mamma Mia', 'Mamma Mia'],
    ["I'm pretty sure it's Wonderwall", 'Wonderwall'],
    ['I know this one, Wonderwall', 'Wonderwall'],
    // trailing hedges
    ['Thriller, I think', 'Thriller'],
    ['Africa or something', 'Africa'],
    ['Hotel California, final answer', 'Hotel California'],
    // "by" becomes the artist separator
    ['Bohemian Rhapsody by Queen', 'Bohemian Rhapsody - Queen'],
    ["I think it's Stand by Me by Ben E King", 'Stand by Me - Ben E King'],
    ['Billie Jean performed by Michael Jackson', 'Billie Jean - Michael Jackson'],
    // spoken punctuation
    ['Hey Ya exclamation mark', 'Hey Ya!'],
    ['Hello question mark', 'Hello?'],
    ['P dot Y dot T', 'P.Y.T'],
    ['Sonny ampersand Cher', 'Sonny & Cher'],
    ['twenty one pilots dash Stressed Out', 'twenty one pilots - Stressed Out'],
    ["Don't Stop Believin comma I think", "Don't Stop Believin"],
    ['Rock n apostrophe Roll', "Rock n' Roll"],
    // whitespace + quotes + unicode
    ['   lots    of   spaces   ', 'lots of spaces'],
    ['"Toxic"', 'Toxic'],
    ['Don’t Stop Me Now', "Don't Stop Me Now"],
    // things we must NOT mangle
    ['Call Me Maybe', 'Call Me Maybe'],
    ['P.S. I Love You', 'P.S. I Love You'],
    ['Mr. Right', 'Mr. Right'],
    ['', ''],
  ];

  for (const [input, expected] of cases) {
    it(`cleans ${JSON.stringify(input)} -> ${JSON.stringify(expected)}`, () => {
      expect(cleanTranscript(input)).toBe(expected);
    });
  }

  // Real titles that open with what used to be treated as filler (audit P1-1).
  const realTitles = [
    "It's My Life",
    'Its My Life',
    'This Is America',
    "That's The Way Love Goes",
    'That Is Love',
    'Like a Prayer',
    'Is This Love',
    'Is It Love',
    "It's Gonna Be Me",
    'So Anxious',
    'Oh No',
    'Yeah!',
    'Well Well Well',
    'Alright',
    'It Must Be Love',
    'Could It Be Magic',
    'Sounds Like Rain',
  ];
  for (const title of realTitles) {
    it(`keeps the title-like opener in ${JSON.stringify(title)}`, () => {
      expect(cleanTranscript(title)).toBe(title);
    });
  }

  it('still strips true fillers in front of a title-like opener', () => {
    expect(cleanTranscript("um, I think it's It's My Life")).toBe("It's My Life");
    expect(cleanTranscript('the song is This Is America')).toBe('This Is America');
  });

  it('never returns an empty string when the input was only filler', () => {
    expect(cleanTranscript('um')).toBe('um');
    expect(cleanTranscript('okay')).toBe('okay');
    expect(cleanTranscript("it's")).toBe("it's");
  });

  it('uses the last "by" so titles containing "by" survive', () => {
    expect(cleanTranscript('Knocking on Heavens Door by Bob Dylan')).toBe(
      'Knocking on Heavens Door - Bob Dylan',
    );
  });

  it('only rewrites "by" when both sides carry a word', () => {
    expect(cleanTranscript('by Queen')).toBe('by Queen');
    expect(cleanTranscript('Bohemian Rhapsody by')).toBe('Bohemian Rhapsody by');
    expect(cleanTranscript('Bohemian Rhapsody by ?')).toBe('Bohemian Rhapsody by?');
  });

  it('leaves an existing dash separator alone', () => {
    expect(cleanTranscript('Queen - Bohemian Rhapsody')).toBe('Queen - Bohemian Rhapsody');
    expect(cleanTranscript('Queen - Stand by Me')).toBe('Queen - Stand by Me');
  });

  it('is total — non-string input yields an empty string', () => {
    expect(cleanTranscript(undefined as unknown as string)).toBe('');
  });
});

describe('cleanTranscriptCandidates', () => {
  it('offers the un-rewritten "by" form as a second candidate', () => {
    expect(cleanTranscriptCandidates('Stand By Me')).toEqual(['Stand - Me', 'Stand By Me']);
    expect(cleanTranscriptCandidates('this is america by childish gambino')).toEqual([
      'this is america - childish gambino',
      'this is america by childish gambino',
    ]);
    expect(cleanTranscriptCandidates("I think it's Stand by Me by Ben E King")).toEqual([
      'Stand by Me - Ben E King',
      'Stand by Me by Ben E King',
    ]);
  });

  it('collapses to a single candidate when there is nothing to rewrite', () => {
    expect(cleanTranscriptCandidates("um, it's my life")).toEqual(["it's my life"]);
    expect(cleanTranscriptCandidates('Queen - Bohemian Rhapsody')).toEqual(['Queen - Bohemian Rhapsody']);
  });

  it('never yields empty strings and is total', () => {
    expect(cleanTranscriptCandidates('')).toEqual([]);
    expect(cleanTranscriptCandidates('   ')).toEqual([]);
    expect(cleanTranscriptCandidates('um')).toEqual(['um']);
    expect(cleanTranscriptCandidates(undefined as unknown as string)).toEqual([]);
  });
});
