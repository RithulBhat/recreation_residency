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

/**
 * Open /songooner/play (loads the DEV hook) and start a real game from the given settings. The first-run coach
 * marks are pre-dismissed unless a test asks for them (`coach: true`).
 */
async function startGame(page: Page, settings: Partial<GameSettings>, opts: { coach?: boolean; stats?: unknown } = {}) {
  await page.addInitScript(
    ({ coach, stats }) => {
      localStorage.clear();
      if (!coach) localStorage.setItem('sg:coach:play', 'done');
      if (stats !== undefined) localStorage.setItem('sg:stats', JSON.stringify(stats));
    },
    { coach: opts.coach ?? false, stats: opts.stats },
  );
  await page.goto('/#/songooner/play');
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
  await page.goto('/#/songooner/play');
  await expect(page.getByRole('heading', { name: 'No game in progress' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Set up a game' })).toHaveAttribute('href', /#\/songooner\/setup$/);
  await page.screenshot({ path: `${OUT}/no-game-mobile.png` });
});

test('results · redirects to setup without a finished game', async ({ page }) => {
  await page.goto('/#/songooner/results');
  await page.waitForURL(/#\/songooner\/setup/);
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

    // Every hint kind sits behind one Hint button — the year comes from the /track lookup the round-open does (P2-1).
    const hintButton = page.getByTestId('hint-button');
    await expect(hintButton).toBeEnabled();
    await expect(hintButton).toHaveAccessibleName(/Hints, 2 left/);
    await hintButton.click();
    await expect(page.getByRole('button', { name: /Release year hint/ })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('button', { name: /First letter hint/ })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('hint-menu')).toHaveCount(0);
    // The round chips hold the verdict slot on phones; the record breathes until its first tap.
    if (name === 'mobile') await expect(page.getByTestId('round-chips')).toBeVisible();
    await expect(page.locator('[data-nudge]')).toHaveCount(1);

    // Press the record — twice, fast. The double-tap guard swallows the bounce (P3-2): the clip
    // plays for 1 s, the ring fills, the vinyl ends in "done", and it counted as ONE listen. The
    // tonearm lands on the groove while it plays and hovers ("cue") once the clip ends.
    const stage = page.getByTestId('stage');
    await page.getByRole('button', { name: /play clip/i }).dblclick();
    await expect(stage).toHaveAttribute('data-vinyl', 'playing', { timeout: 20_000 });
    await expect(stage).toHaveAttribute('data-tonearm', 'down');
    await expect(stage).toHaveAttribute('data-vinyl', 'done', { timeout: 20_000 });
    await expect(stage).toHaveAttribute('data-tonearm', 'cue');
    await expect(page.getByRole('button', { name: /replay clip/i })).toBeVisible();
    await expect(page.locator('[data-nudge]')).toHaveCount(0);
    expect(await page.evaluate(() => window.__songooner!.gameStore.getState().state.rounds[0].playsThisTry)).toBe(1);

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
    await expect(page.getByTestId('outcome')).toHaveText(/The answer/i);
    await expect(reveal.getByRole('link', { name: /Deezer/ })).toHaveAttribute('href', /deezer\.com\/track\/\d+/);
    await expect(reveal.getByRole('button', { name: 'Next song' })).toBeVisible();
    // The meta line carries the release year now ("2019 · After Hours").
    await expect(reveal).toContainText(/(19|20)\d{2} · /);
    // The lost round auto-plays (faded in) with a slim "tap to stop" strip under the record.
    await expect(stage).toHaveAttribute('data-vinyl', 'playing', { timeout: 20_000 });
    await expect(stage.getByTestId('reveal-progress')).toBeVisible();
    await settle(page);
    await page.screenshot({ path: `${OUT}/play-reveal-${name}.png`, fullPage: true });
    await stage.getByTestId('reveal-progress').click();
    await expect(stage).not.toHaveAttribute('data-vinyl', 'playing');
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
    if (name === 'desktop') {
      // Next hands focus to the field (a frame later); leave it, then H opens the hint menu, ↓ walks
      // it and Enter takes a hint.
      await expect(input).toBeFocused();
      await input.blur();
      await page.keyboard.press('h');
      await expect(page.getByRole('dialog', { name: 'Hints' })).toBeVisible();
      await expect(page.getByRole('button', { name: /Release year hint/ })).toBeFocused();
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('ArrowDown');
      await expect(page.getByRole('button', { name: /First letter hint/ })).toBeFocused();
      await page.keyboard.press('Enter');
    } else {
      await page.getByTestId('hint-button').click();
      await page.getByRole('button', { name: /First letter hint/ }).click();
    }
    await expect(page.getByTestId('hint-menu')).toHaveCount(0);
    await expect(page.getByTestId('hints')).toContainText('Title:');
    await input.fill(answer.title.slice(0, Math.min(6, answer.title.length)));
    const option = page.getByRole('option').filter({ hasText: answer.artist }).first();
    await expect(option).toBeVisible({ timeout: 10_000 });
    await option.click();
    await expect(page.getByTestId('feedback').filter({ visible: true })).toContainText(/Correct at 1s \(\+[\d,]+\)/);
    const last = page.getByTestId('reveal').filter({ visible: true });
    await expect(last).toContainText('Hints ×1');
    await expect(last).toContainText('First try');
    await expect(last).toContainText('Round score');
    // A 1 s win is not a 0.1 s Club win: no stamp, the outcome label carries the clip.
    await expect(page.getByTestId('outcome')).toHaveText(/Nailed it · 1s/i);
    await expect(page.getByTestId('club-stamp')).toHaveCount(0);
    await expect(stage).toHaveAttribute('data-tonearm', 'rest');
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

    await page.waitForURL(/#\/songooner\/results/);
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
  await expect(page.getByTestId('blitz-readout')).toHaveText(/0:[34]\d/);
  await expect(page.getByTestId('blitz-tally')).toHaveText(/0\s*songs/);
  const first = Number(await clock.getAttribute('aria-valuenow'));
  await page.waitForTimeout(1500);
  const later = Number(await clock.getAttribute('aria-valuenow'));
  expect(later).toBeLessThan(first);
  await expect(page.getByTestId('stage-strip')).toHaveCount(0);
  await expect(page.getByTestId('hint-button')).toHaveCount(0); // no hint budget in blitz
  await expect(page.getByRole('button', { name: 'Skip (−3s)' })).toBeVisible();
  // Under ten seconds the readout turns red and pulses.
  await page.evaluate(() => {
    const store = window.__songooner!.gameStore;
    store.setState((s) => ({ state: { ...s.state, blitzEndsAt: Date.now() + 8000 } }));
  });
  await expect(page.getByTestId('blitz-readout')).toHaveClass(/blitz-urgent/);
  await expect(page.getByTestId('blitz-readout')).toHaveClass(/text-danger/);
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
  await page.waitForURL(/#\/songooner\/results/);
  await expect(page.getByTestId('results-hero')).toContainText('Called it early');
  // Blitz-native copy: songs against the clock, and the clock (not the wall time) as the duration.
  await expect(page.getByTestId('blitz-summary')).toContainText('0 songs in 40 s');
  await expect(page.getByTestId('results-hero')).toContainText('40s');
});

test('play · quitting before touching anything discards the game (nothing recorded)', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize(VIEWPORTS.desktop);
  await startGame(page, { packIds: ['pop-hits'], mode: 'classic', rounds: 3, seed: 'e2e-discard' });
  await page.keyboard.press('Escape');
  const dialog = page.getByRole('dialog', { name: 'Quit this game?' });
  await dialog.getByRole('button', { name: 'Quit game' }).click();
  await page.waitForURL(/#\/songooner\/setup/);
  await expect(page.getByText('Game discarded')).toBeVisible();
  const games = await page.evaluate(() => {
    const raw = localStorage.getItem('sg:stats');
    if (!raw) return 0;
    const parsed = JSON.parse(raw) as { state?: { totals?: { games?: number } } };
    return parsed.state?.totals?.games ?? 0;
  });
  expect(games).toBe(0);
  // The results screen has nothing to show for it either.
  await page.goto('/#/songooner/results');
  await page.waitForURL(/#\/songooner\/setup/);
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

test('play · a failed preview is announced on round open and makes the record a Retry affordance', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize(VIEWPORTS.desktop);
  const previews = /preview[^/]*\.dzcdn\.net/;
  await page.route(previews, (route) => route.abort());
  await startGame(page, { packIds: ['pop-hits'], mode: 'fixed', clipLength: 1, tries: 3, rounds: 2, seed: 'e2e-retry' });
  const stage = page.getByTestId('stage');

  // No tap needed: the strict preload already failed, so the round opens in the error state (P2-6).
  await expect(stage).toHaveAttribute('data-error', '', { timeout: 15_000 });
  await expect(stage).toContainText("Couldn't load this preview");
  await expect(stage).toContainText(/Tap the record or press/);
  const retry = stage.getByRole('button', { name: /Retry clip/ });
  await expect(retry).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Give up & next' })).toBeVisible();
  await page.screenshot({ path: `${OUT}/play-preview-failed-desktop.png` });

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

for (const vp of [
  { width: 844, height: 390 },
  { width: 926, height: 428 },
]) {
  test(`play · landscape phone ${vp.width}×${vp.height} keeps the record and the guess box on one screen`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize(vp);
    await startGame(page, { packIds: ['pop-hits'], mode: 'classic', rounds: 3, hintsEnabled: true, seed: 'e2e-landscape' });
    await expect(page.getByTestId('stage')).toHaveAttribute('data-compact', '');
    await settle(page);
    await page.screenshot({ path: `${OUT}/play-landscape-${vp.width}x${vp.height}.png` });
    await expectNoHorizontalOverflow(page);

    const record = await page.getByRole('button', { name: /play clip/i }).boundingBox();
    const input = await page.getByRole('combobox', { name: 'Your guess' }).boundingBox();
    const skip = await page.getByRole('button', { name: /^Skip/ }).boundingBox();
    const hint = await page.getByTestId('hint-button').boundingBox();
    for (const [label, box] of [['record', record], ['input', input], ['skip', skip], ['hint', hint]] as const) {
      expect(box, `${label} has a box`).not.toBeNull();
      expect(box!.y, `${label} top`).toBeGreaterThanOrEqual(0);
      expect(box!.y + box!.height, `${label} bottom within ${vp.height}`).toBeLessThanOrEqual(vp.height + 1);
    }
    // The record sits to the LEFT of the guess box, not above it.
    expect(record!.x + record!.width).toBeLessThanOrEqual(input!.x + 1);
    const tall = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
    expect(tall, 'page height past the viewport').toBeLessThanOrEqual(120);

    // Reveal in landscape: the card lands beside the record.
    await page.getByRole('button', { name: 'Give up' }).click();
    await expect(page.getByTestId('reveal').filter({ visible: true })).toBeVisible();
    await settle(page);
    await page.screenshot({ path: `${OUT}/play-landscape-reveal-${vp.width}x${vp.height}.png` });
    await expectNoHorizontalOverflow(page);
  });
}

test('play · first-run coach marks show once, walk three steps and never come back', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize(VIEWPORTS.mobile);
  await startGame(page, { packIds: ['pop-hits'], mode: 'classic', rounds: 3, seed: 'e2e-coach' }, { coach: true });
  const marks = page.getByTestId('coach-marks');
  await expect(marks).toBeVisible();
  const dialog = marks.getByRole('dialog', { name: 'Tap the record' });
  await expect(dialog).toBeVisible();
  await expect(marks).toContainText('1/3');
  // The record stays sharp under a spotlight (no blur), and the copy uses the run's real first clip.
  await expect(marks.getByTestId('coach-spotlight')).toHaveClass(/coach-spotlight/);
  await expect(dialog).toContainText('You get 0.1s of the song');
  await settle(page, 400);
  await page.screenshot({ path: `${OUT}/coach-1-mobile.png` });

  // Keyboard: → walks forward, Next walks forward, Esc dismisses for good.
  await page.keyboard.press('ArrowRight');
  await expect(marks.getByRole('dialog', { name: 'Type your guess' })).toBeVisible();
  await marks.getByTestId('coach-next').click();
  await expect(marks.getByRole('dialog', { name: 'Skip grows the clip' })).toBeVisible();
  await expect(marks.getByTestId('coach-next')).toHaveText('Got it');
  await expect(marks.getByRole('listitem').nth(2)).toHaveAttribute('aria-current', 'step');
  await settle(page, 300);
  await page.screenshot({ path: `${OUT}/coach-3-mobile.png` });
  await page.keyboard.press('Escape');
  await expect(marks).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('sg:coach:play'))).toBe('done');

  // Leave and come back through the app: the game is still there, the coach marks are not.
  await page.evaluate(() => {
    location.hash = '#/songooner/setup';
  });
  await expect(page.getByTestId('start-game')).toBeVisible();
  await page.evaluate(() => {
    location.hash = '#/songooner/play';
  });
  await expect(page.getByTestId('stage')).toBeVisible();
  await settle(page, 400);
  await expect(page.getByTestId('coach-marks')).toHaveCount(0);
});

test('play · the 0.1 s Club stamp lands on a win heard at 0.1 s, with the lifetime tally', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize(VIEWPORTS.mobile);
  // Six 0.1 s wins on record already (the same figure the results card reads).
  const stats = { state: { totals: { byClipBucket: { '0.1': { seen: 9, correct: 6 } } } }, version: 1 };
  await startGame(page, { packIds: ['pop-hits'], mode: 'classic', rounds: 2, seed: 'e2e-club' }, { stats });
  const stage = page.getByTestId('stage');
  const input = page.getByRole('combobox', { name: 'Your guess' });
  const answer = async () =>
    page.evaluate(() => {
      const s = window.__songooner!.gameStore.getState().state;
      const t = s.rounds[s.currentRound].track;
      return `${t.artist} - ${t.title}`;
    });
  await input.fill(await answer());
  await input.press('Enter');
  const stamp = page.getByTestId('club-stamp');
  await expect(stamp).toBeVisible();
  await expect(stamp).toContainText('0.1s');
  await expect(stamp).toContainText('Club');
  await expect(stamp).toContainText('×7');
  await expect(page.getByTestId('outcome')).toHaveText(/Nailed it · 0.1s/i);
  await settle(page, 1300);
  await page.screenshot({ path: `${OUT}/club-stamp-mobile.png` });

  // Round 2: a skip grows the clip to 0.3 s — that win is not a club win.
  await page.getByTestId('reveal').filter({ visible: true }).getByRole('button', { name: 'Next song' }).click();
  await expect(stage).not.toHaveAttribute('data-vinyl', 'loading', { timeout: 30_000 });
  await page.getByRole('button', { name: 'Skip → 0.3s' }).click();
  await input.fill(await answer());
  await input.press('Enter');
  await expect(page.getByTestId('outcome')).toHaveText(/Nailed it · 0.3s/i);
  await expect(page.getByTestId('club-stamp')).toHaveCount(0);
});

test('play · touch autocomplete offers "Submit as is" on top of 44 px rows', async ({ browser }) => {
  test.setTimeout(120_000);
  const ctx = await browser.newContext({ viewport: VIEWPORTS.mobile, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  try {
    await startGame(page, { packIds: ['pop-hits'], mode: 'fixed', clipLength: 1, tries: 3, rounds: 2, seed: 'e2e-touch' });
    const answer = await page.evaluate(() => {
      const s = window.__songooner!.gameStore.getState().state;
      return s.rounds[s.currentRound].track.title;
    });
    // No keyboard on a phone: the record's status line says "tap", never "press Space".
    await expect(page.getByTestId('stage')).toContainText(/Tap the record/i);
    await expect(page.getByTestId('stage')).not.toContainText(/press/i);
    const input = page.getByRole('combobox', { name: 'Your guess' });
    await input.fill(answer.slice(0, Math.min(4, answer.length)));
    const submitRow = page.getByTestId('submit-as-is');
    await expect(submitRow).toBeVisible({ timeout: 10_000 });
    await expect(submitRow).toContainText('Submit “');
    const rows = page.getByRole('option').filter({ hasNotText: 'Submit “' });
    await expect(rows.first()).toBeVisible({ timeout: 10_000 });
    for (const box of await Promise.all([submitRow.boundingBox(), rows.first().boundingBox()])) {
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    }
    await settle(page, 300);
    await page.screenshot({ path: `${OUT}/touch-autocomplete-mobile.png` });
    await submitRow.tap();
    await expect(page.getByTestId('feedback')).toContainText(/Nope|So close|Correct|Artist/);
  } finally {
    await ctx.close();
  }
});
