import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { Disc3, Info, Layers, Library, ListChecks, SlidersHorizontal, Users, X } from 'lucide-react';
import type { GameSettings } from '@/types';
import { getPack } from '@/lib/catalog';
import { loadCustomPacks } from '@/lib/customPacks';
import { useSettingsStore } from '@/store/settingsStore';
import { useStartGame } from '@/hooks/useStartGame';
import { useIsMobile } from '@/hooks/useMediaQuery';
import { SectionHeading } from '@/components/SectionHeading';
import { Button } from '@/components/ui/Button';
import {
  ClipSettings,
  MODE_LABEL,
  MODE_OPTIONS,
  ModeExtras,
  ModePicker,
  ModifierSettings,
  PackPicker,
  PresetRow,
  RoundSettings,
  SetupSection,
  StartBar,
  clipSummary,
  isGameMode,
  modifierLabels,
  packsSummary,
  poolEstimate,
  resolvePacks,
  roundsSummary,
} from '@/components/setup';
import { DIFFICULTY_INFO } from '@/components/setup/summary';

function extrasSummary(s: GameSettings): string {
  const parts: string[] = [];
  if (s.mode === 'blitz') parts.push(`${s.blitzDuration} s clock`);
  if (s.mode === 'survival') parts.push(`${s.lives} lives`);
  if (s.mode === 'duel') parts.push(s.duelStyle === 'buzzer' ? 'Buzzer' : 'Turns');
  if (s.mode === 'duel' || s.mode === 'party') parts.push(s.players.map((p) => p.emoji).join(' '));
  parts.push(s.voiceHost ? 'Voice host on' : 'Voice host off');
  return parts.join(' · ');
}

/** The lobby: every option lives here. Query params: mode, packs, preset, autostart=1, share=1. */
export default function Setup() {
  loadCustomPacks();
  const game = useStartGame();
  const start = game.start;
  const settings = useSettingsStore((s) => s.settings);
  const mobile = useIsMobile();
  const [params, setParams] = useSearchParams();
  const handled = useRef<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Apply URL params once (StrictMode-safe via the ref), then strip them so a refresh
  // doesn't re-apply a mode the player has since changed.
  useEffect(() => {
    const key = params.toString();
    if (!key || handled.current === key) return;
    handled.current = key;
    const store = useSettingsStore.getState();
    const patch: Partial<GameSettings> = {};
    const mode = params.get('mode');
    if (isGameMode(mode)) patch.mode = mode;
    const packs = (params.get('packs') ?? '')
      .split(',')
      .map((id) => id.trim())
      .filter((id) => id && getPack(id));
    if (packs.length) patch.packIds = packs;
    const preset = params.get('preset');
    if (preset) store.applyPreset(preset);
    if (Object.keys(patch).length) store.update(patch);
    if (params.get('share') === '1') setNotice('Finish any game and share the challenge link from the results screen — your friend gets the same songs.');
    if (params.get('autostart') === '1') void start(useSettingsStore.getState().settings);
    setParams({}, { replace: true });
  }, [params, setParams, start]);

  const packs = useMemo(() => resolvePacks(settings.packIds), [settings.packIds]);
  const songs = poolEstimate(packs.map((p) => p.approxSize));
  const modeMeta = MODE_OPTIONS.find((m) => m.id === settings.mode);
  const mods = modifierLabels(settings.modifiers);

  return (
    <div className="flex flex-col gap-6 pb-36 sm:pb-32">
      <SectionHeading
        eyebrow="Lobby"
        title={<span id="setup-title">Set up your game</span>}
        description="Pick a mode and some packs, dial in the clip length, then hit Start. Everything is remembered."
        size="lg"
        action={
          <div className="hidden sm:block">
            <Button variant="ghost" size="sm" to="/packs" leadingIcon={<Library />}>
              Browse packs
            </Button>
          </div>
        }
      />

      {notice && (
        <div className="glass flex items-start gap-3 rounded-2xl px-4 py-3 text-sm text-fg" role="status">
          <Info className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
          <span className="flex-1">{notice}</span>
          <button type="button" aria-label="Dismiss" onClick={() => setNotice(null)} className="grid size-7 place-items-center rounded-full text-muted hover:bg-surface hover:text-fg">
            <X className="size-4" />
          </button>
        </div>
      )}

      <PresetRow />

      <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
        <div className="flex flex-col gap-4">
          <SetupSection id="mode" icon={<Disc3 />} title="Mode" summary={`${MODE_LABEL[settings.mode]} · ${modeMeta?.how ?? ''}`}>
            <ModePicker />
          </SetupSection>
          <SetupSection
            id="packs"
            icon={<Library />}
            title="Packs"
            summary={`${packsSummary(packs.map((p) => p.name))}${songs > 0 ? ` · ~${songs.toLocaleString()} songs` : ''}`}
          >
            <PackPicker />
          </SetupSection>
          <SetupSection id="clip" icon={<Layers />} title="Clip length" summary={clipSummary(settings)}>
            <ClipSettings />
          </SetupSection>
        </div>
        <div className="flex flex-col gap-4">
          <SetupSection
            id="rounds"
            icon={<ListChecks />}
            title="Rounds & rules"
            summary={`${roundsSummary(settings)} · ${DIFFICULTY_INFO[settings.difficulty].label} · ${settings.roundTimer ? `${settings.roundTimer} s timer` : 'no timer'}`}
            defaultOpen={!mobile}
          >
            <RoundSettings />
          </SetupSection>
          <SetupSection id="modifiers" icon={<SlidersHorizontal />} title="Modifiers" summary={mods.length ? mods.join(' · ') : 'Sounds normal'} defaultOpen={!mobile}>
            <ModifierSettings />
          </SetupSection>
          <SetupSection
            id="extras"
            icon={<Users />}
            title={settings.mode === 'duel' || settings.mode === 'party' ? 'Players & host' : 'Extras & host'}
            summary={extrasSummary(settings)}
            defaultOpen={!mobile || settings.mode === 'duel' || settings.mode === 'party'}
          >
            <ModeExtras />
          </SetupSection>
        </div>
      </div>

      <StartBar game={game} />
    </div>
  );
}
