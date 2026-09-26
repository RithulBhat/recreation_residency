import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import type { GameSettings } from '../src/types';

const OUT = 'test-results/play';
mkdirSync(OUT, { recursive: true });

// Real Deezer previews are played through Web Audio; let Chromium start audio without a gesture.
test.use({ launchOptions: { args: ['--autoplay-policy=no-user-gesture-required'] }, trace: 'off' });

const VIEWPORTS = {
  mobile: { width: 390, height: 844 },
  desktop: { width: 1440, height: 900 },
} as const;

const PLAYERS: GameSettings['players'] = [
  { id: 'p1', name: 'Fox', emoji: '🦊', color: '#f97316' },
  { id: 'p2', name: 'Octo', emoji: '🐙', color: '#a855f7' },
];

async function settle(page: Page, ms = 700) {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(ms);
}

/** Open /play (loads the DEV hook) and start a real game from the given settings. */
async function startGame(page: Page, settings: Partial<GameSettings>) {
  await page.addInitScript(() => localStorage.clear());
  await page.goto('/#/play');
  await expect(page.getByRole('heading', { name: 'No game in progress' })).toBeVisible();
  await page.waitForFunction(() => typeof window.__songooner?.start === 'function');
  await page.evaluate(async (s) => {
    await window.__songooner!.start(s);
  }, settings);
  await expect(page.getByTestId('stage')).toBeVisible({ timeout: 20_000 });
  // "Dropping the needle…" → preview decoded
  await expect(page.getByTestId('stage')).not.toHaveAttribute('data-vinyl', 'loading', { timeout: 30_000 });
}

async function expectNoHorizontalOverflow(page: Page) {
  const r = await page.evaluate(() => ({
    doc: document.documentElement.scrollWidth,
    inner: window.innerWidth,
    widest: Array.from(document.querySelectorAll<HTMLElement>('main *'))
      .filter((el) => getComputedStyle(el).pointerEvents !== 'none')
      .filter((el) => el.getBoundingClientRect().right > window.innerWidth + 1)
      .slice(0, 4)
      .map((el) => `${el.tagName}.${el.className}`.slice(0, 140)),
  }));
  expect(r.widest, 'elements past the right edge').toEqual([]);
  expect(r.doc, `documentElement.scrollWidth ${r.doc} > innerWidth ${r.inner}`).toBeLessThanOrEqual(r.inner);
}

async function expectIconButtonsLabelled(page: Page) {
  const missing = await page.evaluate(() =>
    Array.from(document.querySelectorAll('button'))
      .filter((b) => b.textContent?.trim() === '' && !b.getAttribute('aria-label') && !b.getAttribute('aria-labelledby'))
      .map((b) => b.outerHTML.slice(0, 140)),
  );
  expect(missing, 'icon buttons without aria-label').toEqual([]);
}

