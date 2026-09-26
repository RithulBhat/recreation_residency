/**
 * Highlight Scout reveal treatments — the exact CSS for every rung of every visual mode.
 *
 * This is an implementation of the TESTED spec in `scratchpad/scout1/VISUAL-SPEC.md`: real ESPN
 * headshots (600×436 RGBA PNGs, transparent background) were rendered through six treatments and
 * scored for guessability. Two of them are REJECTED there and are deliberately absent here:
 *   - the full-bust silhouette (`object-fit: contain` + `brightness(0)`) — eight players were
 *     indistinguishable blobs;
 *   - a forehead-anchored zoom — it lands on featureless skin.
 * What survived: a HEAD-CROP silhouette with an accent rim light (the glow traces the hairline and
 * jaw, so locs / fades / bald heads / curls separate), and an EYE-LEVEL zoom.
 *
 * ## The ladder
 * The engine hands a screen `stage.visual` (0 → 1) whose per-mode bounds live in `@/scout/stages`
 * (silhouette 0→0.85, faceZoom 0.06→0.95, logoZoom 0.1→0.95). Those bounds are mapped onto the
 * spec's five stops via {@link specPosition}, which deliberately stops SHORT of the last stop while
 * a round is live: stop 1.0 is the clean photo, and that is the payoff frame — it is only reached
 * with `revealed: true`. So the hardest rung is the spec's stop 0, the easiest LIVE rung is stop
 * 0.75 (silhouette: `blur(7px)`, full colour, still unreadable as a face), and the reveal is clean.
 *
 * Everything here is pure and framework-free so the ladder can be unit tested and a screenshot
 * script can render it without React.
 */

import { FACE_ZOOM_MAX, FACE_ZOOM_MIN, LOGO_ZOOM_MAX, LOGO_ZOOM_MIN, SILHOUETTE_MAX } from '@/scout/stages';
import type { ScoutFocus } from '@/scout/stages';
import type { ScoutMode } from '@/scout/types';

/** The modes that render an image ladder rather than text. */
export type VisualMode = 'silhouette' | 'faceZoom' | 'logoZoom';

export const VISUAL_MODES: readonly VisualMode[] = ['silhouette', 'faceZoom', 'logoZoom'];

export function isVisualMode(mode: ScoutMode): mode is VisualMode {
  return (VISUAL_MODES as readonly string[]).includes(mode);
}

/** ~450 ms per the brief; screens drop this to 0 under `prefers-reduced-motion`. */
export const REVEAL_MS = 450;

/** Minimum on-screen size of the stage, in px (spec: the treatments only work big enough). */
export const MIN_STAGE_PX = { mobile: 280, desktop: 380, logoMobile: 260 } as const;

