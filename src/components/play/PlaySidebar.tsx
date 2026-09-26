import { Kbd } from '@/components/ui';

/** Desktop aside while a round is open: what to do, and where the shortcuts live. */
export function PlaySidebar({ buzzer }: { buzzer: boolean }) {
  return (
    <div className="glass rounded-3xl p-4 text-sm text-muted">
      <p className="font-mono text-[11px] uppercase tracking-widest">Now playing</p>
      <p className="mt-1 text-fg">
        {buzzer ? 'First to buzz gets the guess. A wrong answer locks you out for the round.' : 'Press Space to listen, type your guess and hit Enter. Skip if you need a longer clip.'}
      </p>
      <p className="mt-2">
        Press <Kbd size="sm">?</Kbd> for all shortcuts.
      </p>
    </div>
  );
}
