/**
 * Shareable results.
 *
 * A Wordle-style grid: a headline, a row of squares that gives away the shape of the run without
 * giving away a single answer, and a link. The no-spoiler property is the whole point — a grid
 * that leaked which item was which would make sharing it hostile, so nothing here ever emits an
 * item name, a value or an order that could be reversed into one.
 *
 * Pure and framework-free; `copyToClipboard` is the only part that touches the browser.
 */

export type ShareMark = 'great' | 'good' | 'poor' | 'miss' | 'skip';

const GLYPH: Record<ShareMark, string> = {
  great: '🟩',
  good: '🟨',
  poor: '🟧',
  miss: '🟥',
  skip: '⬜',
};

export interface ShareCard {
  /** e.g. "Price Guess — Daily 2026-09-27" */
  title: string;
  /** e.g. "7,420 points · best streak 5" */
  subtitle?: string;
  marks: readonly ShareMark[];
  url?: string;
}

/** Wrap the squares so a long run does not become one unreadable line. */
export function gridOf(marks: readonly ShareMark[], perRow = 10): string {
  const rows: string[] = [];
  for (let i = 0; i < marks.length; i += perRow) {
    rows.push(marks.slice(i, i + perRow).map((m) => GLYPH[m]).join(''));
  }
  return rows.join('\n');
}

export function renderShare(card: ShareCard): string {
  const lines = [card.title];
  if (card.subtitle) lines.push(card.subtitle);
  if (card.marks.length > 0) lines.push('', gridOf(card.marks));
  if (card.url) lines.push('', card.url);
  return lines.join('\n');
}

/**
 * Copy text, falling back to a hidden textarea where the async clipboard API is unavailable or
 * blocked (Safari without a user gesture, insecure origins, older browsers). Returns whether it
 * worked, so the UI can say "copied" only when it is true.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through to the legacy path */
  }
  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(area);
    return ok;
  } catch {
    return false;
  }
}
