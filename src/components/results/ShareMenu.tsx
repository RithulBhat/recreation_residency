import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Image as ImageIcon, Link2, Share2 } from 'lucide-react';
import { Button, cn, useEscape, useOnClickOutside } from '@/components/ui';

export interface ShareMenuProps {
  /** Result card: the picture plus its caption. */
  onCard: () => void | Promise<void>;
  /** Challenge link: same songs, same seed, beat my score. */
  onChallenge: () => void | Promise<void>;
  /** A card is being painted — the trigger shows a spinner and stays put. */
  busy?: boolean;
  className?: string;
}

function Item({ icon, title, hint, onSelect, testId }: { icon: ReactNode; title: string; hint: string; onSelect: () => void; testId: string }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onSelect}
      data-testid={testId}
      className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-surface-strong focus-visible:bg-surface-strong focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent-2"
    >
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-gradient-accent text-accent-fg [&>svg]:size-5" aria-hidden>
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-fg">{title}</span>
        <span className="block text-xs text-muted">{hint}</span>
      </span>
    </button>
  );
}

/**
 * One `Share` button, two ways out: the result card (picture + caption) or a challenge link.
 * A `menu` popover: opens on click/Enter/Space, arrows move, Escape and outside clicks close and
 * hand focus back to the trigger.
 */
export function ShareMenu({ onCard, onChallenge, busy = false, className }: ShareMenuProps) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const reduce = useReducedMotion();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useOnClickOutside([triggerRef, panelRef], () => setOpen(false), open);
  useEscape(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, open);
  useEffect(() => {
    if (open) panelRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
  }, [open]);

  const choose = (action: () => void | Promise<void>) => () => {
    setOpen(false);
    triggerRef.current?.focus();
    void action();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const items = Array.from(panelRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
    if (items.length === 0) return;
    const current = items.findIndex((el) => el === document.activeElement);
    let next: number | null = null;
    if (e.key === 'ArrowDown') next = (current + 1) % items.length;
    else if (e.key === 'ArrowUp') next = (current - 1 + items.length) % items.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = items.length - 1;
    else if (e.key === 'Tab') {
      setOpen(false);
      return;
    }
    if (next !== null) {
      e.preventDefault();
      items[next]?.focus();
    }
  };

  return (
    <div className={cn('relative', className)}>
      <Button
        ref={triggerRef}
        variant="secondary"
        size="lg"
        fullWidth
        leadingIcon={<Share2 />}
        loading={busy}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? `${id}-menu` : undefined}
        onClick={() => setOpen((o) => !o)}
        data-testid="share-button"
      >
        Share
      </Button>
      <AnimatePresence>
        {open && (
          <motion.div
            ref={panelRef}
            id={`${id}-menu`}
            role="menu"
            aria-label="Share"
            onKeyDown={onKeyDown}
            data-testid="share-menu"
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: -6, scale: 0.97 }}
            transition={{ duration: 0.16, ease: 'easeOut' }}
            className="glass-strong absolute right-0 top-full z-50 mt-2 w-[min(20rem,calc(100vw-2rem))] origin-top-right rounded-2xl bg-bg-elevated/95 p-1.5 shadow-xl"
          >
            <Item icon={<ImageIcon />} title="Result card" hint="A picture of this run, caption included. Post-ready." onSelect={choose(onCard)} testId="share-card" />
            <Item icon={<Link2 />} title="Challenge link" hint="Same songs, same order. Beat my score." onSelect={choose(onChallenge)} testId="share-challenge" />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
