import { useState } from 'react';
import { HelpCircle, Lock } from 'lucide-react';
import { cn } from '@/components/ui';
import type { ScoutPersonCard } from '@/scout/types';

/**
 * One player on a choice-shaped board.
 *
 * The photo is the transparent-background ESPN headshot, so it sits on a tinted plate rather than in
 * a frame; when the CDN has no picture for a man (or the network is gone) the plate keeps his
 * initials instead of collapsing, because the NAME is the clue and the photo is the decoration.
 *
 * Pass `onPick` and the card becomes a real `<button>`: that is the whole answer mechanism for
 * Higher or Lower and Odd One Out, which never touch the guess box.
 */

export type PuzzleCardState =
  /** in play */
  | 'idle'
  /** struck out by the ladder — still visible, no longer choosable */
  | 'ruledOut'
  /** the card this player just chose */
  | 'picked'
  /** the right answer, on the reveal */
  | 'answer'
  /** a card this player chose and got wrong */
  | 'missed';

/**
 * What the line under the name says.
 *
 * It matters which one a board picks: an Odd One Out round about CLUBS would be over the moment the
 * cards printed 'KC · KC · KC · BUF', and a Depth Chart would answer itself. Each stage chooses the
 * line that does not give its own question away.
 */
export type PuzzleCardDetail =
  /** 'WR · KC' */
  | 'position'
  /** 'Rd 1, pk 10' — never the year, which is the Draft Class answer */
  | 'draft'
  /** '#15 · QB' — never the club, which is the Depth Chart answer */
  | 'jersey'
  /** 'KC' alone — for a round whose question is the position group */
  | 'club'
  | 'none';

export interface PuzzleCardProps {
  card: ScoutPersonCard;
  detail?: PuzzleCardDetail;
  state?: PuzzleCardState;
  /** Renders the card as a button and fires with the card that was tapped. */
  onPick?: (card: ScoutPersonCard) => void;
  disabled?: boolean;
  /** 1-based hotkey badge, drawn only on pickable cards. */
  hotkey?: number;
  /** A value shown in a pill on the card — the stat in a Higher or Lower reveal. */
  value?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

function initials(name: string): string {
  const parts = name.split(' ').filter((p) => p !== '');
  if (parts.length === 0) return '?';
  const first = parts[0][0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1][0] ?? '') : '';
  return `${first}${last}`.toUpperCase();
}

function detailText(card: ScoutPersonCard, detail: PuzzleCardDetail): string {
  if (detail === 'none') return '';
  if (detail === 'draft') {
    return card.draftRound === undefined ? 'Undrafted' : `Rd ${card.draftRound}, pk ${card.draftPick ?? '?'}`;
  }
  if (detail === 'jersey') {
    return [card.jersey ? `#${card.jersey}` : '', card.pos].filter((s) => s !== '').join(' · ');
  }
  if (detail === 'club') return card.teamAbbr ?? '';
  return [card.pos, card.teamAbbr].filter((s) => s !== undefined && s !== '').join(' · ');
}

const PHOTO_SIZE: Record<'sm' | 'md' | 'lg', string> = {
  sm: 'h-16',
  md: 'h-20',
  lg: 'h-28 sm:h-36',
};

const STATE_RING: Record<PuzzleCardState, string> = {
  idle: 'border-border',
  ruledOut: 'border-border opacity-45',
  picked: 'border-accent ring-2 ring-accent',
  answer: 'border-success ring-2 ring-success',
  missed: 'border-danger ring-2 ring-danger opacity-80',
};

/** The photo plate: transparent PNG over a tint, initials when the image will not load. */
function CardPhoto({ card, size }: { card: ScoutPersonCard; size: 'sm' | 'md' | 'lg' }) {
  const [broken, setBroken] = useState(false);
  return (
    <div
      className={cn(
        'relative grid w-full place-items-end overflow-hidden rounded-2xl bg-surface',
        PHOTO_SIZE[size],
      )}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-70"
        style={{
          background:
            'radial-gradient(90% 80% at 50% 110%, color-mix(in oklab, var(--sg-accent-2-vivid) 22%, transparent), transparent 70%)',
        }}
      />
      {broken ? (
        <span className="absolute inset-0 grid place-items-center font-display text-lg font-bold text-fg/70">
          {initials(card.name)}
        </span>
      ) : (
        <img
          src={card.image}
          alt=""
          className="relative h-full w-full object-contain object-bottom"
          loading="lazy"
          decoding="async"
          onError={() => setBroken(true)}
        />
      )}
    </div>
  );
}

