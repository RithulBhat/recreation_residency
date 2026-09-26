import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Track } from '@/types';
import { makeTrack } from '@/game/fixtures';

const getTrack = vi.fn<(id: number, opts?: { fresh?: boolean }) => Promise<Track>>();
vi.mock('@/lib/deezer', async (orig) => ({
  ...(await orig<typeof import('@/lib/deezer')>()),
  getTrack: (id: number, opts?: { fresh?: boolean }) => getTrack(id, opts),
}));

import { clearTrackDetails, mergeTrackDetail, resolveTrackDetail, withTrackDetail } from './trackDetails';

/** A preview url signed to expire `inSec` seconds from now. */
function signed(id: number, inSec: number): string {
  return `https://cdnt-preview.dzcdn.net/${id}.mp3?hdnea=exp=${Math.floor(Date.now() / 1000) + inSec}~acl=x`;
}

beforeEach(() => {
  clearTrackDetails();
  getTrack.mockReset();
});
afterEach(() => vi.restoreAllMocks());

describe('mergeTrackDetail', () => {
  it('takes the year, bpm and a returned preview, keeps catalog fields', () => {
    const known = makeTrack({ id: 7, packId: 'pop-hits', album: 'After Hours', preview: '' });
    const detail = makeTrack({ id: 7, releaseYear: 2019, bpm: 171, preview: signed(7, 900), previewFetchedAt: 123, album: '' });
    const merged = mergeTrackDetail(known, detail);
    expect(merged).toMatchObject({ id: 7, packId: 'pop-hits', album: 'After Hours', releaseYear: 2019, bpm: 171, previewFetchedAt: 123 });
    expect(merged.preview).toBe(detail.preview);
    // no preview in the answer → ours stays
    expect(mergeTrackDetail({ ...known, preview: 'keep' }, { ...detail, preview: '' }).preview).toBe('keep');
  });
});

describe('resolveTrackDetail', () => {
  it('looks a track up once, remembers the year and answers from memory afterwards', async () => {
    const track = makeTrack({ id: 7, preview: signed(7, 3600) });
    getTrack.mockResolvedValueOnce(makeTrack({ id: 7, preview: signed(7, 3600), releaseYear: 2019 }));
    const first = await resolveTrackDetail(track);
    expect(first.releaseYear).toBe(2019);
    expect(getTrack).toHaveBeenCalledWith(7, { fresh: false }); // preview was fresh: a cached detail is fine
    const second = await resolveTrackDetail(track);
    expect(second.releaseYear).toBe(2019);
    expect(getTrack).toHaveBeenCalledTimes(1);
    expect(withTrackDetail(track).releaseYear).toBe(2019);
  });

  it('asks for a fresh signature when the preview is stale', async () => {
    const stale = makeTrack({ id: 8, preview: signed(8, -10) });
    getTrack.mockResolvedValueOnce(makeTrack({ id: 8, preview: signed(8, 3600), releaseYear: 2001 }));
    const t = await resolveTrackDetail(stale);
    expect(getTrack).toHaveBeenCalledWith(8, { fresh: true });
    expect(t.preview).toBe(signed(8, 3600));
    expect(t.releaseYear).toBe(2001);
  });

  it('falls back to the playable track we hold when the lookup fails, and rethrows when it does not', async () => {
    const fresh = makeTrack({ id: 9, preview: signed(9, 3600) });
    getTrack.mockRejectedValueOnce(new Error('rate limited'));
    await expect(resolveTrackDetail(fresh)).resolves.toMatchObject({ id: 9, preview: fresh.preview });
    const stale = makeTrack({ id: 10, preview: signed(10, -10) });
    getTrack.mockRejectedValueOnce(new Error('gone'));
    await expect(resolveTrackDetail(stale)).rejects.toThrow('gone');
  });
});
