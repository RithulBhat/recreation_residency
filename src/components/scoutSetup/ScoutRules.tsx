import { SCOUT_LIMITS } from '@/scout/presets';
import { useScoutSettingsStore } from '@/store/scoutStore';
import type { ScoutDifficulty } from '@/scout/types';
import { Chip } from '@/components/ui/Chip';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { Stepper } from '@/components/ui/Stepper';
import { Switch } from '@/components/ui/Switch';
import { SettingRow } from '@/components/setup/SettingRow';
import {
  SCOUT_DIFFICULTY_INFO,
  SCOUT_DIFFICULTY_ORDER,
  scoutRevealLadder,
  triesLabel,
} from './summary';

const ROUND_OPTIONS = [5, 8, 10, 15, 20, 0] as const;
const TIMER_OPTIONS = [0, 15, 20, 30, 45, 60] as const;

function roundsOptionLabel(n: number): string {
  return n === 0 ? '∞' : String(n);
}

export interface ScoutRulesProps {
  /** Pool size per tier for the current packs + mode, or null while the dataset loads. */
  tierCounts?: Readonly<Partial<Record<ScoutDifficulty, number>>> | null;
}

/** Difficulty, rounds, tries, round timer and hints — every `ScoutSettings` rule in one panel. */
export function ScoutRules({ tierCounts }: ScoutRulesProps) {
  const settings = useScoutSettingsStore((s) => s.settings);
  const update = useScoutSettingsStore((s) => s.update);

  const roundValues: number[] = [...ROUND_OPTIONS];
  if (!roundValues.includes(settings.rounds)) roundValues.splice(roundValues.length - 1, 0, settings.rounds);

  const ladder = scoutRevealLadder(settings.mode, settings.tries);

  return (
    <div className="flex flex-col gap-5">
      <SettingRow
        label="Difficulty"
        hint={
          <>
            {SCOUT_DIFFICULTY_INFO[settings.difficulty].hint}{' '}
            <span className="font-mono text-[11px] text-fg/70">
              {SCOUT_DIFFICULTY_INFO[settings.difficulty].fame}
            </span>
          </>
        }
        stack
      >
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Difficulty">
          {SCOUT_DIFFICULTY_ORDER.map((d) => {
            const count = tierCounts?.[d];
            return (
              <Chip
                key={d}
                size="sm"
                check
                selected={settings.difficulty === d}
                onClick={() => update({ difficulty: d })}
                count={count}
                aria-label={`${SCOUT_DIFFICULTY_INFO[d].label}: ${SCOUT_DIFFICULTY_INFO[d].hint}`}
              >
                {SCOUT_DIFFICULTY_INFO[d].label}
              </Chip>
            );
          })}
        </div>
      </SettingRow>

      <SettingRow label="Rounds" hint="Subjects per run. ∞ keeps dealing until you quit.">
        <SegmentedControl<string>
          aria-label="Rounds"
          size="sm"
          value={String(settings.rounds)}
          onChange={(v) => update({ rounds: Number(v) })}
          options={roundValues.map((n) => ({
            value: String(n),
            label: roundsOptionLabel(n),
            'aria-label': n === 0 ? 'Endless' : `${n} rounds`,
          }))}
        />
      </SettingRow>

      <div className="flex flex-col gap-2">
        <Stepper
          size="lg"
          label="Tries per subject"
          description={`Also the number of reveal rungs — ${triesLabel(settings.tries)}, each one easier than the last.`}
          value={settings.tries}
          min={SCOUT_LIMITS.tries.min}
          max={SCOUT_LIMITS.tries.max}
          onChange={(tries) => update({ tries })}
        />
        {ladder && (
          <div className="flex items-center gap-1.5" aria-hidden data-testid="reveal-ladder">
            {ladder.map((v, i) => (
              <span
                key={i}
                className="h-2 flex-1 rounded-full bg-surface-strong"
                style={{ background: `color-mix(in oklab, var(--sg-accent-vivid) ${Math.round(v * 85) + 12}%, var(--sg-surface-strong))` }}
              />
            ))}
          </div>
        )}
        {ladder && (
          <p className="font-mono text-[11px] tabular text-muted">
            reveal {Math.round((ladder[0] ?? 0) * 100)}% on try 1 →{' '}
            {Math.round((ladder[ladder.length - 1] ?? 0) * 100)}% on try {ladder.length}
          </p>
        )}
      </div>

      <SettingRow
        label="Round timer"
        hint={
          settings.roundTimer === 0
            ? 'Take all the time you want.'
            : `${settings.roundTimer}s per subject, then it counts as a miss.`
        }
      >
        <SegmentedControl<string>
          aria-label="Round timer"
          size="sm"
          value={String(settings.roundTimer)}
          onChange={(v) => update({ roundTimer: Number(v) })}
          options={TIMER_OPTIONS.map((t) => ({
            value: String(t),
            label: t === 0 ? 'Off' : `${t}s`,
            'aria-label': t === 0 ? 'Timer off' : `${t} seconds`,
          }))}
        />
      </SettingRow>

      <Switch
        label="Hints"
        description="Let a round trade points for an extra clue. Each hint costs 15%."
        checked={settings.hintsEnabled}
        onChange={(hintsEnabled) => update({ hintsEnabled })}
      />
    </div>
  );
}
