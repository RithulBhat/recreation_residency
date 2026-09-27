import { describe, expect, it } from 'vitest';
import { FACE_ZOOM_MAX, FACE_ZOOM_MIN, LOGO_ZOOM_MAX, LOGO_ZOOM_MIN, SILHOUETTE_MAX, visualLadder } from '@/scout/stages';
import type { SilhouetteCurtain } from './visuals';
import {
  CURTAIN_FEATHER,
  FACE_JITTER,
  LOGO_FOCUS_RANGE,
  SILHOUETTE_CUT,
  VISUAL_RANGE,
  curtainMask,
  faceOriginX,
  isVisualMode,
  logoOrigin,
  silhouetteCurtain,
  silhouetteFilter,
  specPosition,
  visualDescription,
  visualStyle,
} from './visuals';

function scaleOf(transform: string): number {
  const m = transform.match(/scale\(([\d.]+)\)/);
  return m ? Number(m[1]) : Number.NaN;
}

function originY(origin: string): number {
  return Number(origin.split(' ')[1].replace('%', ''));
}

describe('isVisualMode', () => {
  it('covers exactly the three image modes', () => {
    expect(isVisualMode('silhouette')).toBe(true);
    expect(isVisualMode('faceZoom')).toBe(true);
    expect(isVisualMode('logoZoom')).toBe(true);
    expect(isVisualMode('highlight')).toBe(false);
    expect(isVisualMode('teamTrivia')).toBe(false);
    expect(isVisualMode('statLine')).toBe(false);
    expect(isVisualMode('careerPath')).toBe(false);
  });
});

describe('specPosition', () => {
  it('maps each mode’s engine bounds onto 0 → ceiling', () => {
    expect(specPosition('silhouette', 0)).toBe(0);
    expect(specPosition('silhouette', SILHOUETTE_MAX)).toBeCloseTo(VISUAL_RANGE.silhouette.ceiling, 5);
    expect(specPosition('faceZoom', FACE_ZOOM_MIN)).toBe(0);
    expect(specPosition('faceZoom', FACE_ZOOM_MAX)).toBeCloseTo(VISUAL_RANGE.faceZoom.ceiling, 5);
    expect(specPosition('logoZoom', LOGO_ZOOM_MIN)).toBe(0);
    expect(specPosition('logoZoom', LOGO_ZOOM_MAX)).toBeCloseTo(VISUAL_RANGE.logoZoom.ceiling, 5);
  });

  it('only reaches the clean frame when the round is over', () => {
    for (const mode of ['faceZoom', 'logoZoom'] as const) {
      expect(specPosition(mode, 1)).toBeLessThan(1);
      expect(specPosition(mode, 1, true)).toBe(1);
    }
    // The silhouette spans its whole ladder; the CURTAIN is what keeps the photo back.
    expect(specPosition('silhouette', 1)).toBe(1);
    expect(silhouetteCurtain(1).cut).toBeLessThan(SILHOUETTE_CUT.reveal);
    expect(silhouetteCurtain(1, true).cut).toBe(SILHOUETTE_CUT.reveal);
  });

  it('clamps nonsense input instead of extrapolating', () => {
    expect(specPosition('silhouette', -5)).toBe(0);
    expect(specPosition('silhouette', Number.NaN)).toBe(0);
    expect(specPosition('faceZoom', 99)).toBeCloseTo(VISUAL_RANGE.faceZoom.ceiling, 5);
  });
});

/**
 * The mask's alpha at `yFraction` down the frame (0 = the top edge, 1 = the bottom edge).
 *
 * This is the CSS painted out by hand, so a test can assert what a player actually sees rather than
 * what the numbers were meant to mean. `mask-size: 100% 200%` makes the mask box twice the frame,
 * `mask-position-y: P%` resolves against (frame − mask) = −frame and so puts the box top at −P% of
 * the frame, and `linear-gradient(to top, transparent 0 A%, #000 B%)` measures A and B from the
 * BOTTOM of that box. Alpha 1 = the blacked-out layer is painted at full strength there, which is
 * the only state in which none of the photo underneath can be seen.
 */
