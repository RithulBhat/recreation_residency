import { Volume2 } from 'lucide-react';
import type { HostPersonality } from '@/types';
import { HOST_PERSONALITIES, useSettingsStore } from '@/store/settingsStore';
import { useVoiceHost } from '@/voice/useVoiceHost';
import { Button } from '@/components/ui/Button';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { Switch } from '@/components/ui/Switch';
import { SettingRow } from './SettingRow';

const PERSONALITY_LABEL: Record<HostPersonality, string> = { hype: 'Hype', chill: 'Chill', savage: 'Savage', radio: 'Radio' };
const PERSONALITY_HINT: Record<HostPersonality, string> = {
  hype: 'Loud, thrilled, a little too much.',
  chill: 'Low-key encouragement.',
  savage: 'Roasts every miss.',
  radio: 'Late-night FM smoothness.',
};

const SAMPLE_LINE: Record<HostPersonality, string> = {
  hype: "LET'S GO! Zero point one seconds, name that track!",
  chill: 'Alright. Take a breath. Here comes the clip.',
  savage: 'Try not to embarrass yourself this time.',
  radio: "You're listening to Songooner. Here's the next one.",
};

/** Voice host on/off, personality and the synth voice — persisted in the settings store. */
export function HostSettings() {
  const enabled = useSettingsStore((s) => s.settings.voiceHost);
  const update = useSettingsStore((s) => s.update);
  const personality = useSettingsStore((s) => s.hostPersonality);
  const voiceURI = useSettingsStore((s) => s.hostVoiceURI);
  const setHostPersonality = useSettingsStore((s) => s.setHostPersonality);
  const setHostVoiceURI = useSettingsStore((s) => s.setHostVoiceURI);

  const host = useVoiceHost({
    enabled,
    personality,
    voiceURI,
    onEnabledChange: (voiceHost) => update({ voiceHost }),
    onPersonalityChange: setHostPersonality,
    onVoiceURIChange: setHostVoiceURI,
  });

  return (
    <div className="flex flex-col gap-4">
      <Switch
        label="Voice host"
        description={host.supported ? 'A commentator reacts to every guess.' : 'Speech synthesis is not available in this browser.'}
        checked={enabled}
        onChange={host.setEnabled}
        disabled={!host.supported}
      />

      {enabled && host.supported && (
        <>
          <SettingRow label="Personality" hint={PERSONALITY_HINT[personality]} stack>
            <SegmentedControl<HostPersonality>
              aria-label="Host personality"
              size="sm"
              fullWidth
              value={personality}
              onChange={host.setPersonality}
              options={HOST_PERSONALITIES.map((p) => ({ value: p, label: PERSONALITY_LABEL[p] }))}
            />
          </SettingRow>

          <SettingRow label="Voice" hint={host.voices.length === 0 ? 'Voices load once the browser is ready.' : `${host.voices.length} voices available.`}>
            <div className="flex items-center gap-2">
              <select
                aria-label="Host voice"
                value={voiceURI ?? ''}
                onChange={(e) => host.setVoiceURI(e.target.value || null)}
                className="h-10 max-w-[14rem] rounded-xl border border-border-strong bg-surface px-3 text-sm text-fg focus:border-accent focus:outline-none"
              >
                <option value="">Auto (best available)</option>
                {host.voices.map((v) => (
                  <option key={v.voiceURI} value={v.voiceURI}>
                    {v.name} ({v.lang})
                  </option>
                ))}
              </select>
              <Button size="sm" variant="secondary" leadingIcon={<Volume2 />} onClick={() => host.say(SAMPLE_LINE[personality])} aria-label="Test the host voice">
                Test
              </Button>
            </div>
          </SettingRow>
        </>
      )}
    </div>
  );
}
