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
      title="Quit this session?"
      description="Everything you have scored so far is kept, and you go straight to the results."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} data-autofocus>
            Keep scouting
          </Button>
          <Button variant="danger" onClick={onQuit} data-testid="scout-quit-confirm">
            Quit session
          </Button>
        </>
      }
    />
  );
}
