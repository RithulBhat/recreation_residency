import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';

/** Screenshots land in `test-results/` by default; set SCOUT_SHOT_DIR to send them elsewhere. */
const OUT = process.env.SCOUT_SHOT_DIR ?? 'test-results/scout-setup';
mkdirSync(OUT, { recursive: true });

/** The owner plays on a laptop: 1440×900 is the target, 1920×1080 the second desktop check. */
const VIEWPORTS = {
  mobile: { width: 390, height: 844 },
  desktop: { width: 1440, height: 900 },
} as const;

const DESKTOPS = {
  '1440': { width: 1440, height: 900 },
  '1920': { width: 1920, height: 1080 },
} as const;

const NARROW = { width: 320, height: 640 } as const;

const SCOUT_ROUTES = ['/#/scout/setup', '/#/scout/daily', '/#/scout/stats'] as const;

/**
 * The SESSION FORMATS and the settings each one actually reads — a restatement of `uses` in
 * `src/scout/formats.ts` (`SCOUT_FORMATS`), deliberately retyped rather than imported so the two
 * can disagree loudly. The lobby stamps `data-setting="<key>"` on every control it renders, so the
 * set on screen must equal this list exactly: anything missing is a rule you cannot reach, anything
 * extra is an inert control (blitz has no round count, the gauntlet no packs, duel no hints).
 *
 * `mode`/`mixModes`/`packIds` live outside the rules panel, in the puzzle-type and pack sections.
 */
const FORMAT_CONTROLS: Record<string, { name: string; controls: string[] }> = {
  standard: {
    name: 'Standard',
    controls: ['mode', 'mixModes', 'packIds', 'difficulty', 'rounds', 'tries', 'roundTimer', 'hintsEnabled'],
  },
  blitz: {
    name: 'Blitz',
    controls: ['mode', 'mixModes', 'packIds', 'blitzDuration', 'difficulty', 'hintsEnabled'],
  },
  survival: {
    name: 'Survival',
    controls: ['mode', 'mixModes', 'packIds', 'lives', 'tries', 'roundTimer', 'hintsEnabled'],
  },
  gauntlet: {
    name: 'Gauntlet',
    controls: ['mode', 'mixModes', 'tries', 'roundTimer', 'hintsEnabled'],
  },
  duel: {
    name: 'Duel',
    controls: ['mode', 'mixModes', 'packIds', 'duelStyle', 'difficulty', 'rounds', 'tries', 'roundTimer', 'players'],
  },
  party: {
    name: 'Party',
    controls: ['mode', 'mixModes', 'packIds', 'difficulty', 'rounds', 'tries', 'roundTimer', 'players'],
  },
};

const FORMAT_IDS = Object.keys(FORMAT_CONTROLS);

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

/** Every `data-setting` the lobby is currently rendering, sorted. */
async function shownControls(page: Page): Promise<string[]> {
  const found = await page.locator('[data-setting]').evaluateAll((els) =>
    els.map((el) => el.getAttribute('data-setting') ?? ''),
  );
  return found.sort();
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
    // Format comes FIRST and is a radiogroup of its own, on Standard by default.
    const formats = page.getByRole('radiogroup', { name: 'Session format' });
    await expect(formats).toBeVisible();
    await expect(formats.getByRole('radio')).toHaveCount(FORMAT_IDS.length);
    await expect(formats.locator('[data-format="standard"]')).toHaveAttribute('aria-checked', 'true');
    // …then the puzzle types, which are read from SCOUT_MODES (never a hardcoded seven).
    const modes = page.getByRole('radiogroup', { name: 'Puzzle type' });
    expect(await modes.getByRole('radio').count()).toBeGreaterThanOrEqual(7);
    await expect(modes.locator('[data-mode="silhouette"]')).toHaveAttribute('aria-checked', 'true');
    // The pool line is counted from the real dataset, not a hard-coded guess.
    await expect(page.getByTestId('scout-pool-line')).toContainText(/\d+ players in this pool/);
    await expect(page.getByTestId('scout-settings-summary')).toContainText('Standard · 10 rounds · Silhouette');
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
    await expect(page.locator('[data-mode="silhouette"]')).toHaveAttribute('aria-checked', 'true');
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
    // The daily is seeded settings like any other run, so it names the format it is played in.
    await expect(page.getByTestId('scout-daily-format')).toBeVisible();
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
    // the mode chart is on the empty page too, with every puzzle type on the axis
    expect(await page.getByTestId('scout-mode-chart').getByRole('listitem').count()).toBeGreaterThanOrEqual(7);
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
    expect(await page.getByTestId('scout-mode-chart').getByRole('listitem').count()).toBeGreaterThanOrEqual(7);
    await expect(page.getByTestId('scout-nemeses')).toBeVisible();
    await expect(page.getByTestId('scout-recent-runs').getByRole('listitem').first()).toBeVisible();
    await expectSingleH1(page);
    await expectNoHorizontalOverflow(page);
    await expectIconButtonsLabelled(page);
    await page.screenshot({ path: `${OUT}/stats-demo-${name}.png`, fullPage: true });
  });
}

