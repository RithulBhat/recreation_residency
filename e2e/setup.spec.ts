import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const OUT = 'test-results/setup';
mkdirSync(OUT, { recursive: true });

const VIEWPORTS = {
  mobile: { width: 390, height: 844 },
  desktop: { width: 1440, height: 900 },
} as const;

/** A hand-rolled challenge code: {v:1, s:seed, g:{m:mode,p:packs}, b:name, c:score}. */
function challengeCode(payload: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function settle(page: Page) {
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(700);
}

async function expectNoHorizontalOverflow(page: Page) {
  const r = await page.evaluate(() => ({
    doc: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
    inner: window.innerWidth,
    // Elements inside a horizontally scrollable row (chip strips, tab bars) are clipped by design
    // and never widen the page; anything else past the edge is a real bug.
    widest: Array.from(document.querySelectorAll<HTMLElement>('main *'))
      .filter((el) => getComputedStyle(el).pointerEvents !== 'none')
      .filter((el) => el.getBoundingClientRect().right > window.innerWidth + 1)
      .filter((el) => {
        for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
          const ox = getComputedStyle(p).overflowX;
          if (ox === 'auto' || ox === 'scroll' || ox === 'hidden') return false;
        }
        return true;
      })
      .slice(0, 4)
      .map((el) => `${el.tagName}.${el.className}`.slice(0, 140)),
  }));
  expect(r.widest, 'elements past the right edge').toEqual([]);
  expect(r.doc, `documentElement.scrollWidth ${r.doc} > innerWidth ${r.inner}`).toBeLessThanOrEqual(r.inner);
  expect(r.body, `body.scrollWidth ${r.body} > innerWidth ${r.inner}`).toBeLessThanOrEqual(r.inner);
}

async function expectIconButtonsLabelled(page: Page) {
  const missing = await page.evaluate(() =>
    Array.from(document.querySelectorAll('button'))
      .filter((b) => b.textContent?.trim() === '' && !b.getAttribute('aria-label') && !b.getAttribute('aria-labelledby'))
      .map((b) => b.outerHTML.slice(0, 140)),
  );
  expect(missing, 'icon buttons without aria-label').toEqual([]);
}

/**
 * Coarse-pointer hit areas: the visual box, or the `touch-hit-44` ::before slop, must reach 44 px.
 * Hidden elements (display:none, zero-size, collapsed panels) are skipped.
 */
async function expectTouchTargets(page: Page, selector: string) {
  const coarse = await page.evaluate(() => matchMedia('(pointer: coarse)').matches);
  expect(coarse, 'test context must emulate a coarse pointer').toBe(true);
  const small = await page.evaluate((sel) => {
    const out: string[] = [];
    for (const el of document.querySelectorAll<HTMLElement>(sel)) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const before = getComputedStyle(el, '::before');
      const slop = before.content !== 'none' && before.position === 'absolute';
      const w = Math.max(r.width, slop ? parseFloat(before.width) || 0 : 0);
      const h = Math.max(r.height, slop ? parseFloat(before.height) || 0 : 0);
      if (w < 44 || h < 44) {
        const label = el.getAttribute('aria-label') ?? el.textContent?.trim().slice(0, 30) ?? '';
        out.push(`${Math.round(w)}\u00d7${Math.round(h)} ${el.tagName.toLowerCase()} "${label}"`);
      }
    }
    return out;
  }, selector);
  expect(small, `touch targets under 44px for ${selector}`).toEqual([]);
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem('sg:coach:play', 'done'); // Start lands on /play: keep the first-run overlay out of the way
  });
});

