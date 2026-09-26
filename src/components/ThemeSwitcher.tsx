import { Check, Palette } from 'lucide-react';
import { THEMES, type ThemeName } from '@/hooks/useTheme';
import { cn } from './ui/cn';
import { IconButton } from './ui/IconButton';
import { Popover } from './ui/Popover';

export interface ThemeSwitcherProps {
  theme: ThemeName;
  onChange: (t: ThemeName) => void;
  className?: string;
}

/** Prop-driven theme picker: a Palette icon button opening a popover with 4 swatch cards. */
export function ThemeSwitcher({ theme, onChange, className }: ThemeSwitcherProps) {
  return (
    <Popover
      aria-label="Choose a theme"
      width={272}
      trigger={<IconButton aria-label="Theme" icon={<Palette />} className={className} />}
    >
      <ThemeGrid theme={theme} onChange={onChange} />
    </Popover>
  );
}

export function ThemeGrid({ theme, onChange, className }: ThemeSwitcherProps) {
  return (
    <div className={cn('grid grid-cols-2 gap-1.5', className)} role="radiogroup" aria-label="Theme">
      {THEMES.map((t) => {
        const selected = t.id === theme;
        return (
          <button
            key={t.id}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(t.id)}
            className={cn(
              'group relative flex flex-col gap-2 rounded-xl border p-2 text-left transition-[border-color,background-color,transform] active:scale-[0.98]',
              selected ? 'border-accent bg-accent/10' : 'border-transparent hover:bg-surface',
            )}
          >
            <span
              className="relative block h-12 w-full overflow-hidden rounded-lg border border-black/10"
              style={{ background: t.swatches[0] }}
              aria-hidden
            >
              <span
                className="absolute -right-2 -top-2 size-10 rounded-full opacity-90 blur-[6px]"
                style={{ background: `linear-gradient(135deg, ${t.swatches[2]}, ${t.swatches[3]})` }}
              />
              <span className="absolute bottom-2 left-2 h-1.5 w-8 rounded-full" style={{ background: t.swatches[1], opacity: 0.85 }} />
              <span className="absolute bottom-2 left-11 h-1.5 w-4 rounded-full" style={{ background: t.swatches[2] }} />
              {selected && (
                <span className="absolute right-1.5 top-1.5 grid size-5 place-items-center rounded-full bg-accent-solid text-accent-fg">
                  <Check className="size-3" strokeWidth={3} />
                </span>
              )}
            </span>
            <span className="px-0.5">
              <span className="block text-xs font-bold text-fg">{t.name}</span>
              <span className="block text-[10px] leading-tight text-muted">{t.blurb}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
