import { useState } from 'react';
import { Check, Share2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { copyToClipboard, renderShare, type ShareCard } from '@/arcade/share';

export interface ShareButtonProps {
  card: ShareCard;
  className?: string;
}

/**
 * Copy a result grid.
 *
 * Says "Copied" only when the copy actually succeeded. The clipboard API is blocked often enough
 * — insecure origins, Safari without a user gesture — that claiming success unconditionally
 * would regularly be a lie, and a share button that lies is worse than one that fails loudly.
 * On failure the text is rendered so it can be selected by hand.
 */
export function ShareButton({ card, className }: ShareButtonProps) {
  const [status, setStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
  const text = renderShare(card);

  return (
    <div className={className}>
      <Button
        fullWidth
        size="lg"
        variant={status === 'copied' ? 'secondary' : 'primary'}
        leadingIcon={status === 'copied' ? <Check /> : <Share2 />}
        onClick={async () => {
          setStatus((await copyToClipboard(text)) ? 'copied' : 'failed');
          window.setTimeout(() => setStatus('idle'), 2500);
        }}
      >
        {status === 'copied' ? 'Copied' : status === 'failed' ? 'Copy failed' : 'Share result'}
      </Button>
      {status === 'failed' && (
        <pre className="mt-2 max-h-40 overflow-auto rounded-xl bg-surface p-3 text-center text-xs text-muted">
          {text}
        </pre>
      )}
    </div>
  );
}
