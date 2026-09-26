import { createRef } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createInitialState, reduce } from '@/game/engine';
import { makeTrack } from '@/game/fixtures';
import { normalizeSettings } from '@/game/presets';
import type { GameState } from '@/types';
import { HintMenu, UsedHints, type HintMenuHandle } from './HintMenu';

function game(overrides: Record<string, unknown> = {}): GameState {
  const settings = normalizeSettings({ mode: 'fixed', clipMode: 'fixed', clipLength: 1, tries: 3, rounds: 2, hintsEnabled: true, seed: 'h', ...overrides });
  const tracks = [makeTrack({ id: 1, releaseYear: 2019 }), makeTrack({ id: 2, title: 'Bravo', releaseYear: 2001 })];
  return reduce(createInitialState(), { type: 'start', settings, tracks, now: 1000 });
}

describe('HintMenu', () => {
  it('is one button that opens the hint kinds; picking one asks for the hint and closes', async () => {
    const s = game();
    const onHint = vi.fn();
    render(<HintMenu settings={s.settings} round={s.rounds[0]} onHint={onHint} />);
    const button = screen.getByTestId('hint-button');
    expect(button).toHaveAccessibleName('Hints, 2 left, each costs 15 percent');
    expect(screen.queryByTestId('hint-menu')).toBeNull();
    fireEvent.click(button);
    expect(screen.getByRole('dialog', { name: 'Hints' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Release year hint/ }));
    expect(onHint).toHaveBeenCalledWith('year');
    expect(button).toHaveAttribute('aria-expanded', 'false');
    await waitFor(() => expect(screen.queryByTestId('hint-menu')).toBeNull());
  });

  it('opens through its handle (the H key) and moves focus into the list; Escape hands it back', async () => {
    const s = game();
    const ref = createRef<HintMenuHandle>();
    render(<HintMenu ref={ref} settings={s.settings} round={s.rounds[0]} onHint={() => undefined} />);
    act(() => ref.current?.open());
    expect(screen.getByRole('dialog', { name: 'Hints' })).toBeInTheDocument();
    await act(async () => {
      await new Promise((r) => requestAnimationFrame(() => r(undefined)));
    });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: /Release year hint/ }));
    fireEvent.keyDown(screen.getByRole('dialog', { name: 'Hints' }), { key: 'ArrowDown' });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: /Artist initials hint/ }));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(document.activeElement).toBe(screen.getByTestId('hint-button'));
    await waitFor(() => expect(screen.queryByTestId('hint-menu')).toBeNull());
  });

  it('renders nothing without a hint budget (blitz) and lists taken hints as chips', () => {
    const blitz = game({ mode: 'blitz', blitzDuration: 60, rounds: 0 });
    const { container } = render(<HintMenu settings={blitz.settings} round={blitz.rounds[0]} onHint={() => undefined} />);
    expect(container).toBeEmptyDOMElement();

    const s = game();
    const hinted = reduce(s, { type: 'hint', kind: 'year', now: 1500 });
    render(<UsedHints round={hinted.rounds[0]} />);
    expect(screen.getByTestId('hints')).toHaveTextContent(/Released in 20(19|01)/);
  });
});
