import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  GRID_LEGEND,
  challengeShareText,
  dailyShareText,
  formatClip,
  formatScore,
  modeLabel,
  resultGrid,
  roundSymbol,
  shareOrCopy,
  shareText,
} from './share';
import type { DailyResult } from './types';
import { classicGame, dailyGame, duelGame, fixedGame, makeGame } from './testFactory';

const CLASSIC_GRID = [
  '🟩 0.1s',
  '🟨 0.3s',
  '🟩 0.1s',
  '🟥 10s',
  '🟨 1s',
  '🟨 2s',
  '🟧 4s',
  '🟨 0.3s',
  '🟩 0.1s',
  '🟨 7s',
].join('\n');

describe('formatters', () => {
  it('formats clip lengths', () => {
    expect(formatClip(0.1)).toBe('0.1s');
    expect(formatClip(0.25)).toBe('0.25s');
    expect(formatClip(1)).toBe('1s');
    expect(formatClip(10)).toBe('10s');
    expect(formatClip(0)).toBe('—');
    expect(formatClip(Number.NaN)).toBe('—');
  });

  it('formats scores with separators', () => {
    expect(formatScore(6420)).toBe('6,420');
    expect(formatScore(0)).toBe('0');
    expect(formatScore(1_234_567)).toBe('1,234,567');
  });

  it('ships a legend', () => {
    expect(GRID_LEGEND.map((l) => l.emoji)).toEqual(['🟩', '🟨', '🟧', '🟥', '⬛']);
  });
});

describe('resultGrid', () => {
  it('renders one line per round with the clip length', () => {
    expect(resultGrid(classicGame())).toBe(CLASSIC_GRID);
  });

  it('uses ⬛ for skipped rounds', () => {
    const lines = resultGrid(fixedGame()).split('\n');
    expect(lines).toHaveLength(6);
    expect(lines[4]).toBe('⬛ 0.5s');
    expect(lines[0]).toBe('🟩 0.5s');
    expect(lines[2]).toBe('🟥 0.5s');
  });

  it('marks partial rounds', () => {
    const game = makeGame({ rounds: [{ shape: 'partial', tryIndex: 1 }] });
    expect(resultGrid(game)).toBe('🟧 0.3s');
  });

  it('falls back to the starting clip when nothing was heard', () => {
    const game = makeGame({ rounds: [{ shape: 'lost', tryIndex: 0, clip: 0 }] });
    expect(resultGrid(game)).toBe('🟥 0.1s');
  });

  it('omits a round the engine auto-skipped before any guess (blitz clock / quit)', () => {
    const game = makeGame({ rounds: [{ shape: 'won' }, { shape: 'skipped', tryIndex: 0 }] });
    expect(resultGrid(game).split('\n')).toHaveLength(1);
  });

  it('is empty for a game with no played rounds', () => {
    expect(resultGrid(makeGame({ rounds: [] }))).toBe('');
  });

  it('exposes the per-round symbol', () => {
    const game = classicGame();
    expect(roundSymbol(game.rounds[0], game.settings)).toBe('🟩');
    expect(roundSymbol(game.rounds[3], game.settings)).toBe('🟥');
  });
});

describe('shareText', () => {
  it('builds headline + grid + url', () => {
    const text = shareText(classicGame(), { url: 'https://songooner.app' });
    expect(text).toBe(
      `Songooner · Classic · 8/10 · 5,640 pts\n\n${CLASSIC_GRID}\n\nhttps://songooner.app`,
    );
  });

  it('omits the url when not given and honours appName', () => {
    const text = shareText(classicGame(), { appName: 'Songooner Beta' });
    expect(text.startsWith('Songooner Beta · Classic · 8/10 · 5,640 pts')).toBe(true);
    expect(text).not.toContain('http');
  });

  it('labels dailies by date', () => {
    const game = dailyGame('2026-09-20');
    expect(modeLabel(game)).toBe('Daily 2026-09-20');
    expect(shareText(game).split('\n')[0]).toBe('Songooner · Daily 2026-09-20 · 4/5 · 3,080 pts');
  });

  it('adds a scoreboard for multiplayer', () => {
    const text = shareText(duelGame([1800, 900]));
    expect(text.split('\n')[0]).toBe('Songooner · Duel · 5/6 · 2,700 pts');
    expect(text).toContain('🏆 Rithul');
    expect(text).toContain('Rithul 1,800');
    expect(text).toContain('Maanu 900');
  });
});

describe('dailyShareText', () => {
  const result: DailyResult = {
    date: '2026-09-20',
    score: 3080,
    correct: 4,
    rounds: 5,
    grid: '🟩 0.1s\n🟥 10s',
  };

  it('uses the stored grid', () => {
    expect(dailyShareText(result, undefined, 'https://songooner.app')).toBe(
      'Songooner · Daily 2026-09-20 · 4/5 · 3,080 pts\n\n🟩 0.1s\n🟥 10s\n\nhttps://songooner.app',
    );
  });

  it('prefers an explicit date and drops a missing url', () => {
    const text = dailyShareText(result, '2026-09-26');
    expect(text).toContain('Daily 2026-09-26');
    expect(text).not.toContain('http');
  });
});

describe('challengeShareText', () => {
  it('names the challenger', () => {
    expect(challengeShareText('Rithul', 6420, 'https://songooner.app/#/c/abc')).toBe(
      '🎯 Rithul scored 6,420 on Songooner. Think you can beat that?\n\nhttps://songooner.app/#/c/abc',
    );
  });

  it('falls back to Someone', () => {
    expect(challengeShareText('   ', 10)).toBe(
      '🎯 Someone scored 10 on Songooner. Think you can beat that?',
    );
  });
});

describe('shareOrCopy', () => {
  const nav = globalThis.navigator;

  function stub(prop: 'share' | 'clipboard', value: unknown): void {
    Object.defineProperty(nav, prop, { value, configurable: true, writable: true });
  }

  afterEach(() => {
    Reflect.deleteProperty(nav, 'share');
    Reflect.deleteProperty(nav, 'clipboard');
  });

  it('uses the Web Share API when available', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    stub('share', share);
    await expect(shareOrCopy('hello')).resolves.toBe('shared');
    expect(share).toHaveBeenCalledWith({ text: 'hello' });
  });

  it('treats a dismissed share sheet as shared', async () => {
    const abort = Object.assign(new Error('nope'), { name: 'AbortError' });
    stub('share', vi.fn().mockRejectedValue(abort));
    const writeText = vi.fn().mockResolvedValue(undefined);
    stub('clipboard', { writeText });
    await expect(shareOrCopy('hello')).resolves.toBe('shared');
    expect(writeText).not.toHaveBeenCalled();
  });

  it('falls back to the clipboard when share throws', async () => {
    stub('share', vi.fn().mockRejectedValue(new Error('unsupported')));
    const writeText = vi.fn().mockResolvedValue(undefined);
    stub('clipboard', { writeText });
    await expect(shareOrCopy('hello')).resolves.toBe('copied');
    expect(writeText).toHaveBeenCalledWith('hello');
  });

  it('copies when there is no share sheet', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    stub('clipboard', { writeText });
    await expect(shareOrCopy('grid')).resolves.toBe('copied');
  });

  it('fails when neither path works', async () => {
    stub('clipboard', { writeText: vi.fn().mockRejectedValue(new Error('denied')) });
    await expect(shareOrCopy('grid')).resolves.toBe('failed');
  });
});
