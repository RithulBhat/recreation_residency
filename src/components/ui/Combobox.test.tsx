import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { Combobox } from './Combobox';

// jsdom has no layout: the highlight effect scrolls the active option into view.
beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

interface Song {
  id: string;
  title: string;
}

const SONGS: Song[] = [
  { id: '1', title: 'Bad Romance' },
  { id: '2', title: 'Bad Guy' },
  { id: '3', title: 'Bad Habits' },
];

function Harness({ onSelect, onSubmit }: { onSelect: (s: Song) => void; onSubmit: (t: string) => void }) {
  const [value, setValue] = useState('');
  const options = value.trim() ? SONGS.filter((s) => s.title.toLowerCase().includes(value.trim().toLowerCase())) : [];
  return (
    <Combobox<Song>
      value={value}
      onChange={setValue}
      options={options}
      getKey={(s) => s.id}
      getLabel={(s) => s.title}
      onSelect={onSelect}
      onSubmit={onSubmit}
      aria-label="Guess"
    />
  );
}

function mount() {
  const onSelect = vi.fn();
  const onSubmit = vi.fn();
  render(<Harness onSelect={onSelect} onSubmit={onSubmit} />);
  const input = screen.getByRole('combobox', { name: 'Guess' });
  return { input, onSelect, onSubmit };
}

describe('Combobox', () => {
  it('does not highlight a suggestion by itself, so Enter submits the typed text', () => {
    const { input, onSelect, onSubmit } = mount();
    fireEvent.change(input, { target: { value: 'Bad' } });
    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(3);
    for (const o of options) expect(o).toHaveAttribute('aria-selected', 'false');
    expect(input).not.toHaveAttribute('aria-activedescendant');

    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSubmit).toHaveBeenCalledWith('Bad');
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('selects a suggestion once the user arrowed onto it', () => {
    const { input, onSelect, onSubmit } = mount();
    fireEvent.change(input, { target: { value: 'Bad' } });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(screen.getAllByRole('option')[0]).toHaveAttribute('aria-selected', 'true');
    expect(input).toHaveAttribute('aria-activedescendant', screen.getAllByRole('option')[0].id);
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSelect).toHaveBeenCalledWith(SONGS[1]);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('ArrowUp from nothing wraps to the last suggestion', () => {
    const { input, onSelect } = mount();
    fireEvent.change(input, { target: { value: 'Bad' } });
    fireEvent.keyDown(input, { key: 'ArrowUp' });
    expect(screen.getAllByRole('option')[2]).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSelect).toHaveBeenCalledWith(SONGS[2]);
  });

  it('a new set of suggestions clears the highlight', () => {
    const { input, onSelect, onSubmit } = mount();
    fireEvent.change(input, { target: { value: 'Bad' } });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.change(input, { target: { value: 'Bad R' } });
    expect(screen.getAllByRole('option')).toHaveLength(1);
    expect(screen.getAllByRole('option')[0]).toHaveAttribute('aria-selected', 'false');
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSubmit).toHaveBeenCalledWith('Bad R');
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('clicking a suggestion selects it', () => {
    const { input, onSelect } = mount();
    fireEvent.change(input, { target: { value: 'Bad' } });
    // By text: HighlightMatch renders the label as inline <mark>/<span> parts, which jsdom's
    // accessible-name algorithm joins without the boundary space ("BadHabits").
    const habits = screen.getAllByRole('option').find((o) => o.textContent === 'Bad Habits');
    expect(habits).toBeDefined();
    fireEvent.click(habits!);
    expect(onSelect).toHaveBeenCalledWith(SONGS[2]);
  });
});