export function clamp01(n: number): number {
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function round(n: number, places = 3): number {
  const f = 10 ** places;
  return Math.round(n * f) / f;
}

/**
 * Engine bounds per mode, plus the highest spec stop a LIVE rung may reach. The gap between
 * `ceiling` and 1 is the reveal — the clean photo is never shown before the answer.
 */
export const VISUAL_RANGE: Readonly<Record<VisualMode, { min: number; max: number; ceiling: number }>> = {
  silhouette: { min: 0, max: SILHOUETTE_MAX, ceiling: 0.75 },
  faceZoom: { min: FACE_ZOOM_MIN, max: FACE_ZOOM_MAX, ceiling: 0.8 },
  logoZoom: { min: LOGO_ZOOM_MIN, max: LOGO_ZOOM_MAX, ceiling: 0.8 },
};

/**
 * Where on the spec's 0 → 1 ladder a rung sits. `revealed` short-circuits to 1 (the clean photo);
 * otherwise the engine's `visual` is normalized inside the mode's bounds and squeezed under the
 * mode's ceiling.
 */
export function specPosition(mode: VisualMode, visual: number, revealed = false): number {
  if (revealed) return 1;
  const { min, max, ceiling } = VISUAL_RANGE[mode];
  const v = Number.isFinite(visual) ? visual : min;
  const t = max > min ? clamp01((v - min) / (max - min)) : 0;
  return round(t * ceiling);
}

// ---------------------------------------------------------------------------------------------
// Stops
// ---------------------------------------------------------------------------------------------

interface Stop<T> {
  at: number;
  value: T;
}

/** Interpolate a table of numeric records at `u`, clamped at both ends. */
function sample<T extends Record<string, number>>(stops: ReadonlyArray<Stop<T>>, u: number): T {
  const first = stops[0];
  const last = stops[stops.length - 1];
  if (u <= first.at) return first.value;
  if (u >= last.at) return last.value;
  for (let i = 1; i < stops.length; i++) {
    const a = stops[i - 1];
    const b = stops[i];
    if (u > b.at) continue;
    const span = b.at - a.at;
    const t = span <= 0 ? 0 : (u - a.at) / span;
    const out = {} as Record<string, number>;
    for (const key of Object.keys(a.value)) out[key] = round(lerp(a.value[key], b.value[key], t));
    return out as T;
  }
  return last.value;
}

interface SilhouetteParams extends Record<string, number> {
  /** 0 = pure black shape, 1 = untouched photo. */
  brightness: number;
  contrast: number;
  /** px. Never above 12 (the spec's `blur(26px)` was pure mush). */
  blur: number;
  /** Rim-light radius in px — the glow that traces the hairline. */
  rim: number;
  /** Second, wider rim pass for a fuller outline. */
  rim2: number;
  /** Head-crop zoom; eases back to the full bust on the reveal. */
  scale: number;
  /**
   * MEASURED, not copied. The spec's `scale(2.1)` from `50% 16%` clipped the crown off every head at
   * the real stage size, and at 2.1 even from the top the head fills the frame edge to edge — a blob
   * again (`scratchpad/scout2/core/calib-crop.png`). An alpha scan of 24 star headshots put the crown
   * between 0.5% and 16.7% down the frame (median 9.4%), so anchoring at the very top and easing the
   * zoom to 1.8 keeps every crown, both ears and the jaw inside the square, with margin to spare.
   */
  originY: number;
}

/**
 * Spec ladder: pure black + rim → fuller rim → shape with a hint of tone → full colour, blurred →
 * clean. `scale`/`originY` hold the tested head crop (2.1 from `50% 16%`) and only relax at the
 * reveal, so the payoff frame is the whole photo.
 */
export const SILHOUETTE_STOPS: ReadonlyArray<Stop<SilhouetteParams>> = [
  { at: 0, value: { brightness: 0, contrast: 1, blur: 0, rim: 3, rim2: 0, scale: 1.8, originY: 0 } },
  { at: 0.25, value: { brightness: 0, contrast: 1, blur: 0, rim: 4, rim2: 3, scale: 1.8, originY: 0 } },
  { at: 0.5, value: { brightness: 0.22, contrast: 1.4, blur: 6, rim: 2, rim2: 0, scale: 1.8, originY: 0 } },
  { at: 0.75, value: { brightness: 1, contrast: 1, blur: 7, rim: 0, rim2: 0, scale: 1.78, originY: 0 } },
  { at: 1, value: { brightness: 1, contrast: 1, blur: 0, rim: 0, rim2: 0, scale: 1, originY: 0 } },
];

interface ZoomParams extends Record<string, number> {
  scale: number;
  originY: number;
}

/** Eye-level zoom, easing out to the full head. NEVER anchored on the forehead (spec: REJECT). */
export const FACE_ZOOM_STOPS: ReadonlyArray<Stop<ZoomParams>> = [
  { at: 0, value: { scale: 3.6, originY: 34 } },
  { at: 0.25, value: { scale: 2.8, originY: 30 } },
  { at: 0.5, value: { scale: 2.2, originY: 24 } },
  { at: 0.75, value: { scale: 1.6, originY: 18 } },
  { at: 1, value: { scale: 1, originY: 12 } },
];

/** Logos are flat and vector-ish, so a tight crop reads: 5.5× is hard-but-fair, 1× is the reveal. */
export const LOGO_ZOOM_STOPS: ReadonlyArray<Stop<ZoomParams>> = [
  { at: 0, value: { scale: 5.5, originY: 50 } },
  { at: 0.33, value: { scale: 3.5, originY: 50 } },
  { at: 0.67, value: { scale: 2.2, originY: 50 } },
  { at: 1, value: { scale: 1, originY: 50 } },
];

// ---------------------------------------------------------------------------------------------
// Focus (deterministic framing)
// ---------------------------------------------------------------------------------------------

/** Spec: jitter the face crop by at most ±6% horizontally, and never drift off the face. */
export const FACE_JITTER = 0.06;
/** Spec: keep the logo crop origin inside 38–58% on each axis. */
export const LOGO_FOCUS_RANGE = { min: 0.38, max: 0.58 } as const;

function remap(value: number, fromMin: number, fromMax: number, toMin: number, toMax: number): number {
  const span = fromMax - fromMin;
  const t = span <= 0 ? 0.5 : clamp01((value - fromMin) / span);
  return round(lerp(toMin, toMax, t));
}

/**
 * The engine's `cropFocus` is wider than the spec allows (faceZoom x 0.36–0.64, logoZoom 0.3–0.7).
 * These squeeze it into the tested window while staying a pure function of the same seed, so the
 * framing is reproducible for a daily / challenge run.
 */
export function faceOriginX(focus: ScoutFocus | undefined): number {
  const x = focus?.x ?? 0.5;
  return remap(x, 0.36, 0.64, 0.5 - FACE_JITTER, 0.5 + FACE_JITTER) * 100;
}

export function logoOrigin(focus: ScoutFocus | undefined): { x: number; y: number } {
  const { min, max } = LOGO_FOCUS_RANGE;
  return {
    x: remap(focus?.x ?? 0.5, 0.3, 0.7, min, max) * 100,
    y: remap(focus?.y ?? 0.5, 0.3, 0.7, min, max) * 100,
  };
}

// ---------------------------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------------------------

/** Everything a screen needs to paint one rung of an image ladder. */
export interface VisualStyle {
  filter: string;
  transform: string;
  transformOrigin: string;
  objectFit: 'cover' | 'contain';
  objectPosition: string;
  opacity: number;
}

/** The accent used for the rim light. A token, so all four themes rim in their own colour. */
export const RIM_COLOR = 'var(--sg-accent-2-vivid)';

export function silhouetteFilter(p: Pick<SilhouetteParams, 'brightness' | 'contrast' | 'blur' | 'rim' | 'rim2'>): string {
  const parts: string[] = [];
  // brightness(0) is what makes a silhouette out of a transparent-background PNG.
  parts.push(`brightness(${round(p.brightness)})`);
  if (p.contrast !== 1) parts.push(`contrast(${round(p.contrast)})`);
  if (p.blur > 0.05) parts.push(`blur(${round(p.blur, 2)}px)`);
  // drop-shadow on an alpha silhouette = a rim light tracing the outline.
  if (p.rim > 0.05) parts.push(`drop-shadow(0 0 ${round(p.rim, 2)}px ${RIM_COLOR})`);
  if (p.rim2 > 0.05) parts.push(`drop-shadow(0 1px ${round(p.rim2, 2)}px ${RIM_COLOR})`);
  return parts.join(' ');
}

export interface VisualStyleInput {
  mode: VisualMode;
  /** `stage.visual` from the engine. */
  visual: number;
  /** Round over: go to the clean photo / logo. */
  revealed?: boolean;
  /** `cropFocus(subject, mode, seed)` — deterministic framing. */
  focus?: ScoutFocus;
}

/** The CSS for one rung. `filter: 'none'` and `scale(1)` is the clean reveal. */
export function visualStyle({ mode, visual, revealed = false, focus }: VisualStyleInput): VisualStyle {
  const u = specPosition(mode, visual, revealed);

  if (mode === 'silhouette') {
    const p = sample(SILHOUETTE_STOPS, u);
    const filter = silhouetteFilter(p);
    return {
      filter: filter === 'brightness(1)' ? 'none' : filter,
      transform: `scale(${round(p.scale, 2)})`,
      transformOrigin: `50% ${round(p.originY, 1)}%`,
      objectFit: 'cover',
      objectPosition: '50% 12%',
      opacity: u < 0.25 ? 0.95 : 1,
    };
  }

  if (mode === 'faceZoom') {
    const p = sample(FACE_ZOOM_STOPS, u);
    const x = revealed ? 50 : faceOriginX(focus);
    return {
      filter: 'none',
      transform: `scale(${round(p.scale, 2)})`,
      transformOrigin: `${round(x, 1)}% ${round(p.originY, 1)}%`,
      objectFit: 'cover',
      objectPosition: '50% 12%',
      opacity: 1,
    };
  }

  const p = sample(LOGO_ZOOM_STOPS, u);
  const o = revealed ? { x: 50, y: 50 } : logoOrigin(focus);
  return {
    filter: 'none',
    transform: `scale(${round(p.scale, 2)})`,
    transformOrigin: `${round(o.x, 1)}% ${round(o.y, 1)}%`,
    objectFit: 'contain',
    objectPosition: '50% 50%',
    opacity: 1,
  };
}

/** How hard this rung reads, for the screen-reader description of the stage. */
export function visualDescription(mode: VisualMode, visual: number, revealed = false): string {
  if (revealed) return mode === 'logoZoom' ? 'The full team logo.' : 'The full photo.';
  const u = specPosition(mode, visual, revealed);
  if (mode === 'silhouette') {
    if (u < 0.35) return 'A blacked-out silhouette of the player, rim-lit.';
    if (u < 0.6) return 'The silhouette, with a hint of tone coming through.';
    return 'The photo in colour, heavily blurred.';
  }
  if (mode === 'faceZoom') {
    const p = sample(FACE_ZOOM_STOPS, u);
    return p.scale > 2.6 ? 'An extreme close-up of the eyes.' : p.scale > 1.8 ? 'A close crop of the face.' : 'The face, nearly the whole head.';
  }
  const p = sample(LOGO_ZOOM_STOPS, u);
  return p.scale > 4 ? 'A few pixels of the team logo.' : p.scale > 2 ? 'A fragment of the team logo.' : 'Most of the team logo.';
}