// ---------------------------------------------------------------- the format axis

test('scout setup · the format picker drives which controls exist', async ({ page }) => {
  await page.setViewportSize(VIEWPORTS.desktop);
  await page.goto('/#/scout/setup');
  await settle(page);
  const summary = page.getByTestId('scout-settings-summary');

  for (const [id, { name, controls }] of Object.entries(FORMAT_CONTROLS)) {
    await page.locator(`[data-format="${id}"]`).click();
    await expect(page.locator(`[data-format="${id}"]`)).toHaveAttribute('aria-checked', 'true');
    // the run summary leads with the format…
    await expect(summary).toContainText(name);
    // …and exactly the controls this format reads are on screen — no more, no less.
    expect(await shownControls(page), `controls for ${id}`).toEqual([...controls].sort());
    await expectNoHorizontalOverflow(page);
  }

  // Back to standard, and the settings the other formats overwrote are handed back.
  await page.locator('[data-format="standard"]').click();
  await expect(summary).toContainText('Standard · 10 rounds');
});

test('scout setup · the format radiogroup is keyboard navigable', async ({ page }) => {
  await page.setViewportSize(VIEWPORTS.desktop);
  await page.goto('/#/scout/setup');
  await settle(page);
  await page.locator('[data-format="standard"]').focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('[data-format="blitz"]')).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('[data-format="blitz"]')).toBeFocused();
  await page.keyboard.press('End');
  await expect(page.locator('[data-format="party"]')).toHaveAttribute('aria-checked', 'true');
  await page.keyboard.press('Home');
  await expect(page.locator('[data-format="standard"]')).toHaveAttribute('aria-checked', 'true');
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('[data-format="party"]')).toHaveAttribute('aria-checked', 'true');
});

test('scout setup · each format-specific control moves the run', async ({ page }) => {
  await page.setViewportSize(VIEWPORTS.desktop);
  await page.goto('/#/scout/setup');
  await settle(page);
  const summary = page.getByTestId('scout-settings-summary');

  // --- blitz: a clock instead of rounds and tries
  await page.locator('[data-format="blitz"]').click();
  await expect(summary).toContainText('90s clock');
  await page.locator('[data-setting="blitzDuration"]').getByRole('radio', { name: '60 seconds' }).click();
  await expect(summary).toContainText('60s clock');
  await expect(page.getByTestId('scout-tries-na')).toBeVisible();

  // --- survival: lives, and the tier is set by the format
  await page.locator('[data-format="survival"]').click();
  await expect(summary).toContainText('3 lives');
  const rules = page.locator('[data-section="scout-rules"]');
  await rules.getByRole('button', { name: 'Increase' }).first().click();
  await expect(summary).toContainText('4 lives');
  await expect(page.getByTestId('scout-difficulty-na')).toContainText('Survival walks the tiers itself');

  // --- gauntlet: the board replaces the pack picker
  await page.locator('[data-format="gauntlet"]').click();
  await expect(page.getByTestId('scout-gauntlet-board')).toBeVisible();
  await expect(page.getByTestId('scout-gauntlet-board').locator('[data-club]')).toHaveCount(32);
  await expect(page.locator('[data-section="scout-packs"]')).toHaveCount(0);
  await expect(summary).toContainText('Gauntlet · 32 franchises');

  // --- duel: style + two seats with the real buzz keys
  await page.locator('[data-format="duel"]').click();
  await expect(summary).toContainText('Duel · Buzz-in');
  await expect(page.getByTestId('scout-buzz-keys')).toContainText('buzzes with');
  await expect(page.getByRole('list', { name: 'Players' }).getByRole('listitem')).toHaveCount(2);
  await page.locator('[data-setting="duelStyle"]').getByRole('radio', { name: 'Turns' }).click();
  await expect(summary).toContainText('Duel · Turns');
  await expect(page.getByTestId('scout-turn-order')).toBeVisible();

  // --- party: 2 to 8 seats
  await page.locator('[data-format="party"]').click();
  const seats = page.getByRole('list', { name: 'Players' });
  await expect(seats.getByRole('listitem')).toHaveCount(2);
  await page.getByRole('button', { name: 'Add player' }).click();
  await expect(seats.getByRole('listitem')).toHaveCount(3);
  await expect(summary).toContainText('Party · 3 players');
  // the round count snaps to a multiple of the roster so everyone gets equal turns
  await expect(summary).toContainText('12 rounds');

  await expectIconButtonsLabelled(page);
  await page.screenshot({ path: `${OUT}/setup-party-desktop.png`, fullPage: true });
});