for (const [name, vp] of Object.entries(VIEWPORTS)) {
  test(`setup · ${name}`, async ({ page }) => {
    await page.setViewportSize(vp);
    await page.goto('/#/songooner/setup');
    await settle(page);
    await expect(page.getByRole('heading', { name: 'Set up your game' })).toBeVisible();
    await expect(page.getByRole('radio', { name: /Classic/ })).toHaveAttribute('aria-checked', 'true');
    await expectNoHorizontalOverflow(page);
    await expectIconButtonsLabelled(page);
    await page.screenshot({ path: `${OUT}/setup-${name}.png`, fullPage: true });
    await page.screenshot({ path: `${OUT}/setup-${name}-fold.png`, fullPage: false });
  });

  test(`setup?mode=party · ${name}`, async ({ page }) => {
    await page.setViewportSize(vp);
    await page.goto('/#/songooner/setup?mode=party');
    await settle(page);
    await expect(page.getByRole('radio', { name: /Party/ })).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByRole('textbox', { name: 'Player 1 name' })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Player 2 name' })).toBeVisible();
    // params are stripped after being applied
    await expect.poll(() => page.evaluate(() => location.hash)).toBe('#/songooner/setup');
    await expectNoHorizontalOverflow(page);
    await expectIconButtonsLabelled(page);
    await page.screenshot({ path: `${OUT}/setup-party-${name}.png`, fullPage: true });
  });

  test(`packs · ${name}`, async ({ page }) => {
    await page.setViewportSize(vp);
    await page.goto('/#/songooner/packs');
    await settle(page);
    await expect(page.getByRole('heading', { name: /packs\. Thousands of songs\./ })).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await expectIconButtonsLabelled(page);
    await page.screenshot({ path: `${OUT}/packs-${name}.png`, fullPage: false });

    // multi-select → floating bar → add to setup
    const cards = page.getByRole('button', { name: /^Add / });
    await cards.nth(0).click();
    await cards.nth(1).click();
    await expect(page.getByRole('button', { name: 'Play 2', exact: true })).toBeVisible();
    await page.screenshot({ path: `${OUT}/packs-selected-${name}.png`, fullPage: false });
    await page.getByRole('button', { name: 'Add to setup' }).click();
    await expect.poll(() => page.evaluate(() => location.hash)).toBe('#/songooner/setup');
    await expect(page.getByRole('list', { name: 'Selected packs' }).getByRole('listitem')).toHaveCount(2);
    // both packs are named in the summary — nothing hides behind "+1"
    const summary = page.getByTestId('settings-summary');
    await expect(summary).toContainText(' + ');
    await expect(summary).not.toContainText('+1');

    // category tab + custom tab render
    await page.goto('/#/songooner/packs');
    await settle(page);
    await page.getByRole('tab', { name: /Decades/ }).click();
    await expect(page.getByTestId('category-blurb')).toContainText('Sixty years');
    await page.getByRole('tab', { name: /Your packs/i }).click();
    await expect(page.getByRole('heading', { name: 'Build a pack from anything on Deezer' })).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await page.screenshot({ path: `${OUT}/packs-custom-${name}.png`, fullPage: false });
  });

  test(`daily · ${name}`, async ({ page }) => {
    await page.setViewportSize(vp);
    await page.goto('/#/songooner/daily');
    await settle(page);
    await expect(page.getByRole('heading', { name: 'Pack of the day' })).toBeVisible();
    await expect(page.getByTestId('play-daily')).toBeVisible();
    await expect(page.getByTestId('midnight-countdown')).toHaveText(/^\d{2}:\d{2}:\d{2}$/);
    await expect(page.getByRole('list', { name: 'Last 14 days' }).getByRole('listitem')).toHaveCount(14);
    await expectNoHorizontalOverflow(page);
    await expectIconButtonsLabelled(page);
    await page.screenshot({ path: `${OUT}/daily-${name}.png`, fullPage: true });
  });

  test(`daily · played · ${name}`, async ({ page }) => {
    await page.setViewportSize(vp);
    await page.addInitScript(() => {
      const d = new Date();
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const y = new Date(d.getTime() - 86_400_000);
      const yKey = `${y.getFullYear()}-${String(y.getMonth() + 1).padStart(2, '0')}-${String(y.getDate()).padStart(2, '0')}`;
      const daily = {
        [key]: { date: key, score: 6420, correct: 8, rounds: 10, grid: '🟩 0.1s\n🟨 1s\n🟩 0.1s\n🟥 10s\n🟩 0.3s\n🟨 2s\n🟩 0.1s\n⬛ 10s\n🟩 0.1s\n🟨 4s' },
        [yKey]: { date: yKey, score: 5000, correct: 10, rounds: 10, grid: '🟩 0.1s' },
      };
      localStorage.setItem('sg:stats', JSON.stringify({ state: { totals: {}, records: [], tracks: {}, achievements: [], daily }, version: 1 }));
    });
    await page.goto('/#/songooner/daily');
    await settle(page);
    await expect(page.getByTestId('daily-score')).toContainText('6,420');
    await expect(page.getByRole('button', { name: 'Share result' })).toBeVisible();
    await expect(page.getByTestId('daily-streak')).toContainText('2-day streak');
    await expectNoHorizontalOverflow(page);
    await page.screenshot({ path: `${OUT}/daily-played-${name}.png`, fullPage: true });
  });

  test(`challenge · ${name}`, async ({ page }) => {
    await page.setViewportSize(vp);
    await page.goto('/#/songooner/c/invalid');
    await settle(page);
    await expect(page.getByRole('heading', { name: 'This challenge link is broken', level: 1 })).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await page.screenshot({ path: `${OUT}/challenge-invalid-${name}.png`, fullPage: false });

    // Links carry played + queued ids (up to 60); the copy counts what the friend will actually hear.
    const exact = challengeCode({ v: 1, s: 'e2e-seed', g: { m: 'classic', p: ['pop-hits'] }, i: Array.from({ length: 12 }, (_, k) => 1000 + k) });
    await page.goto(`/#/songooner/c/${exact}`);
    await settle(page);
    await expect(page.getByText('Same 10 songs, same order')).toBeVisible();

    const code = challengeCode({ v: 1, s: 'e2e-seed', g: { m: 'classic', p: ['pop-hits', 'nope-pack'] }, b: 'Maanu', c: 6420 });
    await page.goto(`/#/songooner/c/${code}`);
    await settle(page);
    await expect(page.getByRole('heading', { name: /Maanu challenged you/ })).toBeVisible();
    await expect(page.getByText('6,420')).toBeVisible();
    await expect(page.getByText(/nope-pack/)).toBeVisible();
    await expect(page.getByTestId('accept-challenge')).toBeEnabled();
    await expectNoHorizontalOverflow(page);
    await expectIconButtonsLabelled(page);
    await page.screenshot({ path: `${OUT}/challenge-${name}.png`, fullPage: false });
  });
}

