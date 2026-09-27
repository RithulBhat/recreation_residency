import { Heart, Hourglass, Info } from 'lucide-react';
import {
  GAUNTLET_SIZE,
  SCOUT_DUEL_STYLES,
  SCOUT_FORMAT_LIMITS,
  formatUses,
  scoutBlitzDuration,
  scoutDuelStyle,
  scoutFormat,
  scoutLives,
  type ScoutSettingKey,
} from '@/scout/formats';
import { SCOUT_LIMITS } from '@/scout/presets';
import { useScoutSettingsStore } from '@/store/scoutStore';
import type { DuelStyle } from '@/types/game';
import type { ScoutDifficulty } from '@/scout/types';
import { Chip } from '@/components/ui/Chip';
import { Kbd } from '@/components/ui/Kbd';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { Stepper } from '@/components/ui/Stepper';
import { Switch } from '@/components/ui/Switch';
import { cn } from '@/components/ui/cn';
import { SettingRow } from '@/components/setup/SettingRow';
import { ScoutBroadcastSettings } from './ScoutBroadcastSettings';
import {
  BLITZ_PENALTY_LABEL,
  BLITZ_RUNG_LABEL,
  SCOUT_DIFFICULTY_INFO,
  SCOUT_DIFFICULTY_ORDER,
  SCOUT_DUEL_STYLE_LABEL,
  livesLabel,
  scoutDifficultyApplies,
  scoutFormatName,
  scoutModeName,
  scoutRevealLadder,
  triesLabel,
} from './summary';

const ROUND_OPTIONS = [5, 8, 10, 15, 20, 0] as const;
const TIMER_OPTIONS = [0, 15, 20, 30, 45, 60] as const;
const BLITZ_OPTIONS = [30, 60, 90, 120, 180] as const;

function roundsOptionLabel(n: number): string {
  return n === 0 ? '∞' : String(n);
}

/**
 * Options for a numeric segmented control with the draft's own value spliced in if it is exotic
 * (a challenge link or an old draft can carry a 45-second clock nobody can otherwise pick).
 * `endLast` keeps a sentinel option (∞ rounds) last.
 */
function withCurrent(options: readonly number[], current: number, endLast = false): number[] {
  const values = [...options];
  if (values.includes(current)) return values;
  if (endLast) {
    values.splice(values.length - 1, 0, current);
    return values;
  }
  values.push(current);
  return values.sort((a, b) => a - b);
}

export interface ScoutRulesProps {
  /** Pool size per tier for the current packs + mode, or null while the dataset loads. */
  tierCounts?: Readonly<Partial<Record<ScoutDifficulty, number>>> | null;
}

/**
 * Every rule the SESSION FORMAT actually reads — and nothing it does not.
 *
 * `formatUses(format, key)` is the only gate: blitz gets a clock and no round or try count (it
 * freezes every subject at one rung), survival gets lives, duel gets a style, the gauntlet takes
 * neither rounds nor a tier, and duel/party have no hints. A control that would turn nothing is not
 * rendered at all — where its absence could be surprising, the reason takes its place. Every control
 * carries `data-setting="<key>"`, so a test can assert that set against the format's `uses` exactly.
 *
 * The BROADCAST SCORE block at the bottom is deliberately the one thing here WITHOUT a `data-setting`:
 * it is a device preference (like the theme or the volume), not a rule of the run, so it belongs to
 * every format and must stay out of the set that test compares against `uses`.
 */
