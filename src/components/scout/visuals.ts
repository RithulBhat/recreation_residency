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
 * (silhouette 0→0.85, faceZoom 0.06→0.95, logoZoom 0.1→0.95). {@link specPosition} normalizes those
 * onto a 0 → 1 ladder position. The zoom modes stop SHORT of 1 while a round is live (1.0 is the
 * clean frame, the payoff, reached only with `revealed: true`); the silhouette spans its whole live
 * range and keeps the reveal out of reach by a different mechanism — the curtain's solid edge never
 * climbs past 77% of the frame while the round is live (see {@link silhouetteCurtain}).
 *
 * ## Silhouette is a CURTAIN, not a filter ramp
 * The first shipped version escalated by CSS filter alone, and `scratchpad/scout1/SILHOUETTE-LADDER.md`
 * measured the result: rungs 0–2 were the SAME black shape with a slightly different rim, because
 * these headshots are lit against transparency and there is no natural filter step between "pure
 * black" and "blurred colour". The fix is two stacked copies of the same photo — a colour layer, and
 * a blacked-out layer above it masked away from the bottom up, so the face emerges while the hair
 * (the strongest clue) stays black longest.
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
  // The silhouette spans its whole ladder: the curtain, not the ceiling, is what holds the photo
  // back — its easiest LIVE rung still keeps the top 23% of the frame solid black.
  silhouette: { min: 0, max: SILHOUETTE_MAX, ceiling: 1 },
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

/**
 * How much of the frame height the curtain's edge is soft over, in %. Without it the mask ends in a
 * hard horizontal line across the face; 7% reads as a lifting shadow.
 */
export const CURTAIN_FEATHER = 7;

/**
 * The CURTAIN, in one number: `cut` is where the curtain's SOLID black edge sits, as a % of the
 * frame height measured from the BOTTOM. Below that line the mask feathers off over
 * {@link CURTAIN_FEATHER}% into the clear photo, so the chin arrives first and the hair last.
 *
 * The feather hangs BELOW the edge, not above it, and that is the whole point: with the feather
 * above, `cut: 0` still left a 7%-tall band of half-masked photo sitting inside the bottom of the
 * frame, and that band is exactly where the mouth and jaw are at this crop. Measured on three
 * seeds, rung 0 handed over Geno Smith's teeth, beard and skin tone and Stefon Diggs's tattooed
 * chin — the flagship puzzle type, leaking on its hardest rung. Hanging the feather below the edge
 * makes `cut: 0` put the solid edge on the frame's bottom edge with the whole soft band off-frame:
 * a TRUE shadow, nothing but the rim-lit outline.
 *
 * `scratchpad/scout1/SILHOUETTE-LADDER.md` gives the rungs by what the player GAINS — shadow →
 * chin and mouth → nose → eyes and brows → nearly everything, softened — and a first cut at the
 * numbers taken against a looser crop. Re-measured against the crop this game actually ships
 * (`scale(1.8)` anchored at the top of the frame, which fills the square with the head), the
 * landmarks sit at roughly: chin 90%, mouth 78%, nose 70%, eyes 53%, brows 48%, hairline 40% down
 * the frame — and a cut of C puts the solid edge at (100 - C)% from the top, clear photo from
 * (100 - C + {@link CURTAIN_FEATHER})% down. Evidence:
 * `scratchpad/scoutfix2/ladder/calib/sheet.png` (a linear sweep over three players) and
 * `.../sil-v2/sheet.png` (the shipped ladder over six). Hence:
 *
 *   0  -> a true shadow: the head outline and hair mass, nothing of the face at all
 *   27 -> the chin and the line of the mouth
 *   41 -> the mouth and nose
 *   57 -> the eyes and brows, hair still solid black
 *   77 -> nearly everything, softened by a small blur on the colour layer
 *
 * (Those are the old 0/20/34/50/70 plus the feather: every rung but the first paints the SAME
 * pixels it did before, and the first one finally paints nothing.)
 *
 * Intermediate positions interpolate, so a 2-6 try ladder spaces evenly through the same features.
 */
export const SILHOUETTE_CUT_STOPS: ReadonlyArray<Stop<{ cut: number; blur: number }>> = [
  { at: 0, value: { cut: 0, blur: 0 } },
  { at: 0.25, value: { cut: 20 + CURTAIN_FEATHER, blur: 0 } },
  { at: 0.5, value: { cut: 34 + CURTAIN_FEATHER, blur: 0 } },
  { at: 0.75, value: { cut: 50 + CURTAIN_FEATHER, blur: 0 } },
  { at: 1, value: { cut: 70 + CURTAIN_FEATHER, blur: 3 } },
];

