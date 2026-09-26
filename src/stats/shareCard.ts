/**
 * The needle-drop share card — a 1080×1350 PNG of one finished game, painted on an offscreen canvas:
 * the record with the best round's album art as its label, the score in JetBrains Mono over the
 * theme gradient, the result grid, one line of brag copy, the player's rank, the 0.1s Club count
 * and the site.
 *
 * Composition (`composeCard`) and layout (`LAYOUT`, `gridLayout`) are pure and run under jsdom;
 * painting goes through the small `Canvas2D` interface so a recording fake can stand in for a real
 * context. `shareCard()` is the browser entry point: paint → `navigator.share({ files })`, else
 * download the PNG and copy the caption.
 */

import type { GameState, Round } from '@/types/game';
import type { Rank } from './rank';
import { playedRounds, roundOutcome, summarizeGame } from './aggregate';
import type { GamePlayerResult } from './types';
import {
  DEFAULT_APP_NAME,
  blitzTally,
  copyText,
  formatClip,
  formatScore,
  isAbortError,
  modeLabel,
  modeTitle,
  resultGrid,
  resultHeadline,
  shareText,
  shortestWinClip,
} from './share';

export const CARD_WIDTH = 1080;
export const CARD_HEIGHT = 1350;

/* ------------------------------------------------------------------ theme */

export interface CardTheme {
  bg: string;
  bgElevated: string;
  fg: string;
  muted: string;
  accent: string;
  accent2: string;
  accent3: string;
  success: string;
  warn: string;
  danger: string;
  vinyl: string;
  groove: string;
  /** Dark ground → brighter glows and a pale tonearm. */
  dark: boolean;
}

/** Midnight Neon — the fallback when no stylesheet is around (tests, SSR). */
export const MIDNIGHT_CARD_THEME: CardTheme = {
  bg: '#0b0b12',
  bgElevated: '#13131f',
  fg: '#f4f4f8',
  muted: '#9b9bb4',
  accent: '#a855f7',
  accent2: '#22d3ee',
  accent3: '#f472b6',
  success: '#34d399',
  warn: '#fbbf24',
  danger: '#fb7185',
  vinyl: '#0f0f14',
  groove: 'rgb(255 255 255 / 0.06)',
  dark: true,
};

/** Read the active theme's tokens off `<html data-theme>` so the card matches the screen. */
export function readCardTheme(root?: Element): CardTheme {
  if (typeof document === 'undefined' || typeof getComputedStyle !== 'function') return MIDNIGHT_CARD_THEME;
  const cs = getComputedStyle(root ?? document.documentElement);
  const pick = (name: string, fallback: string): string => cs.getPropertyValue(name).trim() || fallback;
  const M = MIDNIGHT_CARD_THEME;
  const scheme = cs.getPropertyValue('color-scheme').trim();
  return {
    bg: pick('--sg-bg', M.bg),
    bgElevated: pick('--sg-bg-elevated', M.bgElevated),
    fg: pick('--sg-fg', M.fg),
    muted: pick('--sg-muted', M.muted),
    accent: pick('--sg-accent', M.accent),
    accent2: pick('--sg-accent-2', M.accent2),
    accent3: pick('--sg-accent-3', M.accent3),
    success: pick('--sg-success', M.success),
    warn: pick('--sg-warn', M.warn),
    danger: pick('--sg-danger', M.danger),
    vinyl: pick('--sg-vinyl', M.vinyl),
    groove: pick('--sg-vinyl-groove', M.groove),
    dark: scheme.includes('dark') ? true : scheme.includes('light') ? false : M.dark,
  };
}

