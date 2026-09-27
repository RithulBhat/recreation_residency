import { useEffect, useRef, type KeyboardEvent } from 'react';
import { SCOUT_FORMATS, scoutFormat } from '@/scout/formats';
import { useScoutSettingsStore } from '@/store/scoutStore';
import type { ScoutFormat } from '@/scout/types';
import { cn } from '@/components/ui/cn';
import { keepScoutSettings, scoutFormatSwitch, type KeptScoutSettings } from './formatSwitch';
import { SCOUT_FORMAT_ACCENT, formatSeatsLabel } from './summary';

/**
 * The SESSION FORMAT picker — the lobby's first and biggest decision.
 *
 * The format is what changes how a session FEELS (a clock, lives, a 32-club board, two seats), so it
 * comes before the puzzle types, and every card carries the format's `how` and `ends` lines so it is
 * obvious what you are signing up for. Rendered from `SCOUT_FORMATS`, never a hardcoded list.
 * Arrow keys / Home / End move the selection, as a radiogroup must.
 *
 * ## Why it remembers three settings
 * `normalizeScoutSettings` OVERWRITES the settings a format cannot play: blitz, survival and the
 * gauntlet force `rounds: 0`, survival and the gauntlet force `difficulty: 'any'`, and the gauntlet
 * rewrites `packIds` to league-wide coverage so it can reach all 32 franchises. Without help, one
 * look at the gauntlet would silently cost you your 10 rounds, your tier and your pack selection.
 * So the picker keeps the last value the player chose for each of those keys WHILE A FORMAT THAT
 * HONOURS IT IS SELECTED, and hands it back when a format that honours it is selected again.
 */
export function ScoutFormatPicker() {
  const settings = useScoutSettingsStore((s) => s.settings);
  const update = useScoutSettingsStore((s) => s.update);
  const format = scoutFormat(settings);
  const ref = useRef<HTMLDivElement>(null);

  /** What the player last chose for the keys a format is allowed to overwrite (see `formatSwitch`). */
  const kept = useRef<KeptScoutSettings>({});
  useEffect(() => {
    keepScoutSettings(kept.current, settings);
  }, [settings]);

  const select = (next: ScoutFormat) => {
    if (next === format) return;
    update(scoutFormatSwitch(settings, next, kept.current));
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const idx = SCOUT_FORMATS.findIndex((f) => f.id === format);
    let next: number | null = null;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (idx + 1) % SCOUT_FORMATS.length;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (idx - 1 + SCOUT_FORMATS.length) % SCOUT_FORMATS.length;
    if (e.key === 'Home') next = 0;
    if (e.key === 'End') next = SCOUT_FORMATS.length - 1;
    if (next === null) return;
    e.preventDefault();
    const target = SCOUT_FORMATS[next];
    if (!target) return;
    select(target.id);
    ref.current?.querySelector<HTMLElement>(`[data-format="${target.id}"]`)?.focus();
  };

  return (
    <div
      ref={ref}
      role="radiogroup"
      aria-label="Session format"
      onKeyDown={onKeyDown}
      data-testid="scout-format-picker"
      className="grid min-w-0 gap-2.5 sm:grid-cols-2 xl:grid-cols-3"
    >
      {SCOUT_FORMATS.map((f) => {
        const selected = f.id === format;
        const accent = SCOUT_FORMAT_ACCENT[f.id];
        return (
          <button
            key={f.id}
            type="button"
            role="radio"
            aria-checked={selected}
            data-format={f.id}
            tabIndex={selected ? 0 : -1}
            onClick={() => select(f.id)}
            className={cn(
              'group relative flex min-w-0 flex-col overflow-hidden rounded-2xl border p-3.5 text-left transition-[border-color,box-shadow,transform] duration-200 active:scale-[0.99]',
              selected ? 'border-transparent ring-2 ring-accent shadow-glow' : 'border-border hover:border-border-strong',
            )}
            style={{
              background: `linear-gradient(155deg, color-mix(in oklab, ${accent} ${selected ? 30 : 14}%, var(--sg-bg-elevated)) 0%, color-mix(in oklab, ${accent} 4%, var(--sg-bg-elevated)) 72%)`,
            }}
          >
            <span
              aria-hidden
              className="pointer-events-none absolute -right-8 -top-10 size-28 rounded-full opacity-40 blur-2xl transition-opacity group-hover:opacity-70"
              style={{ background: accent }}
            />
            <span className="relative flex items-center gap-2.5">
              <span
                className="grid size-10 shrink-0 place-items-center rounded-xl text-lg leading-none shadow-md"
                style={{ background: `linear-gradient(135deg, ${accent}, color-mix(in oklab, ${accent} 50%, var(--sg-accent-2)))` }}
                aria-hidden
              >
                {f.emoji}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-display text-base font-black leading-tight text-fg">{f.name}</span>
                <span className="mt-0.5 block font-mono text-[10px] uppercase tracking-[0.14em] text-fg/60">
                  {formatSeatsLabel(f.seats)}
                </span>
              </span>
            </span>
            <span className="relative mt-2.5 block text-[13px] leading-snug text-fg/90">{f.blurb}</span>
            <span className="relative mt-2.5 flex flex-col gap-1 border-t border-fg/10 pt-2.5">
              <span className="flex gap-1.5 text-[11px] leading-snug text-muted">
                <span className="w-7 shrink-0 pt-0.5 font-mono text-[9px] uppercase tracking-[0.14em] text-fg/50">how</span>
                <span className="min-w-0">{f.how}</span>
              </span>
              <span className="flex gap-1.5 text-[11px] leading-snug text-muted">
                <span className="w-7 shrink-0 pt-0.5 font-mono text-[9px] uppercase tracking-[0.14em] text-fg/50">ends</span>
                <span className="min-w-0">{f.ends}</span>
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
