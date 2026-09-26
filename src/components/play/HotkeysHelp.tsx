import type { GameSettings } from '@/types';
import { Kbd, Sheet } from '@/components/ui';
import { isBuzzerDuel } from '@/game/presets';

export interface HotkeysHelpProps {
  open: boolean;
  onClose: () => void;
  settings: GameSettings;
  voiceSupported: boolean;
}

interface Row {
  keys: string[];
  label: string;
}

export function hotkeyRows(settings: GameSettings, voiceSupported: boolean): Row[] {
  const rows: Row[] = [
    { keys: ['Space'], label: 'Play / replay the clip' },
    { keys: ['Enter'], label: 'Submit your guess · next song' },
    { keys: ['→'], label: settings.allowSkip ? 'Skip this try' : 'Skip (disabled in this game)' },
    { keys: ['H'], label: 'Open the hints' },
  ];
  if (voiceSupported) rows.push({ keys: ['M'], label: 'Hold to talk (voice guess)' });
  if (isBuzzerDuel(settings)) rows.push({ keys: ['A', 'L'], label: 'Buzz in (left / right player)' });
  rows.push({ keys: ['N'], label: 'Next song (after the reveal)' }, { keys: ['Esc'], label: 'Quit game' }, { keys: ['?'], label: 'This help' });
  return rows;
}

export function HotkeysHelp({ open, onClose, settings, voiceSupported }: HotkeysHelpProps) {
  return (
    <Sheet open={open} onClose={onClose} title="Keyboard shortcuts" description="Shortcuts pause while you're typing a guess (except Enter and Esc).">
      <ul className="flex flex-col divide-y divide-border">
        {hotkeyRows(settings, voiceSupported).map((row) => (
          <li key={row.label} className="flex items-center justify-between gap-4 py-2.5 text-sm">
            <span className="text-fg">{row.label}</span>
            <span className="flex shrink-0 gap-1">
              {row.keys.map((k) => (
                <Kbd key={k}>{k}</Kbd>
              ))}
            </span>
          </li>
        ))}
      </ul>
    </Sheet>
  );
}
