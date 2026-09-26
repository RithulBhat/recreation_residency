import { afterEach, describe, expect, it, vi } from 'vitest';
import { rankFor } from './rank';
import { resultGrid } from './share';
import {
  CARD_HEIGHT,
  CARD_WIDTH,
  LAYOUT,
  MIDNIGHT_CARD_THEME,
  bestRound,
  bragLine,
  cardFileName,
  composeCard,
  drawCard,
  fillTracked,
  fitFont,
  gridLayout,
  parseGrid,
  prettySite,
  readCardTheme,
  shareCard,
  tileColor,
  tileSize,
  withAlpha,
  type Canvas2D,
  type GradientLike,
} from './shareCard';
import { blitzGame, classicGame, dailyGame, duelGame, makeGame, partyGame } from './testFactory';

/* ------------------------------------------------------------------ a recording canvas */

interface TextCall {
  text: string;
  x: number;
  y: number;
  font: string;
  fill: string | GradientLike | CanvasPattern;
}

class FakeGradient implements GradientLike {
  stops: [number, string][] = [];
  addColorStop(offset: number, color: string): void {
    this.stops.push([offset, color]);
  }
}

/** Measures 0.6 em per glyph and records what was drawn where. */
class FakeCanvas implements Canvas2D<string> {
  fillStyle: string | GradientLike | CanvasPattern = '#000';
  strokeStyle: string | GradientLike | CanvasPattern = '#000';
  lineWidth = 1;
  lineCap: CanvasLineCap = 'butt';
  font = '10px sans-serif';
  textAlign: CanvasTextAlign = 'left';
  textBaseline: CanvasTextBaseline = 'alphabetic';
  globalAlpha = 1;
  shadowBlur = 0;
  shadowColor = '';
  shadowOffsetY = 0;
  texts: TextCall[] = [];
  images: { image: string; x: number; y: number; w: number; h: number }[] = [];
  roundRects = 0;
  arcs = 0;
  save(): void {}
  restore(): void {}
  beginPath(): void {}
  closePath(): void {}
  arc(): void {
    this.arcs += 1;
  }
  moveTo(): void {}
  lineTo(): void {}
  roundRect(): void {
    this.roundRects += 1;
  }
  fill(): void {}
  stroke(): void {}
  clip(): void {}
  fillRect(): void {}
  fillText(text: string, x: number, y: number): void {
    this.texts.push({ text, x, y, font: this.font, fill: this.fillStyle });
  }
  measureText(text: string): { width: number } {
    const size = Number(/(\d+(?:\.\d+)?)px/.exec(this.font)?.[1] ?? 10);
    return { width: [...text].length * size * 0.6 };
  }
  createLinearGradient(): GradientLike {
    return new FakeGradient();
  }
  createRadialGradient(): GradientLike {
    return new FakeGradient();
  }
  drawImage(image: string, x: number, y: number, w: number, h: number): void {
    this.images.push({ image, x, y, w, h });
  }
  translate(): void {}
  rotate(): void {}
}

const rank = rankFor(7000); // Beat Detective, level 7

/* ------------------------------------------------------------------ layout maths */

describe('gridLayout', () => {
  it('stacks up to five per column and balances the columns', () => {
    expect(gridLayout(0)).toEqual({ columns: 0, rows: 0, shown: 0, hidden: 0 });
    expect(gridLayout(3)).toEqual({ columns: 1, rows: 3, shown: 3, hidden: 0 });
    expect(gridLayout(5)).toEqual({ columns: 1, rows: 5, shown: 5, hidden: 0 });
    expect(gridLayout(7)).toEqual({ columns: 2, rows: 4, shown: 7, hidden: 0 });
    expect(gridLayout(10)).toEqual({ columns: 2, rows: 5, shown: 10, hidden: 0 });
    expect(gridLayout(20)).toEqual({ columns: 4, rows: 5, shown: 20, hidden: 0 });
  });

  it('folds anything past twenty cells into "+N more"', () => {
    expect(gridLayout(25)).toEqual({ columns: 4, rows: 5, shown: 20, hidden: 5 });
  });

  it('keeps every column inside the left half of the card and above the footer', () => {
    const g = LAYOUT.grid;
    expect(g.x + g.maxCols * g.colWidth).toBeLessThanOrEqual(LAYOUT.side.x);
    for (const count of [1, 3, 4, 5, 6, 10, 11, 20, 40]) {
      const { rows } = gridLayout(count);
      const bottom = g.y + rows * (tileSize(count) + g.rowGap) - g.rowGap;
      expect(bottom, `${count} cells`).toBeLessThan(LAYOUT.footer.y - 40);
    }
  });

  it('sizes tiles by how many there are', () => {
    expect(tileSize(3)).toBe(48);
    expect(tileSize(5)).toBe(42);
    expect(tileSize(10)).toBe(40);
    expect(tileSize(20)).toBe(LAYOUT.grid.tile);
  });
});

