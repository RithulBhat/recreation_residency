import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';

/** Screenshots land in `test-results/` by default; set SCOUT_SHOT_DIR to send them elsewhere. */
const OUT = process.env.SCOUT_SHOT_DIR ?? 'test-results/scout-setup';
mkdirSync(OUT, { recursive: true });

const VIEWPORTS = {
  mobile: { width: 390, height: 844 },
  desktop: { width: 1440, height: 900 },
} as const;

const NARROW = { width: 320, height: 640 } as const;

const SCOUT_ROUTES = ['/#/scout/setup', '/#/scout/daily', '/#/scout/stats'] as const;

/**
 * A real challenge payload, encoded the way `@/scout/challenge` encodes one: compact keys inside
 * `g` (`m` mode, `p` packs, `t` tries, `r` rounds), the seed in `s`, the sender in `b`, their score
 * in `c` — then base64url. Built here rather than imported so this suite stays free of app imports;
 * if the encoding ever changes, the screen renders "broken link" and these tests fail loudly.
 *
 * `rounds: 5` is deliberately NOT the lobby default (10): a run that starts with 5 rounds proves the
 * link's rules were applied and not the draft sitting in localStorage.
 */
const CHALLENGE = { by: 'Maya', score: 6420, rounds: 5, tries: 4, seed: 'e2e-scout-challenge' } as const;
const CHALLENGE_CODE = Buffer.from(
  JSON.stringify({
    v: 1,
    s: CHALLENGE.seed,
    g: { m: 'silhouette', p: ['superstars'], t: CHALLENGE.tries, r: CHALLENGE.rounds },
    b: CHALLENGE.by,
    c: CHALLENGE.score,
  }),
).toString('base64url');
const CHALLENGE_URL = `/#/scout/c/${CHALLENGE_CODE}`;

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
    // Children of a horizontal scroller (chip strips, tab bars) are clipped by design.
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

/** One `<h1>` per route: the outline starts with the screen's own title. */
async function expectSingleH1(page: Page) {
  const h1s = await page.locator('h1').evaluateAll((els) => els.map((el) => el.textContent?.trim().slice(0, 60) ?? ''));
  expect(h1s, 'exactly one h1').toHaveLength(1);
}

/** Coarse-pointer hit areas: the box, or the `touch-hit-44` ::before slop, must reach 44 px. */
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
        out.push(`${Math.round(w)}×${Math.round(h)} ${el.tagName.toLowerCase()} "${label}"`);
      }
    }
    return out;
  }, selector);
  expect(small, `touch targets under 44px for ${selector}`).toEqual([]);
}

function isoDaysAgo(n: number): string {
  const d = new Date(Date.now() - n * 86_400_000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.clear();
  });
});

