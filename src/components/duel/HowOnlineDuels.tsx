import { Info, Link2, ShieldQuestion, Swords } from 'lucide-react';
import { cn } from '../ui/cn';

const BULLETS = [
  {
    icon: <Link2 />,
    title: 'One code, no accounts',
    body: 'The host creates a room; the code (or the share link) is all your opponent needs.',
  },
  {
    icon: <Swords />,
    title: 'Same songs, same second',
    body: 'Two solo runs through the identical seeded playlist — no buzzing in on each other. Most points wins.',
  },
  {
    icon: <ShieldQuestion />,
    title: 'Straight between browsers',
    body: 'A signalling server only introduces the two browsers; guesses and scores go straight between them.',
  },
];

export interface HowOnlineDuelsProps {
  className?: string;
}

/** The three things worth knowing before you send someone a room code. */
export function HowOnlineDuels({ className }: HowOnlineDuelsProps) {
  return (
    <section className={cn('glass rounded-3xl p-4 sm:p-6', className)} aria-labelledby="duel-how-title">
      <h2 id="duel-how-title" className="font-display text-base font-bold text-fg">
        How online duels work
      </h2>
      <ul className="mt-4 grid gap-4 sm:grid-cols-3">
        {BULLETS.map((b) => (
          <li key={b.title} className="flex gap-3">
            <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl bg-accent/15 text-accent [&>svg]:size-4">
              {b.icon}
            </span>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-fg">{b.title}</div>
              <p className="mt-0.5 text-xs leading-relaxed text-muted">{b.body}</p>
            </div>
          </li>
        ))}
      </ul>
      <p className="mt-4 flex items-start gap-2 text-xs text-muted">
        <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        Scores are self-reported by each browser — play someone you trust, or keep it friendly.
      </p>
    </section>
  );
}