/** `#a855f7` + 0.4 → `rgba(168,85,247,0.4)`. Non-hex colours pass through (or vanish at alpha 0). */
export function withAlpha(color: string, alpha: number): string {
  const hex = /^#([0-9a-f]{3,8})$/i.exec(color.trim());
  if (!hex) return alpha <= 0 ? 'transparent' : color;
  let h = hex[1];
  if (h.length === 3 || h.length === 4) h = [...h].map((c) => c + c).join('');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${Math.max(0, Math.min(1, alpha))})`;
}

/* ------------------------------------------------------------------ layout */

/** Every coordinate on the card, in canvas pixels. Baselines for text, top-left for boxes. */
export const LAYOUT = {
  pad: 72,
  eyebrow: { y: 96, size: 22, tracking: 4 },
  record: { cx: 540, cy: 372, r: 224, labelR: 92, holeR: 8 },
  tonearm: { pivotX: 938, pivotY: 152, headX: 732, headY: 316 },
  headline: { y: 690, size: 56 },
  score: { y: 830, size: 140 },
  brag: { y: 896, size: 34 },
  divider: { y: 946 },
  grid: { x: 72, y: 986, tile: 36, rowGap: 12, colWidth: 140, maxRows: 5, maxCols: 4 },
  side: { x: 660, y: 986 },
  footer: { y: 1292 },
} as const;

export interface GridLayout {
  columns: number;
  rows: number;
  /** cells that fit */
  shown: number;
  /** cells folded into "+N more" */
  hidden: number;
}

/** Tile edge for a grid of `count` cells — a three-song run gets big tiles, a twenty-song run stays tidy. */
export function tileSize(count: number): number {
  if (count <= 3) return 48;
  if (count <= 5) return 42;
  if (count <= 10) return 40;
  return LAYOUT.grid.tile;
}

/** Column-major grid: up to `maxRows` per column, `maxCols` columns, balanced across columns. */
export function gridLayout(count: number, maxRows: number = LAYOUT.grid.maxRows, maxCols: number = LAYOUT.grid.maxCols): GridLayout {
  const n = Math.max(0, Math.floor(count));
  const shown = Math.min(n, maxRows * maxCols);
  if (shown === 0) return { columns: 0, rows: 0, shown: 0, hidden: n };
  const columns = Math.min(maxCols, Math.ceil(shown / maxRows));
  const rows = Math.ceil(shown / columns);
  return { columns, rows, shown, hidden: n - shown };
}

/* ------------------------------------------------------------------ model */

export interface GridCell {
  /** the emoji `resultGrid` printed for this round */
  symbol: string;
  /** `0.1s` */
  clip: string;
}

export interface CardRank {
  emoji: string;
  title: string;
  level: number;
}

export interface CardModel {
  eyebrowLeft: string;
  eyebrowRight: string;
  headline: string;
  score: string;
  brag: string;
  grid: GridCell[];
  rank: CardRank | null;
  /** `0.1s CLUB ×3` */
  club: string | null;
  /** Up to three short stat lines for the right column. */
  stats: string[];
  /** `songooner.app` — protocol and hash stripped */
  site: string;
  /** Album art for the record label (best round), if any. */
  artUrl: string | null;
  /** The caption that travels with the picture. */
  caption: string;
}

export interface ComposeOptions {
  /** Full share url; also shown (prettified) in the footer. */
  url?: string;
  /** `Pop Hits` — resolved pack names. Falls back to the pack ids. */
  packLabel?: string;
  rank?: Rank | null;
  /** Lifetime correct guesses heard at ≤ 0.1 s (`totals.byClipBucket['0.1'].correct`). */
  clubCount?: number;
  appName?: string;
}

const EPS = 1e-6;

/**
 * The round to put on the record: the win at the shortest clip, then the fewest tries, then the
 * most points. With nothing won, the first song played still makes a sleeve.
 */
export function bestRound(state: GameState): Round | null {
  const played = playedRounds(state);
  let best: { round: Round; clip: number; tries: number } | null = null;
  for (const round of played) {
    const o = roundOutcome(round, state.settings);
    if (!o.won) continue;
    const better =
      best === null ||
      o.clipHeard < best.clip - EPS ||
      (Math.abs(o.clipHeard - best.clip) <= EPS && (o.triesUsed < best.tries || (o.triesUsed === best.tries && round.score > best.round.score)));
    if (better) best = { round, clip: o.clipHeard, tries: o.triesUsed };
  }
  return best?.round ?? played[0] ?? null;
}

/** `resultGrid` text → cells. */
export function parseGrid(grid: string): GridCell[] {
  if (grid.trim().length === 0) return [];
  return grid.split('\n').map((line) => {
    const m = /^(\S+)\s+(.*)$/.exec(line.trim());
    return m ? { symbol: m[1], clip: m[2] } : { symbol: line.trim(), clip: '' };
  });
}

/** `https://songooner.app/#/` → `songooner.app`. */
export function prettySite(url: string | undefined): string {
  if (!url) return 'songooner.app';
  return url
    .replace(/^[a-z]+:\/\//i, '')
    .replace(/[#?].*$/, '')
    .replace(/\/+$/, '');
}

function topPlayer(players: readonly GamePlayerResult[]): GamePlayerResult | null {
  let top: GamePlayerResult | null = null;
  for (const p of players) if (top === null || p.score > top.score) top = p;
  return top;
}

/** "Named it in 0.1s · Pop Hits · 6/10" — or the blitz tally, or the scoreboard for 2+ players. */
export function bragLine(state: GameState, pack: string): string {
  const record = summarizeGame(state);
  const s = state.settings;
  if (s.mode === 'blitz' && !s.daily) return `${blitzTally(record.correct, s.blitzDuration)} · ${pack}`;
  if (record.players && record.players.length >= 2) {
    return record.players.map((p) => `${p.name} ${formatScore(p.score)}`).join(' · ');
  }
  const best = shortestWinClip(state);
  const tally = `${record.correct}/${record.rounds}`;
  return best !== null ? `Named it in ${formatClip(best)} · ${pack} · ${tally}` : `${pack} · ${tally}`;
}

/** Everything the painter needs, computed once and testable without a canvas. */
export function composeCard(state: GameState, opts: ComposeOptions = {}): CardModel {
  const record = summarizeGame(state);
  const s = state.settings;
  const appName = opts.appName ?? DEFAULT_APP_NAME;
  const pack = opts.packLabel?.trim() || s.packIds.join(', ') || 'Custom mix';
  const multi = record.players !== undefined && record.players.length >= 2;
  const winner = multi && record.players ? topPlayer(record.players) : null;
  const headline = multi ? (record.winnerName ? `${record.winnerName} takes it.` : "It's a tie!") : resultHeadline(record, state.endReason);
  const score = formatScore(winner ? winner.score : record.score);
  const best = bestRound(state);
  const rank = opts.rank ? { emoji: opts.rank.emoji, title: opts.rank.title, level: opts.rank.level } : null;
  const clubCount = opts.clubCount ?? 0;
  const club = clubCount > 0 ? `0.1s CLUB ×${clubCount}` : null;

  const stats: string[] = [];
  if (multi && record.players) {
    stats.push(`👥 ${record.players.length} players`, `🎵 ${record.rounds} songs`);
  } else {
    if (record.bestStreak > 0) stats.push(`🔥 Best streak ${record.bestStreak}`);
    if (record.correct > 0) stats.push(`👂 Avg clip ${formatClip(record.avgClipLengthHeard)}`);
    if (s.mode === 'blitz' && !s.daily) stats.push(`⏱ ${s.blitzDuration}s on the clock`);
  }

  return {
    eyebrowLeft: appName.toUpperCase(),
    eyebrowRight: `${modeTitle(state)} · ${pack}`.toUpperCase(),
    headline,
    score,
    brag: bragLine(state, pack),
    grid: parseGrid(resultGrid(state)),
    rank,
    club,
    stats: stats.slice(0, 3),
    site: prettySite(opts.url),
    artUrl: best ? best.track.coverBig || best.track.cover || null : null,
    caption: shareText(state, { url: opts.url, appName }),
  };
}

/** `songooner-classic-6420.png` */
export function cardFileName(state: GameState): string {
  const mode = modeLabel(state).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `songooner-${mode}-${Math.round(state.totalScore)}.png`;
}

/* ------------------------------------------------------------------ painting */

/** What `createLinearGradient` / `createRadialGradient` hand back — `CanvasGradient` satisfies it. */
export interface GradientLike {
  addColorStop(offset: number, color: string): void;
}

export type FillStyle = string | GradientLike | CanvasPattern;

/**
 * The slice of `CanvasRenderingContext2D` the painter touches. A real context satisfies it
 * structurally; a recording fake (see the tests) does too, with `Image` as whatever it likes.
 */
export interface Canvas2D<Image = CanvasImageSource> {
  fillStyle: FillStyle;
  strokeStyle: FillStyle;
  lineWidth: number;
  lineCap: CanvasLineCap;
  font: string;
  textAlign: CanvasTextAlign;
  textBaseline: CanvasTextBaseline;
  globalAlpha: number;
  shadowBlur: number;
  shadowColor: string;
  shadowOffsetY: number;
  save(): void;
  restore(): void;
  beginPath(): void;
  closePath(): void;
  arc(x: number, y: number, radius: number, startAngle: number, endAngle: number): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  roundRect(x: number, y: number, w: number, h: number, radii?: number | number[]): void;
  fill(): void;
  stroke(): void;
  clip(): void;
  fillRect(x: number, y: number, w: number, h: number): void;
  fillText(text: string, x: number, y: number, maxWidth?: number): void;
  measureText(text: string): { width: number };
  createLinearGradient(x0: number, y0: number, x1: number, y1: number): GradientLike;
  createRadialGradient(x0: number, y0: number, r0: number, x1: number, y1: number, r1: number): GradientLike;
  drawImage(image: Image, dx: number, dy: number, dw: number, dh: number): void;
  translate(x: number, y: number): void;
  rotate(angle: number): void;
}

export const FONT_DISPLAY = '"Unbounded", "Space Grotesk", system-ui, sans-serif';
export const FONT_SANS = '"Space Grotesk", system-ui, -apple-system, "Segoe UI", sans-serif';
export const FONT_MONO = '"JetBrains Mono", ui-monospace, "SF Mono", Menlo, monospace';
export const FONT_EMOJI = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';

const PARTIAL_ORANGE = '#f97316';

/** Tile colour for a grid symbol — theme tokens so a vinyl card stays amber and a y2k card stays blue. */
export function tileColor(symbol: string, theme: CardTheme): { color: string; alpha: number } {
  switch (symbol) {
    case '🟩':
      return { color: theme.success, alpha: 1 };
    case '🟨':
      return { color: theme.warn, alpha: 1 };
    case '🟧':
      return { color: PARTIAL_ORANGE, alpha: 1 };
    case '🟥':
      return { color: theme.danger, alpha: 1 };
    default:
      return { color: theme.muted, alpha: 0.35 };
  }
}

function font(weight: number | string, size: number, family: string): string {
  return `${weight} ${size}px ${family}`;
}

function circle(ctx: Canvas2D<unknown>, x: number, y: number, r: number): void {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.closePath();
}

function line(ctx: Canvas2D<unknown>, x0: number, y0: number, x1: number, y1: number): void {
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
}

function glow(ctx: Canvas2D<unknown>, x: number, y: number, r: number, color: string, alpha: number): void {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, withAlpha(color, alpha));
  g.addColorStop(1, withAlpha(color, 0));
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
}

/** Shrink a font until `text` fits `maxWidth`; returns the size used (and leaves `ctx.font` set). */
export function fitFont(ctx: Canvas2D<unknown>, text: string, weight: number | string, family: string, size: number, maxWidth: number, minSize = 18): number {
  let s = size;
  for (;;) {
    ctx.font = font(weight, s, family);
    if (ctx.measureText(text).width <= maxWidth || s <= minSize) return s;
    s -= 2;
  }
}

/** Width of `text` drawn with `tracking` between glyphs, in the current font. */
export function measureTracked(ctx: Canvas2D<unknown>, text: string, tracking: number): number {
  const chars = [...text];
  return chars.reduce((n, c) => n + ctx.measureText(c).width, 0) + tracking * Math.max(0, chars.length - 1);
}

/** Letter-spaced text (canvas has no reliable `letterSpacing`). Returns the width drawn. */
export function fillTracked(ctx: Canvas2D<unknown>, text: string, x: number, y: number, tracking: number, align: 'left' | 'right' = 'left'): number {
  const chars = [...text];
  const widths = chars.map((c) => ctx.measureText(c).width);
  const total = widths.reduce((n, w) => n + w, 0) + tracking * Math.max(0, chars.length - 1);
  let cx = align === 'right' ? x - total : x;
  ctx.textAlign = 'left';
  chars.forEach((c, i) => {
    ctx.fillText(c, cx, y);
    cx += widths[i] + tracking;
  });
  return total;
}

function drawRecord<Image>(ctx: Canvas2D<Image>, theme: CardTheme, art: Image | null): void {
  const { cx, cy, r, labelR, holeR } = LAYOUT.record;

  glow(ctx, cx, cy, r * 1.55, theme.accent, theme.dark ? 0.34 : 0.2);

  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.6)';
  ctx.shadowBlur = 70;
  ctx.shadowOffsetY = 34;
  circle(ctx, cx, cy, r);
  ctx.fillStyle = theme.vinyl;
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.strokeStyle = theme.groove;
  ctx.lineWidth = 1.25;
  for (let gr = labelR + 12; gr < r - 5; gr += 3) {
    circle(ctx, cx, cy, gr);
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.11)';
  ctx.lineWidth = 2;
  for (const f of [0.6, 0.76, 0.91]) {
    circle(ctx, cx, cy, r * f);
    ctx.stroke();
  }
  ctx.restore();

  // gloss: a soft diagonal sheen clipped to the disc
  ctx.save();
  circle(ctx, cx, cy, r);
  ctx.clip();
  const sheen = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
  sheen.addColorStop(0, 'rgba(255,255,255,0.17)');
  sheen.addColorStop(0.32, 'rgba(255,255,255,0.03)');
  sheen.addColorStop(0.62, 'rgba(255,255,255,0)');
  sheen.addColorStop(1, 'rgba(255,255,255,0.11)');
  ctx.fillStyle = sheen;
  ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  ctx.restore();

  // label: album art, or the accent gradient
  ctx.save();
  circle(ctx, cx, cy, labelR);
  ctx.clip();
  if (art) {
    ctx.drawImage(art, cx - labelR, cy - labelR, labelR * 2, labelR * 2);
  } else {
    const g = ctx.createLinearGradient(cx - labelR, cy - labelR, cx + labelR, cy + labelR);
    g.addColorStop(0, theme.accent);
    g.addColorStop(0.55, theme.accent2);
    g.addColorStop(1, theme.accent3);
    ctx.fillStyle = g;
    ctx.fillRect(cx - labelR, cy - labelR, labelR * 2, labelR * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 2;
    for (const f of [0.45, 0.7]) {
      circle(ctx, cx, cy, labelR * f);
      ctx.stroke();
    }
  }
  ctx.restore();

  circle(ctx, cx, cy, labelR);
  ctx.strokeStyle = 'rgba(255,255,255,0.3)';
  ctx.lineWidth = 3;
  ctx.stroke();
  circle(ctx, cx, cy, holeR);
  ctx.fillStyle = theme.bg;
  ctx.fill();
  circle(ctx, cx, cy, r - 1);
  ctx.strokeStyle = 'rgba(255,255,255,0.1)';
  ctx.lineWidth = 2;
  ctx.stroke();
}

function drawTonearm(ctx: Canvas2D<unknown>, theme: CardTheme): void {
  const { pivotX, pivotY, headX, headY } = LAYOUT.tonearm;
  const arm = theme.dark ? '#e6e6f0' : '#2a2a3a';
  ctx.save();
  ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(0,0,0,0.4)';
  ctx.lineWidth = 14;
  line(ctx, pivotX, pivotY + 8, headX, headY + 8);
  ctx.strokeStyle = arm;
  ctx.lineWidth = 10;
  line(ctx, pivotX, pivotY, headX, headY);
  // pivot + counterweight
  circle(ctx, pivotX, pivotY, 28);
  ctx.fillStyle = theme.bgElevated;
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.22)';
  ctx.lineWidth = 2;
  ctx.stroke();
  circle(ctx, pivotX, pivotY, 11);
  ctx.fillStyle = theme.accent;
  ctx.fill();
  // cartridge, aligned with the arm
  ctx.translate(headX, headY);
  ctx.rotate(Math.atan2(headY - pivotY, headX - pivotX));
  ctx.fillStyle = arm;
  ctx.beginPath();
  ctx.roundRect(-8, -14, 40, 28, 7);
  ctx.fill();
  ctx.fillStyle = theme.accent2;
  ctx.beginPath();
  ctx.roundRect(24, -5, 12, 10, 3);
  ctx.fill();
  ctx.restore();
}

function drawGrid(ctx: Canvas2D<unknown>, cells: readonly GridCell[], theme: CardTheme): void {
  const g = LAYOUT.grid;
  const tile = tileSize(cells.length);
  const lay = gridLayout(cells.length);
  ctx.save();
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  for (let i = 0; i < lay.shown; i += 1) {
    const cell = cells[i];
    const col = Math.floor(i / lay.rows);
    const row = i % lay.rows;
    const x = g.x + col * g.colWidth;
    const y = g.y + row * (tile + g.rowGap);
    const { color, alpha } = tileColor(cell.symbol, theme);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(x, y, tile, tile, Math.round(tile / 4));
    ctx.fill();
    ctx.restore();
    if (cell.clip) {
      ctx.font = font(600, tile >= 44 ? 26 : 22, FONT_MONO);
      ctx.fillStyle = theme.muted;
      ctx.fillText(cell.clip, x + tile + 14, y + tile / 2 + 1);
    }
  }
  if (lay.hidden > 0) {
    ctx.font = font(500, 22, FONT_SANS);
    ctx.fillStyle = theme.muted;
    ctx.fillText(`+${lay.hidden} more`, g.x, g.y + lay.rows * (tile + g.rowGap) + 10);
  }
  ctx.restore();
}

/** Rank, club and stats, anchored to the right margin so they balance the grid on the left. */
function drawSide(ctx: Canvas2D<unknown>, model: CardModel, theme: CardTheme): void {
  const left = LAYOUT.side.x;
  const right = CARD_WIDTH - LAYOUT.pad;
  let y = LAYOUT.side.y;
  ctx.save();
  ctx.textBaseline = 'alphabetic';

  if (model.rank) {
    ctx.font = font(600, 18, FONT_MONO);
    ctx.fillStyle = theme.muted;
    fillTracked(ctx, `LEVEL ${model.rank.level}`, right, y + 16, 4, 'right');
    ctx.font = font(400, 42, FONT_EMOJI);
    const emojiW = ctx.measureText(model.rank.emoji).width;
    ctx.textAlign = 'right';
    ctx.fillStyle = theme.fg;
    ctx.fillText(model.rank.emoji, right + 2, y + 66);
    fitFont(ctx, model.rank.title, 700, FONT_DISPLAY, 28, right - emojiW - 16 - left, 18);
    ctx.fillStyle = theme.fg;
    ctx.fillText(model.rank.title, right - emojiW - 16, y + 64);
    y += 108;
  }

  if (model.club) {
    ctx.font = font(600, 22, FONT_MONO);
    const w = measureTracked(ctx, model.club, 3) + 48;
    const h = 50;
    const x = right - w;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, h / 2);
    ctx.fillStyle = withAlpha(theme.accent, 0.16);
    ctx.fill();
    ctx.strokeStyle = theme.accent;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = theme.fg;
    ctx.textBaseline = 'middle';
    fillTracked(ctx, model.club, x + 24, y + h / 2 + 1, 3);
    ctx.textBaseline = 'alphabetic';
    y += h + 26;
  }

  ctx.font = font(500, 24, FONT_SANS);
  ctx.fillStyle = theme.muted;
  ctx.textAlign = 'right';
  for (const s of model.stats) {
    ctx.fillText(s, right, y + 22, right - left);
    y += 40;
  }
  ctx.restore();
}