describe('parseGrid', () => {
  it('turns resultGrid lines into cells', () => {
    const cells = parseGrid(resultGrid(classicGame()));
    expect(cells).toHaveLength(10);
    expect(cells[0]).toEqual({ symbol: '🟩', clip: '0.1s' });
    expect(cells[3]).toEqual({ symbol: '🟥', clip: '10s' });
    expect(parseGrid('')).toEqual([]);
  });
});

describe('tileColor', () => {
  it('maps every symbol onto a theme token', () => {
    const t = MIDNIGHT_CARD_THEME;
    expect(tileColor('🟩', t)).toEqual({ color: t.success, alpha: 1 });
    expect(tileColor('🟨', t)).toEqual({ color: t.warn, alpha: 1 });
    expect(tileColor('🟥', t)).toEqual({ color: t.danger, alpha: 1 });
    expect(tileColor('⬛', t).alpha).toBeLessThan(1);
  });
});

describe('withAlpha / prettySite / cardFileName', () => {
  it('converts hex colours and leaves the rest alone', () => {
    expect(withAlpha('#a855f7', 0.4)).toBe('rgba(168,85,247,0.4)');
    expect(withAlpha('#fff', 1)).toBe('rgba(255,255,255,1)');
    expect(withAlpha('rgb(1 2 3)', 0)).toBe('transparent');
    expect(withAlpha('red', 0.5)).toBe('red');
  });

  it('prints the site without protocol, hash or trailing slash', () => {
    expect(prettySite('https://rithulbhat.github.io/songooner/#/')).toBe('rithulbhat.github.io/songooner');
    expect(prettySite('http://localhost:5176/')).toBe('localhost:5176');
    expect(prettySite(undefined)).toBe('songooner.app');
  });

  it('names the file after the mode and score', () => {
    expect(cardFileName(classicGame())).toBe('songooner-classic-5640.png');
    expect(cardFileName(dailyGame('2026-09-20'))).toBe('songooner-daily-2026-09-20-3080.png');
  });
});

/* ------------------------------------------------------------------ composition */

describe('bestRound', () => {
  it('picks the shortest-clip first-try win, highest score on a tie', () => {
    // rounds 0, 2 and 8 were won on try 0 at 0.1s; round 8 scored the most.
    expect(bestRound(classicGame())?.index).toBe(8);
  });

  it('falls back to the first song played when nothing was won', () => {
    const game = makeGame({ rounds: [{ shape: 'lost' }, { shape: 'lost' }] });
    expect(bestRound(game)?.index).toBe(0);
    expect(bestRound(makeGame({ rounds: [] }))).toBeNull();
  });
});

describe('bragLine', () => {
  it('brags about the fastest call', () => {
    expect(bragLine(classicGame(), 'Pop Hits')).toBe('Named it in 0.1s · Pop Hits · 8/10');
  });

  it('counts songs against the clock for blitz', () => {
    expect(bragLine(blitzGame(7, 2), 'Pop Hits')).toBe('7 songs in 90s · Pop Hits');
  });

  it('lists the scoreboard for 2+ players', () => {
    expect(bragLine(duelGame([1800, 900]), 'Pop Hits')).toBe('Rithul 1,800 · Maanu 900');
  });

  it('has nothing to brag about after a shut-out', () => {
    expect(bragLine(makeGame({ rounds: [{ shape: 'lost' }] }), 'Pop Hits')).toBe('Pop Hits · 0/1');
  });
});