function maskAlphaAt(curtain: SilhouetteCurtain, yFraction: number): number {
  const stops = curtain.maskImage.match(/transparent 0 ([\d.]+)%, #000 ([\d.]+)%/);
  if (!stops) throw new Error(`unreadable mask: ${curtain.maskImage}`);
  const clear = Number(stops[1]) / 100;
  const solid = Number(stops[2]) / 100;
  const boxHeight = Number(curtain.maskSize.split(' ')[1].replace('%', '')) / 100; // in frame heights
  const position = Number(curtain.maskPosition.split(' ')[1].replace('%', '')) / 100;
  const boxTop = position * (1 - boxHeight);
  const boxBottom = boxTop + boxHeight;
  // `to top` measures from the bottom of the mask box upward.
  const f = (boxBottom - yFraction) / boxHeight;
  if (f <= clear) return 0;
  if (f >= solid) return 1;
  return (f - clear) / (solid - clear);
}

/** 101 samples down the frame — a 7%-tall leak cannot hide between them. */
function maskAlphaProfile(curtain: SilhouetteCurtain): number[] {
  return Array.from({ length: 101 }, (_, i) => maskAlphaAt(curtain, i / 100));
}

describe('the silhouette curtain', () => {
  const rungs = visualLadder(5, 0, SILHOUETTE_MAX);
  const cuts = rungs.map((v) => silhouetteCurtain(v).cut);

  it('hits the five tested cuts at five tries', () => {
    // The five measured landmarks, each carrying the feather that now hangs BELOW the solid edge.
    expect(cuts).toEqual([0, 20, 34, 50, 70].map((c, i) => (i === 0 ? 0 : c + CURTAIN_FEATHER)));
    expect(cuts).toEqual([0, 27, 41, 57, 77]);
  });

  it('rung 0 leaves NO visible photo — not one pixel row of the frame', () => {
    // The bug this pins: the feather used to hang above the cut line, so at cut 0 the bottom 7% of
    // the frame was only partly blacked out. On a 380 px stage that band is ~27 px of lit chin —
    // measured on three seeds it handed over teeth, a beard, a tattoo and skin tone, on the
    // HARDEST rung of the flagship mode.
    const rung0 = silhouetteCurtain(rungs[0]);
    expect(rung0.cut).toBe(SILHOUETTE_CUT.min);
    for (const alpha of maskAlphaProfile(rung0)) expect(alpha).toBe(1);
    // …and the shade layer really is painted (open would drop it from the DOM entirely).
    expect(rung0.open).toBe(false);
    expect(rung0.shadeFilter).toContain('brightness(0)');
  });

  it('every ladder, at every try count, starts on a fully opaque frame', () => {
    for (const tries of [1, 2, 3, 4, 5, 6]) {
      const first = silhouetteCurtain(visualLadder(tries, 0, SILHOUETTE_MAX)[0]);
      expect(Math.min(...maskAlphaProfile(first)), `tries ${tries}`).toBe(1);
    }
  });

  it('opens from the bottom up: later rungs clear a strictly taller band of the frame', () => {
    const clear = rungs.map((v) => maskAlphaProfile(silhouetteCurtain(v)).filter((a) => a < 1).length);
    expect(clear[0]).toBe(0);
    for (let i = 1; i < clear.length; i++) expect(clear[i]).toBeGreaterThan(clear[i - 1]);
    // and what it clears is always the BOTTOM of the frame, never a band in the middle
    for (const v of rungs) {
      const profile = maskAlphaProfile(silhouetteCurtain(v));
      for (let i = 1; i < profile.length; i++) expect(profile[i]).toBeLessThanOrEqual(profile[i - 1]);
    }
  });

  it('gives every rung a visibly different cut — the shipped filter ladder repeated itself', () => {
    for (let i = 1; i < cuts.length; i++) {
      // 10 percentage points of frame height is ~38 px on a 380 px stage: a whole facial feature.
      expect(cuts[i] - cuts[i - 1]).toBeGreaterThanOrEqual(10);
    }
    expect(new Set(cuts).size).toBe(cuts.length);
  });

  it('spaces evenly across the whole face for every try count, and never opens fully while live', () => {
    for (const tries of [1, 2, 3, 4, 5, 6]) {
      const ladder = visualLadder(tries, 0, SILHOUETTE_MAX).map((v) => silhouetteCurtain(v).cut);
      expect(ladder).toHaveLength(tries);
      expect(ladder[0]).toBe(SILHOUETTE_CUT.min);
      expect(ladder[ladder.length - 1]).toBe(tries === 1 ? SILHOUETTE_CUT.min : SILHOUETTE_CUT.max);
      for (let i = 1; i < ladder.length; i++) expect(ladder[i]).toBeGreaterThan(ladder[i - 1]);
      for (const cut of ladder) expect(cut).toBeLessThan(SILHOUETTE_CUT.reveal);
    }
  });

  it('rung 0 is a true shadow: flat black, rim-lit, and the photo unblurred underneath', () => {
    const c = silhouetteCurtain(rungs[0]);
    expect(c.shadeFilter).toContain('brightness(0)');
    expect(c.shadeFilter).toContain('drop-shadow');
    expect(c.shadeFilter).not.toContain('blur');
    expect(c.baseFilter).toBe('none');
    expect(c.open).toBe(false);
  });

  it('keeps the rim constant — escalating it reads as no change at all (spec: do not)', () => {
    const filters = new Set(rungs.map((v) => silhouetteCurtain(v).shadeFilter));
    expect(filters.size).toBe(1);
  });

  it('softens the colour layer only on the last live rung, and never past 12 px', () => {
    const blurs = rungs.map((v) => Number(silhouetteCurtain(v).baseFilter.match(/blur\(([\d.]+)px\)/)?.[1] ?? 0));
    expect(blurs.slice(0, 4)).toEqual([0, 0, 0, 0]);
    expect(blurs[4]).toBeGreaterThan(0);
    for (const b of blurs) expect(b).toBeLessThanOrEqual(12);
  });

  it('masks from the bottom up, on a box twice the frame so the edge can animate', () => {
    const m = curtainMask(34);
    // The feather is spent BELOW the 50% line (the solid edge), never above it — that is what keeps
    // cut 0 fully opaque instead of leaking a soft band across the bottom of the frame.
    expect(m.maskImage).toBe(`linear-gradient(to top, transparent 0 ${50 - CURTAIN_FEATHER / 2}%, #000 50%)`);
    expect(m.maskSize).toBe('100% 200%');
    // mask-position-y resolves against (frame − mask) = −frame, so cut% puts the edge cut% up.
    expect(m.maskPosition).toBe('50% 34%');
    expect(curtainMask(0).maskPosition).toBe('50% 0%');
    expect(curtainMask(140).maskPosition).toBe(`50% ${SILHOUETTE_CUT.reveal}%`);
  });

  it('keeps the head crop anchored at the top of the frame, then pulls back on the reveal', () => {
    const live = visualStyle({ mode: 'silhouette', visual: rungs[0] });
    expect(originY(live.transformOrigin)).toBe(0);
    expect(scaleOf(live.transform)).toBeGreaterThan(1.5);
    expect(live.objectPosition).toBe('50% 12%');
    const revealed = visualStyle({ mode: 'silhouette', visual: SILHOUETTE_MAX, revealed: true });
    expect(revealed.filter).toBe('none');
    expect(scaleOf(revealed.transform)).toBe(1);
    expect(silhouetteCurtain(SILHOUETTE_MAX, true).open).toBe(true);
  });
});

describe('the face-zoom ladder', () => {
  const rungs = visualLadder(5, FACE_ZOOM_MIN, FACE_ZOOM_MAX);

  it('zooms out monotonically from an eye-level crop', () => {
    const scales = rungs.map((v) => scaleOf(visualStyle({ mode: 'faceZoom', visual: v }).transform));
    // Rung 0 is ONE feature: at 3.6× both eyes, the nose and the moustache were all in frame.
    expect(scales[0]).toBeCloseTo(6.2, 2);
    for (let i = 1; i < scales.length; i++) expect(scales[i]).toBeLessThan(scales[i - 1]);
    expect(scales[scales.length - 1]).toBeGreaterThan(1);
  });

  it('escalates evenly — each rung pulls back by a similar RATIO, none of them stalls', () => {
    const scales = rungs.map((v) => scaleOf(visualStyle({ mode: 'faceZoom', visual: v }).transform));
    const ratios = scales.slice(1).map((s, i) => s === 0 ? 0 : scales[i] / s);
    for (const r of ratios) expect(r).toBeGreaterThan(1.2);
    expect(Math.max(...ratios) - Math.min(...ratios)).toBeLessThan(0.2);
  });

  it('anchors on the eyes and never on the forehead', () => {
    // The spec REJECTED a forehead anchor (origin ~22% at 6×): featureless skin.
    const first = visualStyle({ mode: 'faceZoom', visual: rungs[0] });
    expect(originY(first.transformOrigin)).toBeGreaterThanOrEqual(30);
    const last = visualStyle({ mode: 'faceZoom', visual: rungs[rungs.length - 1] });
    expect(originY(last.transformOrigin)).toBeLessThan(originY(first.transformOrigin));
  });

  it('jitters the horizontal origin by at most ±6%, never onto the centre line, and centres it on the reveal', () => {
    for (const x of [0.36, 0.42, 0.49, 0.5, 0.58, 0.64, 0, 1]) {
      const pct = faceOriginX({ x, y: 0.3 });
      expect(pct).toBeGreaterThanOrEqual((0.5 - FACE_JITTER) * 100 - 0.001);
      expect(pct).toBeLessThanOrEqual((0.5 + FACE_JITTER) * 100 + 0.001);
      // Centred at 6.2x frames the bridge of the nose and catches BOTH eyes: two features.
      expect(Math.abs(pct - 50)).toBeGreaterThanOrEqual(FACE_JITTER * 40 - 0.001);
    }
    expect(new Set([0.36, 0.44, 0.56, 0.64].map((x) => faceOriginX({ x, y: 0.3 }))).size).toBe(4);
    const revealed = visualStyle({ mode: 'faceZoom', visual: 1, revealed: true, focus: { x: 0.36, y: 0.2 } });
    expect(revealed.transformOrigin.startsWith('50%')).toBe(true);
  });
});

describe('the logo ladder', () => {
  const rungs = visualLadder(5, LOGO_ZOOM_MIN, LOGO_ZOOM_MAX);

  it('starts tight and eases out without ever reaching 1× while live', () => {
    const scales = rungs.map((v) => scaleOf(visualStyle({ mode: 'logoZoom', visual: v }).transform));
    expect(scales[0]).toBeCloseTo(5.5, 2);
    for (let i = 1; i < scales.length; i++) expect(scales[i]).toBeLessThan(scales[i - 1]);
    expect(scales[scales.length - 1]).toBeGreaterThan(1);
    expect(scaleOf(visualStyle({ mode: 'logoZoom', visual: 1, revealed: true }).transform)).toBe(1);
  });

  it('keeps the seeded crop origin inside the tested 38–58% window', () => {
    for (const x of [0.3, 0.42, 0.7]) {
      for (const y of [0.3, 0.55, 0.7]) {
        const o = logoOrigin({ x, y });
        for (const v of [o.x, o.y]) {
          expect(v).toBeGreaterThanOrEqual(LOGO_FOCUS_RANGE.min * 100 - 0.001);
          expect(v).toBeLessThanOrEqual(LOGO_FOCUS_RANGE.max * 100 + 0.001);
        }
      }
    }
  });

  it('uses contain so a logo is never cropped by the frame itself', () => {
    expect(visualStyle({ mode: 'logoZoom', visual: 0.5 }).objectFit).toBe('contain');
    expect(visualStyle({ mode: 'silhouette', visual: 0.5 }).objectFit).toBe('cover');
  });
});

describe('silhouetteFilter', () => {
  it('drops no-op steps', () => {
    expect(silhouetteFilter({ brightness: 1, contrast: 1, blur: 0, rim: 0 })).toBe('brightness(1)');
  });
  it('orders brightness before the rim light, so the glow traces the black shape', () => {
    const f = silhouetteFilter({ brightness: 0, contrast: 1, blur: 0, rim: 3 });
    expect(f.indexOf('brightness')).toBeLessThan(f.indexOf('drop-shadow'));
  });
});

describe('visualDescription', () => {
  it('describes the frame without ever naming the subject', () => {
    expect(visualDescription('silhouette', 0)).toMatch(/silhouette/i);
    expect(visualDescription('silhouette', SILHOUETTE_MAX)).toMatch(/hair/i);
    expect(visualDescription('faceZoom', 0.06)).toMatch(/close-up/i);
    expect(visualDescription('logoZoom', 0.1)).toMatch(/logo/i);
    expect(visualDescription('silhouette', 1, true)).toMatch(/full photo/i);
  });
});
