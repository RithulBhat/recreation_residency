import { Flag } from 'lucide-react';
import { scoutFormat, scoutFormatInfo } from '@/scout/formats';
import { scoutMode } from '@/scout/packs';
import { useScoutSettingsStore } from '@/store/scoutStore';
import { cn } from '@/components/ui/cn';
import { SCOUT_FORMAT_ACCENT, scoutModeName, scoutRunSteps } from './summary';

/**
 * "How this run plays" — the lobby's honest read-back of the draft, in the order it happens.
 *
 * It is the only block that talks about both axes at once: the FORMAT decides the three steps
 * (`scoutRunSteps`, unit-tested in `summary.test.ts`) and what ends the run, the PUZZLE TYPE decides
 * what a round shows you. Nothing here is a control, so it never repeats what the settings panel
 * already says — it says what those settings will feel like.
 */
export function ScoutRunBrief({ className }: { className?: string }) {
  const settings = useScoutSettingsStore((s) => s.settings);
  const format = scoutFormat(settings);
  const info = scoutFormatInfo(format);
  const mode = scoutMode(settings.mode);
  const steps = scoutRunSteps(settings);
  const accent = SCOUT_FORMAT_ACCENT[format];

  return (
    <div
      className={cn('glass relative flex flex-col overflow-hidden rounded-3xl p-4 sm:p-5', className)}
      data-testid="scout-run-brief"
    >
      <span
        aria-hidden
        className="pointer-events-none absolute -right-12 -top-14 size-40 rounded-full opacity-25 blur-3xl"
        style={{ background: accent }}
      />
      <div className="relative flex items-start gap-2.5">
        <span
          className="grid size-9 shrink-0 place-items-center rounded-xl text-lg leading-none shadow-md"
          style={{ background: `linear-gradient(135deg, ${accent}, color-mix(in oklab, ${accent} 50%, var(--sg-accent-2)))` }}
          aria-hidden
        >
          {info?.emoji}
        </span>
        <div className="min-w-0">
          <h2 className="font-display text-base font-bold leading-tight text-fg">How this run plays</h2>
          <p className="mt-0.5 font-mono text-[11px] uppercase tracking-[0.14em] text-muted">
            {info?.name ?? format} · {settings.mixModes ? 'Mixed bag' : scoutModeName(settings.mode)}
          </p>
        </div>
      </div>

      <p className="relative mt-3 text-sm text-muted">
        {settings.mixModes
          ? 'Every round picks a puzzle type this subject can actually be played in — a silhouette, a redacted play, a stat sheet, a logo.'
          : (mode?.how ?? '')}
      </p>

      <ol className="relative mt-3 flex flex-col gap-2.5 text-sm text-fg">
        {steps.map((step, i) => (
          <li key={i} className="flex gap-2.5">
            <span
              className={cn(
                'grid size-5 shrink-0 place-items-center rounded-full font-mono text-[10px] font-bold',
                i === 0 ? 'bg-gradient-accent text-accent-fg' : 'bg-surface-strong text-fg',
              )}
            >
              {i + 1}
            </span>
            <span className="min-w-0">{step}</span>
          </li>
        ))}
      </ol>

      <p className="relative mt-4 flex items-start gap-2 border-t border-border pt-3 text-xs text-muted">
        <Flag className="mt-0.5 size-3.5 shrink-0 text-accent" aria-hidden />
        <span className="min-w-0">
          <span className="font-semibold text-fg">Ends</span> — {info?.ends}
        </span>
      </p>
    </div>
  );
}
