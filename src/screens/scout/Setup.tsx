import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { Binoculars, Info, Library, ListChecks, RotateCcw, Trophy, X } from 'lucide-react';
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
  SCOUT_DIFFICULTY_INFO,
  SCOUT_DIFFICULTY_ORDER,
  ScoutModePicker,
  ScoutPackPicker,
  ScoutPresetRow,
  ScoutReplaceDialog,
  ScoutResumeBanner,
  ScoutRules,
  ScoutStartBar,
  roundsLabel,
  scoutModeName,
  scoutPackCounts,
  scoutPackNames,
  scoutPacksSummary,
  scoutPoolSize,
  timerLabel,
  triesLabel,
  useScoutDataset,
  useStartScout,
} from '@/components/scoutSetup';
import type { ScoutDifficulty, ScoutMode, ScoutSettings } from '@/scout/types';

function isScoutMode(value: unknown): value is ScoutMode {
  return typeof value === 'string' && (SCOUT_MODE_IDS as readonly string[]).includes(value);
}

/**
 * The Highlight Scout lobby. Query params: `mode`, `packs` (comma separated), `preset`,
 * `challenge` (a code from `#/scout/c/:code`) and `autostart=1` — applied once, then stripped so a
 * refresh cannot re-apply a mode the player has since changed.
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

  return (
    <div className="flex flex-col gap-4 pb-36 sm:gap-6 sm:pb-32">
      <SectionHeading
        as="h1"
        eyebrow="Highlight Scout · Lobby"
        title={<span id="scout-setup-title">Set up your scouting session</span>}
        description="Pick how the clues arrive, who is in the pool and how many tries you get. Everything is remembered."
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
            {scoutPacksSummary(packNames)} has nobody at {SCOUT_DIFFICULTY_INFO[settings.difficulty].label} who can be
            played as {scoutModeName(settings.mode)}. Add a pack, or set the difficulty back to Any.
          </span>
        </div>
      )}

      <ScoutResumeBanner />

      <ScoutPresetRow />

      <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
        <div className="flex min-w-0 flex-col gap-4">
          <SetupSection
            id="scout-mode"
            icon={<Binoculars />}
            title="Mode"
            summary={
              settings.mixModes
                ? 'Mixed bag · every mode shuffled'
                : `${scoutModeName(settings.mode)} · ${modeInfo?.blurb ?? ''}`
            }
          >
            <ScoutModePicker />
          </SetupSection>
          <SetupSection
            id="scout-packs"
            icon={<Library />}
            title="Packs"
            summary={`${scoutPacksSummary(packNames)}${poolSize !== null ? ` · ${poolSize.toLocaleString()} in the pool` : ''}`}
          >
            <ScoutPackPicker counts={counts} poolSize={poolSize} loading={loading} />
          </SetupSection>
        </div>
        <div className="flex min-w-0 flex-col gap-4">
          <SetupSection
            id="scout-rules"
            icon={<ListChecks />}
            title="Difficulty & rules"
            summary={`${SCOUT_DIFFICULTY_INFO[settings.difficulty].label} · ${roundsLabel(settings.rounds)} · ${triesLabel(settings.tries)} · ${timerLabel(settings.roundTimer)}`}
            defaultOpen={!mobile}
          >
            <ScoutRules tierCounts={tierCounts} />
          </SetupSection>

          <div className="glass rounded-3xl p-4 sm:p-5">
            <h2 className="font-display text-base font-bold text-fg">How a round plays</h2>
            <p className="mt-1.5 text-sm text-muted">
              {settings.mixModes
                ? 'Every round picks a mode this subject can actually be played in — a silhouette, a redacted play, a stat sheet, a logo.'
                : (modeInfo?.how ?? '')}
            </p>
            <ol className="mt-3 flex flex-col gap-2 text-sm text-fg">
              <li className="flex gap-2.5">
                <span className="grid size-5 shrink-0 place-items-center rounded-full bg-gradient-accent font-mono text-[10px] font-bold text-accent-fg">
                  1
                </span>
                <span>You get the hardest rung first — barely anything.</span>
              </li>
              <li className="flex gap-2.5">
                <span className="grid size-5 shrink-0 place-items-center rounded-full bg-surface-strong font-mono text-[10px] font-bold text-fg">
                  2
                </span>
                <span>
                  Every miss lifts the reveal and adds a clue. You have {triesLabel(settings.tries)} before the round is
                  lost.
                </span>
              </li>
              <li className="flex gap-2.5">
                <span className="grid size-5 shrink-0 place-items-center rounded-full bg-surface-strong font-mono text-[10px] font-bold text-fg">
                  3
                </span>
                <span>Solving on rung one is worth the most — the score falls with every try.</span>
              </li>
            </ol>
          </div>
        </div>
      </div>

      <ScoutStartBar game={game} poolSize={poolSize} datasetLoading={loading} />
      <ScoutReplaceDialog game={game} />
    </div>
  );
}
