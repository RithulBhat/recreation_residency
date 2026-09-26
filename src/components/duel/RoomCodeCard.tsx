import { useState } from 'react';
import { Check, Copy, Share2 } from 'lucide-react';
import { Button } from '../ui/Button';
import { useToast } from '../ui/Toast';
import { cn } from '../ui/cn';
import { R } from '@/routes';

export interface RoomCodeCardProps {
  code: string;
  /** Smaller treatment for the guest (they already know the code). */
  compact?: boolean;
  className?: string;
}

/** The share link for a room: `…/#/songooner/duel?join=CODE`, safe to paste anywhere. */
export function duelShareUrl(code: string): string {
  if (typeof window === 'undefined') return `#${R.songooner.duel}?join=${code}`;
  const { origin, pathname, search } = window.location;
  return `${origin}${pathname}${search}#${R.songooner.duel}?join=${code}`;
}

async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through to the legacy path */
  }
  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(area);
    return ok;
  } catch {
    return false;
  }
}

/** The room code, big enough to read across a table, with copy + share. */
export function RoomCodeCard({ code, compact = false, className }: RoomCodeCardProps) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const chars = code.split('');

  const flash = (): void => {
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  const onCopy = async (): Promise<void> => {
    const ok = await copyText(code);
    if (ok) flash();
    toast(
      ok
        ? { title: 'Room code copied', description: code, tone: 'success' }
        : { title: "Couldn't copy", description: `Read it out instead: ${code}`, tone: 'danger' },
    );
  };

  const onShare = async (): Promise<void> => {
    const url = duelShareUrl(code);
    const data = { title: 'Songooner duel', text: `Join my Songooner duel — room ${code}`, url };
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share(data);
        return;
      } catch (e) {
        // A cancelled share sheet is not an error worth shouting about.
        if (e instanceof DOMException && e.name === 'AbortError') return;
      }
    }
    const ok = await copyText(url);
    toast(
      ok
        ? { title: 'Invite link copied', description: 'Paste it to your opponent.', tone: 'success' }
        : { title: "Couldn't copy the link", description: url, tone: 'danger' },
    );
  };

  return (
    <div className={cn('flex flex-col items-center gap-3', className)}>
      <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-accent">Room code</div>

      <div
        className="flex w-full max-w-md justify-center gap-1.5 sm:gap-2"
        data-testid="room-code"
        data-code={code}
        aria-label={`Room code ${chars.join(' ')}`}
      >
        {chars.map((ch, i) => (
          <span
            key={`${ch}-${i}`}
            aria-hidden
            className={cn(
              'glass-strong grid flex-1 place-items-center rounded-2xl font-display font-black leading-none text-fg',
              compact ? 'h-12 max-w-12 text-xl' : 'h-14 max-w-14 text-2xl sm:h-20 sm:max-w-20 sm:text-4xl',
            )}
          >
            {ch}
          </span>
        ))}
      </div>

      <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
        <Button
          variant="secondary"
          size={compact ? 'md' : 'lg'}
          onClick={() => void onCopy()}
          leadingIcon={copied ? <Check /> : <Copy />}
        >
          {copied ? 'Copied' : 'Copy code'}
        </Button>
        {!compact && (
          <Button variant="primary" size="lg" onClick={() => void onShare()} leadingIcon={<Share2 />}>
            Share link
          </Button>
        )}
      </div>
    </div>
  );
}
