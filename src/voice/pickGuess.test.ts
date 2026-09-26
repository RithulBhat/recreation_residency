import { describe, expect, it } from 'vitest';
import type { Track } from '@/types';
import { cleanTranscript } from './cleanup';
import { pickVoiceGuess, voiceGuessCandidates } from './pickGuess';

function track(title: string, artist: string): Track {
  return { id: 1, title, titleFull: title, artist, artistId: 1, album: 'A', albumId: 1, cover: '', coverBig: '', preview: 'x', previewFetchedAt: 0, duration: 200, rank: 1, explicit: false };
}

/** What the Play screen receives from `useVoiceGuess` for a spoken phrase. */
function spoken(raw: string): [string, string] {
  return [cleanTranscript(raw), raw];
}

describe('voiceGuessCandidates', () => {
  it('orders cleaned, un-rewritten, raw and dedupes', () => {
    expect(voiceGuessCandidates(...spoken('Stand By Me'))).toEqual(['Stand - Me', 'Stand By Me']);
    expect(voiceGuessCandidates(...spoken("um it's my life"))).toEqual(["it's my life", "um it's my life"]);
    expect(voiceGuessCandidates(...spoken('Africa'))).toEqual(['Africa']);
    expect(voiceGuessCandidates('', '')).toEqual([]);
  });
});

describe('pickVoiceGuess', () => {
  // The audit's reproductions: every one of these used to burn a try.
  it.each([
    ["it's my life", "It's My Life", 'Bon Jovi'],
    ['this is america', 'This Is America', 'Childish Gambino'],
    ['this is america by childish gambino', 'This Is America', 'Childish Gambino'],
    ['stand by me', 'Stand By Me', 'Ben E. King'],
    ['stand by me by ben e king', 'Stand By Me', 'Ben E. King'],
    ['all by myself', 'All By Myself', 'Celine Dion'],
    ["that's the way love goes", "That's The Way Love Goes", 'Janet Jackson'],
    ['like a prayer', 'Like a Prayer', 'Madonna'],
    ['is this love', 'Is This Love', 'Whitesnake'],
    ['so anxious', 'So Anxious', 'Ginuwine'],
    ['oh no', 'Oh No', 'Capone'],
    ["um, i think it's it's my life", "It's My Life", 'Bon Jovi'],
  ])('%s → correct for "%s"', (raw, title, artist) => {
    const t = track(title, artist);
    const picked = pickVoiceGuess(...spoken(raw), t, 'title');
    expect(picked.length).toBeGreaterThan(0);
    // The submitted text must be accepted by the matcher for the very track it was picked against.
    expect(pickVoiceGuess(...spoken(raw), t, 'both')).toBe(picked);
  });

  it('prefers the cleaned form when it matches', () => {
    const t = track('Bohemian Rhapsody', 'Queen');
    expect(pickVoiceGuess(...spoken("um, I think it's Bohemian Rhapsody by Queen"), t, 'both')).toBe('Bohemian Rhapsody - Queen');
  });

  it('falls back to the un-rewritten form when the cleaned one would be wrong', () => {
    const t = track('Stand By Me', 'Ben E. King');
    expect(pickVoiceGuess(...spoken('stand by me'), t, 'title')).toBe('stand by me');
  });

  it('takes a partial (artist-only) candidate over a wrong cleaned one', () => {
    const t = track('Levitating', 'Dua Lipa');
    // Cleaned "Levitate - Dua Lipa"? No: "dua lipa" is only ever artist here, so the pick is partial.
    expect(pickVoiceGuess(...spoken('dua lipa'), t, 'both')).toBe('dua lipa');
  });

  it('returns the cleaned text when nothing matches', () => {
    const t = track('Levitating', 'Dua Lipa');
    expect(pickVoiceGuess(...spoken("um, it's definitely not this one"), t, 'title')).toBe("it's definitely not this one");
  });

  it('returns the raw text when cleanup left nothing', () => {
    const t = track('Levitating', 'Dua Lipa');
    expect(pickVoiceGuess('', '  hmm  ', t, 'title')).toBe('hmm');
  });
});
