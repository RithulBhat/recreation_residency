import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { Binoculars, Info, Library, ListChecks, Map, RotateCcw, Swords, Trophy, Users, X } from 'lucide-react';
import { SCOUT_FORMAT_IDS, formatUses, isScoutMultiplayer, scoutFormat, scoutFormatInfo } from '@/scout/formats';
import { SCOUT_MODES, scoutPack } from '@/scout/packs';
import { SCOUT_MODE_IDS } from '@/scout/presets';
import { decodeScoutChallenge, scoutChallengeSettings } from '@/scout/challenge';
import { useScoutSettingsStore } from '@/store/scoutStore';
import { useIsMobile } from '@/hooks/useMediaQuery';
import { SectionHeading } from '@/components/SectionHeading';
import { Button } from '@/components/ui/Button';
import { SetupSection } from '@/components/setup/SetupSection';
import { R } from '@/routes';
import {
  SCOUT_DIFFICULTY_ORDER,
  ScoutFooter,
  ScoutFormatPicker,
  ScoutGauntletBoard,
  ScoutModePicker,
  ScoutPackPicker,
  ScoutPresetRow,
  ScoutReplaceDialog,
  ScoutResumeBanner,
  ScoutRules,
  ScoutRunBrief,
  ScoutSeats,
  ScoutStartBar,
  roundsLabel,
  scoutFormatSwitch,
  scoutDifficultyLabel,
  scoutFormatName,
  scoutModeName,
  scoutPackCounts,
  scoutPackNames,
  scoutPacksSummary,
  scoutPoolSize,
  scoutRulesSummary,
  seatsLabel,
  useScoutDataset,
  useStartScout,
} from '@/components/scoutSetup';
import type { ScoutDifficulty, ScoutFormat, ScoutMode, ScoutSettings } from '@/scout/types';

function isScoutMode(value: unknown): value is ScoutMode {
  return typeof value === 'string' && (SCOUT_MODE_IDS as readonly string[]).includes(value);
}

function isScoutFormat(value: unknown): value is ScoutFormat {
  return typeof value === 'string' && (SCOUT_FORMAT_IDS as readonly string[]).includes(value);
}

/**
 * The Highlight Scout lobby — FORMAT first, then puzzle types.
 *
 * The format (standard, blitz, survival, gauntlet, duel, party) is what changes how a session feels,
 * so it is the first and biggest choice on the page; everything below it is driven by
 * `formatUses(format, key)`, which is also what hides the controls a format ignores. A puzzle type
 * added to `SCOUT_MODES` shows up here on its own — nothing on this screen hardcodes the list.
 *
 * Query params: `format`, `mode`, `packs` (comma separated), `preset`, `challenge` (a code from
 * `#/scout/c/:code`) and `autostart=1` — applied once, then stripped so a refresh cannot re-apply a
 * format the player has since changed.
 */
