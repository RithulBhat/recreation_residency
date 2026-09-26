import { Avatar } from '../ui/Avatar';
import { Input } from '../ui/Input';
import { cn } from '../ui/cn';
import { DUEL_COLORS, DUEL_EMOJIS, type DuelLook } from './identity';

export interface IdentityPickerProps {
  name: string;
  onNameChange: (name: string) => void;
  look: DuelLook;
  onLookChange: (look: DuelLook) => void;
  /** Locked once the room is live (the opponent already knows this identity). */
  disabled?: boolean;
  className?: string;
}

/** Name + emoji + color — everything the opponent sees about you. */
export function IdentityPicker({ name, onNameChange, look, onLookChange, disabled, className }: IdentityPickerProps) {
  return (
    <div className={cn('flex flex-col gap-4', className)}>
      <div className="flex items-end gap-3">
        <Avatar emoji={look.emoji} color={look.color} size="lg" name={name || 'You'} className="mb-1" />
        <Input
          label="Your name"
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder="e.g. Ari"
          maxLength={24}
          disabled={disabled}
          autoComplete="nickname"
          spellCheck={false}
          size="lg"
          data-testid="duel-name"
          containerClassName="min-w-0 flex-1"
        />
      </div>

      <div>
        <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.18em] text-muted">Pick a face</div>
        <div className="grid grid-cols-8 gap-1.5" role="radiogroup" aria-label="Duel emoji">
          {DUEL_EMOJIS.map((emoji) => {
            const selected = emoji === look.emoji;
            return (
              <button
                key={emoji}
                type="button"
                role="radio"
                aria-checked={selected}
                aria-label={emoji}
                disabled={disabled}
                onClick={() => onLookChange({ ...look, emoji })}
                className={cn(
                  'grid aspect-square min-h-11 place-items-center rounded-xl text-xl transition-[background-color,box-shadow,transform] active:scale-90 disabled:opacity-50',
                  selected ? 'bg-surface-strong shadow-glow' : 'bg-surface hover:bg-surface-strong',
                )}
              >
                <span aria-hidden>{emoji}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.18em] text-muted">Pick a colour</div>
        <div className="grid grid-cols-8 gap-1.5" role="radiogroup" aria-label="Duel colour">
          {DUEL_COLORS.map((color) => {
            const selected = color === look.color;
            return (
              <button
                key={color}
                type="button"
                role="radio"
                aria-checked={selected}
                aria-label={`Colour ${color}`}
                disabled={disabled}
                onClick={() => onLookChange({ ...look, color })}
                className={cn(
                  'aspect-square min-h-11 w-full rounded-full transition-transform active:scale-90 disabled:opacity-50',
                  selected ? 'ring-2 ring-fg ring-offset-2 ring-offset-bg' : 'opacity-70 hover:opacity-100',
                )}
                style={{ background: color }}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
