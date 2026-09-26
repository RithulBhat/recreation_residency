import { Disc3, Play, Settings2 } from 'lucide-react';
import { Button, Card } from '@/components/ui';

/** Shown when `/play` is opened without a game in the store. */
export function NoGame() {
  return (
    <div className="mx-auto flex min-h-[60dvh] max-w-md flex-col items-center justify-center py-10 text-center">
      <Card padding="lg" glow className="w-full overflow-hidden">
        <div className="pointer-events-none absolute -right-16 -top-16 size-56 rounded-full bg-accent opacity-20 blur-3xl" aria-hidden />
        <div className="relative flex flex-col items-center">
          <div className="grid size-16 place-items-center rounded-3xl bg-gradient-accent text-accent-fg shadow-glow [&>svg]:size-7" aria-hidden>
            <Disc3 />
          </div>
          <h1 className="mt-5 font-display text-2xl font-bold text-fg">No game in progress</h1>
          <p className="mt-2 max-w-xs text-sm text-muted">Pick a mode and some packs first, then the record starts spinning.</p>
          <div className="mt-7 flex flex-wrap justify-center gap-2">
            <Button to="/setup" variant="glow" size="lg" leadingIcon={<Play className="fill-current" />}>
              Set up a game
            </Button>
            <Button to="/daily" variant="secondary" size="lg" leadingIcon={<Settings2 />}>
              Daily challenge
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
