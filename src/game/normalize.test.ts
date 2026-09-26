import { describe, expect, it } from 'vitest';
import {
  artistVariants,
  digitsToWords,
  featuredArtists,
  hasVersionKeyword,
  latinOnly,
  nonLatinOnly,
  normalizeArtist,
  normalizeLoose,
  normalizeName,
  normalizeTitle,
  numberVariants,
  removeVersionSegments,
  splitArtists,
  stripDiacritics,
  wordsToDigits,
} from './normalize';

describe('normalizeTitle', () => {
  const cases: Array<[string, string]> = [
    ['Blinding Lights', 'blinding lights'],
    ['Mr. Brightside', 'mr brightside'],
    ['SICKO MODE', 'sicko mode'],
    ["Don't Stop Me Now", 'dont stop me now'],
    ['Levitating (feat. DaBaby)', 'levitating'],
    ['Levitating feat. DaBaby', 'levitating'],
    ["Love Story (Taylor's Version)", 'love story'],
    ['Bohemian Rhapsody - Remastered 2011', 'bohemian rhapsody'],
    ['Blinding Lights (Remix)', 'blinding lights'],
    ['Wake Me Up - Radio Edit', 'wake me up'],
    ['I Wanna Dance with Somebody (Who Loves Me)', 'i wanna dance with somebody who loves me'],
    ['The Scientist', 'scientist'],
    ['Rock & Roll', 'rock and roll'],
    ['Beyoncé - Halo', 'beyonce - halo'.replace(' - ', ' ')],
    ['Déjà Vu', 'deja vu'],
    ['  Hello   World  ', 'hello world'],
    ['7 rings', '7 rings'],
    ['Shape of You', 'shape of you'],
    ['Song 2', 'song 2'],
    ['Stay (with Justin Bieber)', 'stay'],
    ['Hotel California - 2013 Remaster', 'hotel california'],
    ['Numb [Live]', 'numb'],
    ['Smells Like Teen Spirit (From "Nevermind")', 'smells like teen spirit'],
    ['Live', 'live'],
    ['(Remix)', 'remix'],
    ['Dynamite', 'dynamite'],
    ['봄날 (Spring Day)', '봄날 spring day'],
    ['Pt. 2', 'part 2'],
    ["Guns N' Roses", 'guns and roses'],
    ['Mötley Crüe', 'motley crue'],
    ['Sped Up Version (sped up)', 'sped up version'],
    ['Under Pressure - Remastered', 'under pressure'],
    ['THE END', 'end'],
    ['love story taylors version', 'love story'],
    ['Hotel California 2013 Remaster', 'hotel california'],
    ['Numb Remix', 'numb'],
    ['Remix', 'remix'],
    ['Stayin Alive', 'stayin alive'],
  ];
  it.each(cases)('%j → %j', (input, expected) => {
    expect(normalizeTitle(input)).toBe(expected);
  });

  it('never returns empty for non-empty input', () => {
    expect(normalizeTitle('(Live)')).toBe('live');
    expect(normalizeTitle('- Remastered')).not.toBe('');
  });
});

describe('version segment removal', () => {
  it('detects keywords on word boundaries only', () => {
    expect(hasVersionKeyword('Remastered 2011')).toBe(true);
    expect(hasVersionKeyword('feat. Drake')).toBe(true);
    expect(hasVersionKeyword("Taylor's Version")).toBe(true);
    expect(hasVersionKeyword('Who Loves Me')).toBe(false);
    expect(hasVersionKeyword('Without You')).toBe(false);
    expect(hasVersionKeyword('Editorial')).toBe(false);
  });

  it('keeps non-version parentheticals and drops version ones', () => {
    expect(removeVersionSegments('Song (Who Loves Me) (Remastered)')).toBe('Song (Who Loves Me)');
    expect(removeVersionSegments('Song - Part 2 - Live')).toBe('Song - Part 2');
  });
});

