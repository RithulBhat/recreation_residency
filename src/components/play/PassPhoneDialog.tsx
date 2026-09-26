import type { PlayerState } from '@/types';
import { Avatar, Button, Dialog } from '@/components/ui';

export interface PassPhoneDialogProps {
  player: PlayerState | null;
  onReady: () => void;
}

/** Pass-and-play interstitial: hides the screen until the next player taps "I'm ready". */
export function PassPhoneDialog({ player, onReady }: PassPhoneDialogProps) {
  return (
    <Dialog open={player !== null} onClose={onReady} dismissible={false} hideClose align="center" size="sm" glow>
      {player && (
        <div className="flex flex-col items-center py-2">
          <Avatar emoji={player.emoji} color={player.color} size="xl" name={player.name} active />
          <p className="mt-5 font-mono text-[11px] uppercase tracking-widest text-muted">Pass the phone</p>
          <h2 className="mt-1 font-display text-2xl font-bold text-fg">{player.name}, you&apos;re up</h2>
          <p className="mt-2 text-sm text-muted">No peeking at the last answer.</p>
          <Button variant="glow" size="lg" className="mt-6" onClick={onReady} data-autofocus>
            I&apos;m ready
          </Button>
        </div>
      )}
    </Dialog>
  );
}
