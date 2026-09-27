import { Delete } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { cn } from '@/components/ui/cn';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '00', '0'] as const;

export interface PriceKeypadProps {
  value: string;
  onChange: (next: string) => void;
  onSubmit: () => void;
  disabled?: boolean;
  submitLabel?: string;
  className?: string;
}

/**
 * A currency keypad rather than a bare number input.
 *
 * The native numeric keyboard on iOS still offers a decimal point and a minus sign, both of
 * which the engine rejects — a player who types one gets silence. A keypad can only produce
 * values the game accepts, and the digits stay large enough to hit on a phone without zooming.
 */
export function PriceKeypad({
  value,
  onChange,
  onSubmit,
  disabled = false,
  submitLabel = 'Lock it in',
  className,
}: PriceKeypadProps) {
  const push = (key: string) => {
    if (disabled) return;
    // 12 digits is far beyond any price we ship and keeps the display from overflowing
    const next = (value === '0' ? '' : value) + key;
    onChange(next.replace(/^0+(?=\d)/, '').slice(0, 12));
  };

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <div className="grid grid-cols-3 gap-2">
        {KEYS.map((k) => (
          <Button
            key={k}
            variant="ghost"
            size="lg"
            disabled={disabled}
            onClick={() => push(k)}
            className="h-14 font-mono text-lg"
            aria-label={k === '00' ? 'Add double zero' : `Add ${k}`}
          >
            {k}
          </Button>
        ))}
        <IconButton
          size="lg"
          variant="ghost"
          shape="square"
          disabled={disabled || value === ''}
          aria-label="Delete last digit"
          onClick={() => onChange(value.slice(0, -1))}
          icon={<Delete />}
          className="h-14 w-full"
        />
      </div>
      <Button
        size="lg"
        fullWidth
        disabled={disabled || value === ''}
        onClick={onSubmit}
      >
        {submitLabel}
      </Button>
    </div>
  );
}