test('daily · first daily shows the 1-day streak hook · mobile', async ({ page }) => {
  await page.setViewportSize(VIEWPORTS.mobile);
  await page.addInitScript(() => {
    const d = new Date();
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const daily = { [key]: { date: key, score: 4200, correct: 6, rounds: 10, grid: '🟩 0.1s\n🟥 10s' } };
    localStorage.setItem('sg:stats', JSON.stringify({ state: { totals: {}, records: [], tracks: {}, achievements: [], daily }, version: 1 }));
  });
  await page.goto('/#/songooner/daily');
  await settle(page);
  await expect(page.getByTestId('daily-score')).toContainText('4,200');
  await expect(page.getByTestId('daily-streak')).toContainText('1-day streak · come back tomorrow to keep it');
  await expectNoHorizontalOverflow(page);
  await page.screenshot({ path: `${OUT}/daily-first-streak-mobile.png`, fullPage: false });
});

test('setup · mode card blurbs follow the draft, not static copy', async ({ page }) => {
  await page.setViewportSize(VIEWPORTS.desktop);
  await page.goto('/#/songooner/setup');
  await settle(page);
  const classic = page.locator('[data-mode="classic"]');
  const fixed = page.locator('[data-mode="fixed"]');
  const modeHeader = page.getByRole('button', { name: /^Mode/ });
  await expect(classic).toContainText('0.1s→10s · 7 tries');
  await expect(modeHeader).toContainText('Classic · 0.1s→10s · 7 tries');

  await page.getByRole('button', { name: /^Songspot Classic preset/ }).click();
  await expect(classic).toContainText('0.1s→15s · 5 tries');
  await expect(modeHeader).toContainText('Classic · 0.1s→15s · 5 tries');

  // Sniper is a fixed-clip preset: its tile reads the draft too, and Classic falls back to the default ladder.
  await page.getByRole('button', { name: /^Sniper preset/ }).click();
  await expect(fixed).toContainText('0.3s×1 try');
  await expect(modeHeader).toContainText('Fixed clip · 0.3s×1 try');
  await expect(classic).toContainText('0.1s→10s · 7 tries');
  await page.screenshot({ path: `${OUT}/setup-mode-blurbs-desktop.png`, fullPage: false });
});

