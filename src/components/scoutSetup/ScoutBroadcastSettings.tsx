import { Radio, Volume2, VolumeX } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Slider } from '@/components/ui/Slider';
import { Switch } from '@/components/ui/Switch';
import { cn } from '@/components/ui/cn';
import { applyBroadcastPrefs, appVolume, fireCue } from '@/hooks/useBroadcastScore';
import { useScoutSettingsStore } from '@/store/scoutStore';
import { useSettingsStore } from '@/store/settingsStore';

export interface ScoutBroadcastSettingsProps {
  className?: string;
}

/**
 * The BROADCAST SCORE control: two independent switches and the score's own trim.
 *
 * The stings are on by default and the bed is off — music under a guessing game is a minority taste,
 * and it is the one setting here that can get in the way of hearing the game. Both sit under the app's
 * volume and `sfxEnabled`, so a muted app shows why nothing will play rather than pretending it will.
 *
 * "Hear it" is also what unlocks the AudioContext: it is a real tap, so the kickoff that follows a
 * Start a moment later is already permitted.
 */
export function ScoutBroadcastSettings({ className }: ScoutBroadcastSettingsProps) {
  const prefs = useScoutSettingsStore((s) => s.broadcast);
  const setBroadcast = useScoutSettingsStore((s) => s.setBroadcast);
  const sfxEnabled = useSettingsStore((s) => s.sfxEnabled);
  // The store volume is both a real mute condition and what re-renders this when it changes;
  // `appVolume` additionally catches the header control's own `sg:volume` / `sg:muted` override.
  const storeVolume = useSettingsStore((s) => s.volume);
  const muted = !sfxEnabled || storeVolume === 0 || appVolume() === 0;
  const anything = prefs.stings || prefs.bed;

  const preview = (): void => {
    applyBroadcastPrefs(prefs, sfxEnabled);
    fireCue('kickoff');
  };

  return (
    <div className={cn('flex flex-col gap-3', className)} data-testid="scout-broadcast">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold text-fg">
            <Radio className="size-3.5 text-accent" aria-hidden />
            Broadcast score
          </h3>
          <p className="mt-0.5 text-xs text-muted">
            Original synthesized brass — a kickoff sting when a session starts, a big call for a name
            taken on the first rung.
          </p>
        </div>
        <Button
          size="sm"
          variant="secondary"
          onClick={preview}
          disabled={muted || !prefs.stings}
          className="shrink-0"
          data-testid="scout-broadcast-preview"
        >
          Hear it
        </Button>
      </div>

      {muted && (
        <p className="flex items-center gap-1.5 rounded-xl bg-surface px-3 py-2 text-xs text-muted" role="status">
          <VolumeX className="size-3.5 shrink-0" aria-hidden />
          Sound is off for the whole app, so the score stays silent until you turn it back on.
        </p>
      )}

      <Switch
        label="Stings"
        description="Kickoff, big calls, the fall on a lost round, and a bumper between rounds."
        checked={prefs.stings}
        onChange={(stings) => setBroadcast({ stings })}
        data-testid="scout-broadcast-stings"
      />
      <Switch
        label="Background bed"
        description="A quiet pulse and pad under a live round. Ducks under every game sound and stops on the reveal."
        checked={prefs.bed}
        onChange={(bed) => setBroadcast({ bed })}
        data-testid="scout-broadcast-bed"
      />

      <Slider
        label={
          <span className="inline-flex items-center gap-1.5">
            <Volume2 className="size-3.5 text-muted" aria-hidden />
            Score volume
          </span>
        }
        aria-label="Broadcast score volume"
        value={prefs.volume}
        onChange={(volume) => setBroadcast({ volume })}
        min={0}
        max={1}
        step={0.05}
        format={(v) => `${Math.round(v * 100)}%`}
        disabled={!anything || muted}
      />
    </div>
  );
}
