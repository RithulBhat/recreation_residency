import { Kbd, Sheet } from '@/components/ui';
import { isScoutBuzzerDuel, scoutFormat } from '@/scout/formats';
import { SCOUT_MODES, scoutModeIsChoice } from '@/scout/packs';
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

/**
 * The shortcut sheet, per session. The two format-specific blocks matter: a buzzer duel is unplayable
 * if nobody knows A and L exist, and the tap-only boards bind bare number keys, which is the one thing
 * on this screen a player would never guess at.
 */
export function hotkeyRows(settings: ScoutSettings): Row[] {
  const format = scoutFormat(settings);
  const blitz = format === 'blitz';
  // With mixModes on, any round could turn out to be a tap-only board.
  const choice = settings.mixModes
    ? SCOUT_MODES.some((m) => scoutModeIsChoice(m.id))
    : scoutModeIsChoice(settings.mode);
  const rows: Row[] = [{ keys: ['Enter'], label: blitz ? 'Submit your guess' : 'Submit your guess · next round' }];
  if (isScoutBuzzerDuel(settings)) {
    rows.push({ keys: ['A'], label: 'Player 1 buzzes in' }, { keys: ['L'], label: 'Player 2 buzzes in' });
  }
  if (choice) {
    rows.push({ keys: ['1', '4'], label: 'Pick that card (Higher or Lower and Odd One Out)' });
    rows.push({ keys: ['←', '→'], label: 'Pick left or right (Higher or Lower)' });
  }
  rows.push(
    { keys: choice ? ['S'] : ['→', 'S'], label: 'Skip this try (it still unlocks the next clue)' },
    { keys: ['G'], label: 'Give up on this one' },
  );
  if (!blitz) {
    rows.push(
      { keys: ['N'], label: 'Next round (after the reveal)' },
      { keys: ['T'], label: 'Watch the tape (after the reveal)' },
    );
  }
  rows.push(
    { keys: ['Esc'], label: settings.rounds > 0 ? 'Quit the session' : 'Quit the endless run' },
    { keys: ['?'], label: 'This help' },
  );
  return rows;
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
