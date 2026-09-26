import { expect, test, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import type { GameSettings } from '../src/types';

/**
 * Results screen + sharing, end to end against real Deezer previews.
 *
 * Games are started through the DEV hook and each round is resolved through the store (a listen,
 * then the exact title or a give-up) so the outcome is deterministic; the screen under test is
 * everything after `/#/songooner/results` lands. Web Share and the clipboard are stubbed per test so the
 * result card (a File) and the challenge link (text) can be captured and inspected in-page.
 */

const OUT = process.env.RESULTS_OUT ?? 'test-results/results';
mkdirSync(OUT, { recursive: true });

// Real previews go through Web Audio; let Chromium start audio without a gesture.
test.use({ launchOptions: { args: ['--autoplay-policy=no-user-gesture-required'] }, trace: 'off' });

const VIEWPORTS = {
  mobile: { width: 390, height: 844 },
  desktop: { width: 1440, height: 900 },
} as const;
type Viewport = keyof typeof VIEWPORTS;
type Theme = 'midnight' | 'daylight';
type Outcome = 'win' | 'lose';

const PLAYERS: GameSettings['players'] = [
  { id: 'p1', name: 'Fox', emoji: '🦊', color: '#f97316' },
  { id: 'p2', name: 'Octo', emoji: '🐙', color: '#a855f7' },
  { id: 'p3', name: 'Frog', emoji: '🐸', color: '#22c55e' },
];

/** What the init script hangs on `window` for the test to read back. */
interface TestWindow {
  __shared: ShareData[];
  __copied: string[];
}

async function settle(page: Page, ms = 900): Promise<void> {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(ms);
}

/**
 * Fresh storage, coach marks dismissed, theme picked, and a recording stand-in for the clipboard
 * and (optionally) a file-capable Web Share API.
 */
async function boot(page: Page, opts: { theme?: Theme; share?: 'files' | 'none' } = {}): Promise<void> {
  await page.addInitScript(
    (cfg) => {
      localStorage.clear();
      localStorage.setItem('sg:coach:play', 'done');
      localStorage.setItem('sg:theme', cfg.theme);
      const tw = window as unknown as TestWindow;
      tw.__shared = [];
      tw.__copied = [];
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: {
          writeText: async (text: string) => {
            tw.__copied.push(text);
          },
        },
      });
      if (cfg.share === 'files') {
        Object.defineProperty(navigator, 'canShare', {
          configurable: true,
          value: (data?: ShareData) => Array.isArray(data?.files) && (data?.files?.length ?? 0) > 0,
        });
        Object.defineProperty(navigator, 'share', {
          configurable: true,
          value: async (data: ShareData) => {
            tw.__shared.push(data);
          },
        });
      } else {
        Object.defineProperty(navigator, 'canShare', { configurable: true, value: undefined });
        Object.defineProperty(navigator, 'share', { configurable: true, value: undefined });
      }
    },
    { theme: opts.theme ?? 'midnight', share: opts.share ?? 'none' },
  );
}

/** Open /play (loads the DEV hook) and start a real game from the given settings. */
async function startGame(page: Page, settings: Partial<GameSettings>): Promise<void> {
  await page.goto('/#/songooner/play');
  await expect(page.getByRole('heading', { name: 'No game in progress' })).toBeVisible();
  await page.waitForFunction(() => typeof window.__songooner?.start === 'function');
  await page.evaluate(async (s) => {
    await window.__songooner!.start(s);
  }, settings);
  await expect(page.getByTestId('stage')).toBeVisible({ timeout: 20_000 });
}

/**
 * Resolve every round through the store: a listen, then the exact title (win) or a give-up (lose),
 * then `next`. Pass-and-play interstitials are dismissed on the way. Ends on `/#/songooner/results`.
 */