function drawFooter(ctx: Canvas2D<unknown>, model: CardModel, theme: CardTheme): void {
  const y = LAYOUT.footer.y;
  const x = LAYOUT.pad;
  ctx.save();
  ctx.textBaseline = 'alphabetic';
  // mini record
  circle(ctx, x + 18, y - 11, 18);
  ctx.fillStyle = theme.vinyl;
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  circle(ctx, x + 18, y - 11, 11);
  ctx.strokeStyle = 'rgba(255,255,255,0.14)';
  ctx.stroke();
  circle(ctx, x + 18, y - 11, 6.5);
  ctx.fillStyle = theme.accent;
  ctx.fill();
  circle(ctx, x + 18, y - 11, 2);
  ctx.fillStyle = theme.bg;
  ctx.fill();

  ctx.font = font(700, 30, FONT_DISPLAY);
  ctx.fillStyle = theme.fg;
  ctx.textAlign = 'left';
  ctx.fillText(DEFAULT_APP_NAME, x + 50, y);

  ctx.font = font(500, 24, FONT_MONO);
  ctx.fillStyle = theme.muted;
  ctx.textAlign = 'right';
  ctx.fillText(model.site, CARD_WIDTH - LAYOUT.pad, y - 2);
  ctx.restore();
}

/** Paint the whole card. `art` is the best round's cover (already loaded), or null for a gradient label. */
export function drawCard<Image>(ctx: Canvas2D<Image>, model: CardModel, theme: CardTheme, art: Image | null): void {
  const W = CARD_WIDTH;
  const H = CARD_HEIGHT;
  const L = LAYOUT;

  ctx.save();
  ctx.fillStyle = theme.bg;
  ctx.fillRect(0, 0, W, H);
  glow(ctx, 150, 240, 640, theme.accent, theme.dark ? 0.5 : 0.28);
  glow(ctx, 990, 1160, 720, theme.accent2, theme.dark ? 0.36 : 0.2);
  glow(ctx, 930, 420, 440, theme.accent3, theme.dark ? 0.2 : 0.12);
  ctx.restore();

  // eyebrow
  ctx.save();
  ctx.textBaseline = 'alphabetic';
  ctx.font = font(600, L.eyebrow.size, FONT_MONO);
  ctx.fillStyle = theme.accent;
  const leftW = fillTracked(ctx, model.eyebrowLeft, L.pad, L.eyebrow.y, L.eyebrow.tracking);
  const rightMax = W - L.pad * 2 - leftW - 40;
  fitFont(ctx, model.eyebrowRight, 600, FONT_MONO, L.eyebrow.size, rightMax - L.eyebrow.tracking * model.eyebrowRight.length, 14);
  ctx.fillStyle = theme.muted;
  fillTracked(ctx, model.eyebrowRight, W - L.pad, L.eyebrow.y, L.eyebrow.tracking, 'right');
  ctx.restore();

  drawRecord(ctx, theme, art);
  drawTonearm(ctx, theme);

  // headline
  ctx.save();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  fitFont(ctx, model.headline, 900, FONT_DISPLAY, L.headline.size, W - L.pad * 2, 32);
  ctx.fillStyle = theme.fg;
  ctx.fillText(model.headline, L.pad, L.headline.y);

  // score over the theme gradient
  ctx.font = font(600, L.score.size, FONT_MONO);
  const scoreW = ctx.measureText(model.score).width;
  const g = ctx.createLinearGradient(L.pad, L.score.y - L.score.size, L.pad + scoreW, L.score.y);
  g.addColorStop(0, theme.accent);
  g.addColorStop(0.55, theme.accent2);
  g.addColorStop(1, theme.accent3);
  ctx.fillStyle = g;
  ctx.fillText(model.score, L.pad - 6, L.score.y);
  ctx.font = font(600, 26, FONT_MONO);
  ctx.fillStyle = theme.muted;
  fillTracked(ctx, 'PTS', L.pad + scoreW + 18, L.score.y - 4, 5);

  // brag
  fitFont(ctx, model.brag, 600, FONT_SANS, L.brag.size, W - L.pad * 2, 22);
  ctx.fillStyle = withAlpha(theme.fg, 0.86);
  ctx.fillText(model.brag, L.pad, L.brag.y);

  // divider
  ctx.fillStyle = withAlpha(theme.fg, theme.dark ? 0.12 : 0.14);
  ctx.fillRect(L.pad, L.divider.y, W - L.pad * 2, 2);
  ctx.restore();

  drawGrid(ctx, model.grid, theme);
  drawSide(ctx, model, theme);
  drawFooter(ctx, model, theme);
}