describe('artists', () => {
  it('normalizeArtist drops "the" and canonicalizes aliases', () => {
    expect(normalizeArtist('The Weeknd')).toBe('weeknd');
    expect(normalizeArtist('weeknd')).toBe('weeknd');
    expect(normalizeArtist('P!nk')).toBe(normalizeArtist('Pink'));
    expect(normalizeArtist('Ye')).toBe(normalizeArtist('Kanye West'));
    expect(normalizeArtist('Jay Z')).toBe(normalizeArtist('JAY-Z'));
    expect(normalizeArtist('Beyoncé')).toBe(normalizeArtist('beyonce'));
    expect(normalizeArtist('A$AP Rocky')).toBe(normalizeArtist('asap rocky'));
  });

  it('artistVariants includes the group members both ways', () => {
    expect(artistVariants('Kanye West')).toContain('ye');
    expect(artistVariants('ye')).toContain('kanye west');
    expect(artistVariants('Unknown Band')).toEqual(['unknown band']);
  });

  it('normalizeName does not canonicalize (search-safe)', () => {
    expect(normalizeName('Ye')).toBe('ye');
    expect(normalizeName('The Weeknd')).toBe('weeknd');
  });

  it('splitArtists splits on feat/&/,/x/with', () => {
    expect(splitArtists('A feat. B & C')).toEqual(['a', 'b', 'c']);
    expect(splitArtists('Drake, Future & 21 Savage')).toEqual(['drake', 'future', '21 savage']);
    expect(splitArtists('Lil Nas X')).toEqual(['lil nas x']);
    expect(splitArtists('Charli XCX x Lorde')).toEqual(['charli xcx', 'lorde']);
    expect(splitArtists('Silk Sonic with Bruno Mars')).toEqual(['silk sonic', 'bruno mars']);
    expect(splitArtists('Post Malone ft. Swae Lee')).toEqual(['post malone', 'swae lee']);
  });

  it('featuredArtists extracts names from titles', () => {
    expect(featuredArtists('Levitating (feat. DaBaby)')).toEqual(['dababy']);
    expect(featuredArtists('Stay (with Justin Bieber)')).toEqual(['justin bieber']);
    expect(featuredArtists('Sunflower feat. Swae Lee & Post Malone')).toEqual(['swae lee', 'post malone']);
    expect(featuredArtists('Plain Title')).toEqual([]);
  });
});

describe('numbers, loose forms, scripts', () => {
  it('maps digits ↔ words as variants only', () => {
    expect(wordsToDigits('seven rings')).toBe('7 rings');
    expect(digitsToWords('7 rings')).toBe('seven rings');
    expect(wordsToDigits('twenty one pilots')).toBe('21 pilots');
    expect(digitsToWords('22')).toBe('twenty two');
    expect(numberVariants('7 rings')).toEqual(['7 rings', 'seven rings']);
    expect(numberVariants('hello')).toEqual(['hello']);
  });

  it('normalizeLoose strips everything but letters and digits', () => {
    expect(normalizeLoose('Mr. Brightside')).toBe('mrbrightside');
    expect(normalizeLoose('I Wanna Dance with Somebody (Who Loves Me)')).toBe('iwannadancewithsomebody');
    expect(normalizeLoose("Don't Stop Me Now - Remastered")).toBe('dontstopmenow');
  });

  it('stripDiacritics handles special letters', () => {
    expect(stripDiacritics('Sigur Rós')).toBe('Sigur Ros');
    expect(stripDiacritics('Møme')).toBe('Mome');
    expect(stripDiacritics('Straße')).toBe('Strasse');
    expect(stripDiacritics('봄날')).toBe('봄날');
  });

  it('latinOnly / nonLatinOnly split mixed-script strings', () => {
    expect(latinOnly('봄날 spring day')).toBe('spring day');
    expect(nonLatinOnly('봄날 spring day')).toBe('봄날');
    expect(latinOnly('spring day')).toBe('spring day');
    expect(nonLatinOnly('spring day')).toBe('');
  });
});
