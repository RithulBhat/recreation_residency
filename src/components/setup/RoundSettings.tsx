import type { Difficulty, GuessTarget, StartPosition } from '@/types';
import { Chip } from '@/components/ui/Chip';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { Switch } from '@/components/ui/Switch';
import { useSettingsStore } from '@/store/settingsStore';
import { SettingRow } from './SettingRow';
import { DIFFICULTY_INFO, START_POSITION_INFO } from './summary';

const ROUND_OPTIONS = [5, 10, 15, 20, 0] as const;
const TIMER_OPTIONS = [0, 10, 20, 30, 60] as const;
const DIFFICULTIES: readonly Difficulty[] = ['any', 'easy', 'medium', 'hard', 'expert', 'impossible'];
const START_POSITIONS: readonly StartPosition[] = ['start', 'random', 'middle', 'end'];

function roundsLabel(n: number): string {
  return n === 0 ? '∞' : String(n);
}

/** Rounds, difficulty, start position, guess target, hints, timer, explicit filter. */
export function RoundSettings() {
  const settings = useSettingsStore((s) => s.settings);
  const update = useSettingsStore((s) => s.update);
  const timed = settings.mode === 'blitz';
  const endless = settings.mode === 'survival';

  const roundValues: number[] = [...ROUND_OPTIONS];
  if (!roundValues.includes(settings.rounds)) roundValues.splice(roundValues.length - 1, 0, settings.rounds);

  return (
    <div className="flex flex-col gap-5">
      {!timed && !endless && (
        <SettingRow label="Rounds" hint="Songs per game. ∞ keeps going until you quit.">
          <SegmentedControl<string>
            aria-label="Rounds"
            size="sm"
            value={String(settings.rounds)}
            onChange={(v) => update({ rounds: Number(v) })}
            options={roundValues.map((n) => ({ value: String(n), label: roundsLabel(n), 'aria-label': n === 0 ? 'Endless' : `${n} rounds` }))}
          />
        </SettingRow>
      )}

      <SettingRow label="Difficulty" hint={DIFFICULTY_INFO[settings.difficulty].hint} stack>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Difficulty">
          {DIFFICULTIES.map((d) => (
            <Chip key={d} size="sm" check selected={settings.difficulty === d} onClick={() => update({ difficulty: d })}>
              {DIFFICULTY_INFO[d].label}
            </Chip>
          ))}
        </div>
      </SettingRow>

      <SettingRow label="Clip starts" hint={START_POSITION_INFO[settings.startPosition].hint}>
        <SegmentedControl<StartPosition>
          aria-label="Clip start position"
          size="sm"
          value={settings.startPosition}
          onChange={(startPosition) => update({ startPosition })}
          options={START_POSITIONS.map((p) => ({ value: p, label: START_POSITION_INFO[p].label }))}
        />
      </SettingRow>

      <SettingRow label="Guess" hint={settings.guessTarget === 'both' ? 'Artist alone earns 30% and costs a try.' : 'What counts as a correct answer.'}>
        <SegmentedControl<GuessTarget>
          aria-label="Guess target"
          size="sm"
          value={settings.guessTarget}
          onChange={(guessTarget) => update({ guessTarget })}
          options={[
            { value: 'title', label: 'Title' },
            { value: 'artist', label: 'Artist' },
            { value: 'both', label: 'Both' },
          ]}
        />
      </SettingRow>

      <SettingRow label="Round timer" hint={settings.roundTimer === 0 ? 'Take your time.' : `${settings.roundTimer} s per song, then it counts as a miss.`}>
        <SegmentedControl<string>
          aria-label="Round timer"
          size="sm"
          value={String(settings.roundTimer)}
          onChange={(v) => update({ roundTimer: Number(v) })}
          options={TIMER_OPTIONS.map((t) => ({ value: String(t), label: t === 0 ? 'Off' : `${t}s`, 'aria-label': t === 0 ? 'Timer off' : `${t} seconds` }))}
        />
      </SettingRow>

      <Switch
        label="Hints"
        description="Year, initials, cover peek. Each hint costs 15%."
        checked={settings.hintsEnabled}
        onChange={(hintsEnabled) => update({ hintsEnabled })}
      />

      <Switch
        label="Hide explicit tracks"
        description="Filters explicit songs and explicit-heavy packs."
        checked={settings.explicitFilter}
        onChange={(explicitFilter) => update({ explicitFilter })}
      />
    </div>
  );
}