/* ------------------------------------------------------------------ browser */

/** Load a CORS-clean image (Deezer's cover CDN allows it); null on error or after `timeoutMs`. */
export function loadImage(url: string, timeoutMs = 4000): Promise<HTMLImageElement | null> {
  if (typeof Image === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    const img = new Image();
    let done = false;
    const finish = (value: HTMLImageElement | null) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve(value);
    };
    const timer = setTimeout(() => finish(null), timeoutMs);
    img.crossOrigin = 'anonymous';
    img.onload = () => finish(img);
    img.onerror = () => finish(null);
    img.src = url;
  });
}

async function waitForFonts(timeoutMs = 1500): Promise<void> {
  if (typeof document === 'undefined' || !('fonts' in document)) return;
  const specs = [
    font(900, LAYOUT.headline.size, FONT_DISPLAY),
    font(700, 30, FONT_DISPLAY),
    font(600, LAYOUT.score.size, FONT_MONO),
    font(600, 24, FONT_SANS),
  ];
  await Promise.race([
    Promise.allSettled(specs.map((s) => document.fonts.load(s))),
    new Promise<void>((resolve) => setTimeout(resolve, timeoutMs)),
  ]);
}

function toBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('toBlob produced nothing'))), 'image/png');
  });
}

function paint(model: CardModel, theme: CardTheme, art: HTMLImageElement | null): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = CARD_WIDTH;
  canvas.height = CARD_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D is unavailable');
  drawCard<CanvasImageSource>(ctx, model, theme, art);
  return toBlob(canvas);
}

