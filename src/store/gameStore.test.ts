import { beforeEach, describe, expect, it } from 'vitest';
import { makeTrack } from '@/game/fixtures';
import { normalizeSettings } from '@/game/presets';
import { currentRound } from '@/game/selectors';
import { newlyEndedRounds, onFinished, onRoundOver, useGameStore } from './gameStore';

const pool = [1, 2, 3].map((id) => makeTrack({ id, title: `Track ${id}` }));

describe('gameStore', () => {
  beforeEach(() => useGameStore.getState().reset());

  it('starts idle and stamps `now` when omitted', () => {
    expect(useGameStore.getState().state.status).toBe('idle');
    const before = Date.now();
    useGameStore.getState().start(normalizeSettings({ mode: 'classic', seed: 'store' }), pool);
    const s = useGameStore.getState().state;
    expect(s.status).toBe('playing');
    expect(s.startedAt).toBeGreaterThanOrEqual(before);
    expect(s.rounds[0].startedAt).toBeGreaterThanOrEqual(before);
  });

  it('convenience actions dispatch through the reducer', () => {
    const st = useGameStore.getState();
    st.start(normalizeSettings({ mode: 'classic', stages: [0.1, 1, 2], seed: 'store' }), pool);
    st.play();
    expect(currentRound(useGameStore.getState().state)!.playsThisTry).toBe(1);
    st.hint('firstLetter');
    expect(currentRound(useGameStore.getState().state)!.hintsUsed).toEqual(['firstLetter']);
    st.skip();
    expect(currentRound(useGameStore.getState().state)!.tryIndex).toBe(1);
    st.guess(currentRound(useGameStore.getState().state)!.track.title);
    expect(useGameStore.getState().state.status).toBe('round-over');
    st.next();
    expect(useGameStore.getState().state.currentRound).toBe(1);
    st.giveUp();
    st.next();
    st.quit();
    expect(useGameStore.getState().state.status).toBe('finished');
    expect(useGameStore.getState().state.endReason).toBe('quit');
  });

  it('does not emit a new state for no-op actions', () => {
    const st = useGameStore.getState();
    st.start(normalizeSettings({ mode: 'classic', seed: 'store' }), pool);
    const before = useGameStore.getState().state;
    st.buzz('you');
    st.next();
    st.guess('   ');
    expect(useGameStore.getState().state).toBe(before);
  });

  it('is deterministic per seed across store restarts', () => {
    const st = useGameStore.getState();
    st.start(normalizeSettings({ mode: 'classic', seed: 'determinism' }), pool);
    const a = useGameStore.getState().state;
    st.reset();
    st.start(normalizeSettings({ mode: 'classic', seed: 'determinism' }), pool);
    const b = useGameStore.getState().state;
    expect(a.id).toBe(b.id);
    expect(a.rounds[0].track.id).toBe(b.rounds[0].track.id);
    expect(a.rounds[0].startOffset).toBe(b.rounds[0].startOffset);
  });

  it('onRoundOver fires once per ended round (incl. blitz auto-advance); onFinished once', () => {
    const ended: string[] = [];
    const finished: string[] = [];
    const off = onRoundOver((r) => ended.push(`${r.index}:${r.status}`));
    const offF = onFinished((s) => finished.push(s.endReason ?? '?'));
    const st = useGameStore.getState();
    st.start(normalizeSettings({ mode: 'blitz', blitzDuration: 60, seed: 'store' }), pool);
    st.guess(currentRound(useGameStore.getState().state)!.track.title, undefined, Date.now());
    st.guess('wrong');
    expect(ended).toEqual(['0:won', '1:lost']);
    st.tick(Date.now() + 120000);
    expect(finished).toEqual(['time']);
    expect(ended).toEqual(['0:won', '1:lost', '2:skipped']);
    off();
    offF();
    st.start(normalizeSettings({ mode: 'classic', seed: 'store' }), pool);
    st.giveUp();
    expect(ended).toHaveLength(3);
  });

  it('newlyEndedRounds ignores unrelated updates and other games', () => {
    const st = useGameStore.getState();
    st.start(normalizeSettings({ mode: 'classic', seed: 'a' }), pool);
    const a = useGameStore.getState().state;
    expect(newlyEndedRounds(a, a)).toEqual([]);
    st.giveUp();
    const b = useGameStore.getState().state;
    expect(newlyEndedRounds(a, b).map((r) => r.index)).toEqual([0]);
    st.start(normalizeSettings({ mode: 'classic', seed: 'b' }), pool);
    st.giveUp();
    const c = useGameStore.getState().state;
    expect(newlyEndedRounds(b, c).map((r) => r.index)).toEqual([0]);
  });
});
