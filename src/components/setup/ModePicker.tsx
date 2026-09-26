import { useRef, type KeyboardEvent, type ReactNode } from 'react';
import { Disc3, Flame, PartyPopper, Swords, Timer, Zap } from 'lucide-react';
import type { GameMode } from '@/types';
import { cn } from '@/components/ui/cn';
import { useSettingsStore } from '@/store/settingsStore';

export interface ModeOption {
  id: GameMode;
  icon: ReactNode;
  name: string;
  blurb: string;
  how: string;
  accent: string;
}

export const MODE_OPTIONS: ReadonlyArray<ModeOption> = [
  { id: 'classic', icon: <Disc3 />, name: 'Classic', blurb: 'The clip grows every try.', how: 'Escalating · up to 8 tries', accent: '#a855f7' },
  { id: 'fixed', icon: <Timer />, name: 'Fixed clip', blurb: 'One clip length, every song.', how: '0.1–10 s · 1–6 tries', accent: '#22d3ee' },
  { id: 'blitz', icon: <Zap />, name: 'Blitz', blurb: 'Name as many as you can.', how: 'Timed · wrong = −3 s', accent: '#fbbf24' },
  { id: 'survival', icon: <Flame />, name: 'Survival', blurb: 'Lives. Clips shrink as you win.', how: '−15% per correct', accent: '#fb7185' },
  { id: 'duel', icon: <Swords />, name: 'Duel', blurb: 'Two players, one device.', how: 'Buzzer A / L · or turns', accent: '#f472b6' },
  { id: 'party', icon: <PartyPopper />, name: 'Party', blurb: '2–8 players, pass the phone.', how: 'Turn-based · scoreboard', accent: '#34d399' },
];

export const MODE_IDS: readonly GameMode[] = MODE_OPTIONS.map((m) => m.id);

export function isGameMode(value: unknown): value is GameMode {
  return typeof value === 'string' && (MODE_IDS as readonly string[]).includes(value);
}

/** Six compact mode cards as a keyboard-navigable radiogroup. */
export function ModePicker() {
  const mode = useSettingsStore((s) => s.settings.mode);
  const update = useSettingsStore((s) => s.update);
  const ref = useRef<HTMLDivElement>(null);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const idx = MODE_OPTIONS.findIndex((m) => m.id === mode);
    let next: number | null = null;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (idx + 1) % MODE_OPTIONS.length;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (idx - 1 + MODE_OPTIONS.length) % MODE_OPTIONS.length;
    if (e.key === 'Home') next = 0;
    if (e.key === 'End') next = MODE_OPTIONS.length - 1;
    if (next === null) return;
    e.preventDefault();
    const target = MODE_OPTIONS[next]!;
    update({ mode: target.id });
    ref.current?.querySelector<HTMLElement>(`[data-mode="${target.id}"]`)?.focus();
  };

  return (
    <div ref={ref} role="radiogroup" aria-label="Game mode" onKeyDown={onKeyDown} className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
      {MODE_OPTIONS.map((m) => {
        const selected = m.id === mode;
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
              'group relative flex min-h-[7.25rem] flex-col overflow-hidden rounded-2xl border p-3 text-left transition-[border-color,box-shadow,transform] duration-200 active:scale-[0.98]',
              selected ? 'border-transparent ring-2 ring-accent shadow-glow' : 'border-border hover:border-border-strong',
            )}
            style={{
              background: `linear-gradient(160deg, color-mix(in oklab, ${m.accent} ${selected ? 34 : 18}%, var(--sg-bg-elevated)) 0%, color-mix(in oklab, ${m.accent} 5%, var(--sg-bg-elevated)) 70%)`,
            }}
          >
            <span
              aria-hidden
              className="pointer-events-none absolute -right-6 -top-8 size-24 rounded-full opacity-50 blur-2xl transition-opacity group-hover:opacity-80"
              style={{ background: m.accent }}
            />
            <span
              className="relative grid size-8 place-items-center rounded-xl text-white shadow-md [&>svg]:size-4"
              style={{ background: `linear-gradient(135deg, ${m.accent}, color-mix(in oklab, ${m.accent} 60%, var(--sg-accent-2)))` }}
              aria-hidden
            >
              {m.icon}
            </span>
            <span className="relative mt-auto pt-2">
              <span className="block font-display text-sm font-bold leading-tight text-fg">{m.name}</span>
              <span className="mt-0.5 block text-[11px] leading-snug text-muted">{m.blurb}</span>
              <span className="mt-1.5 block font-mono text-[10px] tabular text-fg/65">{m.how}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
