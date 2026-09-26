import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';

/**
 * Online duel lobby, end to end against the real PeerJS cloud signalling server.
 *
 * The race test drives TWO browser contexts: page A hosts a room, page B joins with the code it
 * read out of the DOM, the host sends a real Deezer-backed pool, the guest readies up and the host
 * starts — both pages must land on `#/play`.
 */

const OUT = 'test-results/duel';
mkdirSync(OUT, { recursive: true });

const BASE = 'http://localhost:5173';
const MOBILE = { width: 390, height: 844 } as const;
const DESKTOP = { width: 1440, height: 900 } as const;

// The public signalling server is occasionally slow; give the whole file a couple of retries.
test.describe.configure({ mode: 'serial', retries: 2 });

async function settle(page: Page): Promise<void> {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(700);
}

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const r = await page.evaluate(() => {
    // Chip rows are deliberately swipeable, so anything clipped by a scroll container is fine.
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
      body: document.body.scrollWidth,
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
  expect(r.body, `body.scrollWidth ${r.body} > innerWidth ${r.inner}`).toBeLessThanOrEqual(r.inner);
}

async function expectIconButtonsLabelled(page: Page): Promise<void> {
  const missing = await page.evaluate(() =>
    Array.from(document.querySelectorAll('button'))
      .filter((b) => b.textContent?.trim() === '' && !b.getAttribute('aria-label') && !b.getAttribute('aria-labelledby'))
      .map((b) => b.outerHTML.slice(0, 140)),
  );
  expect(missing, 'icon buttons without aria-label').toEqual([]);
}

function gameId(page: Page): Promise<string> {
  return page.evaluate(() => window.__songooner!.gameStore.getState().state.id);
}

/** Drive a 5-round race to the end through the dev hook: give up, next, five times. */
async function finishRace(page: Page): Promise<void> {
  await page.waitForFunction(() => window.__songooner?.gameStore.getState().state.status === 'playing');
  for (let i = 0; i < 5; i++) {
    await page.evaluate(() => {
      const store = window.__songooner!.gameStore.getState();
      if (store.state.status === 'playing') store.giveUp();
    });
    await page.waitForTimeout(150);
    await page.evaluate(() => {
      const store = window.__songooner!.gameStore.getState();
      if (store.state.status === 'round-over') store.next();
    });
    await page.waitForTimeout(150);
  }
}

/** Landing → identity → hosting, for one viewport. No opponent needed. */
for (const [name, vp] of Object.entries({ mobile: MOBILE, desktop: DESKTOP })) {
  test(`duel · lobby states · ${name}`, async ({ page }) => {
    test.setTimeout(90_000);
    await page.addInitScript(() => {
      localStorage.clear();
      localStorage.setItem('sg:coach:play', 'done');
    });
    await page.setViewportSize(vp);
    await page.goto(`${BASE}/#/duel`);
    await settle(page);

    await expect(page.getByRole('heading', { name: 'Duel a friend' })).toBeVisible();
    await expect(page.getByTestId('duel-same-device')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'How online duels work' })).toBeVisible();
    await page.screenshot({ path: `${OUT}/landing-${name}.png`, fullPage: true });
    await expectNoHorizontalOverflow(page);
    await expectIconButtonsLabelled(page);

    await page.getByTestId('duel-online').click();
    await expect(page.getByTestId('duel-name')).toBeVisible();
    // Identity gates both actions until there is a name to show the opponent.
    await expect(page.getByTestId('duel-create')).toBeDisabled();
    await page.getByTestId('duel-name').fill('Solo');
    await expect(page.getByTestId('duel-create')).toBeEnabled();
    await settle(page);
    await page.screenshot({ path: `${OUT}/identity-${name}.png`, fullPage: true });
    await expectNoHorizontalOverflow(page);

    await page.getByTestId('duel-create').click();
    await expect(page.getByTestId('room-code')).toBeVisible({ timeout: 45_000 });
    await expect(page.getByTestId('duel-status').first()).toContainText('Waiting for opponent', { timeout: 45_000 });
    const code = (await page.getByTestId('room-code').getAttribute('data-code')) ?? '';
    expect(code).toMatch(/^[A-Z2-9]{6}$/);
    await expect(page.getByTestId('duel-send-config')).toBeDisabled();
    await settle(page);
    await page.screenshot({ path: `${OUT}/host-waiting-${name}.png`, fullPage: true });
    await expectNoHorizontalOverflow(page);
    await expectIconButtonsLabelled(page);

    // Leaving drops the room and returns to the two big choices.
    await page.getByTestId('duel-leave').click();
    await expect(page.getByTestId('duel-same-device')).toBeVisible();
  });
}