async function playOut(page: Page, outcomes: readonly Outcome[]): Promise<void> {
  for (const outcome of outcomes) {
    const ready = page.getByRole('button', { name: "I'm ready" });
    if (await ready.isVisible().catch(() => false)) await ready.click();
    await expect(page.getByTestId('stage')).not.toHaveAttribute('data-vinyl', 'loading', { timeout: 30_000 });
    await page.waitForFunction(() => window.__songooner!.gameStore.getState().state.status === 'playing');
    await page.evaluate((o) => {
      const store = window.__songooner!.gameStore.getState();
      const s = store.state;
      const round = s.rounds[s.currentRound];
      store.play();
      if (o === 'win') store.guess(round.track.title, round.activePlayerId);
      else store.giveUp();
    }, outcome);
    await page.waitForFunction(() => {
      const status = window.__songooner!.gameStore.getState().state.status;
      return status === 'round-over' || status === 'finished';
    });
    await page.waitForTimeout(300);
    await page.evaluate(() => {
      const store = window.__songooner!.gameStore.getState();
      if (store.state.status === 'round-over') store.next();
    });
  }
  await page.waitForURL(/#\/songooner\/results/, { timeout: 20_000 });
  await expect(page.getByTestId('results-hero')).toBeVisible();
  await settle(page, 1600); // number tickers + entrance springs
}

async function switchTheme(page: Page, theme: Theme): Promise<void> {
  await page.evaluate((t) => {
    document.documentElement.dataset.theme = t;
  }, theme);
  await settle(page, 500);
}

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const r = await page.evaluate(() => {
    const inScroller = (el: HTMLElement): boolean => {
      let node: HTMLElement | null = el.parentElement;
      while (node && node !== document.body) {
        const ox = getComputedStyle(node).overflowX;
        if (ox === 'auto' || ox === 'scroll' || ox === 'hidden') return true;
        node = node.parentElement;
      }
      return false;
    };
    return {
      doc: document.documentElement.scrollWidth,
      inner: window.innerWidth,
      widest: Array.from(document.querySelectorAll<HTMLElement>('main *'))
        .filter((el) => getComputedStyle(el).pointerEvents !== 'none')
        .filter((el) => !inScroller(el))
        .filter((el) => el.getBoundingClientRect().right > window.innerWidth + 1)
        .slice(0, 4)
        .map((el) => `${el.tagName}.${el.className}`.slice(0, 140)),
    };
  });
  expect(r.widest, 'elements past the right edge').toEqual([]);
  expect(r.doc, `documentElement.scrollWidth ${r.doc} > innerWidth ${r.inner}`).toBeLessThanOrEqual(r.inner);
}

async function expectIconButtonsLabelled(page: Page): Promise<void> {
  const missing = await page.evaluate(() =>
    Array.from(document.querySelectorAll('button'))
      .filter((b) => b.textContent?.trim() === '' && !b.getAttribute('aria-label') && !b.getAttribute('aria-labelledby'))
      .map((b) => b.outerHTML.slice(0, 140)),
  );
  expect(missing, 'icon buttons without aria-label').toEqual([]);
}

/** Share → Result card, then read the File the stubbed share sheet received and decode it in-page. */
async function captureCard(page: Page, file: string): Promise<{ width: number; height: number; text: string; name: string; type: string }> {
  await page.getByTestId('share-button').click();
  await expect(page.getByTestId('share-menu')).toBeVisible();
  await page.getByTestId('share-card').click();
  await expect(page.getByTestId('share-menu')).toHaveCount(0);
  await page.waitForFunction(() => (window as unknown as TestWindow).__shared.length > 0, undefined, { timeout: 20_000 });
  const info = await page.evaluate(async () => {
    const tw = window as unknown as TestWindow;
    const data = tw.__shared.pop();
    const f = data?.files?.[0];
    if (!data || !f) throw new Error('nothing was shared');
    const bitmap = await createImageBitmap(f);
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error ?? new Error('read failed'));
      reader.readAsDataURL(f);
    });
    return { width: bitmap.width, height: bitmap.height, text: data.text ?? '', name: f.name, type: f.type, dataUrl };
  });
  writeFileSync(file, Buffer.from(info.dataUrl.split(',')[1] ?? '', 'base64'));
  return { width: info.width, height: info.height, text: info.text, name: info.name, type: info.type };
}

