import { useEffect, useRef, useState } from 'react';
import { useMotionValueEvent, useReducedMotion, useSpring } from 'motion/react';

/** rest: parked off the record · cue: lifted just above the groove · down: stylus on the record. */
export type TonearmMode = 'rest' | 'cue' | 'down';

export interface TonearmProps {
  mode: TonearmMode;
  /** The stylus met the groove (once per drop). */
  onContact?: () => void;
}

/** Geometry in the record's 0–100 box (the disc is inset 7 %, radius 43). */
export const PIVOT = { x: 102, y: 4 } as const;
/** Where the stylus lands: on the outer grooves, up and to the right of the label. */
export const STYLUS = { x: 79.9, y: 24.9 } as const;
export const ANGLES: Record<TonearmMode, number> = { rest: -28, cue: -9, down: 0 };
/** Degrees from the resting angle at which the stylus counts as touching. */
const CONTACT_WITHIN = 1.2;

// Unit vector from the pivot to the stylus, and the headshell it hangs from.
const DX = STYLUS.x - PIVOT.x;
const DY = STYLUS.y - PIVOT.y;
const LEN = Math.hypot(DX, DY);
const UX = DX / LEN;
const UY = DY / LEN;
const ARM_DEG = (Math.atan2(DY, DX) * 180) / Math.PI;
const HEAD = { x: STYLUS.x - UX * 4.2, y: STYLUS.y - UY * 4.2 };
const HEAD_MID = { x: STYLUS.x - UX * 2.4, y: STYLUS.y - UY * 2.4 };
const WEIGHT = { x: PIVOT.x - UX * 4.4, y: PIVOT.y - UY * 4.4 };

function rotation(deg: number): string {
  return `rotate(${deg.toFixed(2)} ${PIVOT.x} ${PIVOT.y})`;
}

/**
 * The tonearm: one SVG group that swings about a pivot outside the record's top-right corner. A
 * spring carries it between the three angles; the moment it lands a ripple spreads from the stylus
 * and `onContact` fires (the needle click). Reduced motion: no swing, the arm simply appears.
 */
export function Tonearm({ mode, onContact }: TonearmProps) {
  const reduce = useReducedMotion();
  const armRef = useRef<SVGGElement>(null);
  const contacted = useRef(mode === 'down');
  const modeRef = useRef(mode);
  const onContactRef = useRef(onContact);
  onContactRef.current = onContact;
  const [ripple, setRipple] = useState(0);
  const angle = useSpring(ANGLES[mode], { stiffness: 300, damping: 26, restDelta: 0.05 });

  useEffect(() => {
    modeRef.current = mode;
    if (mode !== 'down') contacted.current = false;
    if (reduce) angle.jump(ANGLES[mode]);
    else angle.set(ANGLES[mode]);
  }, [mode, reduce, angle]);

  useEffect(() => {
    armRef.current?.setAttribute('transform', rotation(angle.get()));
  }, [angle]);

  useMotionValueEvent(angle, 'change', (v) => {
    armRef.current?.setAttribute('transform', rotation(v));
    if (modeRef.current === 'down' && !contacted.current && v > ANGLES.down - CONTACT_WITHIN) {
      contacted.current = true;
      setRipple((k) => k + 1);
      onContactRef.current?.();
    }
  });

  const down = mode === 'down';

  return (
    <>
      <svg viewBox="0 0 100 100" className="pointer-events-none absolute inset-0 overflow-visible" aria-hidden data-testid="tonearm" data-mode={mode}>
        <g ref={armRef} transform={rotation(ANGLES[mode])}>
          {/* Shadow: further away while the arm hovers, tight under it once it lands. */}
          <g
            stroke="rgb(0 0 0 / 0.4)"
            fill="none"
            strokeLinecap="round"
            style={{ transform: down ? 'translate(0.5px, 1px)' : 'translate(1.8px, 3px)', transition: 'transform 300ms ease-out', opacity: down ? 0.5 : 0.35 }}
          >
            <line x1={WEIGHT.x} y1={WEIGHT.y} x2={HEAD.x} y2={HEAD.y} strokeWidth="2.6" />
            <rect x={HEAD_MID.x - 2.8} y={HEAD_MID.y - 1.8} width="5.6" height="3.6" rx="0.9" fill="rgb(0 0 0 / 0.4)" stroke="none" transform={`rotate(${ARM_DEG} ${HEAD_MID.x} ${HEAD_MID.y})`} />
          </g>
          {/* Counterweight */}
          <line x1={PIVOT.x} y1={PIVOT.y} x2={WEIGHT.x} y2={WEIGHT.y} stroke="var(--sg-muted)" strokeWidth="2.8" strokeLinecap="round" />
          {/* Arm tube with a highlight edge */}
          <line x1={PIVOT.x} y1={PIVOT.y} x2={HEAD.x} y2={HEAD.y} stroke="var(--sg-fg)" strokeWidth="2.3" strokeLinecap="round" opacity="0.9" />
          <line x1={PIVOT.x} y1={PIVOT.y} x2={HEAD.x} y2={HEAD.y} stroke="rgb(255 255 255 / 0.55)" strokeWidth="0.7" strokeLinecap="round" transform="translate(-0.45 -0.45)" />
          {/* Headshell + stylus */}
          <rect x={HEAD_MID.x - 2.8} y={HEAD_MID.y - 1.8} width="5.6" height="3.6" rx="0.9" fill="var(--sg-fg)" stroke="rgb(0 0 0 / 0.35)" strokeWidth="0.5" transform={`rotate(${ARM_DEG} ${HEAD_MID.x} ${HEAD_MID.y})`} />
          <line x1={HEAD_MID.x + UX * 2.4} y1={HEAD_MID.y + UY * 2.4} x2={STYLUS.x + UX * 0.6} y2={STYLUS.y + UY * 0.6} stroke="var(--sg-accent-2)" strokeWidth="1" strokeLinecap="round" />
          {/* Pivot bearing */}
          <circle cx={PIVOT.x} cy={PIVOT.y} r="4.2" fill="var(--sg-bg-elevated)" stroke="rgb(255 255 255 / 0.3)" strokeWidth="0.8" />
          <circle cx={PIVOT.x} cy={PIVOT.y} r="1.6" fill="var(--sg-fg)" opacity="0.7" />
        </g>
      </svg>
      {ripple > 0 && (
        <span
          key={ripple}
          aria-hidden
          className="groove-ripple pointer-events-none absolute size-[9%] rounded-full border-2 border-accent-2"
          style={{ left: `${STYLUS.x}%`, top: `${STYLUS.y}%` }}
        />
      )}
    </>
  );
}