test('scout setup · leaving a format hands its settings back', async ({ page }) => {
  await page.setViewportSize(VIEWPORTS.desktop);
  await page.goto('/#/scout/setup');
  await settle(page);
  const summary = page.getByTestId('scout-settings-summary');

  await page.getByRole('radio', { name: '20 rounds' }).click();
  await page.getByRole('button', { name: /^Superstars:/ }).click();
  await expect(summary).toContainText('20 rounds');
  await expect(summary).toContainText('Superstars · Superstars');

  // The gauntlet cannot play a round count, a tier or a pack selection — it overwrites all three…
  await page.locator('[data-format="gauntlet"]').click();
  await expect(summary).not.toContainText('20 rounds');
  // …and standard gets them back rather than being left with the gauntlet's league-wide draft.
  await page.locator('[data-format="standard"]').click();
  await expect(summary).toContainText('20 rounds');
  await expect(summary).toContainText('Superstars · Superstars');
});

for (const id of FORMAT_IDS) {
  test(`scout setup · a ${id} run starts and lands on the play screen`, async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.desktop);
    await page.goto(`/#/scout/setup?format=${id}`);
    await settle(page);
    await expect(page.locator(`[data-format="${id}"]`)).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByTestId('scout-settings-summary')).toContainText(FORMAT_CONTROLS[id]!.name);
    await page.getByTestId('scout-start').click();
    await expect.poll(() => page.evaluate(() => location.hash), { timeout: 30_000 }).toBe('#/scout/play');
  });
}

test('scout setup · presets cover both axes and apply in one tap', async ({ page }) => {
  await page.setViewportSize(VIEWPORTS.desktop);
  await page.goto('/#/scout/setup');
  await settle(page);
  const summary = page.getByTestId('scout-settings-summary');
  const presets = page.getByRole('group', { name: 'Presets' });

  // The row is one flat list over the puzzle presets AND the format presets.
  expect(await presets.getByRole('button').count()).toBeGreaterThanOrEqual(15);

  await presets.getByRole('button', { name: /^Sixty Second Scout preset/ }).click();
  await expect(summary).toContainText('Blitz · 60s clock · Face Off');
  await expect(page.locator('[data-format="blitz"]')).toHaveAttribute('aria-checked', 'true');

  await presets.getByRole('button', { name: /^Last Man Standing preset/ }).click();
  await expect(summary).toContainText('Survival · 3 lives · Mixed bag');
  await expect(page.locator('[data-format="survival"]')).toHaveAttribute('aria-checked', 'true');

  await presets.getByRole('button', { name: /^Pass the Laptop preset/ }).click();
  await expect(summary).toContainText('Party · 4 players · 12 rounds');
  await expect(page.getByRole('list', { name: 'Players' }).getByRole('listitem')).toHaveCount(4);

  // a puzzle-type preset leaves the format alone
  await presets.getByRole('button', { name: /^Film Room preset/ }).click();
  await expect(summary).toContainText('Party');
  await expect(summary).toContainText('Film Room');

  await page.screenshot({ path: `${OUT}/setup-presets-desktop.png`, fullPage: false });
});

test('scout setup · ?mode + ?packs apply to the draft', async ({ page }) => {
  await page.setViewportSize(VIEWPORTS.desktop);
  await page.goto('/#/scout/setup?mode=teamTrivia&packs=franchises-all');
  await settle(page);
  await expect(page.locator('[data-mode="teamTrivia"]')).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByRole('list', { name: 'Selected packs' })).toContainText('All 32 Franchises');
  // a team mode counts franchises, not players
  await expect(page.getByTestId('scout-pool-line')).toContainText('32 franchises in this pool');
  await expect(page.getByTestId('scout-settings-summary')).toContainText('Franchise IQ');
  // …and a franchise run has no fame tiers to pick, so the control is replaced by the reason
  await expect(page.getByTestId('scout-difficulty-na')).toContainText('No difficulty tiers here');
  await expect.poll(() => page.evaluate(() => location.hash)).toBe('#/scout/setup');
  await page.screenshot({ path: `${OUT}/setup-team-mode-desktop.png`, fullPage: false });
});

