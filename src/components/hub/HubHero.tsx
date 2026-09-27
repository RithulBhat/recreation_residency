import { GAME_LABEL } from '@/routes';
import { Link } from 'react-router';
import { ArrowRight, ChartColumn } from 'lucide-react';
import { R, RESIDENCY_NAME } from '@/routes';
import { MODE_LABEL } from '@/components/setup/summary';
import { relativeTime, useLastVisit } from './useLastVisit';

/** "Rithul's Recreation" + "Residency" — the last word carries the gradient. */
function splitName(name: string): [string, string] {
  const cut = name.lastIndexOf(' ');
  return cut < 0 ? ['', name] : [name.slice(0, cut), name.slice(cut + 1)];
}

/**
 * Shown only when this device has actually finished a game. No games, no line — a first visit gets
 * a clean front door instead of an empty state.
 */
function WelcomeBack() {
  const visit = useLastVisit();
  if (visit === null) return null;
  const { rank, last } = visit;
  return (
    <p
      data-testid="hub-welcome-back"
      className="glass flex max-w-full flex-wrap items-center justify-center gap-x-2 gap-y-1 rounded-2xl px-4 py-2 text-xs text-muted sm:rounded-full sm:text-sm"
    >
      <span className="font-semibold text-fg">
        <span aria-hidden>{rank.emoji}</span> Welcome back, {rank.title}
      </span>
      <span aria-hidden className="text-muted/50">
        ·
      </span>
      {last === null ? (
        <span>
          {visit.games} {visit.games === 1 ? 'game' : 'games'} played
        </span>
      ) : (
        <span>
          last run {MODE_LABEL[last.mode]}, {last.score.toLocaleString()} pts, {relativeTime(last.finishedAt)}
        </span>
      )}
      <Link
        to={R.songooner.stats}
        className="inline-flex items-center gap-1 font-semibold text-accent hover:underline"
      >
        <ChartColumn className="size-3.5" aria-hidden />
        Pick up where you left off
        <ArrowRight className="size-3.5" aria-hidden />
      </Link>
    </p>
  );
}

/**
 * The marquee. Two lamps, the name, one line about what this is — and the page's only `<h1>`.
 *
 * It is deliberately SHORTER from `lg` up than it is on a phone's scroll: on a 1440 x 900 laptop —
 * the screen this is played on — a marquee sized for a big monitor pushed both "Play now" buttons
 * 97 px below the fold and cut the game cards mid-sentence, so the front door asked for a scroll
 * before it offered a game.
 */
/**
 * Spelled from the real `GameKey` list rather than typed as a word.
 *
 * "Two games, one house" was true when it was written and silently stopped being true the moment
 * a third arrived — the same failure as a card advertising seven clue modes for a game with
 * thirteen. Deriving it means the front door cannot lie about how many games are behind it.
 */
const GAME_WORDS = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight'] as const;
const GAME_COUNT_WORD =
  GAME_WORDS[Object.keys(GAME_LABEL).length] ?? String(Object.keys(GAME_LABEL).length);

export function HubHero() {
  const [lead, last] = splitName(RESIDENCY_NAME);
  return (
    <section className="relative isolate flex flex-col items-center gap-3.5 overflow-x-clip pt-1 text-center sm:gap-5 sm:pt-6 lg:gap-3.5 lg:pt-1">
      {/* Light spilling out from under the marquee. */}
      <div
        className="pointer-events-none absolute -top-24 left-1/2 -z-10 h-56 w-[min(44rem,100%)] -translate-x-1/2 rounded-[50%] bg-gradient-accent opacity-[0.22] blur-[70px]"
        aria-hidden
      />

      <div className="relative flex items-center gap-2.5">
        <span className="hub-lamp size-1.5 rounded-full" aria-hidden />
        <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.28em] text-fg/70">
          {GAME_COUNT_WORD} games, one house
        </span>
        <span className="hub-lamp hub-lamp-b size-1.5 rounded-full" aria-hidden />
      </div>

      <h1 className="relative max-w-full font-display text-[clamp(1.75rem,8.6vw,2.6rem)] font-black leading-[0.98] tracking-tight text-fg sm:text-6xl lg:text-[3.35rem] 2xl:text-[4.2rem]">
        {lead && <span>{lead} </span>}
        <span className="text-gradient">{last}</span>
      </h1>

      <p className="relative max-w-2xl text-balance text-sm text-muted sm:text-lg lg:text-base 2xl:text-lg">
        Name a song from a heartbeat of audio. Name the NFL player behind a silhouette. Guess what
        something costs, or which of two numbers is bigger. Free, no sign-up, nothing to install.
      </p>

      <WelcomeBack />
    </section>
  );
}