export interface RenderOptions extends ComposeOptions {
  /** Defaults to the active theme's CSS variables. */
  theme?: CardTheme;
}

/** Paint the card to a PNG blob. Falls back to a gradient label when the art fails or taints the canvas. */
export async function renderShareCard(state: GameState, opts: RenderOptions = {}): Promise<Blob> {
  if (typeof document === 'undefined') throw new Error('renderShareCard needs a DOM');
  const model = composeCard(state, opts);
  const theme = opts.theme ?? readCardTheme();
  const [art] = await Promise.all([model.artUrl ? loadImage(model.artUrl) : Promise.resolve(null), waitForFonts()]);
  if (!art) return paint(model, theme, null);
  try {
    return await paint(model, theme, art);
  } catch {
    // A tainted canvas (no CORS on the cached image) throws on export — the gradient label still ships.
    return paint(model, theme, null);
  }
}

const prepared = new Map<string, Promise<Blob>>();

/**
 * Render ahead of the tap (Results mounts → idle → paint) so the share sheet opens inside the
 * user-gesture window. Keyed by game + theme; re-renders after a theme switch.
 */
export function prepareShareCard(state: GameState, opts: RenderOptions = {}): Promise<Blob> {
  const theme = opts.theme ?? readCardTheme();
  const key = `${state.id}|${theme.bg}|${theme.accent}`;
  const hit = prepared.get(key);
  if (hit) return hit;
  const p = renderShareCard(state, { ...opts, theme });
  prepared.clear();
  prepared.set(key, p);
  p.catch(() => {
    if (prepared.get(key) === p) prepared.delete(key);
  });
  return p;
}

