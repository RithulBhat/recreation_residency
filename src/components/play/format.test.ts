import { describe, expect, it } from 'vitest';
import { clipLabel, clock, displayTitle, points } from './format';

describe('displayTitle', () => {
  it('drops featured credits and version suffixes', () => {
    expect(displayTitle('SHE DID IT AGAIN (feat. Zeze Millz)')).toBe('SHE DID IT AGAIN');
    expect(displayTitle('Industry Baby [feat. Jack Harlow]')).toBe('Industry Baby');
    expect(displayTitle('Come Together - Remastered 2009')).toBe('Come Together');
    expect(displayTitle('Come Together (2009 Remaster)')).toBe('Come Together');
    expect(displayTitle('Levitating (feat. DaBaby) - Radio Edit')).toBe('Levitating');
    expect(displayTitle('Bohemian Rhapsody - Live at Wembley')).toBe('Bohemian Rhapsody');
    expect(displayTitle('Flowers (From "Barbie The Album")')).toBe('Flowers');
    expect(displayTitle('Christina Aguilera (Expanded Edition)')).toBe('Christina Aguilera');
    expect(displayTitle('Rumours (Super Deluxe)')).toBe('Rumours');
    expect(displayTitle('Thriller (25th Anniversary Edition)')).toBe('Thriller');
  });

  it('keeps remixes and titles that merely contain the words', () => {
    expect(displayTitle('One More Time (Daft Punk Remix)')).toBe('One More Time (Daft Punk Remix)');
    expect(displayTitle('Stayin’ Alive')).toBe('Stayin’ Alive');
    expect(displayTitle('Live Forever')).toBe('Live Forever');
    expect(displayTitle('With or Without You')).toBe('With or Without You');
  });

  it('falls back to the original when nothing would be left', () => {
    expect(displayTitle('(feat. Someone)')).toBe('(feat. Someone)');
    expect(displayTitle('  ')).toBe('');
  });
});

describe('labels', () => {
  it('formats clips, points and clocks', () => {
    expect(clipLabel(0.1)).toBe('0.1s');
    expect(clipLabel(2.5)).toBe('2.5s');
    expect(clipLabel(0)).toBe('—');
    expect(points(6420)).toBe('6,420');
    expect(clock(65_000)).toBe('1:05');
  });
});