describe('composeCard', () => {
  it('assembles every line of a solo card', () => {
    const model = composeCard(classicGame(), { url: 'https://songooner.app/#/', packLabel: 'Pop Hits', rank, perfectRounds: 3 });
    expect(model.eyebrowLeft).toBe('SONGOONER');
    expect(model.eyebrowRight).toBe('CLASSIC · POP HITS');
    expect(model.headline).toBe('Golden ears.');
    expect(model.score).toBe('5,640');
    expect(model.brag).toBe('Named it in 0.1s · Pop Hits · 8/10');
    expect(model.grid).toHaveLength(10);
    expect(model.rank).toEqual({ emoji: '🕵️', title: 'Beat Detective', level: 7 });
    expect(model.club).toBe('0.1s CLUB ×3');
    expect(model.stats).toEqual(['🔥 Best streak 3', '👂 Avg clip 1.36s']);
    expect(model.site).toBe('songooner.app');
    expect(model.artUrl).toBe('https://cdn.example/cover-big/1008.jpg');
    expect(model.caption.startsWith('Songooner · Classic · 8/10 · 5,640 pts')).toBe(true);
    expect(model.caption.endsWith('https://songooner.app/#/')).toBe(true);
  });

  it('drops the rank and club when there is nothing to show', () => {
    const model = composeCard(classicGame());
    expect(model.rank).toBeNull();
    expect(model.club).toBeNull();
    expect(model.eyebrowRight).toBe('CLASSIC · POP-HITS');
  });

  it('formats the daily date like the Daily screen', () => {
    const model = composeCard(dailyGame('2026-09-20'), { packLabel: 'Pop Hits' });
    expect(model.eyebrowRight).toMatch(/^DAILY · .*2026 · POP HITS$/);
  });

  it('leads with the winner for 2+ players', () => {
    const duel = composeCard(duelGame([1800, 900]));
    expect(duel.headline).toBe('Rithul takes it.');
    expect(duel.score).toBe('1,800');
    expect(duel.stats).toEqual(['👥 2 players', '🎵 6 songs']);
    const tie = composeCard(duelGame([900, 900]));
    expect(tie.headline).toBe("It's a tie!");
    expect(tie.score).toBe('900');
    expect(composeCard(partyGame()).headline).toBe('Rithul takes it.');
  });

  it('uses the blitz tally and clock', () => {
    const model = composeCard(blitzGame(7, 2), { packLabel: 'Pop Hits' });
    expect(model.brag).toBe('7 songs in 90s · Pop Hits');
    expect(model.stats).toContain('⏱ 90s on the clock');
  });
});

/* ------------------------------------------------------------------ painting */

describe('drawCard', () => {
  const model = composeCard(classicGame(), { url: 'https://songooner.app/#/', packLabel: 'Pop Hits', rank, perfectRounds: 3 });

  it('draws every text inside the canvas', () => {
    const ctx = new FakeCanvas();
    drawCard(ctx, model, MIDNIGHT_CARD_THEME, 'cover.jpg');
    expect(ctx.texts.length).toBeGreaterThan(10);
    for (const t of ctx.texts) {
      expect(t.x, `${t.text} x`).toBeGreaterThanOrEqual(0);
      expect(t.x, `${t.text} x`).toBeLessThanOrEqual(CARD_WIDTH);
      expect(t.y, `${t.text} y`).toBeGreaterThan(0);
      expect(t.y, `${t.text} y`).toBeLessThanOrEqual(CARD_HEIGHT);
    }
  });

  it('paints the score in mono over a gradient, and the rest of the copy', () => {
    const ctx = new FakeCanvas();
    drawCard(ctx, model, MIDNIGHT_CARD_THEME, 'cover.jpg');
    const score = ctx.texts.find((t) => t.text === '5,640');
    expect(score).toBeDefined();
    expect(score?.font).toContain('140px');
    expect(score?.font).toContain('JetBrains Mono');
    expect(score?.fill).toBeInstanceOf(FakeGradient);
    const drawn = ctx.texts.map((t) => t.text);
    expect(drawn).toContain('Golden ears.');
    expect(drawn).toContain('Named it in 0.1s · Pop Hits · 8/10');
    expect(drawn).toContain('Beat Detective');
    expect(drawn).toContain('songooner.app');
    expect(drawn).toContain('Songooner');
    expect(drawn).toContain('🔥 Best streak 3');
    // tracked strings are drawn glyph by glyph
    expect(drawn.join('')).toContain('0.1s CLUB ×3');
    expect(drawn.join('')).toContain('SONGOONER');
    expect(drawn.join('')).toContain('PTS');
    // one clip label per grid cell
    expect(ctx.texts.filter((t) => /^\d+(\.\d+)?s$/.test(t.text))).toHaveLength(10);
  });

  it('puts the art on the label, or a gradient when there is none', () => {
    const withArt = new FakeCanvas();
    drawCard(withArt, model, MIDNIGHT_CARD_THEME, 'cover.jpg');
    const { cx, cy, labelR } = LAYOUT.record;
    expect(withArt.images).toEqual([{ image: 'cover.jpg', x: cx - labelR, y: cy - labelR, w: labelR * 2, h: labelR * 2 }]);
    const without = new FakeCanvas();
    drawCard(without, model, MIDNIGHT_CARD_THEME, null);
    expect(without.images).toEqual([]);
    expect(without.roundRects).toBeGreaterThanOrEqual(model.grid.length);
  });

  it('shrinks copy that would overflow', () => {
    const ctx = new FakeCanvas();
    const size = fitFont(ctx, 'x'.repeat(40), 900, 'Unbounded', 56, CARD_WIDTH - LAYOUT.pad * 2, 18);
    expect(size).toBeLessThanOrEqual(38);
    expect(ctx.font).toContain(`${size}px`);
    expect(fitFont(ctx, 'short', 900, 'Unbounded', 56, 936, 18)).toBe(56);
  });

  it('tracks letters and reports the width', () => {
    const ctx = new FakeCanvas();
    ctx.font = '600 20px mono';
    expect(fillTracked(ctx, 'ABC', 0, 0, 4)).toBe(3 * 12 + 8);
    expect(ctx.texts.map((t) => t.text)).toEqual(['A', 'B', 'C']);
    expect(ctx.texts.map((t) => t.x)).toEqual([0, 16, 32]);
  });

  it('falls back to Midnight Neon without a stylesheet', () => {
    expect(readCardTheme()).toEqual(MIDNIGHT_CARD_THEME);
  });
});

