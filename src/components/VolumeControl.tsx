import { Volume, Volume1, Volume2, VolumeX } from 'lucide-react';
import { IconButton } from './ui/IconButton';
import { Popover } from './ui/Popover';
import { Slider } from './ui/Slider';
import { Switch } from './ui/Switch';

export interface VolumeControlProps {
  /** 0..1 */
  volume: number;
  onVolumeChange: (v: number) => void;
  muted?: boolean;
  onMutedChange?: (m: boolean) => void;
  /** Optional SFX toggle */
  sfx?: boolean;
  onSfxChange?: (on: boolean) => void;
  className?: string;
}

function volumeIcon(volume: number, muted?: boolean) {
  if (muted || volume <= 0) return <VolumeX />;
  if (volume < 0.34) return <Volume />;
  if (volume < 0.67) return <Volume1 />;
  return <Volume2 />;
}

/** Prop-driven volume popover (Slider + optional mute / SFX switches). */
export function VolumeControl({ volume, onVolumeChange, muted, onMutedChange, sfx, onSfxChange, className }: VolumeControlProps) {
  const effective = muted ? 0 : volume;
  return (
    <Popover aria-label="Volume" width={248} trigger={<IconButton aria-label="Volume" icon={volumeIcon(volume, muted)} className={className} />}>
      <div className="flex flex-col gap-3 p-2">
        <Slider
          label="Volume"
          value={Math.round(effective * 100)}
          onChange={(v) => {
            onVolumeChange(v / 100);
            if (muted && v > 0) onMutedChange?.(false);
          }}
          min={0}
          max={100}
          step={1}
          format={(v) => `${v}%`}
        />
        {onMutedChange && <Switch size="sm" label="Mute" checked={!!muted} onChange={onMutedChange} />}
        {onSfxChange && <Switch size="sm" label="Sound effects" checked={!!sfx} onChange={onSfxChange} />}
      </div>
    </Popover>
  );
}
