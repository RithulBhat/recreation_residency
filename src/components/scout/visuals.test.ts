import { describe, expect, it } from 'vitest';
import { FACE_ZOOM_MAX, FACE_ZOOM_MIN, LOGO_ZOOM_MAX, LOGO_ZOOM_MIN, SILHOUETTE_MAX, visualLadder } from '@/scout/stages';
import {
  FACE_JITTER,
  LOGO_FOCUS_RANGE,
  VISUAL_RANGE,
  faceOriginX,
  isVisualMode,
  logoOrigin,
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
    for (const mode of ['silhouette', 'faceZoom', 'logoZoom'] as const) {
      expect(specPosition(mode, 1)).toBeLessThan(1);
      expect(specPosition(mode, 1, true)).toBe(1);
    }
  });

  it('clamps nonsense input instead of extrapolating', () => {
    expect(specPosition('silhouette', -5)).toBe(0);
    expect(specPosition('silhouette', Number.NaN)).toBe(0);
    expect(specPosition('faceZoom', 99)).toBeCloseTo(VISUAL_RANGE.faceZoom.ceiling, 5);
  });
});

describe('the silhouette ladder', () => {
  const rungs = visualLadder(5, 0, SILHOUETTE_MAX);

  it('starts as a pure black rim-lit shape', () => {
    const style = visualStyle({ mode: 'silhouette', visual: rungs[0] });
    expect(style.filter).toContain('brightness(0)');
    expect(style.filter).toContain('drop-shadow');
    expect(style.filter).not.toContain('blur');
  });

  it('never blurs past the spec’s 12 px ceiling, and never reveals the photo while live', () => {
    for (const v of rungs) {
      const style = visualStyle({ mode: 'silhouette', visual: v });
      const blur = Number(style.filter.match(/blur\(([\d.]+)px\)/)?.[1] ?? 0);
      expect(blur).toBeLessThanOrEqual(12);
      expect(style.filter).not.toBe('none');
    }
  });

  it('lets light in monotonically', () => {
    const brightness = rungs.map((v) => {
      const f = visualStyle({ mode: 'silhouette', visual: v }).filter;
      return Number(f.match(/brightness\(([\d.]+)\)/)?.[1] ?? 1);
    });
    for (let i = 1; i < brightness.length; i++) expect(brightness[i]).toBeGreaterThanOrEqual(brightness[i - 1]);
    expect(brightness[brightness.length - 1]).toBe(1);
  });

  it('keeps the head crop anchored at the top of the frame, then pulls back on the reveal', () => {
    const live = visualStyle({ mode: 'silhouette', visual: rungs[0] });
    expect(originY(live.transformOrigin)).toBe(0);
    expect(scaleOf(live.transform)).toBeGreaterThan(1.5);
    const revealed = visualStyle({ mode: 'silhouette', visual: SILHOUETTE_MAX, revealed: true });
    expect(revealed.filter).toBe('none');
    expect(scaleOf(revealed.transform)).toBe(1);
  });
});

describe('the face-zoom ladder', () => {
  const rungs = visualLadder(5, FACE_ZOOM_MIN, FACE_ZOOM_MAX);

  it('zooms out monotonically from an eye-level crop', () => {
    const scales = rungs.map((v) => scaleOf(visualStyle({ mode: 'faceZoom', visual: v }).transform));
    expect(scales[0]).toBeCloseTo(3.6, 2);
    for (let i = 1; i < scales.length; i++) expect(scales[i]).toBeLessThan(scales[i - 1]);
    expect(scales[scales.length - 1]).toBeGreaterThan(1);
  });

  it('anchors on the eyes and never on the forehead', () => {
    // The spec REJECTED a forehead anchor (origin ~22% at 6×): featureless skin.
    const first = visualStyle({ mode: 'faceZoom', visual: rungs[0] });
    expect(originY(first.transformOrigin)).toBeGreaterThanOrEqual(30);
    const last = visualStyle({ mode: 'faceZoom', visual: rungs[rungs.length - 1] });
    expect(originY(last.transformOrigin)).toBeLessThan(originY(first.transformOrigin));
  });

  it('jitters the horizontal origin by at most ±6% and centres it on the reveal', () => {
    for (const x of [0.36, 0.5, 0.64, 0, 1]) {
      const pct = faceOriginX({ x, y: 0.3 });
      expect(pct).toBeGreaterThanOrEqual((0.5 - FACE_JITTER) * 100 - 0.001);
      expect(pct).toBeLessThanOrEqual((0.5 + FACE_JITTER) * 100 + 0.001);
    }
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
    expect(silhouetteFilter({ brightness: 1, contrast: 1, blur: 0, rim: 0, rim2: 0 })).toBe('brightness(1)');
  });
  it('orders brightness before the rim light, so the glow traces the black shape', () => {
    const f = silhouetteFilter({ brightness: 0, contrast: 1, blur: 0, rim: 3, rim2: 0 });
    expect(f.indexOf('brightness')).toBeLessThan(f.indexOf('drop-shadow'));
  });
});

describe('visualDescription', () => {
  it('describes the frame without ever naming the subject', () => {
    expect(visualDescription('silhouette', 0)).toMatch(/silhouette/i);
    expect(visualDescription('faceZoom', 0.06)).toMatch(/close-up/i);
    expect(visualDescription('logoZoom', 0.1)).toMatch(/logo/i);
    expect(visualDescription('silhouette', 1, true)).toMatch(/full photo/i);
  });
});
