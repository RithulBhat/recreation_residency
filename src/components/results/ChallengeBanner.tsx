import { Trophy } from 'lucide-react';
import type { Challenger } from '@/store/resultStore';
import { cn } from '@/components/ui';
import { points } from '@/components/play/format';

export interface ChallengeBannerProps {
  challenger: Challenger;
  score: number;
}

export function challengeLine(challenger: Challenger, score: number): { text: string; beat: boolean | null } {
  const name = challenger.by.trim() || 'Your friend';
  if (score > challenger.score) return { text: `You beat ${name}'s ${points(challenger.score)}!`, beat: true };
  if (score < challenger.score) return { text: `${name} still leads with ${points(challenger.score)}.`, beat: false };
  return { text: `Dead heat with ${name} at ${points(score)}.`, beat: null };
}

export function ChallengeBanner({ challenger, score }: ChallengeBannerProps) {
  const line = challengeLine(challenger, score);
  return (
    <section
      className={cn(
        'glass flex items-center gap-3 rounded-3xl border px-4 py-3',
        line.beat === true && 'border-success/40 glow',
        line.beat === false && 'border-danger/30',
      )}
      role="status"
      data-testid="challenge-banner"
    >
      <Trophy className={cn('size-5 shrink-0', line.beat === true ? 'text-success' : line.beat === false ? 'text-danger' : 'text-warn')} aria-hidden />
      <p className="font-display text-base font-bold text-fg">{line.text}</p>
    </section>
  );
}
