import { Disc3, Keyboard, Library } from 'lucide-react';
import { cn } from './ui/cn';
import { SectionHeading } from './SectionHeading';

const steps = [
  {
    icon: <Library />,
    title: 'Pick your packs',
    text: 'Mix any of 150+ packs — genres, decades, regions, artists, soundtracks. Or let the daily pick for you.',
  },
  {
    icon: <Disc3 />,
    title: 'Drop the needle',
    text: 'Hit the record. You get 0.1 seconds. Replay it, or extend the clip and trade points for time.',
  },
  {
    icon: <Keyboard />,
    title: 'Name that track',
    text: 'Type it, or say it out loud in voice mode. Faster and shorter clips score higher. Build streaks.',
  },
];

export function HowItWorks({ className }: { className?: string }) {
  return (
    <section className={cn('', className)} aria-labelledby="how-it-works">
      <SectionHeading
        eyebrow="How it plays"
        title="Three steps. Zero setup."
        description="No accounts, no downloads. Everything runs in your browser."
        as="h2"
        className="mb-6"
      />
      <ol className="grid gap-3 sm:grid-cols-3 sm:gap-4">
        {steps.map((s, i) => (
          <li key={s.title} className="glass relative overflow-hidden rounded-3xl p-5">
            <span className="pointer-events-none absolute -right-3 -top-6 font-display text-[7rem] font-black leading-none text-fg/[0.045] select-none" aria-hidden>
              {i + 1}
            </span>
            <div className="relative flex items-center gap-3">
              <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-gradient-accent text-accent-fg shadow-glow [&>svg]:size-5" aria-hidden>
                {s.icon}
              </span>
              <span className="font-mono text-xs font-semibold uppercase tracking-widest text-muted">Step {i + 1}</span>
            </div>
            <h3 id={i === 0 ? 'how-it-works' : undefined} className="relative mt-4 font-display text-lg font-bold text-fg">
              {s.title}
            </h3>
            <p className="relative mt-1.5 text-sm text-muted">{s.text}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