for (const [name, vp] of Object.entries(VIEWPORTS) as [Viewport, { width: number; height: number }][]) {
  test(`results · solo · ${name}`, async ({ page }) => {
    await boot(page, { share: 'files' });
    await page.setViewportSize(vp);
    await startGame(page, { packIds: ['pop-hits'], mode: 'fixed', clipLength: 1, tries: 2, rounds: 3, seed: `e2e-results-${name}` });
    await playOut(page, ['win', 'lose', 'win']);

    // The screen: verdict, score, tiles, actions, set list.
    await expect(page.getByTestId('results-eyebrow')).toContainText('Fixed');
    await expect(page.getByTestId('results-hero')).toContainText('2/3');
    await expect(page.getByTestId('final-score')).toBeVisible();
    await expect(page.getByTestId('hero-tiles').locator('> *')).toHaveCount(4);
    await expect(page.getByTestId('round-row')).toHaveCount(3);
    await expect(page.getByRole('button', { name: 'Play again' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Change settings' })).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await expectIconButtonsLabelled(page);

    // Every hero tile shares one surface; captions sit on the same baseline.
    const tiles = await page.getByTestId('hero-tiles').locator('> *').evaluateAll((els) =>
      els.map((el) => {
        const r = el.getBoundingClientRect();
        const hint = el.lastElementChild?.getBoundingClientRect();
        return { bg: getComputedStyle(el).backgroundColor, height: Math.round(r.height), hintBottom: Math.round((hint?.bottom ?? 0) - r.bottom) };
      }),
    );
    expect(new Set(tiles.map((t) => t.bg)).size).toBe(1);
    expect(new Set(tiles.map((t) => t.hintBottom)).size).toBe(1);
    for (const t of tiles) expect(t.height).toBeGreaterThanOrEqual(112);

    // Primary actions are on screen without scrolling, and not under the tab bar.
    const again = page.getByTestId('play-again');
    const box = await again.boundingBox();
    expect(box).not.toBeNull();
    if (box) {
      expect(box.y + box.height).toBeLessThanOrEqual(vp.height);
      const hit = await page.evaluate(
        ({ x, y }) => document.elementFromPoint(x, y)?.closest('[data-testid="play-again"]') !== null,
        { x: box.x + box.width / 2, y: box.y + box.height / 2 },
      );
      expect(hit, 'Play again is hit-testable at its centre').toBe(true);
    }

    await page.screenshot({ path: `${OUT}/results-solo-midnight-${name}.png` });
    await page.screenshot({ path: `${OUT}/results-solo-midnight-${name}-full.png`, fullPage: true });

    // Share popover: keyboard-reachable, roving focus, Escape hands focus back.
    const share = page.getByTestId('share-button');
    await share.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('share-menu')).toBeVisible();
    await expect(page.getByTestId('share-card')).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(page.getByTestId('share-challenge')).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(page.getByTestId('share-card')).toBeFocused();
    await settle(page, 300);
    await page.screenshot({ path: `${OUT}/results-share-menu-midnight-${name}.png` });
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('share-menu')).toHaveCount(0);
    await expect(share).toBeFocused();

    // Result card → a 1080×1350 PNG plus the caption, handed to the share sheet.
    const card = await captureCard(page, `${OUT}/share-card-midnight-${name}.png`);
    expect(card).toMatchObject({ width: 1080, height: 1350, type: 'image/png' });
    expect(card.name).toMatch(/^songooner-fixed-\d+\.png$/);
    expect(card.text).toContain('Songooner · Fixed · 2/3 ·');
    expect(card.text).toContain('🟩');

    // Challenge link → copied when there is no share sheet.
    await page.evaluate(() => {
      Object.defineProperty(navigator, 'share', { configurable: true, value: undefined });
    });
    await share.click();
    await page.getByTestId('share-challenge').click();
    await page.waitForFunction(() => (window as unknown as TestWindow).__copied.length > 0);
    const copied = await page.evaluate(() => (window as unknown as TestWindow).__copied.at(-1) ?? '');
    expect(copied).toContain('Think you can beat that?');
    expect(copied).toMatch(/#\/songooner\/c\/[A-Za-z0-9_-]+/);
    await expect(page.getByRole('status').filter({ hasText: 'Challenge link copied' })).toBeVisible();

    // Daylight: same screen, same card, light tokens.
    await page.evaluate(() => {
      Object.defineProperty(navigator, 'share', {
        configurable: true,
        value: async (data: ShareData) => {
          (window as unknown as TestWindow).__shared.push(data);
        },
      });
    });
    await switchTheme(page, 'daylight');
    await page.screenshot({ path: `${OUT}/results-solo-daylight-${name}.png` });
    const light = await captureCard(page, `${OUT}/share-card-daylight-${name}.png`);
    expect(light).toMatchObject({ width: 1080, height: 1350 });
  });

  test(`results · party · ${name}`, async ({ page }) => {
    await boot(page);
    await page.setViewportSize(vp);
    await startGame(page, { packIds: ['pop-hits'], mode: 'party', clipLength: 1, clipMode: 'fixed', tries: 2, rounds: 3, players: PLAYERS, seed: `e2e-party-${name}` });
    await playOut(page, ['win', 'lose', 'lose']);

    // The hero leads with the winner, not a combined total.
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Fox takes it.');
    await expect(page.getByTestId('hero-players')).toContainText('3 players');
    await expect(page.getByTestId('podium')).toBeVisible();
    if (name === 'mobile') {
      await expect(page.getByTestId('standings-list')).toBeVisible();
      await expect(page.getByTestId('standings-list').locator('> li')).toHaveCount(3);
      await expect(page.getByTestId('standings-list').locator('> li').first()).toContainText('Fox');
      await expect(page.getByTestId('podium-steps')).toBeHidden();
    } else {
      await expect(page.getByTestId('podium-steps')).toBeVisible();
      await expect(page.getByTestId('standings-list')).toBeHidden();
    }
    // Actions still sit above the standings.
    const [actions, podium] = await Promise.all([page.getByTestId('result-actions').boundingBox(), page.getByTestId('podium').boundingBox()]);
    expect(actions && podium && actions.y < podium.y).toBe(true);
    await expectNoHorizontalOverflow(page);
    await page.screenshot({ path: `${OUT}/results-party-midnight-${name}.png` });
    await switchTheme(page, 'daylight');
    await page.screenshot({ path: `${OUT}/results-party-daylight-${name}.png` });
  });

  test(`results · daily · ${name}`, async ({ page }) => {
    await boot(page);
    await page.setViewportSize(vp);
    await startGame(page, { packIds: ['pop-hits'], mode: 'fixed', clipLength: 1, tries: 2, rounds: 3, daily: '2026-09-26', seed: 'daily-2026-09-26' });
    await playOut(page, ['win', 'win', 'lose']);

    // The eyebrow and the daily card format the date like the Daily screen — never the ISO string.
    await expect(page.getByTestId('results-eyebrow')).toContainText('Daily · Sat, Sep 26, 2026');
    await expect(page.getByTestId('results-eyebrow')).not.toContainText('2026-09-26');
    await expect(page.getByTestId('daily-card')).toContainText('Daily · Sat, Sep 26, 2026');
    await expect(page.getByTestId('daily-card')).toContainText('Next daily in');
    await expectNoHorizontalOverflow(page);
    await page.screenshot({ path: `${OUT}/results-daily-midnight-${name}.png` });
    await page.screenshot({ path: `${OUT}/results-daily-midnight-${name}-full.png`, fullPage: true });
    await switchTheme(page, 'daylight');
    await page.screenshot({ path: `${OUT}/results-daily-daylight-${name}.png` });
  });
}
