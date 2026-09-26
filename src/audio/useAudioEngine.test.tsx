import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getAudioEngine } from './engine';
import { useAudioEngine } from './useAudioEngine';

// jsdom has no AudioContext, so the singleton engine takes the <audio> element path here.
describe('useAudioEngine', () => {
  afterEach(() => {
    getAudioEngine().stop();
    vi.restoreAllMocks();
  });

  it('mirrors engine state, exposes the backend and controls volume', async () => {
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(() => Promise.resolve());
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
    const { result } = renderHook(() => useAudioEngine());
    expect(result.current.state).toBe('idle');
    expect(result.current.isPlaying).toBe(false);
    expect(result.current.progress).toBe(0);
    expect(result.current.volume).toBe(1);

    await act(async () => {
      await result.current.play({ url: 'https://cdnt-preview.dzcdn.net/x.mp3', offset: 0, duration: 0.05 });
    });
    expect(result.current.state).toBe('stopped');
    expect(result.current.progress).toBe(1);
    expect(result.current.backend).toBe('element');
    expect(result.current.isPlaying).toBe(false);

    act(() => result.current.setVolume(0.4));
    expect(result.current.volume).toBe(0.4);
    expect(getAudioEngine().getVolume()).toBe(0.4);
    act(() => result.current.setVolume(1));
  });

  it('unsubscribes on unmount', () => {
    const engine = getAudioEngine();
    const spy = vi.spyOn(engine, 'onState');
    const { unmount } = renderHook(() => useAudioEngine());
    expect(spy).toHaveBeenCalledTimes(1);
    unmount();
    expect(() => engine.stop()).not.toThrow();
  });
});
