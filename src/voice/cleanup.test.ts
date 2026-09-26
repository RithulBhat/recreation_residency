import { describe, expect, it } from 'vitest';
import { cleanTranscript } from './cleanup';

describe('cleanTranscript', () => {
  const cases: ReadonlyArray<readonly [string, string]> = [
    // fillers + lead-ins
    ["um, I think it's Bohemian Rhapsody", 'Bohemian Rhapsody'],
    ['uh uh Africa', 'Africa'],
    ['Hmm, uh, Rolling in the Deep', 'Rolling in the Deep'],
    ['umm... Take On Me', 'Take On Me'],
    ['the song is Levitating', 'Levitating'],
    ['this is Smells Like Teen Spirit', 'Smells Like Teen Spirit'],
    ["it's Blinding Lights", 'Blinding Lights'],
    ["yeah so, maybe it's Mr. Brightside", 'Mr. Brightside'],
    ['MY GUESS IS Mamma Mia', 'Mamma Mia'],
    ["I'm pretty sure it's Wonderwall", 'Wonderwall'],
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

  it('documents that a leading "it\'s" is treated as filler', () => {
    // Known trade-off: "It's My Life" loses its article. The matcher is fuzzy enough.
    expect(cleanTranscript("It's My Life")).toBe('My Life');
  });

  it('never returns an empty string when the input was only filler', () => {
    expect(cleanTranscript('um')).toBe('um');
    expect(cleanTranscript("it's")).toBe("it's");
  });

  it('uses the last "by" so titles containing "by" survive', () => {
    expect(cleanTranscript('Knocking on Heavens Door by Bob Dylan')).toBe(
      'Knocking on Heavens Door - Bob Dylan',
    );
  });

  it('leaves an existing dash separator alone', () => {
    expect(cleanTranscript('Queen - Bohemian Rhapsody')).toBe('Queen - Bohemian Rhapsody');
  });

  it('is total — non-string input yields an empty string', () => {
    expect(cleanTranscript(undefined as unknown as string)).toBe('');
  });
});
