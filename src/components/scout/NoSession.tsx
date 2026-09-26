import { Binoculars, CalendarDays, Play } from 'lucide-react';
import { Button, Card } from '@/components/ui';
import { R } from '@/routes';

/** Shown when `/scout/play` is opened with nothing in the store. */
export function NoSession() {
  return (
    <div className="mx-auto flex min-h-[60dvh] max-w-md flex-col items-center justify-center py-10 text-center">
      <Card padding="lg" glow className="w-full overflow-hidden">
        <div className="pointer-events-none absolute -right-16 -top-16 size-56 rounded-full bg-accent opacity-20 blur-3xl" aria-hidden />
        <div className="relative flex flex-col items-center">
          <div className="grid size-16 place-items-center rounded-3xl bg-gradient-accent text-accent-fg shadow-glow [&>svg]:size-7" aria-hidden>
            <Binoculars />
          </div>
          <h1 className="mt-5 font-display text-2xl font-bold text-fg">No scouting session</h1>
          <p className="mt-2 max-w-xs text-sm text-muted">
            Pick a mode and a pack and the first silhouette goes up on the board.
          </p>
          <div className="mt-7 flex flex-wrap justify-center gap-2">
            <Button to={R.scout.setup} variant="glow" size="lg" leadingIcon={<Play className="fill-current" />}>
              Set up a session
            </Button>
            <Button to={R.scout.daily} variant="secondary" size="lg" leadingIcon={<CalendarDays />}>
              Daily scout
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
