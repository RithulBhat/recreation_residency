import { useId } from 'react';
import { cn } from './ui/cn';

export type LogoSize = 'sm' | 'md' | 'lg' | 'xl';

export interface LogoProps {
  size?: LogoSize;
  /** Render only the record glyph */
  glyphOnly?: boolean;
  className?: string;
  /** Spin the glyph */
  spinning?: boolean;
}

const sizes: Record<LogoSize, { glyph: number; text: string; gap: string }> = {
  sm: { glyph: 22, text: 'text-lg', gap: 'gap-1.5' },
  md: { glyph: 28, text: 'text-2xl', gap: 'gap-2' },
  lg: { glyph: 40, text: 'text-4xl', gap: 'gap-3' },
  xl: { glyph: 56, text: 'text-4xl sm:text-6xl', gap: 'gap-3 sm:gap-4' },
};

export function LogoGlyph({ size = 28, className, spinning }: { size?: number; className?: string; spinning?: boolean }) {
  // The gradient is referenced by id and the logo renders several times per page (header,
  // footer, hero), so every instance needs its own id or they all resolve to the first one.
  const gradientId = `sg-logo-g-${useId().replace(/\W/g, '')}`;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      aria-hidden
      className={cn('shrink-0', spinning && 'animate-spin-slow', className)}
      style={{ animationDuration: spinning ? '3s' : undefined }}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--sg-accent)" />
          <stop offset="0.55" stopColor="var(--sg-accent-2)" />
          <stop offset="1" stopColor="var(--sg-accent-3)" />
        </linearGradient>
      </defs>
      <circle cx="32" cy="32" r="30" fill="var(--sg-vinyl)" />
      <circle cx="32" cy="32" r="30" fill="none" stroke={`url(#${gradientId})`} strokeWidth="3" />
      <circle cx="32" cy="32" r="22" fill="none" stroke="var(--sg-fg)" strokeOpacity="0.14" strokeWidth="1.5" />
      <circle cx="32" cy="32" r="17" fill="none" stroke="var(--sg-fg)" strokeOpacity="0.1" strokeWidth="1.5" />
      <circle cx="32" cy="32" r="11" fill={`url(#${gradientId})`} />
      <circle cx="32" cy="32" r="3" fill="var(--sg-vinyl)" />
      <path d="M22 10 A26 26 0 0 1 54 32" fill="none" stroke="#fff" strokeOpacity="0.35" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function Logo({ size = 'md', glyphOnly = false, className, spinning }: LogoProps) {
  const s = sizes[size];
  return (
    <span className={cn('inline-flex items-center', s.gap, className)}>
      <LogoGlyph size={s.glyph} spinning={spinning} />
      {!glyphOnly && (
        <span className={cn('font-display font-black tracking-tight leading-none text-gradient', s.text)}>
          Songooner
        </span>
      )}
    </span>
  );
}
