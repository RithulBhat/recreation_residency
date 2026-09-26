import { describe, expect, it } from 'vitest';
import { clipEmbedUrl } from '@/data/nfl';
import { tapeEmbedUrl } from './WatchTape';
import { isEmbedBlocked, posterUrl, watchUrl } from './youtubeApi';

describe('tapeEmbedUrl', () => {
  it('keeps the privacy-friendly embed and adds only what the API needs', () => {
    const url = tapeEmbedUrl('abc123XYZ_-');
    expect(url.startsWith(clipEmbedUrl('abc123XYZ_-', { autoplay: true }))).toBe(true);
    expect(url).toContain('youtube-nocookie.com/embed/abc123XYZ_-');
    expect(url).toContain('enablejsapi=1');
  });

  it('escapes a video id rather than pasting it into the URL', () => {
    expect(tapeEmbedUrl('a b&c')).toContain('embed/a%20b%26c');
  });
});

describe('isEmbedBlocked', () => {
  it('treats every "this will never play here" code as blocked', () => {
    for (const code of [2, 5, 100, 101, 150]) expect(isEmbedBlocked(code)).toBe(true);
  });
  it('leaves unknown codes alone rather than hiding a working player', () => {
    expect(isEmbedBlocked(0)).toBe(false);
    expect(isEmbedBlocked(999)).toBe(false);
  });
});

describe('poster and watch urls', () => {
  it('points at YouTube’s own thumbnail and watch page', () => {
    expect(posterUrl('xyz')).toBe('https://i.ytimg.com/vi/xyz/hqdefault.jpg');
    expect(watchUrl('xyz')).toBe('https://www.youtube.com/watch?v=xyz');
    expect(watchUrl('a b')).toBe('https://www.youtube.com/watch?v=a%20b');
  });
});
