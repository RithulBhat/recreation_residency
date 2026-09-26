import type { DuelStyle } from '@/types';
import { LIMITS } from '@/game/presets';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { Stepper } from '@/components/ui/Stepper';
import { Kbd } from '@/components/ui/Kbd';
import { useSettingsStore } from '@/store/settingsStore';
import { HostSettings } from './HostSettings';
import { PlayersEditor } from './PlayersEditor';
import { SettingRow } from './SettingRow';

const BLITZ_OPTIONS = [60, 90, 120, 180] as const;
const SURVIVAL_MAX_LIVES = 5;

/** Mode-specific knobs (blitz clock, lives, duel style, players) + the voice host. */
export function ModeExtras() {
  const settings = useSettingsStore((s) => s.settings);
  const update = useSettingsStore((s) => s.update);
  const { mode } = settings;

  const blitzValues: number[] = [...BLITZ_OPTIONS];
  if (!blitzValues.includes(settings.blitzDuration)) blitzValues.push(settings.blitzDuration);
  blitzValues.sort((a, b) => a - b);

  return (
    <div className="flex flex-col gap-5">
      {mode === 'blitz' && (
        <SettingRow label="Clock" hint="Total time. Every wrong guess burns 3 s.">
          <SegmentedControl<string>
            aria-label="Blitz duration"
            size="sm"
            value={String(settings.blitzDuration)}
            onChange={(v) => update({ blitzDuration: Number(v) })}
            options={blitzValues.map((n) => ({ value: String(n), label: `${n}s`, 'aria-label': `${n} seconds` }))}
          />
        </SettingRow>
      )}

      {mode === 'survival' && (
        <Stepper
          label="Lives"
          description="Lose one per missed song. Clips shrink 15% per hit."
          value={settings.lives}
          onChange={(lives) => update({ lives })}
          min={LIMITS.lives.min}
          max={SURVIVAL_MAX_LIVES}
          format={(v) => '❤️'.repeat(v)}
          aria-label="Lives"
        />
      )}

      {mode === 'duel' && (
        <SettingRow
          label="Duel style"
          hint={
            settings.duelStyle === 'buzzer' ? (
              <>
                First to buzz answers — <Kbd size="sm">A</Kbd> for player one, <Kbd size="sm">L</Kbd> for player two.
              </>
            ) : (
              'Players alternate songs; highest score wins.'
            )
          }
        >
          <SegmentedControl<DuelStyle>
            aria-label="Duel style"
            size="sm"
            value={settings.duelStyle}
            onChange={(duelStyle) => update({ duelStyle })}
            options={[
              { value: 'buzzer', label: 'Buzzer' },
              { value: 'turns', label: 'Turns' },
            ]}
          />
        </SettingRow>
      )}

      {(mode === 'duel' || mode === 'party') && (
        <SettingRow label="Players" hint={mode === 'duel' ? 'Exactly two. Pick a name and a look.' : 'Two to eight. Pass the phone between turns.'} stack>
          <PlayersEditor
            players={settings.players}
            onChange={(players) => update({ players })}
            min={LIMITS.players.min}
            max={mode === 'duel' ? 2 : LIMITS.players.max}
          />
        </SettingRow>
      )}

      {(mode === 'blitz' || mode === 'survival' || mode === 'duel' || mode === 'party') && <hr className="border-border" />}

      <HostSettings />
    </div>
  );
}
