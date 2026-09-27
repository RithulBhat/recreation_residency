import { useRef, type KeyboardEvent } from 'react';
import { Shuffle } from 'lucide-react';
import { SCOUT_MODES, type ScoutModeInfo } from '@/scout/packs';
import { useScoutSettingsStore } from '@/store/scoutStore';
import type { ScoutMode } from '@/scout/types';
import { Switch } from '@/components/ui/Switch';
import { cn } from '@/components/ui/cn';

/**
 * One accent per puzzle type, so the cards read as different games.
 *
 * Deliberately PARTIAL: the list of puzzle types is `SCOUT_MODES`, and a new one may land without
 * an entry here. Use {@link scoutModeAccent}, which falls back to the shared palette by position, so
 * a new puzzle type still gets a colour of its own the moment it is added.
 */
export const SCOUT_MODE_ACCENT: Readonly<Partial<Record<ScoutMode, string>>> = {
  silhouette: '#a855f7',
  faceZoom: '#22d3ee',
  highlight: '#f472b6',
  teamTrivia: '#34d399',
  statLine: '#fbbf24',
  careerPath: '#60a5fa',
  logoZoom: '#fb7185',
};

const MODE_PALETTE: readonly string[] = [
  '#a855f7',
  '#22d3ee',
  '#f472b6',
  '#34d399',
  '#fbbf24',
  '#60a5fa',
  '#fb7185',
  '#c084fc',
  '#2dd4bf',
  '#f59e0b',
];

/**
 * What the card's badge promises — what the player actually hands over to win the round.
 *
 * Read off `ScoutModeInfo.answer` / `.input`, never inferred from `.guesses`: `.guesses` is the POOL
 * a mode draws from, which is a different question. Draft Class draws from players and is answered
 * with a YEAR; Higher or Lower and Odd One Out draw from players and are answered by tapping a card,
 * with no guess box on screen at all. Badging those three "player" promised a text answer the round
 * never asks for.
 */
export function scoutModeAnswerLabel(mode: Pick<ScoutModeInfo, 'answer' | 'input'>): string {
  if (mode.input === 'choice') return 'pick a card';
  switch (mode.answer) {
    case 'team':
      return 'franchise';
    case 'year':
      return 'year';
    case 'option':
      return 'pick a card';
    default:
      return 'player';
  }
}

/** The accent for a puzzle type — its own, or one from the palette by position. */
export function scoutModeAccent(mode: ScoutMode): string {
  const own = SCOUT_MODE_ACCENT[mode];
  if (own !== undefined) return own;
  const i = SCOUT_MODES.findIndex((m) => m.id === mode);
  return MODE_PALETTE[(i < 0 ? 0 : i) % MODE_PALETTE.length] ?? '#a855f7';
}

/**
 * The PUZZLE TYPES as a keyboard-navigable radiogroup, plus the Mixed bag switch.
 *
 * Rendered from `SCOUT_MODES` at build time, never a hardcoded list — a puzzle type added
 * to `@/scout/packs` appears here (and in the presets, summaries and stats) with no change needed.
 */
export function ScoutModePicker() {
  const mode = useScoutSettingsStore((s) => s.settings.mode);
  const mixModes = useScoutSettingsStore((s) => s.settings.mixModes);
  const update = useScoutSettingsStore((s) => s.update);
  const ref = useRef<HTMLDivElement>(null);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const idx = SCOUT_MODES.findIndex((m) => m.id === mode);
    let next: number | null = null;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (idx + 1) % SCOUT_MODES.length;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (idx - 1 + SCOUT_MODES.length) % SCOUT_MODES.length;
    if (e.key === 'Home') next = 0;
    if (e.key === 'End') next = SCOUT_MODES.length - 1;
    if (next === null) return;
    e.preventDefault();
    const target = SCOUT_MODES[next];
    if (!target) return;
    update({ mode: target.id });
    ref.current?.querySelector<HTMLElement>(`[data-mode="${target.id}"]`)?.focus();
  };

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div
        ref={ref}
        role="radiogroup"
        aria-label="Puzzle type"
        data-setting="mode"
        onKeyDown={onKeyDown}
        className={cn(
          'grid min-w-0 auto-rows-fr grid-cols-2 gap-2.5 sm:grid-cols-3',
          mixModes && 'opacity-80',
        )}
      >
        {SCOUT_MODES.map((m) => {
          const selected = m.id === mode;
          const accent = scoutModeAccent(m.id);
          return (
            <button
              key={m.id}
              type="button"
              role="radio"
              aria-checked={selected}
              data-mode={m.id}
              tabIndex={selected ? 0 : -1}
              onClick={() => update({ mode: m.id })}
              className={cn(
                'group relative flex min-h-[8rem] min-w-0 flex-col overflow-hidden rounded-2xl border p-3 text-left transition-[border-color,box-shadow,transform] duration-200 active:scale-[0.98]',
                selected ? 'border-transparent ring-2 ring-accent shadow-glow' : 'border-border hover:border-border-strong',
              )}
              style={{
                background: `linear-gradient(160deg, color-mix(in oklab, ${accent} ${selected ? 34 : 16}%, var(--sg-bg-elevated)) 0%, color-mix(in oklab, ${accent} 5%, var(--sg-bg-elevated)) 70%)`,
              }}
            >
              <span
                aria-hidden
                className="pointer-events-none absolute -right-6 -top-8 size-24 rounded-full opacity-45 blur-2xl transition-opacity group-hover:opacity-75"
                style={{ background: accent }}
              />
              <span className="relative flex items-center justify-between gap-2">
                <span
                  className="grid size-8 place-items-center rounded-xl text-base leading-none shadow-md"
                  style={{ background: `linear-gradient(135deg, ${accent}, color-mix(in oklab, ${accent} 55%, var(--sg-accent-2)))` }}
                  aria-hidden
                >
                  {m.emoji}
                </span>
                <span
                  className="shrink-0 font-mono text-[9px] uppercase tracking-[0.12em] text-fg/60"
                  data-answer={m.input === 'choice' ? 'choice' : m.answer}
                >
                  {scoutModeAnswerLabel(m)}
                </span>
              </span>
              <span className="relative mt-auto pt-2">
                <span className="block font-display text-sm font-bold leading-tight text-fg">{m.name}</span>
                <span className="mt-0.5 block text-[11px] leading-snug text-muted">{m.blurb}</span>
                <span className="mt-1.5 block text-[10px] leading-snug text-fg/70">{m.how}</span>
              </span>
            </button>
          );
        })}
      </div>

      <div className="rounded-2xl border border-border bg-bg/40 p-3" data-setting="mixModes">
        <Switch
          label={
            <span className="inline-flex items-center gap-1.5">
              <Shuffle className="size-3.5 text-accent" aria-hidden />
              Mixed bag
            </span>
          }
          description="Shuffle every puzzle type into one run — players and franchises, a different game each round."
          checked={mixModes}
          onChange={(v) => update({ mixModes: v })}
        />
      </div>
    </div>
  );
}