export function ScoutRules({ tierCounts }: ScoutRulesProps) {
  const settings = useScoutSettingsStore((s) => s.settings);
  const update = useScoutSettingsStore((s) => s.update);
  const format = scoutFormat(settings);
  const uses = (key: ScoutSettingKey): boolean => formatUses(format, key);

  const ladder = scoutRevealLadder(settings.mode, settings.tries);
  // Franchises carry no fame score, so `buildPool` deals all 32 clubs at every tier. Rather than
  // leave a dial that turns nothing, a team-only run gets the reason in its place.
  const tiersApply = scoutDifficultyApplies(settings);
  const showTiers = uses('difficulty') && tiersApply;
  // Why the tiers are missing: the format walks them itself, or the run only ever deals franchises.
  const tierReason = uses('difficulty')
    ? null
    : format === 'survival'
      ? 'Survival walks the tiers itself, one step harder every few right answers.'
      : `The gauntlet has to reach all ${GAUNTLET_SIZE} franchises, so it plays every tier.`;

  return (
    <div className="flex flex-col gap-5">
      {uses('duelStyle') && (
        <div data-setting="duelStyle">
          <SettingRow
            label="Duel style"
            hint={
              scoutDuelStyle(settings) === 'buzzer' ? (
                <>
                  Nobody answers until someone buzzes — <Kbd size="sm">A</Kbd> for player one,{' '}
                  <Kbd size="sm">L</Kbd> for player two. A wrong buzz locks you out of the round.
                </>
              ) : (
                'One subject each, round by round. No buzzing, no lockouts.'
              )
            }
          >
            <SegmentedControl<DuelStyle>
              aria-label="Duel style"
              size="sm"
              value={scoutDuelStyle(settings)}
              onChange={(duelStyle) => update({ duelStyle })}
              options={SCOUT_DUEL_STYLES.map((s) => ({ value: s, label: SCOUT_DUEL_STYLE_LABEL[s] }))}
            />
          </SettingRow>
        </div>
      )}

      {uses('blitzDuration') && (
        <div data-setting="blitzDuration">
          <SettingRow
            label={
              <span className="inline-flex items-center gap-1.5">
                <Hourglass className="size-3.5 text-accent" aria-hidden />
                Clock
              </span>
            }
            hint={`Total time for the whole run. A miss or a skip burns ${BLITZ_PENALTY_LABEL}.`}
          >
            <SegmentedControl<string>
              aria-label="Blitz clock"
              size="sm"
              value={String(scoutBlitzDuration(settings))}
              onChange={(v) => update({ blitzDuration: Number(v) })}
              options={withCurrent(BLITZ_OPTIONS, scoutBlitzDuration(settings)).map((n) => ({
                value: String(n),
                label: `${n}s`,
                'aria-label': `${n} seconds`,
              }))}
            />
          </SettingRow>
        </div>
      )}

      {uses('lives') && (
        <div className="flex flex-col gap-2" data-setting="lives">
          <Stepper
            size="lg"
            label={
              <span className="inline-flex items-center gap-1.5">
                <Heart className="size-3.5 text-danger" aria-hidden />
                Lives
              </span>
            }
            description={`${livesLabel(scoutLives(settings))} to start. A lost round costs one; at zero the run is over.`}
            value={scoutLives(settings)}
            min={SCOUT_FORMAT_LIMITS.lives.min}
            max={SCOUT_FORMAT_LIMITS.lives.max}
            onChange={(lives) => update({ lives })}
            aria-label="Lives"
          />
          {/* A health bar rather than a row of emoji in the stepper, which wraps past two lives. */}
          <div className="flex items-center gap-1.5" aria-hidden data-testid="lives-bar">
            {Array.from({ length: SCOUT_FORMAT_LIMITS.lives.max }, (_, i) => (
              <span
                key={i}
                className={cn('h-2 flex-1 rounded-full', i < scoutLives(settings) ? 'bg-danger' : 'bg-surface-strong')}
              />
            ))}
          </div>
          <p className="font-mono text-[11px] tabular text-muted">
            {scoutLives(settings)} of {SCOUT_FORMAT_LIMITS.lives.max} lives
          </p>
        </div>
      )}

      {showTiers ? (
        <div data-setting="difficulty">
          <SettingRow
            label="Difficulty"
            hint={
              <>
                {SCOUT_DIFFICULTY_INFO[settings.difficulty].hint}{' '}
                <span className="font-mono text-[11px] text-fg/70">
                  {SCOUT_DIFFICULTY_INFO[settings.difficulty].fame}
                </span>
                {settings.mixModes && ' Franchise rounds ignore it — all 32 clubs always play.'}
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
        </div>
      ) : (
        <div className="flex items-start gap-2.5 rounded-2xl bg-surface px-3.5 py-3" data-testid="scout-difficulty-na">
          <Info className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
          <p className="min-w-0 text-xs text-muted">
            <span className="text-sm font-semibold text-fg">No difficulty tiers here.</span>{' '}
            {tierReason ?? (
              <>
                Tiers rank players by fame, and {scoutModeName(settings.mode)} names franchises — all {GAUNTLET_SIZE}{' '}
                clubs are in every pool. Switch to a player mode, or turn on Mixed bag, to pick a tier.
              </>
            )}
          </p>
        </div>
      )}

      {uses('rounds') && (
        <div data-setting="rounds">
          <SettingRow
            label="Rounds"
            hint={
              format === 'party'
                ? 'Subjects per run, snapped up to a multiple of the roster so everyone gets equal turns.'
                : 'Subjects per run. ∞ keeps dealing until you quit.'
            }
          >
            <SegmentedControl<string>
              aria-label="Rounds"
              size="sm"
              value={String(settings.rounds)}
              onChange={(v) => update({ rounds: Number(v) })}
              options={withCurrent(ROUND_OPTIONS, settings.rounds, true).map((n) => ({
                value: String(n),
                label: roundsOptionLabel(n),
                'aria-label': n === 0 ? 'Endless' : `${n} rounds`,
              }))}
            />
          </SettingRow>
        </div>
      )}

      {uses('tries') ? (
        <div className="flex flex-col gap-2" data-setting="tries">
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
      ) : (
        <div className="flex items-start gap-2.5 rounded-2xl bg-surface px-3.5 py-3" data-testid="scout-tries-na">
          <Info className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
          <p className="min-w-0 text-xs text-muted">
            <span className="text-sm font-semibold text-fg">No try count in {scoutFormatName(format)}.</span> Every
            subject opens at the same {BLITZ_RUNG_LABEL} and a miss moves you straight on — the clock is the pressure
            here, not the ladder.
          </p>
        </div>
      )}

      {uses('roundTimer') && (
        <div data-setting="roundTimer">
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
              options={withCurrent(TIMER_OPTIONS, settings.roundTimer).map((t) => ({
                value: String(t),
                label: t === 0 ? 'Off' : `${t}s`,
                'aria-label': t === 0 ? 'Timer off' : `${t} seconds`,
              }))}
            />
          </SettingRow>
        </div>
      )}

      {uses('hintsEnabled') && (
        <div data-setting="hintsEnabled">
          <Switch
            label="Hints"
            description="Let a round trade points for an extra clue. Each hint costs 15%."
            checked={settings.hintsEnabled}
            onChange={(hintsEnabled) => update({ hintsEnabled })}
          />
        </div>
      )}

      <ScoutBroadcastSettings className="border-t border-border/70 pt-4" />
    </div>
  );
}
