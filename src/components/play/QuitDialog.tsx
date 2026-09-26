import { Button, Dialog } from '@/components/ui';

export interface QuitDialogProps {
  open: boolean;
  onClose: () => void;
  onQuit: () => void;
}

export function QuitDialog({ open, onClose, onQuit }: QuitDialogProps) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="sm"
      title="Quit this game?"
      description="Your score so far will be saved to your stats and you'll go straight to the results."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} data-autofocus>
            Keep playing
          </Button>
          <Button variant="danger" onClick={onQuit}>
            Quit game
          </Button>
        </>
      }
    />
  );
}
