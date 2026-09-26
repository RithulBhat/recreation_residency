/**
 * `/duel` lobby, driven over the fake PeerJS network.
 *
 * The regression this file guards: the countdown used to park on 0 forever, so the full-screen
 * "GO" overlay (scroll-locked, `fixed inset-0`) covered the lobby for anyone who came back to
 * `/duel` after a race — browser Back on mobile, most often. The hand-off to `/play` must still
 * happen exactly once, on the `> 0 → 0` transition.
 */

import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router';
import type { PlayerConfig } from '@/types';
import { makeTrack } from '@/game/fixtures';
import { normalizeSettings } from '@/game/presets';
import { createDuelSession, type DuelSession } from '@/net/duel';
import type { InitMsg } from '@/net/protocol';
import { createFakeNetwork } from '@/net/testUtils/fakePeer';
import { ToastProvider } from '@/components/ui/Toast';
import { GO_LINGER_MS, resetOnlineDuel, useOnlineDuel } from '@/net/useOnlineDuel';
import Duel from './Duel';

const navigate = vi.fn();
const startLoadedGame = vi.fn();
vi.mock('react-router', async (orig) => ({
  ...(await orig<typeof import('react-router')>()),
  useNavigate: () => navigate,
}));
vi.mock('@/lib/startGame', async (orig) => ({
  ...(await orig<typeof import('@/lib/startGame')>()),
  startLoadedGame: (...args: unknown[]) => startLoadedGame(...args),
}));

const CODE = 'ABCDEF';
const hostMe: PlayerConfig = { id: 'you', name: 'Ace', emoji: '🎵', color: '#a855f7' };
const guestMe: PlayerConfig = { id: 'you', name: 'Bee', emoji: '🦊', color: '#f97316' };

let host: DuelSession | null = null;

afterEach(() => {
  host?.close();
  host = null;
  resetOnlineDuel();
  vi.useRealTimers();
  navigate.mockClear();
  startLoadedGame.mockClear();
  document.body.style.overflow = '';
});

/** Mounting the screen, as a fresh navigation to `#/duel` would. */
function lobby() {
  return render(
    <MemoryRouter initialEntries={['/duel']}>
      <ToastProvider>
        <Duel />
      </ToastProvider>
    </MemoryRouter>,
  );
}

function initFor(seed: string): InitMsg {
  return {
    type: 'init',
    settings: normalizeSettings({ mode: 'fixed', clipMode: 'fixed', rounds: 1, seed }),
    tracks: [makeTrack({ id: 1, title: 'Hello', artist: 'Adele' })],
  };
}

describe('/duel — countdown hand-off', () => {
  it('readies up, hands off to /play once, and leaves no overlay behind on a later visit', async () => {
    vi.useFakeTimers();
    const net = createFakeNetwork();
    host = createDuelSession({ role: 'host', code: CODE, me: hostMe, peerFactory: net.peerFactory });
    await act(async () => {
      await net.flush();
    });

    const api = renderHook(() => useOnlineDuel()).result;
    act(() => api.current.join(CODE, guestMe, { peerFactory: net.peerFactory }));
    await act(async () => {
      await net.flush();
    });

    const view = lobby();
    expect(screen.getByTestId('duel-leave')).toBeInTheDocument();
    expect(screen.queryByTestId('duel-countdown')).toBeNull();

    /* ---- the host's setup arrives; the guest readies (state lives in the duel store) ---- */
    await act(async () => {
      host?.send(initFor('race-1'));
      await net.flush();
    });
    expect(screen.getByTestId('duel-summary')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('duel-ready'));
    expect(api.current.myReady).toBe(true);
    expect(screen.getByTestId('duel-guest-ready')).toBeInTheDocument();

    /* ---- 3-2-1: the overlay owns the screen ---- */
    await act(async () => {
      host?.send({ type: 'start', startAt: Date.now() + 3000 });
      await net.flush();
    });
    expect(screen.getByTestId('duel-countdown')).toBeInTheDocument();
    expect(document.body.style.overflow).toBe('hidden');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3200);
    });
    expect(startLoadedGame).toHaveBeenCalledTimes(1);
    expect(startLoadedGame).toHaveBeenCalledWith(api.current.initPayload);
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith('/play');
    // "GO" is still up for a beat, which is the whole point of the 0 frame.
    expect(screen.getByTestId('duel-countdown')).toBeInTheDocument();

    /* ---- the app is on /play now; the countdown lets go of itself ---- */
    view.unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(GO_LINGER_MS + 100);
    });
    expect(api.current.countdown).toBeNull();
    expect(api.current.startAt).toBeNull();
    expect(document.body.style.overflow).not.toBe('hidden');

    /* ---- browser Back → the connected lobby, no overlay, Leave reachable ---- */
    lobby();
    expect(screen.queryByTestId('duel-countdown')).toBeNull();
    expect(screen.getByTestId('duel-leave')).toBeEnabled();
    expect(document.body.style.overflow).not.toBe('hidden');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    // No second hand-off: a countdown this mount never watched must not start anything.
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(startLoadedGame).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('duel-countdown')).toBeNull();
  });

  it('re-arms cleanly for a rematch: a new init clears my readiness and the countdown runs again', async () => {
    vi.useFakeTimers();
    const net = createFakeNetwork();
    host = createDuelSession({ role: 'host', code: CODE, me: hostMe, peerFactory: net.peerFactory });
    await act(async () => {
      await net.flush();
    });
    const api = renderHook(() => useOnlineDuel()).result;
    act(() => api.current.join(CODE, guestMe, { peerFactory: net.peerFactory }));
    await act(async () => {
      await net.flush();
    });
    const first = lobby();

    // race 1, all the way through the countdown
    await act(async () => {
      host?.send(initFor('race-1'));
      await net.flush();
    });
    fireEvent.click(screen.getByTestId('duel-ready'));
    await act(async () => {
      host?.send({ type: 'start', startAt: Date.now() + 3000 });
      await net.flush();
      await vi.advanceTimersByTimeAsync(3200 + GO_LINGER_MS);
    });
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(api.current.countdown).toBeNull();
    first.unmount();

    // back in the lobby afterwards: connected, no overlay, and the setup that was just played
    lobby();
    expect(screen.queryByTestId('duel-countdown')).toBeNull();
    expect(screen.getByTestId('duel-summary')).toBeInTheDocument();

    // rematch: a fresh init makes the guest ready up again, and a new countdown arms
    await act(async () => {
      host?.send(initFor('race-2'));
      await net.flush();
    });
    expect(api.current.myReady).toBe(false);
    expect(screen.getByTestId('duel-ready')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('duel-ready'));
    expect(api.current.myReady).toBe(true);

    await act(async () => {
      host?.send({ type: 'start', startAt: Date.now() + 3000 });
      await net.flush();
    });
    expect(api.current.countdown).toBe(3);
    expect(screen.getByTestId('duel-countdown')).toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3200);
    });
    expect(navigate).toHaveBeenCalledTimes(2);
    expect(startLoadedGame).toHaveBeenLastCalledWith(api.current.initPayload);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(GO_LINGER_MS + 100);
    });
    expect(api.current.countdown).toBeNull();
  });
});