export function PuzzleCard({
  card,
  detail = 'position',
  state = 'idle',
  onPick,
  disabled = false,
  hotkey,
  value,
  size = 'md',
  className,
}: PuzzleCardProps) {
  const pickable = onPick !== undefined && !disabled && state !== 'ruledOut';
  const sub = detailText(card, detail);
  const body = (
    <>
      <CardPhoto card={card} size={size} />
      <div className="mt-2 min-w-0">
        <div className={cn('truncate font-semibold leading-tight text-fg', size === 'lg' ? 'text-base' : 'text-sm')}>
          {card.name}
        </div>
        {sub !== '' && <div className="truncate font-mono text-[11px] uppercase tracking-[0.1em] text-muted">{sub}</div>}
      </div>
      {value !== undefined && (
        <div className="mt-2 rounded-xl bg-surface px-2 py-1 text-center font-mono text-sm font-bold text-fg">{value}</div>
      )}
      {hotkey !== undefined && pickable && (
        <span
          aria-hidden
          className="absolute right-2 top-2 grid size-5 place-items-center rounded-lg border border-border-strong bg-bg-elevated/90 font-mono text-[10px] font-bold text-muted"
        >
          {hotkey}
        </span>
      )}
      {state === 'ruledOut' && (
        <>
          <span aria-hidden className="pointer-events-none absolute inset-0 grid place-items-center">
            <span className="h-0.5 w-[92%] rotate-[-14deg] rounded-full bg-danger" />
          </span>
          <span className="absolute right-2 top-2 rounded-lg border border-danger/50 bg-danger/15 px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-[0.12em] text-danger">
            Out
          </span>
        </>
      )}
    </>
  );

  const shell = cn(
    'relative flex min-w-0 flex-col rounded-3xl border bg-bg-elevated/70 p-2.5 text-left transition-[border-color,box-shadow,transform] duration-200',
    STATE_RING[state],
    pickable && 'hover:border-border-strong hover:shadow-glow active:scale-[0.98] cursor-pointer',
    className,
  );

  if (!pickable) {
    return (
      <div className={shell} data-testid="scout-puzzle-card" data-player={card.playerId} data-state={state}>
        {body}
      </div>
    );
  }
  return (
    <button
      type="button"
      className={shell}
      onClick={() => onPick?.(card)}
      data-testid="scout-puzzle-card"
      data-player={card.playerId}
      data-state={state}
      aria-label={`Pick ${card.name}`}
    >
      {body}
    </button>
  );
}

/** A card the ladder has not paid out yet. */
export function LockedCard({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  return (
    <div
      className="flex min-w-0 flex-col rounded-3xl border border-dashed border-border bg-surface/40 p-2.5 opacity-60"
      data-testid="scout-puzzle-locked"
      aria-hidden
    >
      <div className={cn('grid w-full place-items-center rounded-2xl bg-surface', PHOTO_SIZE[size])}>
        <Lock className="size-4 text-muted" />
      </div>
      <div className="mt-2 h-3 w-4/5 rounded-full bg-fg/10" />
      <div className="mt-1.5 h-2 w-2/5 rounded-full bg-fg/10" />
    </div>
  );
}

export interface MysteryCardProps {
  /** 'Who is he?' — what the round is asking. */
  label: string;
  revealed?: boolean;
  /** The answer, once the round is over. */
  answer?: string;
  /** Headshot or club logo for the reveal. */
  image?: string;
  /** Shown instead of a photo — the draft year, typeset big. */
  big?: string;
  size?: 'sm' | 'md' | 'lg';
}

/**
 * The slot where the answer goes: a question mark while the round is live, the real face (or crest,
 * or year) once it is over. It is what makes these boards ask their question without a sentence.
 */
export function MysteryCard({ label, revealed = false, answer, image, big, size = 'md' }: MysteryCardProps) {
  const [broken, setBroken] = useState(false);
  const showImage = revealed && image !== undefined && image !== '' && !broken && big === undefined;
  return (
    <div
      className={cn(
        'relative flex min-w-0 flex-col rounded-3xl border p-2.5',
        revealed ? 'border-success bg-success/10' : 'border-accent/50 bg-accent/10 shadow-glow',
      )}
      data-testid="scout-puzzle-mystery"
      data-revealed={revealed ? 'true' : 'false'}
    >
      <div className={cn('relative grid w-full place-items-center overflow-hidden rounded-2xl bg-surface', PHOTO_SIZE[size])}>
        {showImage ? (
          <img
            src={image}
            alt=""
            className="h-full w-full object-contain"
            loading="lazy"
            decoding="async"
            onError={() => setBroken(true)}
          />
        ) : revealed && big !== undefined ? (
          <span className="font-mono text-2xl font-bold text-fg sm:text-3xl">{big}</span>
        ) : (
          <HelpCircle className={cn('text-accent', size === 'lg' ? 'size-10' : 'size-7')} aria-hidden />
        )}
      </div>
      <div className="mt-2 min-w-0">
        <div className={cn('font-semibold leading-tight', revealed ? 'line-clamp-2 text-fg' : 'truncate text-accent')}>
          {revealed && answer !== undefined ? answer : label}
        </div>
        <div className="truncate font-mono text-[11px] uppercase tracking-[0.1em] text-muted">
          {revealed ? 'The answer' : 'Your call'}
        </div>
      </div>
    </div>
  );
}