test('resume banner + confirmation before replacing a live game · mobile', async ({ page }) => {
  await page.setViewportSize(VIEWPORTS.mobile);
  await page.goto('/#/songooner/setup');
  await settle(page);
  await page.waitForFunction(() => typeof window.__songooner?.start === 'function');
  const firstId = await page.evaluate(async () => {
    await window.__songooner!.start({ packIds: ['pop-hits'], mode: 'classic', rounds: 10, seed: 'e2e-resume' });
    return window.__songooner!.gameStore.getState().state.id;
  });

  // Songooner's home shows the slim banner and it links to the game.
  await page.goto('/#/songooner');
  const banner = page.getByTestId('resume-banner');
  await expect(banner).toBeVisible();
  await expect(banner).toContainText('Round 1/10');
  await expect(banner).toContainText('Resume');
  await expect(banner).toHaveAttribute('href', /#\/songooner\/play$/);
  await expectNoHorizontalOverflow(page);
  await page.screenshot({ path: `${OUT}/resume-banner-home-mobile.png`, fullPage: false });

  // Setup shows it too, and Start asks before throwing the game away.
  await page.goto('/#/songooner/setup');
  await expect(page.getByTestId('resume-banner')).toContainText('Round 1/10');
  await page.getByTestId('start-game').click();
  const dialog = page.getByRole('dialog', { name: 'Replace the game in progress?' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('Round 1/10');
  await page.waitForTimeout(450);
  await page.screenshot({ path: `${OUT}/replace-game-dialog-mobile.png`, fullPage: false });
  await dialog.getByRole('button', { name: 'Keep it' }).click();
  await expect(dialog).toBeHidden();
  expect(await page.evaluate(() => location.hash)).toBe('#/songooner/setup');
  expect(await page.evaluate(() => window.__songooner!.gameStore.getState().state.id)).toBe(firstId);

  // Confirming starts a fresh game.
  await page.getByTestId('start-game').click();
  await page.getByTestId('confirm-replace-game').click();
  await expect.poll(() => page.evaluate(() => location.hash), { timeout: 45_000 }).toBe('#/songooner/play');
  expect(await page.evaluate(() => window.__songooner!.gameStore.getState().state.id)).not.toBe(firstId);
});

test('setup · clip mode, slider keyboard, stages, custom artist pack, start', async ({ page }) => {
  await page.setViewportSize(VIEWPORTS.desktop);
  await page.goto('/#/songooner/setup');
  await settle(page);

  // Classic → Fixed clip flips the mode too
  await page.getByRole('radio', { name: 'Fixed clip', exact: true }).click();
  await expect(page.getByRole('radio', { name: /Fixed clip/ }).first()).toHaveAttribute('aria-checked', 'true');
  const slider = page.getByRole('slider', { name: 'Clip length' });
  await expect(slider).toBeVisible();
  const before = Number(await slider.getAttribute('aria-valuenow'));
  await slider.focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  const after = Number(await slider.getAttribute('aria-valuenow'));
  expect(after).toBeGreaterThan(before);
  // pointer drag towards the right end of the track
  const box = await slider.boundingBox();
  const track = await page.getByRole('slider', { name: 'Clip length' }).locator('..').boundingBox();
  if (box && track) {
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(track.x + track.width * 0.9, box.y + box.height / 2, { steps: 8 });
    await page.mouse.up();
    expect(Number(await slider.getAttribute('aria-valuenow'))).toBeGreaterThan(after);
  }
  await expect(page.getByTestId('settings-summary')).toContainText('×3 tries');

  // Back to escalating: add + remove a stage
  await page.getByRole('radio', { name: 'Escalating stages' }).click();
  const preview = page.getByTestId('stage-preview');
  await expect(preview).toContainText('7 tries');
  await page.getByRole('button', { name: '15s stage' }).click();
  await expect(preview).toContainText('8 tries');
  await expect(page.getByRole('button', { name: '0.25s stage' })).toBeDisabled(); // max 8 reached
  await page.getByRole('button', { name: '15s stage' }).click();
  await expect(preview).toContainText('7 tries');
  await page.screenshot({ path: `${OUT}/setup-stages-desktop.png`, fullPage: false });

  // Custom artist pack from a real Deezer search
  await page.getByRole('button', { name: 'Mix packs' }).click();
  await page.getByRole('radio', { name: 'Build your own' }).click();
  await page.getByRole('searchbox', { name: 'Any artist' }).fill('Arijit Singh');
  const hit = page.getByRole('list', { name: 'Artist results' }).getByRole('button', { name: /Arijit Singh/ }).first();
  await expect(hit).toBeVisible({ timeout: 20_000 });
  await hit.click();
  const selected = page.getByRole('list', { name: 'Selected packs' });
  await expect(selected.getByText('Arijit Singh')).toBeVisible();
  await expect(page.getByRole('list', { name: 'Your packs' }).getByText('Arijit Singh', { exact: true })).toBeVisible();
  await page.screenshot({ path: `${OUT}/setup-custom-pack-desktop.png`, fullPage: false });
  await page.getByRole('button', { name: 'Done' }).click();

  // Start → navigates to #/songooner/play (Play may still be a stub)
  await page.getByTestId('start-game').click();
  await expect.poll(() => page.evaluate(() => location.hash), { timeout: 45_000 }).toBe('#/songooner/play');
});

test('setup · mobile mix packs sheet + collapsible sections', async ({ page }) => {
  await page.setViewportSize(VIEWPORTS.mobile);
  await page.goto('/#/songooner/setup');
  await settle(page);
  // rounds section starts collapsed on mobile and remembers being opened
  const rounds = page.getByRole('button', { name: /Rounds & rules/ });
  await expect(rounds).toHaveAttribute('aria-expanded', 'false');
  await rounds.click();
  await expect(rounds).toHaveAttribute('aria-expanded', 'true');
  // leave and come back through the app (a reload would re-run the localStorage.clear init script)
  await page.getByRole('navigation', { name: 'Primary mobile' }).getByRole('link', { name: 'Daily' }).click();
  await expect(page.getByRole('heading', { name: 'Pack of the day' })).toBeVisible();
  await page.getByRole('navigation', { name: 'Primary mobile' }).getByRole('link', { name: 'Lobby' }).click();
  await expect(page.getByRole('button', { name: /Rounds & rules/ })).toHaveAttribute('aria-expanded', 'true');

  await page.getByRole('button', { name: 'Mix packs' }).click();
  const dialog = page.getByRole('dialog', { name: 'Mix packs' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: /^Add / }).nth(1).click();
  await expectNoHorizontalOverflow(page);
  await page.screenshot({ path: `${OUT}/setup-sheet-mobile.png`, fullPage: false });
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('list', { name: 'Selected packs' }).getByRole('listitem')).toHaveCount(2);
});

test('setup · party with 8 players fits a 390 px phone', async ({ page }) => {
  await page.setViewportSize(VIEWPORTS.mobile);
  await page.goto('/#/songooner/setup?mode=party');
  await settle(page);
  const add = page.getByRole('button', { name: 'Add player' });
  for (let i = 0; i < 6; i++) await add.click();
  await expect(page.getByRole('list', { name: 'Players' }).getByRole('listitem')).toHaveCount(8);
  await expect(add).toBeDisabled(); // 8 is the cap
  await expect(page.getByRole('textbox', { name: 'Player 8 name' })).toBeVisible();
  await page.waitForTimeout(300);
  await expectNoHorizontalOverflow(page);
  await page.screenshot({ path: `${OUT}/setup-party8-mobile.png`, fullPage: true });

  // …and the 320 px floor too, where the name fields have the least room.
  await page.setViewportSize({ width: 320, height: 640 });
  await page.waitForTimeout(400);
  await expectNoHorizontalOverflow(page);
});

test.describe('home · featured pack autostart', () => {
  test.use({ hasTouch: true });

  test('a featured pack\u2019s play button asks before replacing a live game', async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.mobile);
    await page.goto('/#/songooner/setup');
    await settle(page);
    await page.waitForFunction(() => typeof window.__songooner?.start === 'function');
    const firstId = await page.evaluate(async () => {
      await window.__songooner!.start({ packIds: ['pop-hits'], mode: 'classic', rounds: 10, seed: 'e2e-autostart' });
      return window.__songooner!.gameStore.getState().state.id;
    });

    await page.goto('/#/songooner');
    await settle(page);
    const featured = page.locator('section[aria-labelledby="packs-title"]');
    const playPack = featured.locator('button[aria-label^="Play "]').first();
    const packName = (await playPack.getAttribute('aria-label'))!.replace(/^Play /, '');
    await playPack.tap();

    // The autostart lands on the lobby and asks, exactly like pressing Start would.
    const dialog = page.getByRole('dialog', { name: 'Replace the game in progress?' });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('Round 1/10');
    await page.screenshot({ path: `${OUT}/home-autostart-replace-dialog-mobile.png`, fullPage: false });

    // "Keep it" declines: the live game survives and nothing navigated to the play screen.
    await dialog.getByRole('button', { name: 'Keep it' }).click();
    await expect(dialog).toBeHidden();
    expect(await page.evaluate(() => location.hash)).toBe('#/songooner/setup');
    expect(await page.evaluate(() => window.__songooner!.gameStore.getState().state.id)).toBe(firstId);
    expect(await page.evaluate(() => window.__songooner!.gameStore.getState().state.status)).toBe('playing');
    // the tapped pack was still applied to the lobby, so Start is one tap away
    await expect(page.getByRole('list', { name: 'Selected packs' })).toContainText(packName);
  });
});