for (const [name, vp] of Object.entries(VIEWPORTS)) {
  test(`scout setup · ${name}`, async ({ page }) => {
    await page.setViewportSize(vp);
    await page.goto('/#/scout/setup');
    await settle(page);

    await expect(page.getByRole('heading', { name: 'Set up your scouting session', level: 1 })).toBeVisible();
    await expect(page.getByRole('radio', { name: /Silhouette/ })).toHaveAttribute('aria-checked', 'true');
    // The pool line is counted from the real dataset, not a hard-coded guess.
    await expect(page.getByTestId('scout-pool-line')).toContainText(/\d+ players in this pool/);
    await expect(page.getByTestId('scout-settings-summary')).toContainText('10 rounds · Silhouette');
    await expect(page.getByTestId('scout-start')).toBeEnabled();

    await expectSingleH1(page);
    await expectNoHorizontalOverflow(page);
    await expectIconButtonsLabelled(page);
    await page.screenshot({ path: `${OUT}/setup-${name}.png`, fullPage: true });
    await page.screenshot({ path: `${OUT}/setup-${name}-fold.png`, fullPage: false });
  });

  test(`scout setup?mode=silhouette · ${name}`, async ({ page }) => {
    await page.setViewportSize(vp);
    await page.goto('/#/scout/setup?mode=silhouette');
    await settle(page);
    await expect(page.getByRole('radio', { name: /Silhouette/ })).toHaveAttribute('aria-checked', 'true');
    // params are stripped once applied, so a refresh cannot re-apply them
    await expect.poll(() => page.evaluate(() => location.hash)).toBe('#/scout/setup');
    await expectNoHorizontalOverflow(page);
    await page.screenshot({ path: `${OUT}/setup-mode-param-${name}.png`, fullPage: false });
  });

  test(`scout daily · ${name}`, async ({ page }) => {
    await page.setViewportSize(vp);
    await page.goto('/#/scout/daily');
    await settle(page);
    await expect(page.getByRole('heading', { name: "Today's assignment", level: 1 })).toBeVisible();
    await expect(page.getByTestId('scout-play-daily')).toBeVisible();
    await expect(page.getByTestId('midnight-countdown')).toHaveText(/^\d{2}:\d{2}:\d{2}$/);
    await expect(page.getByRole('list', { name: 'Last 14 days' }).getByRole('listitem')).toHaveCount(14);
    await expectSingleH1(page);
    await expectNoHorizontalOverflow(page);
    await expectIconButtonsLabelled(page);
    await page.screenshot({ path: `${OUT}/daily-${name}.png`, fullPage: true });
  });

  test(`scout stats · ${name}`, async ({ page }) => {
    await page.setViewportSize(vp);
    await page.goto('/#/scout/stats');
    await settle(page);
    await expect(page.getByRole('heading', { name: 'Your scouting record', level: 1 })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Nothing scouted yet' })).toBeVisible();
    // the mode chart is on the empty page too, with all seven modes on the axis
    await expect(page.getByTestId('scout-mode-chart').getByRole('listitem')).toHaveCount(7);
    await expectSingleH1(page);
    await expectNoHorizontalOverflow(page);
    await expectIconButtonsLabelled(page);
    await page.screenshot({ path: `${OUT}/stats-empty-${name}.png`, fullPage: true });
  });

  test(`scout stats · with history · ${name}`, async ({ page }) => {
    await page.setViewportSize(vp);
    await page.goto('/#/scout/stats?demo=1');
    await settle(page);
    await expect(page.getByRole('heading', { name: 'Your scouting record', level: 1 })).toBeVisible();
    await expect(page.getByText('points scouted')).toBeVisible();
    await expect(page.getByTestId('scout-mode-chart').getByRole('listitem')).toHaveCount(7);
    await expect(page.getByTestId('scout-nemeses')).toBeVisible();
    await expect(page.getByTestId('scout-recent-runs').getByRole('listitem').first()).toBeVisible();
    await expectSingleH1(page);
    await expectNoHorizontalOverflow(page);
    await expectIconButtonsLabelled(page);
    await page.screenshot({ path: `${OUT}/stats-demo-${name}.png`, fullPage: true });
  });
}

test('scout setup · ?mode + ?packs apply to the draft', async ({ page }) => {
  await page.setViewportSize(VIEWPORTS.desktop);
  await page.goto('/#/scout/setup?mode=teamTrivia&packs=franchises-all');
  await settle(page);
  await expect(page.getByRole('radio', { name: /Franchise IQ/ })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByRole('list', { name: 'Selected packs' })).toContainText('All 32 Franchises');
  // a team mode counts franchises, not players
  await expect(page.getByTestId('scout-pool-line')).toContainText('32 franchises in this pool');
  await expect(page.getByTestId('scout-settings-summary')).toContainText('Franchise IQ');
  await expect.poll(() => page.evaluate(() => location.hash)).toBe('#/scout/setup');
  await page.screenshot({ path: `${OUT}/setup-team-mode-desktop.png`, fullPage: false });
});

test('scout setup · every control moves the draft and the summary', async ({ page }) => {
  await page.setViewportSize(VIEWPORTS.desktop);
  await page.goto('/#/scout/setup');
  await settle(page);
  const summary = page.getByTestId('scout-settings-summary');

  // --- mode: each of the seven cards
  for (const mode of ['Face Off', 'Film Room', 'Franchise IQ', 'Stat Sheet', 'Draft Board', 'Logo Zoom', 'Silhouette']) {
    await page.getByRole('radio', { name: new RegExp(mode) }).click();
    await expect(page.getByRole('radio', { name: new RegExp(mode) })).toHaveAttribute('aria-checked', 'true');
    await expect(summary).toContainText(mode);
  }

  // --- keyboard moves the selection too
  await page.getByRole('radio', { name: /Silhouette/ }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('radio', { name: /Face Off/ })).toHaveAttribute('aria-checked', 'true');
  await page.getByRole('radio', { name: /Silhouette/ }).click();

  // --- mixed bag
  const mixed = page.getByRole('switch', { name: 'Mixed bag' });
  await mixed.click();
  await expect(mixed).toHaveAttribute('aria-checked', 'true');
  await expect(summary).toContainText('Mixed bag');
  await mixed.click();
  await expect(summary).not.toContainText('Mixed bag');

  // --- difficulty tiers
  await page.getByRole('button', { name: /^Superstars:/ }).click();
  await expect(summary).toContainText('Superstars');
  await page.getByRole('button', { name: /^Deep cuts:/ }).click();
  await expect(summary).toContainText('Deep cuts');
  // Superstars pack + deep-cut tier is an impossible pool, and the lobby says so
  await expect(page.getByTestId('scout-empty-pool')).toBeVisible();
  await expect(page.getByTestId('scout-start')).toBeDisabled();
  await page.screenshot({ path: `${OUT}/setup-empty-pool-desktop.png`, fullPage: false });
  await page.getByRole('button', { name: /^Any:/ }).click();
  await expect(page.getByTestId('scout-empty-pool')).toHaveCount(0);
  await expect(page.getByTestId('scout-start')).toBeEnabled();

  // --- rounds
  await page.getByRole('radio', { name: '20 rounds' }).click();
  await expect(summary).toContainText('20 rounds');
  await page.getByRole('radio', { name: 'Endless' }).click();
  await expect(summary).toContainText('∞ rounds');
  await page.getByRole('radio', { name: '10 rounds' }).click();

  // --- tries stepper (and its reveal ladder)
  const rules = page.locator('[data-section="scout-rules"]');
  await expect(page.getByTestId('reveal-ladder').locator('span')).toHaveCount(5);
  await rules.getByRole('button', { name: 'Increase' }).click();
  await expect(summary).toContainText('6 tries');
  await expect(page.getByTestId('reveal-ladder').locator('span')).toHaveCount(6);
  await expect(rules.getByRole('button', { name: 'Increase' })).toBeDisabled(); // 6 is the cap
  for (let i = 0; i < 5; i++) await rules.getByRole('button', { name: 'Decrease' }).click();
  await expect(summary).toContainText('1 try');
  await expect(rules.getByRole('button', { name: 'Decrease' })).toBeDisabled();
  await rules.getByRole('button', { name: 'Increase' }).click();

  // --- round timer
  await page.getByRole('radio', { name: '30 seconds' }).click();
  await expect(summary).toContainText('30s timer');
  await page.getByRole('radio', { name: 'Timer off' }).click();
  await expect(summary).not.toContainText('timer');

  // --- hints
  const hints = page.getByRole('switch', { name: 'Hints' });
  await hints.click();
  await expect(summary).toContainText('no hints');
  await hints.click();
  await expect(summary).not.toContainText('no hints');

  // --- packs: search, categories, expander, add and remove
  await page.getByRole('searchbox', { name: 'Search packs' }).fill('chiefs');
  // `name` matches a substring, so be exact: "Selected packs" is a list too.
  const results = page.getByRole('list', { name: 'Packs', exact: true }).getByRole('listitem');
  // the roster pack, plus AFC West whose tagline names them — not all 60
  await expect(results).toHaveCount(2);
  await expect(results.filter({ hasText: 'Kansas City Chiefs' })).toHaveCount(1);
  await page.getByRole('button', { name: 'Add Kansas City Chiefs' }).click();
  const selected = page.getByRole('list', { name: 'Selected packs' });
  await expect(selected).toContainText('Kansas City Chiefs');
  const packCount = await selected.getByRole('listitem').count();
  // the summary names two packs and counts the rest
  await expect(summary).toContainText(packCount > 2 ? `+${packCount - 2}` : 'Kansas City Chiefs');
  await page.getByRole('searchbox', { name: 'Search packs' }).fill('');
  await page.getByRole('button', { name: 'Position' }).click();
  await expect(page.getByRole('list', { name: 'Packs', exact: true }).getByRole('listitem')).toHaveCount(9);
  await page.getByRole('button', { name: 'All', exact: true }).click();
  await page.getByTestId('scout-show-all-packs').click();
  await expect(page.getByRole('list', { name: 'Packs', exact: true }).getByRole('listitem')).toHaveCount(60);
  await selected.getByRole('button', { name: 'Remove Kansas City Chiefs' }).click();
  await expect(selected).not.toContainText('Kansas City Chiefs');
  await expect(selected.getByRole('listitem')).toHaveCount(packCount - 1);

  await expectNoHorizontalOverflow(page);
  await page.screenshot({ path: `${OUT}/setup-controls-desktop.png`, fullPage: true });
});

test('scout setup · Start builds a pool and goes to the play screen', async ({ page }) => {
  await page.setViewportSize(VIEWPORTS.mobile);
  await page.goto('/#/scout/setup');
  await settle(page);
  await page.getByTestId('scout-start').click();
  await expect.poll(() => page.evaluate(() => location.hash), { timeout: 30_000 }).toBe('#/scout/play');
});

test('scout setup · a live run is never replaced without asking', async ({ page }) => {
  await page.setViewportSize(VIEWPORTS.mobile);
  await page.goto('/#/scout/setup');
  await settle(page);
  await page.getByTestId('scout-start').click();
  await expect.poll(() => page.evaluate(() => location.hash), { timeout: 30_000 }).toBe('#/scout/play');

  // Back in the lobby the live run is advertised, not forgotten.
  await page.goto('/#/scout/setup');
  await settle(page);
  const banner = page.getByTestId('scout-resume-banner');
  await expect(banner).toBeVisible();
  await expect(banner).toContainText('Round 1/10');
  await expect(banner).toHaveAttribute('href', /#\/scout\/play$/);
  await page.screenshot({ path: `${OUT}/setup-resume-banner-mobile.png`, fullPage: false });

  // Start asks before throwing it away, and "Keep it" declines.
  await page.getByTestId('scout-start').click();
  const dialog = page.getByRole('dialog', { name: 'Replace the run in progress?' });
  await expect(dialog).toBeVisible();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/setup-replace-dialog-mobile.png`, fullPage: false });
  await dialog.getByRole('button', { name: 'Keep it' }).click();
  await expect(dialog).toBeHidden();
  expect(await page.evaluate(() => location.hash)).toBe('#/scout/setup');

  // Confirming starts a fresh one.
  await page.getByTestId('scout-start').click();
  await page.getByTestId('scout-confirm-replace').click();
  await expect.poll(() => page.evaluate(() => location.hash), { timeout: 30_000 }).toBe('#/scout/play');
});

test('scout setup · ?autostart=1 starts the run without a tap', async ({ page }) => {
  await page.setViewportSize(VIEWPORTS.mobile);
  await page.goto('/#/scout/setup?autostart=1');
  await expect.poll(() => page.evaluate(() => location.hash), { timeout: 30_000 }).toBe('#/scout/play');
});

test('scout daily · Play starts today’s seeded run', async ({ page }) => {
  await page.setViewportSize(VIEWPORTS.mobile);
  await page.goto('/#/scout/daily');
  await settle(page);
  await page.getByTestId('scout-play-daily').click();
  await expect.poll(() => page.evaluate(() => location.hash), { timeout: 30_000 }).toBe('#/scout/play');
});

test('scout daily · a played day shows the result, the grid and the streak', async ({ page }) => {
  await page.setViewportSize(VIEWPORTS.mobile);
  const today = isoDaysAgo(0);
  const yesterday = isoDaysAgo(1);
  await page.addInitScript(
    ([t, y]) => {
      const verdicts = ['correct', 'close', 'wrong', 'correct', 'skipped', 'close', 'correct', 'correct'];
      const rounds = verdicts.map((verdict, index) => ({
        index,
        mode: 'silhouette',
        kind: 'player',
        subjectId: `310${index}`,
        name: `Player ${index}`,
        verdict,
        triesUsed: verdict === 'correct' ? 1 + (index % 3) : 5,
        score: verdict === 'correct' ? 900 : 0,
        ms: 12_000,
      }));
      const base = {
        durationMs: 180_000,
        mode: 'silhouette',
        mixModes: false,
        packIds: ['superstars'],
        difficulty: 'any',
        tries: 5,
        played: 8,
        close: 2,
        bestStreak: 3,
        avgTryWhenRight: 1.5,
        grid: '🟩🟨🟥🟩⬜🟨🟩🟩',
        rounds,
      };
      const records = [
        { ...base, id: 'e2e-today', finishedAt: Date.now(), score: 6420, correct: 4, daily: t },
        { ...base, id: 'e2e-yesterday', finishedAt: Date.now() - 86_400_000, score: 5000, correct: 8, daily: y },
      ];
      localStorage.setItem('sg:scout-results', JSON.stringify({ state: { records }, version: 1 }));
    },
    [today, yesterday],
  );
  await page.goto('/#/scout/daily');
  await settle(page);
  await expect(page.getByTestId('scout-daily-score')).toContainText('6,420');
  await expect(page.getByTestId('scout-daily-streak')).toContainText('2-day streak');
  await expect(page.getByRole('list', { name: 'Round by round' }).getByRole('listitem')).toHaveCount(8);
  await expect(page.getByRole('button', { name: 'Share result' })).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await expectSingleH1(page);
  await page.screenshot({ path: `${OUT}/daily-played-mobile.png`, fullPage: true });
});

test('scout screens fit a 320 px phone', async ({ page }) => {
  await page.setViewportSize(NARROW);
  for (const route of SCOUT_ROUTES) {
    await page.goto(route);
    await settle(page);
    await expectSingleH1(page);
    await expectNoHorizontalOverflow(page);
    await page.screenshot({ path: `${OUT}/narrow-${route.replace(/\W+/g, '-')}.png`, fullPage: false });
  }
  // …and with a full pack list open, which is the widest the lobby ever gets
  await page.goto('/#/scout/setup');
  await settle(page);
  await page.getByTestId('scout-show-all-packs').click();
  await expectNoHorizontalOverflow(page);
});

test.describe('scout lobby · touch targets on a coarse pointer', () => {
  test.use({ hasTouch: true, isMobile: true });

  test('every lobby control reaches 44 px', async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.mobile);
    await page.goto('/#/scout/setup');
    await settle(page);
    // the rules section is collapsed on a phone — open it so its controls are measured too
    await page.getByRole('button', { name: /Difficulty & rules/ }).click();
    await page.waitForTimeout(400);
    await expectTouchTargets(page, 'main button, main a[href], main [role="radio"], main [role="switch"]');
    await expectTouchTargets(page, '[data-testid="scout-start-bar"] button');
  });
});

test.describe('scout screens in every light', () => {
  for (const theme of ['midnight', 'daylight'] as const) {
    for (const [name, vp] of Object.entries(VIEWPORTS)) {
      test(`${theme} · ${name}`, async ({ page }) => {
        await page.setViewportSize(vp);
        await page.addInitScript((t) => localStorage.setItem('sg:theme', t), theme);
        for (const [label, route] of [
          ['setup', '/#/scout/setup'],
          ['daily', '/#/scout/daily'],
          ['stats', '/#/scout/stats?demo=1'],
        ] as const) {
          await page.goto(route);
          await settle(page);
          await expectNoHorizontalOverflow(page);
          await page.screenshot({ path: `${OUT}/${label}-${name}-${theme}.png`, fullPage: true });
        }
      });
    }
  }
});


// ---------------------------------------------------------------- challenge links (`/scout/c/:code`)

test('scout challenge · a real code names the sender, their score and the rules', async ({ page }) => {
  await page.setViewportSize(VIEWPORTS.desktop);
  await page.goto(CHALLENGE_URL);
  await settle(page);

  await expect(page.getByRole('heading', { name: `${CHALLENGE.by} challenged you`, level: 1 })).toBeVisible();
  await expect(page.getByTestId('scout-challenge-score')).toContainText('6,420');
  // The link's own rules, not the lobby draft: 5 rounds and 4 tries came out of the code.
  const facts = page.getByRole('definition');
  await expect(facts.filter({ hasText: 'Silhouette' }).first()).toBeVisible();
  await expect(facts.filter({ hasText: '5 rounds · 4 tries · no timer' })).toHaveCount(1);
  await expect(page.getByRole('list', { name: 'Packs' })).toContainText('Superstars');
  await expect(page.getByTestId('scout-accept-challenge')).toBeEnabled();

  await expectSingleH1(page);
  await expectNoHorizontalOverflow(page);
  await expectIconButtonsLabelled(page);
  await page.screenshot({ path: `${OUT}/challenge-desktop.png`, fullPage: true });

  await page.setViewportSize(NARROW);
  await page.waitForTimeout(300);
  await expectNoHorizontalOverflow(page);
  await page.screenshot({ path: `${OUT}/challenge-narrow.png`, fullPage: true });
});

test('scout challenge · a broken code says so and still offers a way in', async ({ page }) => {
  await page.setViewportSize(VIEWPORTS.desktop);
  await page.goto('/#/scout/c/not-a-real-code');
  await settle(page);
  await expect(page.getByRole('heading', { name: 'That challenge link is broken', level: 1 })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Play anyway' })).toBeVisible();
  await expectSingleH1(page);
  await expectNoHorizontalOverflow(page);
  await page.screenshot({ path: `${OUT}/challenge-broken-desktop.png`, fullPage: false });
});

test('scout challenge · Accept deals the identical seeded run', async ({ page }) => {
  await page.setViewportSize(VIEWPORTS.desktop);

  /** Accept the challenge from a cold page and report what round one actually dealt. */
  const acceptAndFingerprint = async (): Promise<{ counter: string; image: string }> => {
    await page.goto(CHALLENGE_URL);
    // A hash change is a same-document navigation, so reload to clear the in-memory game store and
    // meet the link exactly as a first-time visitor would.
    await page.reload();
    await settle(page);
    await page.getByTestId('scout-accept-challenge').click();
    await expect.poll(() => page.evaluate(() => location.hash), { timeout: 30_000 }).toBe('#/scout/play');
    // The silhouette stage layers a base photo and a reveal curtain over the same headshot; the
    // base is the one that is always there, whatever the treatment on top of it is doing.
    const stage = page.getByTestId('scout-stage-base');
    await expect(stage).toHaveAttribute('src', /a\.espncdn\.com\/i\/headshots\/nfl\/players\/full\/\d+\.png$/);
    return {
      counter: (await page.getByTestId('scout-round-counter').textContent()) ?? '',
      image: (await stage.getAttribute('src')) ?? '',
    };
  };

  const first = await acceptAndFingerprint();
  // The link's rules, not the 10-round lobby default.
  expect(first.counter.replace(/\s+/g, '')).toBe(`1/${CHALLENGE.rounds}`);

  const second = await acceptAndFingerprint();
  expect(second.counter).toBe(first.counter);
  // Same seed, same settings, same dataset → the same first subject, every time.
  expect(second.image, 'the seeded queue must deal the same round one twice').toBe(first.image);
});