/* ------------------------------------------------------------------ the share bridge */

describe('shareCard', () => {
  const nav = globalThis.navigator;
  const silent = { track: { cover: '', coverBig: '' } } as const;
  let id = 0;
  const game = () => classicGame({ id: `share-${++id}`, rounds: [{ shape: 'won', ...silent }, { shape: 'lost', ...silent }] });

  function stub(prop: string, value: unknown): void {
    Object.defineProperty(nav, prop, { value, configurable: true, writable: true });
  }

  function paintable(): void {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => new FakeCanvas() as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((cb) => cb(new Blob(['png'], { type: 'image/png' })));
  }

  afterEach(() => {
    vi.restoreAllMocks();
    for (const p of ['share', 'canShare', 'clipboard']) Reflect.deleteProperty(nav, p);
    for (const p of ['createObjectURL', 'revokeObjectURL']) Reflect.deleteProperty(URL, p);
  });

  it('hands the PNG and caption to the native sheet', async () => {
    paintable();
    const share = vi.fn().mockResolvedValue(undefined);
    stub('canShare', (d: ShareData) => Array.isArray(d.files) && d.files.length > 0);
    stub('share', share);
    await expect(shareCard(game(), { url: 'https://songooner.app/' })).resolves.toBe('shared');
    const data = share.mock.calls[0]?.[0] as ShareData;
    expect(data.files).toHaveLength(1);
    expect(data.files?.[0]).toBeInstanceOf(File);
    expect(data.files?.[0]?.type).toBe('image/png');
    expect(data.files?.[0]?.name).toBe('songooner-classic-500.png');
    expect(data.text).toContain('Songooner · Classic · 1/2 · 500 pts');
    expect(data.text).toContain('https://songooner.app/');
  });

  it('treats a dismissed sheet as shared', async () => {
    paintable();
    stub('canShare', () => true);
    stub('share', vi.fn().mockRejectedValue(Object.assign(new Error('nope'), { name: 'AbortError' })));
    await expect(shareCard(game())).resolves.toBe('shared');
  });

  it('downloads the PNG and copies the caption when files cannot be shared', async () => {
    paintable();
    const writeText = vi.fn().mockResolvedValue(undefined);
    stub('clipboard', { writeText });
    const createObjectURL = vi.fn(() => 'blob:card');
    Object.defineProperty(URL, 'createObjectURL', { value: createObjectURL, configurable: true, writable: true });
    Object.defineProperty(URL, 'revokeObjectURL', { value: vi.fn(), configurable: true, writable: true });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    await expect(shareCard(game())).resolves.toBe('downloaded');
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(click).toHaveBeenCalledTimes(1);
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('Songooner · Classic'));
  });

  it('reports "copied" when only the caption made it', async () => {
    paintable();
    stub('clipboard', { writeText: vi.fn().mockResolvedValue(undefined) });
    await expect(shareCard(game())).resolves.toBe('copied');
  });

  it('fails softly without a canvas', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => null);
    await expect(shareCard(game())).resolves.toBe('failed');
  });
});
