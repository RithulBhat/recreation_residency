import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { cn } from '@/components/ui';
import type { ScoutClue } from '@/scout/types';

export interface RedactedPlayProps {
  /** The rung's `play` clues, ladder order: the play text first, then situation / when. */
  clues: readonly ScoutClue[];
  className?: string;
}

/** `[?]` is what the sync script leaves behind where a player's name was. */
const BLANK = /\[\?\]/g;

/** Text → alternating prose and blanks. Exported for the unit test. */
export function splitRedacted(text: string): Array<{ kind: 'text' | 'blank'; value: string }> {
  const out: Array<{ kind: 'text' | 'blank'; value: string }> = [];
  let last = 0;
  BLANK.lastIndex = 0;
  for (let m = BLANK.exec(text); m !== null; m = BLANK.exec(text)) {
    if (m.index > last) out.push({ kind: 'text', value: text.slice(last, m.index) });
    out.push({ kind: 'blank', value: '?' });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ kind: 'text', value: text.slice(last) });
  return out;
}

function Blank({ index }: { index: number }) {
  return (
    <span
      className="mx-0.5 inline-flex h-[1.15em] min-w-[2.1em] items-center justify-center rounded-md border border-warn/40 bg-warn/15 align-[-0.15em] font-mono text-[0.72em] font-bold text-warn"
      aria-label={index === 0 ? 'redacted player name' : 'another redacted name'}
      data-testid="scout-blank"
    >
      ?
    </span>
  );
}

/**
 * The `highlight` mode's visual: a real play from ESPN's play-by-play, typeset like a stat sheet,
 * with every resolved player name knocked out as a chip. The situation line above it reads as a
 * scoreboard strip — it is a clue, so it only appears once the ladder unlocks it.
 */
export function RedactedPlay({ clues, className }: RedactedPlayProps) {
  const reduce = useReducedMotion();
  const [play, ...rest] = clues;
  const text = play?.value ?? '';
  const parts = splitRedacted(text);
  let blanks = -1;

  return (
    <section
      className={cn('glass relative isolate flex min-h-[16rem] flex-col overflow-hidden rounded-4xl bg-bg-elevated/85 p-4 sm:min-h-[20rem] sm:p-6', className)}
      data-testid="scout-stage-play"
      aria-label="The play"
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{ background: 'radial-gradient(120% 90% at 50% 0%, color-mix(in oklab, var(--sg-accent-vivid) 12%, transparent), transparent 60%)' }}
        aria-hidden
      />
      <div className="relative flex flex-wrap items-center gap-1.5">
        <span className="eyebrow-readable">Play by play</span>
        <AnimatePresence initial={false}>
          {rest.map((c) => (
            <motion.span
              key={`${c.label}:${c.value}`}
              layout={!reduce}
              initial={reduce ? { opacity: 0 } : { opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.28 }}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 py-1 font-mono text-[11px] font-semibold text-fg"
            >
              <span className="text-muted">{c.label}</span>
              {c.value}
            </motion.span>
          ))}
        </AnimatePresence>
      </div>

      <p
        className="relative my-auto py-4 font-mono text-[1.0625rem] font-semibold leading-[1.75] tracking-tight text-fg sm:text-xl sm:leading-[1.8]"
        data-testid="scout-play-text"
      >
        {parts.map((p, i) => {
          if (p.kind === 'text') return <span key={i}>{p.value}</span>;
          blanks += 1;
          return <Blank key={i} index={blanks} />;
        })}
      </p>

      <p className="relative text-xs text-muted">
        Every name in the play is blacked out. One of them is the answer.
      </p>
    </section>
  );
}