test('scout setup · every control moves the draft and the summary', async ({ page }) => {
  await page.setViewportSize(VIEWPORTS.desktop);
  await page.goto('/#/scout/setup');
  await settle(page);
  const summary = page.getByTestId('scout-settings-summary');
  const modes = page.getByRole('radiogroup', { name: 'Puzzle type' });

  // --- puzzle type: the seven that shipped first (more may exist; they are read from SCOUT_MODES)
  for (const [id, name] of [
    ['faceZoom', 'Face Off'],
    ['highlight', 'Film Room'],
    ['teamTrivia', 'Franchise IQ'],
    ['statLine', 'Stat Sheet'],
    ['careerPath', 'Draft Board'],
    ['logoZoom', 'Logo Zoom'],
    ['silhouette', 'Silhouette'],
  ] as const) {
    await modes.locator(`[data-mode="${id}"]`).click();
    await expect(modes.locator(`[data-mode="${id}"]`)).toHaveAttribute('aria-checked', 'true');
    await expect(summary).toContainText(name);
  }

  // --- keyboard moves the selection too
  await modes.locator('[data-mode="silhouette"]').focus();
  await page.keyboard.press('ArrowRight');
  await expect(modes.locator('[data-mode="faceZoom"]')).toHaveAttribute('aria-checked', 'true');
  await modes.locator('[data-mode="silhouette"]').click();

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
  // Category chips narrow the grid. The pack catalogue grows, so assert the shape, not a magic 60.
  const packList = page.getByRole('list', { name: 'Packs', exact: true });
  await page.getByRole('group', { name: 'Pack categories' }).getByRole('button', { name: 'Position' }).click();
  const positionPacks = await packList.getByRole('listitem').count();
  expect(positionPacks).toBeGreaterThanOrEqual(9);
  await page.getByRole('group', { name: 'Pack categories' }).getByRole('button', { name: 'All', exact: true }).click();
  const expander = page.getByTestId('scout-show-all-packs');
  const total = Number(/\d+/.exec((await expander.textContent()) ?? '')?.[0] ?? '0');
  expect(total).toBeGreaterThan(positionPacks);
  await expander.click();
  await expect(packList.getByRole('listitem')).toHaveCount(total);
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
  // …and in the two formats that add controls of their own
  for (const id of ['duel', 'gauntlet'] as const) {
    await page.goto(`/#/scout/setup?format=${id}`);
    await settle(page);
    await expectNoHorizontalOverflow(page);
    await page.screenshot({ path: `${OUT}/narrow-setup-${id}.png`, fullPage: false });
  }
});

test.describe('scout lobby · touch targets on a coarse pointer', () => {
  test.use({ hasTouch: true, isMobile: true });

  test('every lobby control reaches 44 px', async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.mobile);
    await page.goto('/#/scout/setup');
    await settle(page);
    // the rules section is collapsed on a phone — open it so its controls are measured too
    await page.getByRole('button', { name: /^Rules/ }).click();
    await page.waitForTimeout(400);
    await expectTouchTargets(page, 'main button, main a[href], main [role="radio"], main [role="switch"]');
    await expectTouchTargets(page, '[data-testid="scout-start-bar"] button');
  });
});

// ---------------------------------------------------------------- every format, every light

test.describe('scout lobby · every format in every light', () => {
  for (const theme of ['midnight', 'daylight'] as const) {
    for (const [size, vp] of Object.entries(DESKTOPS)) {
      test(`${theme} · ${size}`, async ({ page }) => {
        await page.setViewportSize(vp);
        await page.addInitScript((t) => localStorage.setItem('sg:theme', t), theme);
        for (const id of FORMAT_IDS) {
          await page.goto(`/#/scout/setup?format=${id}`);
          await settle(page);
          await expect(page.locator(`[data-format="${id}"]`)).toHaveAttribute('aria-checked', 'true');
          await expectNoHorizontalOverflow(page);
          await page.screenshot({ path: `${OUT}/${id}-${size}-${theme}.png`, fullPage: true });
          await page.screenshot({ path: `${OUT}/${id}-${size}-${theme}-fold.png`, fullPage: false });
        }
      });
    }
  }
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
