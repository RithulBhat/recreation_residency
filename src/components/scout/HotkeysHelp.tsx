import { Kbd, Sheet } from '@/components/ui';
import type { ScoutSettings } from '@/scout/types';

export interface HotkeysHelpProps {
  open: boolean;
  onClose: () => void;
  settings: ScoutSettings;
}

interface Row {
  keys: string[];
  label: string;
}

export function hotkeyRows(settings: ScoutSettings): Row[] {
  return [
    { keys: ['Enter'], label: 'Submit your guess · next round' },
    { keys: ['→', 'S'], label: 'Skip this try (it still unlocks the next clue)' },
    { keys: ['G'], label: 'Give up on this one' },
    { keys: ['N'], label: 'Next round (after the reveal)' },
    { keys: ['T'], label: 'Watch the tape (after the reveal)' },
    { keys: ['Esc'], label: settings.rounds > 0 ? 'Quit the session' : 'Quit the endless run' },
    { keys: ['?'], label: 'This help' },
  ];
}

export function HotkeysHelp({ open, onClose, settings }: HotkeysHelpProps) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Keyboard shortcuts"
      description="Shortcuts pause while you are typing a guess (except Enter and Esc)."
    >
      <ul className="flex flex-col divide-y divide-border">
        {hotkeyRows(settings).map((row) => (
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
