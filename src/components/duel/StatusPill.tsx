import type { ReactNode } from 'react';
import { Check, Loader, PlugZap, Radio, TriangleAlert, Unplug, Wifi } from 'lucide-react';
import type { DuelPhase } from '@/net';
import { Badge, type BadgeTone } from '../ui/Badge';
import { cn } from '../ui/cn';

export interface StatusPillProps {
  status: DuelPhase;
  /** Round-trip time, shown next to the pill once the first pong lands. */
  latencyMs?: number;
  className?: string;
}

interface Look {
  label: string;
  tone: BadgeTone;
  icon: ReactNode;
  dot?: boolean;
}

const LOOKS: Record<DuelPhase, Look> = {
  idle: { label: 'Offline', tone: 'neutral', icon: <Unplug /> },
  connecting: { label: 'Connecting…', tone: 'accent', icon: <Loader className="animate-spin-slow" />, dot: true },
  waiting: { label: 'Waiting for opponent', tone: 'warn', icon: <Radio />, dot: true },
  connected: { label: 'Connected', tone: 'success', icon: <Check /> },
  playing: { label: 'Racing', tone: 'gradient', icon: <PlugZap /> },
  finished: { label: 'Finished', tone: 'neutral', icon: <Check /> },
  error: { label: 'Connection problem', tone: 'danger', icon: <TriangleAlert /> },
  closed: { label: 'Disconnected', tone: 'danger', icon: <Unplug /> },
};

/** The live connection state of the room, as one glanceable pill. */
export function StatusPill({ status, latencyMs = 0, className }: StatusPillProps) {
  const look = LOOKS[status];
  const showPing = latencyMs > 0 && (status === 'connected' || status === 'playing' || status === 'finished');
  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)} role="status" aria-live="polite">
      <Badge tone={look.tone} icon={look.icon} dot={look.dot} data-testid="duel-status">
        {look.label}
      </Badge>
      {showPing && (
        <span className="inline-flex items-center gap-1 font-mono text-[11px] tabular text-muted">
          <Wifi className="size-3" aria-hidden />
          {latencyMs} ms
        </span>
      )}
    </div>
  );
}