/**
 * The cut of the hardest rung, the easiest LIVE rung, and the reveal. The reveal has to clear the
 * feather as well as the frame, or the top {@link CURTAIN_FEATHER}% of the answer stays shaded.
 */
export const SILHOUETTE_CUT = { min: 0, max: 70 + CURTAIN_FEATHER, reveal: 100 + CURTAIN_FEATHER } as const;

/**
 * The head crop, MEASURED (`scratchpad/scout2/core/calib-crop.png`): an alpha scan of 24 star
 * headshots put the crown between 0.5% and 16.7% down the frame, so anchoring the zoom at the very
 * top of the frame at 1.8× keeps every crown, both ears and the jaw inside the square. The spec's
 * `scale(2.1)` from `50% 16%` clipped the crown off every head. The reveal relaxes to 1×.
 */
export const SILHOUETTE_SCALE = 1.8;
export const SILHOUETTE_OBJECT_POSITION = '50% 12%';

/** Everything the two stacked layers need to paint one rung of the curtain. */
export interface SilhouetteCurtain {
  /** Where the curtain's solid edge sits, % of the frame height from the bottom. 0 = a true shadow. */
  cut: number;
  /** True once the curtain is fully open — the shade layer is not painted at all. */
  open: boolean;
  /** `mask-image` for the blacked-out layer (also set on `-webkit-mask-image`: Safari needs it). */
  maskImage: string;
  /** Companion `mask-size` / `mask-position`, which is what actually animates. */
  maskSize: string;
  maskPosition: string;
  /** Filter for the blacked-out layer: a flat black shape with an accent rim tracing the hairline. */
  shadeFilter: string;
  /** Filter for the colour layer underneath — `none` until the last live rung softens it. */
  baseFilter: string;
}

/**
 * Why `mask-position` and not the gradient's own stops: `mask-image` between two gradients does not
 * interpolate reliably, so the curtain would snap. Instead the gradient is FIXED (transparent over
 * the bottom of a mask box twice the frame's height, opaque over the top half) and the mask box
 * slides. `mask-position-y: cut%` resolves against (frame height − mask height) = −frame height, so
 * it puts the box's top at −cut% of the frame: the gradient's 50% line — the curtain's solid edge —
 * lands exactly `cut%` up from the bottom. A percentage animates, so the reveal glides.
 *
 * The feather is spent BELOW that 50% line (`transparent 0 → (50 − half)`, opaque from 50), so the
 * soft band lies inside the part of the frame the rung already gives away rather than eating into
 * the part it is meant to hide. At `cut: 0` the solid edge is the frame's own bottom edge and the
 * entire soft band is off-frame — the mask is opaque everywhere, which is what makes rung 0 a true
 * shadow instead of a shadow with a lit chin under it.
 */
export function curtainMask(cut: number): Pick<SilhouetteCurtain, 'maskImage' | 'maskSize' | 'maskPosition'> {
  const c = Math.min(Math.max(cut, 0), SILHOUETTE_CUT.reveal);
  // The feather is half as wide inside a mask box of twice the height.
  const half = round(CURTAIN_FEATHER / 2, 2);
  return {
    maskImage: `linear-gradient(to top, transparent 0 ${50 - half}%, #000 50%)`,
    maskSize: '100% 200%',
    maskPosition: `50% ${round(c, 2)}%`,
  };
}

/** The rung of the curtain for an engine `visual`. `revealed` opens it all the way. */
export function silhouetteCurtain(visual: number, revealed = false): SilhouetteCurtain {
  const u = specPosition('silhouette', visual, revealed);
  const open = revealed;
  const { cut, blur } = open ? { cut: SILHOUETTE_CUT.reveal, blur: 0 } : sample(SILHOUETTE_CUT_STOPS, u);
  // Whole percentage points: a 0.03% difference in the curtain edge is not a rung, and an integer
  // keeps `data-cut` and the CSS readable.
  const edge = Math.round(cut);
  return {
    cut: edge,
    open,
    ...curtainMask(edge),
    shadeFilter: silhouetteFilter({ brightness: 0, contrast: 1, blur: 0, rim: 3 }),
    baseFilter: blur > 0.05 ? `blur(${round(blur, 2)}px)` : 'none',
  };
}

interface ZoomParams extends Record<string, number> {
  scale: number;
  originY: number;
}

