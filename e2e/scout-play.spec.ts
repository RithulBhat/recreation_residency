import { expect, test, type Page } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';
import type { PlayerClip } from '../src/data/nfl';
import type { ScoutMode, ScoutSettings } from '../src/scout/types';

const OUT = 'test-results/scout';
mkdirSync(OUT, { recursive: true });

test.use({ trace: 'off' });

const VIEWPORTS = {
  mobile: { width: 390, height: 844 },
  narrow: { width: 320, height: 720 },
  desktop: { width: 1440, height: 900 },
} as const;

/** The DEV handle Play registers (`src/components/scout/startScoutGame.ts`). */
interface ScoutAnswer {
  kind: 'player' | 'team';
  id: string;
  name: string;
  accepted: string[];
  mode: string;
  tryIndex: number;
  tries: number;
  visual: number;
}
interface ScoutHandle {
  start: (settings: Partial<ScoutSettings>) => Promise<{ subjects: unknown[] }>;
  answer: () => ScoutAnswer | null;
  closeGuess: () => string | null;
  wrongGuess: () => string;
  store: { getState: () => { state: { status: string; totalScore: number }; skip: () => void; giveUp: () => void; next: () => void } };
}
declare global {
  interface Window {
    __scout?: ScoutHandle;
  }
}

/** Read rather than import: Playwright's ESM loader wants an import attribute for JSON. */
const clips: PlayerClip[] = JSON.parse(readFileSync('src/data/nfl/clips.json', 'utf8')) as PlayerClip[];
const CLIP_IDS = new Set(clips.map((c) => c.id));
const TEAM_MODES: readonly ScoutMode[] = ['teamTrivia', 'logoZoom'];
const ALL_MODES: readonly ScoutMode[] = [
  'silhouette',
  'faceZoom',
  'highlight',
  'statLine',
  'careerPath',
  'teamTrivia',
  'logoZoom',
];

/** The stage each mode renders. */
const STAGE_TESTID: Record<ScoutMode, string> = {
  silhouette: 'scout-stage-photo',
  faceZoom: 'scout-stage-photo',
  logoZoom: 'scout-stage-photo',
  highlight: 'scout-stage-play',
  statLine: 'scout-stage-stats',
  teamTrivia: 'scout-stage-trivia',
  careerPath: 'scout-stage-career',
};

function settingsFor(mode: ScoutMode, over: Partial<ScoutSettings> = {}): Partial<ScoutSettings> {
  return {
    mode,
    packIds: TEAM_MODES.includes(mode) ? ['franchises-all'] : ['superstars'],
    difficulty: 'any',
    tries: 5,
    rounds: 5,
    roundTimer: 0,
    mixModes: false,
    ...over,
  };
}

/** Open /scout/play (which registers the DEV hook) and start a real session. */
async function startScout(page: Page, settings: Partial<ScoutSettings>): Promise<void> {
  await page.addInitScript(() => localStorage.clear());
  if (!page.url().includes('/scout/play')) await page.goto('/#/scout/play');
  await page.waitForFunction(() => typeof window.__scout?.start === 'function', null, { timeout: 30_000 });
  await page.evaluate(async (s) => {
    await window.__scout!.start(s);
  }, settings);
  await expect(page.getByTestId('scout-try-ladder')).toBeVisible({ timeout: 20_000 });
}

function getAnswer(page: Page): Promise<ScoutAnswer | null> {
  return page.evaluate(() => window.__scout!.answer());
}

/** Type a guess and submit it as free text. */
async function guess(page: Page, text: string): Promise<void> {
  const box = page.getByTestId('scout-guess-box').getByRole('combobox');
  await box.fill(text);
  await box.press('Enter');
}

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const r = await page.evaluate(() => {
    const inScroller = (el: HTMLElement): boolean => {
      let node: HTMLElement | null = el.parentElement;
      while (node && node !== document.body) {
        const ox = getComputedStyle(node).overflowX;
        const oy = getComputedStyle(node).overflowY;
        if (['auto', 'scroll', 'hidden'].includes(ox) || ['auto', 'scroll', 'hidden'].includes(oy)) return true;
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
        .map((el) => `${el.tagName}.${String(el.className)}`.slice(0, 140)),
    };
  });
  expect(r.widest, 'elements past the right edge').toEqual([]);
  expect(r.doc, `documentElement.scrollWidth ${r.doc} > innerWidth ${r.inner}`).toBeLessThanOrEqual(r.inner);
}