test('play · no game in progress card', async ({ page }) => {
  await page.setViewportSize(VIEWPORTS.mobile);
  await page.goto('/#/play');
  await expect(page.getByRole('heading', { name: 'No game in progress' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Set up a game' })).toHaveAttribute('href', /#\/setup$/);
  await page.screenshot({ path: `${OUT}/no-game-mobile.png` });
});

test('results · redirects to setup without a finished game', async ({ page }) => {
  await page.goto('/#/results');
  await page.waitForURL(/#\/setup/);
});

for (const [name, vp] of Object.entries(VIEWPORTS)) {
  test(`play · solo flow · ${name}`, async ({ page }) => {
    test.setTimeout(180_000);
    await page.setViewportSize(vp);
    await startGame(page, { packIds: ['pop-hits'], mode: 'fixed', clipLength: 1, tries: 3, rounds: 2, hintsEnabled: true, seed: `e2e-${name}` });

    await expect(page.getByTestId('round-counter')).toContainText('1/2');
    await expectNoHorizontalOverflow(page);
    await expectIconButtonsLabelled(page);
    await settle(page);
    await page.screenshot({ path: `${OUT}/play-idle-${name}.png`, fullPage: true });

    // Press the record: the clip plays for 1 s, the ring fills, the vinyl ends in "done".
    const stage = page.getByTestId('stage');
    await page.getByRole('button', { name: /play clip/i }).click();
    await expect(stage).toHaveAttribute('data-vinyl', 'playing', { timeout: 20_000 });
    await expect(stage).toHaveAttribute('data-vinyl', 'done', { timeout: 20_000 });
    await expect(page.getByRole('button', { name: /replay clip/i })).toBeVisible();

    // Wrong guess → feedback + tries strip advances.
    const input = page.getByRole('combobox', { name: 'Your guess' });
    await input.fill('zzz definitely not a song title');
    await input.press('Enter');
    await expect(page.getByTestId('feedback')).toContainText(/Nope|So close/);
    await expect(page.getByTestId('feedback')).toContainText('2 tries left');
    await settle(page, 500);
    await page.screenshot({ path: `${OUT}/play-wrong-${name}.png`, fullPage: true });

    // Skip → last try, then give up → reveal.
    await page.getByRole('button', { name: 'Skip try' }).click();
    await expect(page.getByTestId('feedback')).toContainText('Skipped');
    await page.getByRole('button', { name: 'Give up' }).click();
    const reveal = page.getByTestId('reveal').filter({ visible: true });
    await expect(reveal).toBeVisible();
    await expect(reveal.getByRole('link', { name: /Deezer/ })).toHaveAttribute('href', /deezer\.com\/track\/\d+/);
    await expect(reveal.getByRole('button', { name: 'Next song' })).toBeVisible();
    await settle(page);
    await page.screenshot({ path: `${OUT}/play-reveal-${name}.png`, fullPage: true });
    await expectNoHorizontalOverflow(page);

    // Next → round 2: take a hint, then find the answer through the autocomplete and win.
    await reveal.getByRole('button', { name: 'Next song' }).click();
    await expect(page.getByTestId('round-counter')).toContainText('2/2');
    await expect(stage).not.toHaveAttribute('data-vinyl', 'loading', { timeout: 30_000 });
    const answer = await page.evaluate(() => {
      const s = window.__songooner!.gameStore.getState().state;
      const t = s.rounds[s.currentRound].track;
      return { title: t.title, artist: t.artist };
    });
    await page.getByRole('button', { name: /First letter hint/ }).click();
    await expect(page.getByTestId('hints')).toContainText('Title:');
    await input.fill(answer.title.slice(0, Math.min(6, answer.title.length)));
    const option = page.getByRole('option').filter({ hasText: answer.artist }).first();
    await expect(option).toBeVisible({ timeout: 10_000 });
    await option.click();
    await expect(page.getByTestId('feedback')).toContainText(/Correct at 1s \(\+[\d,]+\)/);
    const last = page.getByTestId('reveal').filter({ visible: true });
    await expect(last).toContainText('Hints ×1');
    await expect(last).toContainText('Round score');
    await settle(page);
    await page.screenshot({ path: `${OUT}/play-won-${name}.png`, fullPage: true });
    if (name === 'desktop') {
      // "?" opens the shortcut sheet; Esc closes it.
      await page.keyboard.press('?');
      await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeVisible();
      await page.screenshot({ path: `${OUT}/play-help-desktop.png` });
      await page.keyboard.press('Escape');
      await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toHaveCount(0);
    }
    await expect(last.getByRole('button', { name: 'See results' })).toBeVisible();
    await last.getByRole('button', { name: 'See results' }).click();

    await page.waitForURL(/#\/results/);
    await expect(page.getByTestId('results-hero')).toBeVisible();
    await expect(page.getByTestId('final-score')).toBeVisible();
    await expect(page.getByTestId('round-row')).toHaveCount(2);
    await expect(page.getByTestId('results-hero')).toContainText('1/2');
    await expect(page.getByTestId('round-list')).toContainText('Correct');
    await expect(page.getByRole('button', { name: 'Play again' })).toBeVisible();
    await expect(page.getByTestId('progression')).toBeVisible();
    await settle(page, 2200); // number tickers + achievement flips
    await expectNoHorizontalOverflow(page);
    await expectIconButtonsLabelled(page);
    await page.screenshot({ path: `${OUT}/results-${name}.png`, fullPage: true });
  });
}

test('play · local duel buzzer flow', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize(VIEWPORTS.desktop);
  await startGame(page, { packIds: ['pop-hits'], mode: 'duel', duelStyle: 'buzzer', clipMode: 'escalating', stages: [0.5, 1, 2], rounds: 3, players: PLAYERS, seed: 'e2e-duel' });

  const bar = page.getByTestId('players-bar');
  await expect(bar).toBeVisible();
  await expect(bar).toContainText('Buzz in');
  const input = page.getByRole('combobox', { name: 'Your guess' });
  await expect(input).toBeDisabled();
  await expect(input).toHaveAttribute('placeholder', /Buzz in first/);

  // Fox buzzes with A.
  await page.keyboard.press('a');
  await expect(bar).toContainText('Fox is guessing');
  await expect(page.getByTestId('player-p1')).toHaveAttribute('aria-current', 'true');
  await expect(input).toBeEnabled();
  await settle(page, 400);
  await page.screenshot({ path: `${OUT}/duel-buzzed-desktop.png`, fullPage: true });

  // Wrong answer locks Fox out, buzzer clears; Octo buzzes with L.
  await input.fill('nope nope nope');
  await input.press('Enter');
  await expect(page.getByTestId('player-p1')).toContainText('locked out');
  await expect(input).toBeDisabled();
  await page.keyboard.press('l');
  await expect(bar).toContainText('Octo is guessing');
  await expect(page.getByTestId('player-p2')).toHaveAttribute('aria-current', 'true');
  await page.getByRole('button', { name: 'Fox buzz in (key A)' }).isDisabled();
  await settle(page, 300);
  await page.screenshot({ path: `${OUT}/duel-lockout-desktop.png`, fullPage: true });

  // Octo also misses → round lost → reveal for everyone.
  await input.fill('still wrong');
  await input.press('Enter');
  await expect(page.getByTestId('reveal').filter({ visible: true })).toBeVisible();
  await expectIconButtonsLabelled(page);
});

test('play · blitz clock counts down and auto-advances', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize(VIEWPORTS.mobile);
  await startGame(page, { packIds: ['pop-hits'], mode: 'blitz', clipLength: 1, blitzDuration: 40, rounds: 0, seed: 'e2e-blitz' });

  const clock = page.getByTestId('blitz-clock').getByRole('progressbar');
  await expect(clock).toBeVisible();
  const first = Number(await clock.getAttribute('aria-valuenow'));
  await page.waitForTimeout(1500);
  const later = Number(await clock.getAttribute('aria-valuenow'));
  expect(later).toBeLessThan(first);
  await expect(page.getByTestId('stage-strip')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Skip (−3s)' })).toBeVisible();
  await settle(page, 300);
  await page.screenshot({ path: `${OUT}/blitz-mobile.png`, fullPage: true });

  // A wrong guess costs 3 s and opens the next song immediately — no reveal in blitz.
  const title = await page.getByTestId('stage').getAttribute('data-vinyl');
  expect(title).not.toBeNull();
  const input = page.getByRole('combobox', { name: 'Your guess' });
  await input.fill('zzz wrong');
  await input.press('Enter');
  await expect(page.getByTestId('reveal').filter({ visible: true })).toHaveCount(0);
  await expect(page.getByTestId('feedback')).toContainText('Nope. −3s');
  await expect(input).toBeEnabled();
  await expectNoHorizontalOverflow(page);

  // Esc → quit dialog → results.
  await page.keyboard.press('Escape');
  const dialog = page.getByRole('dialog', { name: 'Quit this game?' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Quit game' }).click();
  await page.waitForURL(/#\/results/);
  await expect(page.getByTestId('results-hero')).toContainText('Called it early');
});

test('play · classic stages, host bubble and survival lives', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize(VIEWPORTS.mobile);
  await startGame(page, { packIds: ['pop-hits'], mode: 'classic', rounds: 3, voiceHost: true, seed: 'e2e-classic' });
  // Seven escalating stages, the first one current; skip unlocks the next.
  const strip = page.getByTestId('stage-strip');
  await expect(strip.getByRole('listitem')).toHaveCount(7);
  await expect(strip.getByRole('listitem').first()).toHaveAttribute('aria-current', 'step');
  await expect(page.getByRole('button', { name: 'Skip → 0.3s' })).toBeVisible();
  // The host publishes its lines as text even when speech is unavailable.
  await expect(page.getByRole('img', { name: 'Hype host' })).toBeVisible();
  await settle(page, 500);
  await page.screenshot({ path: `${OUT}/play-classic-host-mobile.png`, fullPage: true });
  await page.getByRole('button', { name: 'Skip → 0.3s' }).click();
  await expect(strip.getByRole('listitem').nth(1)).toHaveAttribute('aria-current', 'step');
  await expect(page.getByRole('button', { name: 'Skip → 1s' })).toBeVisible();
  await expectNoHorizontalOverflow(page);

  // Survival: a new game straight from the dev hook (the store already holds the classic one).
  await page.evaluate(async () => {
    await window.__songooner!.start({ packIds: ['pop-hits'], mode: 'survival', clipLength: 2, tries: 1, lives: 3, rounds: 0, seed: 'e2e-survival' });
  });
  await expect(page.getByRole('img', { name: '3 of 3 lives left' })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('stage')).not.toHaveAttribute('data-vinyl', 'loading', { timeout: 30_000 });
  await page.getByRole('button', { name: 'Give up' }).click();
  await expect(page.getByRole('img', { name: '2 of 3 lives left' })).toBeVisible();
});

test('play · a failed preview makes the record a Retry affordance (click and Space)', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize(VIEWPORTS.desktop);
  const previews = /preview[^/]*\.dzcdn\.net/;
  await page.route(previews, (route) => route.abort());
  await startGame(page, { packIds: ['pop-hits'], mode: 'fixed', clipLength: 1, tries: 3, rounds: 2, seed: 'e2e-retry' });
  const stage = page.getByTestId('stage');

  await page.getByRole('button', { name: /play clip/i }).click();
  await expect(stage).toHaveAttribute('data-error', '', { timeout: 15_000 });
  await expect(stage).toContainText(/Tap the record or press/);
  const retry = stage.getByRole('button', { name: /Retry clip/ });
  await expect(retry).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Give up & next' })).toBeVisible();

  // Unblock the CDN: the record retries and clears the error; Space replays.
  await page.unroute(previews);
  await retry.click();
  await expect(stage).toHaveAttribute('data-vinyl', 'playing', { timeout: 20_000 });
  await expect(stage).not.toHaveAttribute('data-error', '');
  await expect(stage).toHaveAttribute('data-vinyl', 'done', { timeout: 20_000 });
  await page.keyboard.press('Space');
  await expect(stage).toHaveAttribute('data-vinyl', 'playing', { timeout: 20_000 });
});

test('play · auto-reveal before any gesture shows "tap to hear" instead of a silent spinning record', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize(VIEWPORTS.mobile);
  // Emulate iOS: the context starts suspended and resume() is refused until a real pointer gesture.
  await page.addInitScript(() => {
    let gesture = false;
    document.addEventListener('pointerdown', () => (gesture = true), true);
    const Real = window.AudioContext;
    window.AudioContext = class extends Real {
      constructor(o?: AudioContextOptions) {
        super(o);
        void super.suspend();
      }
      override resume(): Promise<void> {
        return gesture ? super.resume() : Promise.resolve();
      }
    };
  });
  await startGame(page, { packIds: ['pop-hits'], mode: 'fixed', clipLength: 1, tries: 1, rounds: 2, seed: 'e2e-autoplay' });
  const stage = page.getByTestId('stage');

  // Give up via the keyboard so no pointer gesture unlocks audio; the lost round auto-reveals.
  await page.getByRole('button', { name: 'Give up' }).focus();
  await page.keyboard.press('Enter');
  await expect(stage).toContainText('Tap the record to hear the song', { timeout: 10_000 });
  await expect(stage).not.toHaveAttribute('data-vinyl', 'playing');
  await expect(stage.locator('.text-danger')).toHaveCount(0); // expected state, not an error
  const hear = stage.getByRole('button', { name: 'Hear the song' });
  await expect(hear).toBeEnabled();
  await hear.click();
  await expect(stage).toHaveAttribute('data-vinyl', 'playing', { timeout: 20_000 });
  await expect(stage).not.toHaveAttribute('data-error', '');
});

test('play · party pass-the-phone interstitial', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize(VIEWPORTS.mobile);
  await startGame(page, {
    packIds: ['pop-hits'],
    mode: 'party',
    clipMode: 'fixed',
    clipLength: 2,
    tries: 1,
    rounds: 3,
    players: [...PLAYERS, { id: 'p3', name: 'Frog', emoji: '🐸', color: '#34d399' }],
    seed: 'e2e-party',
  });
  const bar = page.getByTestId('players-bar');
  await expect(bar).toContainText("Fox's turn");
  await page.getByRole('button', { name: 'Give up' }).click();
  const reveal = page.getByTestId('reveal').filter({ visible: true });
  await reveal.getByRole('button', { name: 'Next song' }).click();
  const pass = page.getByRole('dialog');
  await expect(pass).toContainText('Pass the phone');
  await expect(pass).toContainText("Octo, you're up");
  await settle(page, 400);
  await page.screenshot({ path: `${OUT}/party-pass-mobile.png` });
  await pass.getByRole('button', { name: "I'm ready" }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(bar).toContainText("Octo's turn");
  await expect(page.getByTestId('player-p2')).toHaveAttribute('aria-current', 'true');
});