export default function ScoutSetup() {
  const game = useStartScout();
  const start = game.start;
  const settings = useScoutSettingsStore((s) => s.settings);
  const mobile = useIsMobile();
  const [params, setParams] = useSearchParams();
  const handled = useRef<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const { dataset, loading, error: datasetError, retry } = useScoutDataset();

  useEffect(() => {
    const key = params.toString();
    if (!key || handled.current === key) return;
    handled.current = key;
    const store = useScoutSettingsStore.getState();
    const patch: Partial<ScoutSettings> = {};

    const next = params.get('format');
    // A deep link into a format goes through the same restore as the picker: the format being left
    // may have forced `rounds: 0` (or a tier, or league-wide packs) that the new one can undo.
    if (isScoutFormat(next)) Object.assign(patch, scoutFormatSwitch(store.settings, next));
    const mode = params.get('mode');
    if (isScoutMode(mode)) patch.mode = mode;
    const packs = (params.get('packs') ?? '')
      .split(',')
      .map((id) => id.trim())
      .filter((id) => id !== '' && scoutPack(id) !== undefined);
    if (packs.length > 0) patch.packIds = packs;
    const preset = params.get('preset');
    if (preset) store.applyPreset(preset);

    const code = params.get('challenge');
    const payload = code ? decodeScoutChallenge(code) : null;
    if (payload) {
      const challenge = scoutChallengeSettings(payload);
      // the draft keeps the rules; the seed only rides along on the run itself
      const { seed: _seed, daily: _daily, ...draft } = challenge;
      store.update(draft);
      setNotice(
        `${payload.by ? `${payload.by}'s` : 'A'} challenge loaded — ${scoutModeName(challenge.mode)}, ${roundsLabel(challenge.rounds)}, same subjects in the same order.`,
      );
      void start(challenge, { force: true });
      setParams({}, { replace: true });
      return;
    }

    if (Object.keys(patch).length > 0) store.update(patch);
    if (params.get('autostart') === '1') void start(useScoutSettingsStore.getState().settings);
    setParams({}, { replace: true });
  }, [params, setParams, start]);

  const format = scoutFormat(settings);
  const formatInfo = scoutFormatInfo(format);
  // The gauntlet chooses its own packs (it has to reach all 32 franchises), so the pack picker is
  // replaced by the board rather than left as a control that cannot change anything.
  const picksPacks = formatUses(format, 'packIds');
  const multiplayer = isScoutMultiplayer(settings);

  // Pool maths only depends on these four fields — keep rounds/timer edits from recomputing.
  const poolKey = `${settings.mode}|${settings.mixModes}|${settings.difficulty}|${settings.packIds.join(',')}`;
  const counts = useMemo(
    () => (dataset ? scoutPackCounts(dataset, settings.difficulty) : null),
    [dataset, settings.difficulty],
  );
  const poolSize = useMemo(
    () => (dataset ? scoutPoolSize(dataset, settings) : null),
    [dataset, poolKey],
  );
  const tierCounts = useMemo(() => {
    if (!dataset) return null;
    const out: Partial<Record<ScoutDifficulty, number>> = {};
    for (const d of SCOUT_DIFFICULTY_ORDER) out[d] = scoutPoolSize(dataset, { ...settings, difficulty: d });
    return out;
  }, [dataset, poolKey]);

  const packNames = scoutPackNames(settings.packIds);
  const modeInfo = SCOUT_MODES.find((m) => m.id === settings.mode);
  // The tier worth NAMING in a summary — null at `any`, on a franchise-only run (nothing it does)
  // and in the formats that set the tier themselves (survival, gauntlet).
  const tierLabel = formatUses(format, 'difficulty') ? scoutDifficultyLabel(settings) : null;

  return (
    <div className="flex flex-col gap-4 pb-36 sm:gap-6 sm:pb-32">
      <SectionHeading
        as="h1"
        eyebrow="Highlight Scout · Lobby"
        title={<span id="scout-setup-title">Set up your scouting session</span>}
        description="Format first — a clock, a last life, or a laptop being passed. Then pick what the clues look like. Everything is remembered."
        size="lg"
        action={
          <div className="hidden sm:block">
            <Button variant="ghost" size="sm" to={R.scout.stats} leadingIcon={<Trophy />}>
              Your record
            </Button>
          </div>
        }
      />

      {notice && (
        <div className="glass flex items-start gap-3 rounded-2xl px-4 py-3 text-sm text-fg" role="status">
          <Info className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
          <span className="flex-1">{notice}</span>
          <button
            type="button"
            aria-label="Dismiss"
            onClick={() => setNotice(null)}
            className="touch-hit-44 grid size-7 place-items-center rounded-full text-muted hover:bg-surface hover:text-fg"
          >
            <X className="size-4" />
          </button>
        </div>
      )}

      {datasetError && (
        <div
          className="flex flex-col items-start gap-3 rounded-2xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-fg sm:flex-row sm:items-center"
          role="alert"
          data-testid="scout-dataset-error"
        >
          <span className="flex-1">{datasetError}</span>
          <Button size="sm" variant="secondary" leadingIcon={<RotateCcw />} onClick={retry}>
            Retry
          </Button>
        </div>
      )}

      {poolSize === 0 && !datasetError && (
        <div
          className="flex flex-col items-start gap-1 rounded-2xl border border-warn/40 bg-warn/10 px-4 py-3 text-sm text-fg"
          role="alert"
          data-testid="scout-empty-pool"
        >
          <span className="font-semibold">Nothing to scout with these settings.</span>
          <span className="text-muted">
            {scoutPacksSummary(packNames)} has nobody{tierLabel !== null ? ` at ${tierLabel}` : ''} who can be played
            as {scoutModeName(settings.mode)}.{' '}
            {tierLabel !== null ? 'Add a pack, or set the difficulty back to Any.' : 'Add a pack.'}
          </span>
        </div>
      )}

      <ScoutResumeBanner />

      <ScoutPresetRow />

      {/*
        FORMAT FIRST — the axis that changes how a session feels, so it gets the full width at the top
        of the page. Below it, two INDEPENDENT two-column rows: the puzzle and the pool, then the
        rules and the read-back. Two rows rather than one tall grid because the pack card and the
        puzzle grid are nowhere near the same height; splitting them bounds the mismatch to one row
        instead of leaving the ~750 px of dead right column a review measured at 1440×900.

        `lg:items-start` keeps the shorter card at its natural height — a stretched glass card with an
        empty bottom reads as a bug, a shorter card does not — and `COLLAPSED_PACKS_WIDE` shows enough
        packs from `lg` up that the first row's two columns land within ~50 px of each other at 1440.
        `min-w-0` on every section is load-bearing: a grid item defaults to `min-width: auto` and the
        collapsed-section summary is a `truncate` (nowrap) line, so one long summary would otherwise
        widen the whole page on a phone.
      */}
      <SetupSection
        id="scout-format"
        className="min-w-0"
        icon={<Swords />}
        title="Format"
        summary={`${formatInfo?.name ?? format} — ${formatInfo?.ends ?? ''}`}
      >
        <ScoutFormatPicker />
      </SetupSection>

      <div className="grid gap-4 lg:grid-cols-2 lg:items-start" data-row="puzzle-pool">
        <SetupSection
          id="scout-mode"
          className="min-w-0"
          icon={<Binoculars />}
          title="Puzzle type"
          summary={
            settings.mixModes
              ? 'Mixed bag · every puzzle type shuffled'
              : `${scoutModeName(settings.mode)} · ${modeInfo?.blurb ?? ''}`
          }
        >
          <ScoutModePicker />
        </SetupSection>

        {picksPacks ? (
          <SetupSection
            id="scout-packs"
            className="min-w-0"
            icon={<Library />}
            title="Packs"
            summary={`${scoutPacksSummary(packNames)}${poolSize !== null ? ` · ${poolSize.toLocaleString()} in the pool` : ''}`}
          >
            <ScoutPackPicker counts={counts} poolSize={poolSize} loading={loading} />
          </SetupSection>
        ) : (
          <SetupSection
            id="scout-board"
            className="min-w-0"
            icon={<Map />}
            title="The board"
            summary="All 32 franchises · one subject each"
          >
            <ScoutGauntletBoard />
          </SetupSection>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2 lg:items-start" data-row="rules-brief">
        <SetupSection
          id="scout-rules"
          className="min-w-0"
          icon={<ListChecks />}
          title="Rules"
          summary={scoutRulesSummary(settings)}
          defaultOpen={!mobile}
        >
          <ScoutRules tierCounts={tierCounts} />
        </SetupSection>

        <div className="flex min-w-0 flex-col gap-4">
          {multiplayer && (
            <SetupSection
              id="scout-players"
              className="min-w-0"
              icon={<Users />}
              title="Players"
              summary={`${seatsLabel(settings.players?.length ?? 0)} · ${scoutFormatName(format)}`}
            >
              <ScoutSeats />
            </SetupSection>
          )}
          <ScoutRunBrief />
        </div>
      </div>

      <ScoutFooter className="mt-6 sm:mt-10" />

      <ScoutStartBar game={game} poolSize={poolSize} datasetLoading={loading} />
      <ScoutReplaceDialog game={game} />
    </div>
  );
}