test('duel · two browsers race each other', async ({ browser }) => {
  test.setTimeout(240_000);
  const hostCtx = await browser.newContext({ viewport: DESKTOP });
  const guestCtx = await browser.newContext({ viewport: MOBILE });
  const a = await hostCtx.newPage();
  const b = await guestCtx.newPage();
  const errors: string[] = [];
  for (const [tag, p] of [['host', a], ['guest', b]] as const) {
    p.on('pageerror', (e) => errors.push(`${tag}: ${e.message}`));
  }

  try {
    for (const p of [a, b]) {
      await p.addInitScript(() => {
        localStorage.clear();
        localStorage.setItem('sg:coach:play', 'done');
      });
    }

    /* ---- host opens a room ---- */
    await a.goto(`${BASE}/#/duel`);
    await a.getByTestId('duel-online').click();
    await a.getByTestId('duel-name').fill('Ace');
    await a.getByTestId('duel-create').click();
    await expect(a.getByTestId('room-code')).toBeVisible({ timeout: 45_000 });
    await expect(a.getByTestId('duel-status').first()).toContainText('Waiting for opponent', { timeout: 45_000 });
    const code = (await a.getByTestId('room-code').getAttribute('data-code')) ?? '';
    expect(code).toMatch(/^[A-Z2-9]{6}$/);

    /* ---- guest joins through a share link ---- */
    await b.goto(`${BASE}/#/duel?join=${code}`);
    await expect(b.getByTestId('duel-code-input')).toHaveValue(code);
    await b.getByTestId('duel-name').fill('Bee');
    await b.getByTestId('duel-join').click();

    /* ---- both sides connected ---- */
    await expect(a.getByTestId('duel-status').first()).toContainText('Connected', { timeout: 60_000 });
    await expect(b.getByTestId('duel-status').first()).toContainText('Connected', { timeout: 60_000 });
    await expect(a.getByTestId('duel-opponent')).toContainText('Bee');
    await expect(b.getByTestId('duel-opponent')).toContainText('Ace');
    await settle(a);
    await settle(b);
    await a.screenshot({ path: `${OUT}/host-connected-desktop.png`, fullPage: true });
    await b.screenshot({ path: `${OUT}/guest-joined-mobile.png`, fullPage: true });
    await expectNoHorizontalOverflow(a);
    await expectNoHorizontalOverflow(b);
    await expectIconButtonsLabelled(a);
    await expectIconButtonsLabelled(b);

    /* ---- host picks a small pack + 5 rounds and sends the pool ---- */
    const popHits = a.getByRole('button', { name: /Pop Hits/ }).first();
    await expect(popHits).toHaveAttribute('aria-pressed', 'true');
    await a.getByRole('radiogroup', { name: 'Rounds' }).getByRole('radio', { name: '5', exact: true }).click();
    await expect(a.getByTestId('duel-summary')).toContainText('5 rounds');

    await a.getByTestId('duel-send-config').click();
    await expect(a.getByTestId('duel-await-ready')).toBeVisible({ timeout: 90_000 });
    await expect(a.getByTestId('duel-await-ready')).toContainText('Bee');

    /* ---- guest sees the setup and readies ---- */
    await expect(b.getByTestId('duel-summary')).toBeVisible({ timeout: 30_000 });
    await expect(b.getByTestId('duel-summary')).toContainText('Pop Hits');
    await expect(b.getByTestId('duel-summary')).toContainText('5 rounds');
    await b.getByTestId('duel-ready').click();
    await expect(b.getByTestId('duel-guest-ready')).toBeVisible();

    /* ---- host starts; both count down and hand off to /play ---- */
    await expect(a.getByTestId('duel-start')).toBeVisible({ timeout: 30_000 });
    await a.getByTestId('duel-start').click();

    await expect(a.getByTestId('duel-countdown')).toBeVisible({ timeout: 10_000 });
    await expect(b.getByTestId('duel-countdown')).toBeVisible({ timeout: 10_000 });
    await a.screenshot({ path: `${OUT}/countdown-desktop.png` });
    await b.screenshot({ path: `${OUT}/countdown-mobile.png` });

    await expect(a).toHaveURL(/#\/play/, { timeout: 20_000 });
    await expect(b).toHaveURL(/#\/play/, { timeout: 20_000 });
    const firstId = await gameId(a);
    expect(await gameId(b)).toBe(firstId); // same seed, same pool → same game id on both sides

    /* ---- both race to the end (give up → next, five times) and land on results ---- */
    await finishRace(a);
    await finishRace(b);
    await expect(a).toHaveURL(/#\/results/, { timeout: 30_000 });
    await expect(b).toHaveURL(/#\/results/, { timeout: 30_000 });
    const outcomeA = a.getByTestId('duel-outcome');
    const outcomeB = b.getByTestId('duel-outcome');
    await expect(outcomeA).toBeVisible({ timeout: 15_000 });
    await expect(outcomeB).toBeVisible({ timeout: 15_000 });
    await expect(outcomeA).toContainText(/Dead heat|You win|They got you/, { timeout: 20_000 });
    await expect(outcomeB).toContainText(/Dead heat|You win|They got you/, { timeout: 20_000 });
    await settle(a);
    await settle(b);
    await a.screenshot({ path: `${OUT}/results-host-desktop.png`, fullPage: true });
    await b.screenshot({ path: `${OUT}/results-guest-mobile.png`, fullPage: true });

    /* ---- rematch: host offers, guest accepts, both count down and race again (P1-1) ---- */
    await a.getByTestId('rematch').click();
    await expect(a.getByTestId('rematch')).toContainText('Waiting for Bee to accept');
    await expect(b.getByTestId('rematch')).toContainText('Accept rematch', { timeout: 15_000 });
    await expect(b.getByTestId('rematch-note')).toContainText('Ace wants a rematch');
    await a.screenshot({ path: `${OUT}/rematch-pending-desktop.png`, fullPage: true });
    await b.screenshot({ path: `${OUT}/rematch-offer-mobile.png`, fullPage: true });
    await b.getByTestId('rematch').click();
    await expect(a.getByTestId('duel-outcome')).toHaveAttribute('data-rematch', /countdown|go/, { timeout: 30_000 });
    await a.screenshot({ path: `${OUT}/rematch-countdown-desktop.png`, fullPage: true });
    await expect(a).toHaveURL(/#\/play/, { timeout: 30_000 });
    await expect(b).toHaveURL(/#\/play/, { timeout: 30_000 });
    const secondA = await gameId(a);
    const secondB = await gameId(b);
    expect(secondA).not.toBe(firstId);
    expect(secondB).toBe(secondA);
    await expect(a.getByTestId('round-counter')).toContainText('1/5');
    await expect(b.getByTestId('round-counter')).toContainText('1/5');
    // No stale hand-off: nobody is dragged anywhere else once the rematch is running.
    await a.waitForTimeout(2500);
    await expect(a).toHaveURL(/#\/play/);
    await expect(b).toHaveURL(/#\/play/);

    /* ---- back to the lobby mid-race: no countdown left on top of it (P1-2) ---- */
    await a.evaluate(() => {
      location.hash = '#/duel';
    });
    await expect(a).toHaveURL(/#\/duel/, { timeout: 15_000 });
    await settle(a);
    // The overlay is scroll-locked and covers everything, so its absence is what makes the lobby usable.
    await expect(a.getByTestId('duel-countdown')).toHaveCount(0);
    await expect(a.getByTestId('room-code')).toBeVisible();
    await expect(a).toHaveURL(/#\/duel/); // and no second hand-off drags us back to /play
    await a.screenshot({ path: `${OUT}/back-to-lobby-desktop.png`, fullPage: true });
    await expectNoHorizontalOverflow(a);

    const leave = a.getByTestId('duel-leave');
    await expect(leave).toBeVisible();
    await leave.click({ timeout: 10_000 }); // times out if anything is covering the button
    await expect(a.getByTestId('duel-same-device')).toBeVisible();

    expect(errors, 'uncaught page errors').toEqual([]);
  } finally {
    await hostCtx.close();
    await guestCtx.close();
  }
});