test.describe('setup · touch targets on a coarse pointer', () => {
  test.use({ hasTouch: true, isMobile: true });

  test('pack chips, stage chips and every other lobby control reach 44 px', async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.mobile);
    await page.goto('/#/songooner/setup');
    await settle(page);

    // The pack chips' Remove \u2715 was the worst offender in the app at 28\u00d728.
    const packChips = page.getByRole('list', { name: 'Selected packs' });
    await expect(packChips.getByRole('button', { name: /^Remove / }).first()).toBeVisible();
    await expectTouchTargets(page, '[aria-label="Selected packs"] button');
    await expectTouchTargets(page, '[aria-label="Clip stages"] button');
    // …and nothing else in the lobby is under 44 px either.
    await expectTouchTargets(page, 'main button, main a[href], main [role="radio"], main [role="switch"]');

    // A second pack makes Remove enabled (it is disabled at one pack) — still 44 px.
    await page.getByRole('button', { name: 'Mix packs' }).click();
    const sheet = page.getByRole('dialog', { name: 'Mix packs' });
    await sheet.getByRole('button', { name: /^Add / }).nth(1).click();
    await page.keyboard.press('Escape');
    await expect(sheet).toBeHidden();
    await expect(packChips.getByRole('listitem')).toHaveCount(2);
    await expectTouchTargets(page, '[aria-label="Selected packs"] button');

    // The pack browser's own small controls (Clear / Surprise me / tag chips / selection bar).
    await page.goto('/#/songooner/packs');
    await settle(page);
    await page.getByRole('button', { name: /^Add / }).first().click();
    await expect(page.getByRole('button', { name: 'Play 1', exact: true })).toBeVisible();
    // the floating selection bar is portalled to <body>, so it needs its own selector
    await expectTouchTargets(page, 'main button, main a[href], main [role="radio"], main [role="tab"], [data-testid="pack-selection-bar"] button');
  });
});