async function expectIconButtonsLabelled(page: Page): Promise<void> {
  const missing = await page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLElement>('button, a[href]'))
      .filter((el) => el.offsetParent !== null || el.getClientRects().length > 0)
      .filter((el) => el.innerText.trim() === '' && !el.getAttribute('aria-label') && !el.getAttribute('aria-labelledby'))
      .map((el) => el.outerHTML.slice(0, 140)),
  );
  expect(missing, 'icon-only controls without an accessible name').toEqual([]);
}

// ---------------------------------------------------------------------------------------------

test('scout play · no session card', async ({ page }) => {
  await page.setViewportSize(VIEWPORTS.mobile);
  await page.goto('/#/scout/play');
  await expect(page.getByRole('heading', { name: 'No scouting session' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Set up a session' })).toHaveAttribute('href', /#\/scout\/setup$/);
  await expect(page.locator('h1')).toHaveCount(1);
});

test('scout play · every mode renders its own stage', async ({ page }) => {
  await page.setViewportSize(VIEWPORTS.mobile);
  for (const mode of ALL_MODES) {
    await startScout(page, settingsFor(mode));
    const answer = await getAnswer(page);
    expect(answer, `${mode} should have a subject`).not.toBeNull();
    expect(answer!.kind).toBe(TEAM_MODES.includes(mode) ? 'team' : 'player');
    await expect(page.getByTestId(STAGE_TESTID[mode])).toBeVisible();
    await expect(page.locator('h1')).toHaveCount(1);
    // Rung 0 is the hardest rung: nothing on screen may spell the answer out.
    const surname = answer!.name.split(' ').pop()!;
    await expect(page.getByTestId('scout-guess-box')).toBeVisible();
    const body = await page.locator('main').innerText();
    expect(body.toLowerCase(), `${mode} rung 0 leaks the answer`).not.toContain(surname.toLowerCase());
    await expectNoHorizontalOverflow(page);
    await expectIconButtonsLabelled(page);
  }
});

test('scout play · wrong guess shakes, close guess explains itself, correct guess reveals', async ({ page }) => {
  await page.setViewportSize(VIEWPORTS.mobile);
  await startScout(page, settingsFor('silhouette'));

  // wrong
  const wrong = await page.evaluate(() => window.__scout!.wrongGuess());
  await guess(page, wrong);
  const feedback = page.getByTestId('scout-feedback');
  await expect(feedback.locator('[data-verdict]')).toHaveAttribute('data-verdict', 'wrong');
  await expect(feedback).toContainText('tries left');
  await expect(page.getByTestId('scout-clue')).toHaveCount(1);

  // close — the best feedback moment in the game
  const close = await page.evaluate(() => window.__scout!.closeGuess());
  expect(close, 'a close guess should be constructible').not.toBeNull();
  await guess(page, close!);
  await expect(feedback.locator('[data-verdict]')).toHaveAttribute('data-verdict', 'close');
  await expect(feedback).toContainText(/Right surname|surname is taken/i);
  await expect(feedback).toContainText(/you said/i);

  // correct
  const answer = await getAnswer(page);
  await guess(page, answer!.accepted[0]);
  const reveal = page.getByTestId('scout-reveal');
  await expect(reveal).toBeVisible();
  await expect(reveal).toHaveAttribute('data-verdict', 'correct');
  await expect(page.getByTestId('scout-reveal-name')).toHaveText(answer!.name);
  await expect(page.getByTestId('scout-next')).toBeVisible();
  const score = await page.evaluate(() => window.__scout!.store.getState().state.totalScore);
  expect(score).toBeGreaterThan(0);
});

test('scout play · skip unlocks a clue, give up ends the round', async ({ page }) => {
  await page.setViewportSize(VIEWPORTS.mobile);
  await startScout(page, settingsFor('faceZoom'));
  await expect(page.getByTestId('scout-clue')).toHaveCount(0);

  await page.getByTestId('scout-skip').click();
  await expect(page.getByTestId('scout-clue')).toHaveCount(1);
  await expect(page.getByTestId('scout-feedback')).toContainText('Skipped');
  await expect(page.getByTestId('scout-try-ladder').locator('[data-status="used"]')).toHaveCount(1);

  await page.getByTestId('scout-give-up').click();
  const reveal = page.getByTestId('scout-reveal');
  await expect(reveal).toBeVisible();
  await expect(reveal).toHaveAttribute('data-verdict', 'skipped');
});

/**
 * Force the plain-iframe path: with the IFrame API unreachable the reveal renders its own frame, so
 * the src and the video id can be asserted without racing YouTube's own error handling.
 */
async function blockYouTubeApi(page: Page): Promise<void> {
  await page.route('https://www.youtube.com/iframe_api', (route) => route.abort());
}

/** Walk forward until the round's player has a verified clip (44 of the 60 stars do). */
async function findRoundWithClip(page: Page): Promise<ScoutAnswer> {
  let answer = await getAnswer(page);
  for (let i = 0; i < 10 && answer && !CLIP_IDS.has(answer.id); i++) {
    await page.evaluate(() => {
      window.__scout!.store.getState().giveUp();
      window.__scout!.store.getState().next();
    });
    await expect(page.getByTestId('scout-try-ladder')).toBeVisible();
    answer = await getAnswer(page);
  }
  expect(answer && CLIP_IDS.has(answer.id), 'found a round with a clip').toBe(true);
  return answer!;
}

test('scout play · watch the tape mounts the right video only after a click', async ({ page }) => {
  await page.setViewportSize(VIEWPORTS.desktop);
  await blockYouTubeApi(page);
  await startScout(page, settingsFor('silhouette', { rounds: 0 }));
  const answer = await findRoundWithClip(page);
  const expected = clips.find((c) => c.id === answer.id)!;

  await page.evaluate(() => window.__scout!.store.getState().giveUp());
  await expect(page.getByTestId('scout-reveal')).toBeVisible();

  // Nothing third-party is loaded until the viewer asks for it.
  await expect(page.locator('iframe')).toHaveCount(0);
  await expect(page.getByTestId('scout-tape-frame')).toHaveCount(0);

  await page.getByTestId('scout-tape-button').click();
  const frame = page.getByTestId('scout-tape-frame');
  await expect(frame).toBeVisible();
  await expect(frame).toHaveAttribute('data-video-id', expected.videoId);
  await expect(frame).toHaveAttribute('src', new RegExp(`youtube-nocookie\\.com/embed/${expected.videoId}`));
  await expect(page.locator('iframe')).toHaveCount(1);

  // The clip is credited, and never used to state the player's current team.
  const tape = page.getByTestId('scout-tape');
  await expect(tape).toHaveAttribute('data-video-id', expected.videoId);
  await expect(tape).toContainText(expected.channel);
  await expect(tape).toContainText('older season or a former team');
  await expect(page.getByTestId('scout-tape-youtube')).toHaveAttribute(
    'href',
    `https://www.youtube.com/watch?v=${expected.videoId}`,
  );
});

test('scout play · a clip the league blocks still gives the viewer a way to watch it', async ({ page }) => {
  await page.setViewportSize(VIEWPORTS.desktop);
  await startScout(page, settingsFor('silhouette', { rounds: 0 }));
  const answer = await findRoundWithClip(page);
  const expected = clips.find((c) => c.id === answer.id)!;

  await page.evaluate(() => window.__scout!.store.getState().giveUp());
  await expect(page.getByTestId('scout-reveal')).toBeVisible();
  await page.getByTestId('scout-tape-button').click();

  // 168 of the 215 verified clips answer onReady and then refuse to play (error 150), so the reveal
  // must end up EITHER playing the tape or showing the poster with a link — never a dead frame.
  const frame = page.getByTestId('scout-tape-frame');
  const blocked = page.getByTestId('scout-tape-blocked');
  await expect(frame.or(blocked).first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('scout-tape-youtube')).toHaveAttribute(
    'href',
    `https://www.youtube.com/watch?v=${expected.videoId}`,
  );
});

test('scout play · a player with no clip falls back to ESPN', async ({ page }) => {
  await page.setViewportSize(VIEWPORTS.mobile);
  // Deep cuts: practice-squad names, none of which have a verified highlight clip.
  await startScout(page, settingsFor('silhouette', { rounds: 0, packIds: ['deep-cuts'] }));
  let answer = await getAnswer(page);
  for (let i = 0; i < 10 && answer && CLIP_IDS.has(answer.id); i++) {
    await page.evaluate(() => {
      window.__scout!.store.getState().giveUp();
      window.__scout!.store.getState().next();
    });
    answer = await getAnswer(page);
  }
  expect(answer && !CLIP_IDS.has(answer.id), 'found a round without a clip').toBe(true);
  await page.evaluate(() => window.__scout!.store.getState().giveUp());
  await expect(page.getByTestId('scout-reveal')).toBeVisible();
  const link = page.getByTestId('scout-tape-fallback');
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute('href', `https://www.espn.com/nfl/player/_/id/${answer!.id}`);
});

test('scout play · hotkeys skip, give up and advance', async ({ page }) => {
  await page.setViewportSize(VIEWPORTS.desktop);
  await startScout(page, settingsFor('silhouette'));
  await page.locator('body').press('ArrowRight');
  await expect(page.getByTestId('scout-clue')).toHaveCount(1);
  await page.locator('body').press('g');
  await expect(page.getByTestId('scout-reveal')).toBeVisible();
  await page.locator('body').press('Enter');
  await expect(page.getByTestId('scout-reveal')).toHaveCount(0);
  await expect(page.getByTestId('scout-round-counter')).toContainText('2/5');
  // ? opens the shortcut sheet
  await page.locator('body').press('?');
  await expect(page.getByRole('heading', { name: 'Keyboard shortcuts' })).toBeVisible();
});

test('scout play · the round timer only starts once the stage is on screen', async ({ page }) => {
  await page.setViewportSize(VIEWPORTS.mobile);
  await startScout(page, settingsFor('silhouette', { rounds: 2, roundTimer: 3 }));
  // The ring counts down from the full timer, and the round is lost when it runs out.
  await expect(page.getByRole('progressbar', { name: 'Round timer' })).toBeVisible();
  const reveal = page.getByTestId('scout-reveal');
  await expect(reveal).toBeVisible({ timeout: 12_000 });
  await expect(reveal).toHaveAttribute('data-verdict', 'timeout');
  await expect(page.getByTestId('scout-feedback')).toContainText(/Time/i);
});

test('scout play · quitting goes to results with what was scored', async ({ page }) => {
  await page.setViewportSize(VIEWPORTS.mobile);
  await startScout(page, settingsFor('logoZoom'));
  const answer = await getAnswer(page);
  await guess(page, answer!.accepted[0]);
  await expect(page.getByTestId('scout-reveal')).toBeVisible();
  await page.getByTestId('scout-quit').click();
  await page.getByTestId('scout-quit-confirm').click();
  await expect(page).toHaveURL(/#\/scout\/results$/);
  await expect(page.getByTestId('scout-results-hero')).toBeVisible();
});

test('scout results · a finished session renders the board and the actions', async ({ page }) => {
  await page.setViewportSize(VIEWPORTS.mobile);
  await startScout(page, settingsFor('silhouette', { rounds: 3 }));

  for (let i = 0; i < 3; i++) {
    const answer = await getAnswer(page);
    expect(answer).not.toBeNull();
    if (i === 1) {
      await page.evaluate(() => window.__scout!.store.getState().giveUp());
    } else {
      await guess(page, answer!.accepted[0]);
    }
    await expect(page.getByTestId('scout-reveal')).toBeVisible();
    await page.getByTestId('scout-next').click();
  }

  await expect(page).toHaveURL(/#\/scout\/results$/);
  await expect(page.getByTestId('scout-results-hero')).toBeVisible();
  await expect(page.locator('h1')).toHaveCount(1);
  await expect(page.getByTestId('scout-final-score')).toBeVisible();
  await expect(page.getByTestId('scout-grid')).toContainText('🟩');
  await expect(page.getByTestId('scout-round-row')).toHaveCount(3);
  await expect(page.getByTestId('scout-play-again')).toBeVisible();
  await expect(page.getByTestId('scout-share')).toBeVisible();
  await expect(page.getByTestId('scout-challenge')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Change setup' })).toHaveAttribute('href', /#\/scout\/setup$/);
  await expectNoHorizontalOverflow(page);
  await expectIconButtonsLabelled(page);
  await page.screenshot({ path: `${OUT}/results-mobile.png`, fullPage: true });
});

test('scout results · a round row plays its own tape', async ({ page }) => {
  await page.setViewportSize(VIEWPORTS.desktop);
  await blockYouTubeApi(page);
  await startScout(page, settingsFor('silhouette', { rounds: 4 }));
  for (let i = 0; i < 4; i++) {
    const answer = await getAnswer(page);
    await guess(page, answer!.accepted[0]);
    await expect(page.getByTestId('scout-reveal')).toBeVisible();
    await page.getByTestId('scout-next').click();
  }
  await expect(page.getByTestId('scout-round-list')).toBeVisible();
  await expect(page.locator('iframe')).toHaveCount(0);
  const enabled = page.getByTestId('scout-round-tape').and(page.locator(':not([disabled])')).first();
  await enabled.click();
  const frame = page.getByTestId('scout-tape-frame').first();
  await expect(frame).toBeVisible();
  await expect(frame).toHaveAttribute('src', /youtube-nocookie\.com\/embed\//);
  // …and only that row's frame: ten rounds must not mean ten YouTube connections.
  await expect(page.locator('iframe')).toHaveCount(1);
});

test('scout home · modes link into setup and the sample renders', async ({ page }) => {
  await page.setViewportSize(VIEWPORTS.narrow);
  await page.goto('/#/scout');
  await expect(page.locator('h1')).toHaveCount(1);
  await expect(page.getByTestId('scout-sample')).toBeVisible();
  await expect(page.getByRole('link', { name: /Silhouette/ })).toHaveAttribute('href', /#\/scout\/setup\?mode=silhouette$/);
  await expect(page.getByRole('link', { name: /Logo Zoom/ })).toHaveAttribute('href', /#\/scout\/setup\?mode=logoZoom$/);
  await expectNoHorizontalOverflow(page);
  await expectIconButtonsLabelled(page);
});

/** Every box that has to be on screen the moment a round ends, and whether it is. */
async function foldCheck(page: Page): Promise<{ docH: number; vh: number; name: boolean; next: boolean }> {
  return page.evaluate(() => {
    const vh = window.innerHeight;
    const inFold = (sel: string): boolean => {
      const el = document.querySelector(sel);
      if (!el) return false;
      const b = el.getBoundingClientRect();
      return b.top >= -1 && b.bottom <= vh + 1;
    };
    return {
      docH: document.documentElement.scrollHeight,
      vh,
      name: inFold('[data-testid="scout-reveal-name"]'),
      next: inFold('[data-testid="scout-next"]'),
    };
  });
}

test('scout play · the silhouette curtain opens a measurable amount on every rung', async ({ page }) => {
  await page.setViewportSize(VIEWPORTS.desktop);
  await startScout(page, settingsFor('silhouette', { tries: 5 }));
  const stage = page.getByTestId('scout-stage-photo');
  const cuts: number[] = [];
  for (let i = 0; i < 5; i++) {
    const cut = Number(await stage.getAttribute('data-cut'));
    cuts.push(cut);
    if (i < 4) {
      await page.getByTestId('scout-skip').click();
      // The clue ladder can be shorter than the try ladder, so wait on the curtain, not the clues.
      await expect(stage).not.toHaveAttribute('data-cut', String(cut));
    }
  }
  // Rung 0 is a TRUE shadow (nothing of the face), every rung after it shows a new band of the
  // photo, and no live rung ever opens the curtain all the way.
  expect(cuts[0]).toBe(0);
  for (let i = 1; i < cuts.length; i++) {
    expect(cuts[i] - cuts[i - 1], `rung ${i} must show more than rung ${i - 1}`).toBeGreaterThanOrEqual(10);
  }
  expect(Math.max(...cuts)).toBeLessThan(100);
  // The curtain is a second, blacked-out copy of the photo — while it is live, it is in the DOM.
  await expect(page.getByTestId('scout-stage-curtain')).toBeVisible();
  await page.getByTestId('scout-give-up').click();
  await expect(page.getByTestId('scout-reveal')).toBeVisible();
});

test('scout play · the reveal is on screen the moment a round ends, in every mode', async ({ page }) => {
  await page.setViewportSize(VIEWPORTS.mobile);
  for (const mode of ALL_MODES) {
    await startScout(page, settingsFor(mode));
    const answer = await getAnswer(page);
    await guess(page, answer!.accepted[0]);
    await expect(page.getByTestId('scout-reveal')).toBeVisible();
    await expect(page.getByTestId('scout-next')).toBeVisible();
    const fold = await foldCheck(page);
    expect(fold.name, `${mode}: the answer is below the fold`).toBe(true);
    expect(fold.next, `${mode}: "Next round" is below the fold`).toBe(true);
    expect(fold.docH, `${mode}: the page scrolls at ${fold.vh} px tall`).toBeLessThanOrEqual(fold.vh + 1);
  }
});

test('scout play · a franchise is never called "him"', async ({ page }) => {
  // The phone layout is the one that still shows the verdict line after the round ends (on a
  // laptop the reveal card takes the hero slot and carries the verdict itself).
  await page.setViewportSize(VIEWPORTS.mobile);
  const person = /\b(him|his|guy)\b/i;
  for (const mode of TEAM_MODES) {
    await startScout(page, settingsFor(mode));
    const answer = await getAnswer(page);
    await guess(page, await page.evaluate(() => window.__scout!.wrongGuess()));
    await expect(page.getByTestId('scout-feedback')).toContainText(/tries left/i);
    expect(await page.getByTestId('scout-feedback').innerText(), `${mode}: wrong verdict`).not.toMatch(person);

    const close = await page.evaluate(() => window.__scout!.closeGuess());
    if (close !== null) {
      await guess(page, close);
      const text = await page.getByTestId('scout-feedback').innerText();
      expect(text, `${mode}: close verdict`).not.toMatch(person);
      // …and it never promises a second club in a city that has only one.
      expect(text).not.toMatch(/try the other one/i);
    }

    await guess(page, answer!.accepted[0]);
    await expect(page.getByTestId('scout-reveal')).toBeVisible();
    expect(await page.getByTestId('scout-feedback').innerText(), `${mode}: correct verdict`).not.toMatch(person);
  }
});

test('scout play · the dossier keeps the deepest cut on screen to the last rung', async ({ page }) => {
  await page.setViewportSize(VIEWPORTS.desktop);
  await startScout(page, settingsFor('teamTrivia', { tries: 6 }));
  const cards = page.getByTestId('scout-trivia-card');
  const first = cards.first();
  const deepCut = await first.innerText();
  for (let i = 0; i < 5; i++) await page.getByTestId('scout-skip').click();
  await expect(cards.last()).toBeVisible();
  // Rung 0 is the most expensive clue in the game: it is still readable, and still says the same thing.
  await expect(first).toBeInViewport({ ratio: 0.9 });
  expect(await first.innerText()).toBe(deepCut);
});

test('scout play · the tape is the payoff on a laptop, not a thumbnail', async ({ page }) => {
  await page.setViewportSize(VIEWPORTS.desktop);
  await startScout(page, settingsFor('silhouette', { rounds: 0 }));
  await findRoundWithClip(page);
  await page.evaluate(() => window.__scout!.store.getState().giveUp());
  await expect(page.getByTestId('scout-reveal')).toBeVisible();
  const poster = page.getByTestId('scout-tape-button');
  await expect(poster).toBeVisible();
  const box = (await poster.boundingBox())!;
  expect(box.width, 'the closed tape is a poster, not a small ghost button').toBeGreaterThan(380);
  expect(box.height / box.width).toBeCloseTo(9 / 16, 1);
});

test('scout play · no horizontal overflow at 320 px in any mode', async ({ page }) => {
  await page.setViewportSize(VIEWPORTS.narrow);
  for (const mode of ALL_MODES) {
    await startScout(page, settingsFor(mode, { tries: 6 }));
    // walk the whole ladder so the widest state of every stage is measured
    for (let i = 0; i < 5; i++) await page.getByTestId('scout-skip').click();
    await page.getByTestId('scout-give-up').click();
    await expect(page.getByTestId('scout-reveal')).toBeVisible();
    await expectNoHorizontalOverflow(page);
  }
});
