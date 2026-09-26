import { LogoGlyph } from './Logo';
import { cn } from './ui/cn';

export function BrandedLoader({ label = 'Loading…', className, fullscreen }: { label?: string; className?: string; fullscreen?: boolean }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn('flex flex-col items-center justify-center gap-4 text-muted', fullscreen ? 'min-h-[60dvh]' : 'py-16', className)}
    >
      <div className="relative">
        <div className="absolute -inset-4 rounded-full bg-gradient-accent opacity-30 blur-xl animate-pulse-soft" aria-hidden />
        <LogoGlyph size={48} spinning className="relative" />
      </div>
      <span className="font-mono text-xs uppercase tracking-widest">{label}</span>
    </div>
  );
}