/**
 * Eye-level zoom, easing out to the full head. NEVER anchored on the forehead (spec: REJECT).
 *
 * MEASURED and re-cut (`scratchpad/scoutfix2/ladder/face-v2|v3/sheet.png`): the spec's `scale(3.6)`
 * hardest rung showed both eyes, the nose, the moustache and half the beard — a portrait, not a
 * puzzle. 6.2× at an origin {@link faceOriginX} keeps deliberately OFF the centre line lands on one
 * eye and its brow, which is a genuine single-feature crop. The stops below it are spaced
 * geometrically (~1.3× per rung) so the ladder escalates evenly instead of stalling early and
 * jumping at the end. Live rungs stop at the mode's 0.8 ceiling (~2.0×), so the full head is still
 * the reveal.
 */
export const FACE_ZOOM_STOPS: ReadonlyArray<Stop<ZoomParams>> = [
  { at: 0, value: { scale: 6.2, originY: 36 } },
  { at: 0.25, value: { scale: 4.4, originY: 32 } },
  { at: 0.5, value: { scale: 3.15, originY: 27 } },
  { at: 0.75, value: { scale: 2.25, originY: 21 } },
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
/**
 * Deliberately BIMODAL, not a smooth jitter across the centre: at 6.2× a crop centred on 50% frames
 * the bridge of the nose and catches BOTH eyes, which is two features. The seed picks a side and
 * then a spot within that side's band, so the hardest rung always lands on one eye while repeated
 * subjects still do not frame identically. Both bands stay inside the spec's ±6%.
 */
export function faceOriginX(focus: ScoutFocus | undefined): number {
  const x = focus?.x ?? 0.5;
  const inner = FACE_JITTER * 0.4; // the closest either band comes to the centre line
  return x < 0.5
    ? remap(x, 0.36, 0.5, 0.5 - FACE_JITTER, 0.5 - inner) * 100
    : remap(x, 0.5, 0.64, 0.5 + inner, 0.5 + FACE_JITTER) * 100;
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

export interface SilhouetteFilter {
  /** 0 = pure black shape, 1 = untouched photo. */
  brightness: number;
  contrast: number;
  /** px. Never above 12 (the spec's `blur(26px)` was pure mush). */
  blur: number;
  /** Rim-light radius in px — the glow that traces the hairline. CONSTANT across the ladder: the
   *  spec measured that escalating the rim reads as no change at all. */
  rim: number;
}

export function silhouetteFilter(p: SilhouetteFilter): string {
  const parts: string[] = [];
  // brightness(0) is what makes a silhouette out of a transparent-background PNG.
  parts.push(`brightness(${round(p.brightness)})`);
  if (p.contrast !== 1) parts.push(`contrast(${round(p.contrast)})`);
  if (p.blur > 0.05) parts.push(`blur(${round(p.blur, 2)}px)`);
  // drop-shadow on an alpha silhouette = a rim light tracing the outline.
  if (p.rim > 0.05) parts.push(`drop-shadow(0 0 ${round(p.rim, 2)}px ${RIM_COLOR})`);
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
    // The COLOUR layer's style. Both layers share it (the crop must line up exactly); the shade
    // layer overrides `filter` with the curtain's own, and its wrapper carries the mask.
    const curtain = silhouetteCurtain(visual, revealed);
    return {
      filter: curtain.baseFilter,
      transform: `scale(${revealed ? 1 : SILHOUETTE_SCALE})`,
      transformOrigin: '50% 0%',
      objectFit: 'cover',
      objectPosition: SILHOUETTE_OBJECT_POSITION,
      opacity: 1,
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
    const { cut } = silhouetteCurtain(visual, revealed);
    // What a rung actually SHOWS is the clear band below the feather, so the thresholds are the
    // measured landmarks plus the feather — the same offset the cut stops carry.
    const f = CURTAIN_FEATHER;
    if (cut < 10 + f) return 'A blacked-out, rim-lit silhouette of the player — the outline and the hair, nothing else.';
    if (cut < 28 + f) return 'The silhouette, with the chin and the line of the mouth showing.';
    if (cut < 42 + f) return 'The silhouette, with the mouth and nose showing.';
    if (cut < 60 + f) return 'The silhouette, with the eyes and brows showing; the hair is still blacked out.';
    return 'Almost the whole face, softened; only the hair is still blacked out.';
  }
  if (mode === 'faceZoom') {
    const p = sample(FACE_ZOOM_STOPS, u);
    return p.scale > 2.6 ? 'An extreme close-up of the eyes.' : p.scale > 1.8 ? 'A close crop of the face.' : 'The face, nearly the whole head.';
  }
  const p = sample(LOGO_ZOOM_STOPS, u);
  return p.scale > 4 ? 'A few pixels of the team logo.' : p.scale > 2 ? 'A fragment of the team logo.' : 'Most of the team logo.';
}