function downloadBlob(blob: Blob, fileName: string): boolean {
  if (typeof document === 'undefined' || typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') return false;
  try {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.rel = 'noopener';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    return true;
  } catch {
    return false;
  }
}

export type ShareCardOutcome = 'shared' | 'downloaded' | 'copied' | 'failed';

export interface ShareCardOptions extends RenderOptions {
  fileName?: string;
}

/**
 * Share the card: the native sheet with the PNG + caption when files can be shared, otherwise
 * download the PNG and put the caption on the clipboard. A dismissed sheet counts as shared.
 */
export async function shareCard(state: GameState, opts: ShareCardOptions = {}): Promise<ShareCardOutcome> {
  let blob: Blob;
  try {
    blob = await prepareShareCard(state, opts);
  } catch {
    return 'failed';
  }
  const caption = composeCard(state, opts).caption;
  const file = new File([blob], opts.fileName ?? cardFileName(state), { type: 'image/png' });
  const nav = typeof navigator === 'undefined' ? undefined : navigator;
  if (nav && typeof nav.share === 'function' && typeof nav.canShare === 'function' && nav.canShare({ files: [file] })) {
    try {
      await nav.share({ files: [file], text: caption, title: DEFAULT_APP_NAME });
      return 'shared';
    } catch (err) {
      if (isAbortError(err)) return 'shared';
      // fall through: some browsers advertise file sharing and then refuse
    }
  }
  const downloaded = downloadBlob(blob, file.name);
  const copied = await copyText(caption);
  if (downloaded) return 'downloaded';
  return copied ? 'copied' : 'failed';
}
