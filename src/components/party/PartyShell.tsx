import { useState, type ReactNode } from 'react';
import { Copy, LogOut, Play, UserX } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { copyToClipboard } from '@/arcade/share';
import { leaderboard, type PartyRoomState } from '@/arcade/party';
import type { PartyGame } from '@/arcade/party';

export interface PartyShellProps {
  game: PartyGame;
  title: string;
  status: string;
  error: string | null;
  code: string | null;
  selfId: string | null;
  state: PartyRoomState | null;
  onHost: (name: string) => void;
  onJoin: (code: string, name: string) => void;
  onStart: () => void;
  onKick: (playerId: string) => void;
  onLeave: () => void;
  /** The live round, rendered by the game. */
  children?: ReactNode;
}

/**
 * The parts of a party room that are the same in both games: getting in, the roster, and the
 * standings. The round itself is the game's business and comes in as children.
 *
 * Clients never receive item data — everyone rebuilds the same run from the shared seed, the
 * way Songooner's duel does. It keeps the wire small and means a client cannot read the answer
 * out of a packet before it is asked the question.
 */
export function PartyShell({
  title,
  status,
  error,
  code,
  selfId,
  state,
  onHost,
  onJoin,
  onStart,
  onKick,
  onLeave,
  children,
}: PartyShellProps) {
  const [name, setName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [copied, setCopied] = useState(false);

  const isHost = state?.players.find((p) => p.id === selfId)?.host === true;
  const connected = status === 'connected' && state !== null;

  if (!connected) {
    return (
      <div className="mx-auto flex w-full max-w-md flex-col gap-4">
        <header className="flex flex-col gap-1 text-center">
          <h1 className="font-display text-3xl font-bold text-fg">{title}</h1>
          <p className="text-sm text-muted">
            One screen hosts. Everyone else joins on their phone with the room code.
          </p>
        </header>

        {error && (
          <Card padding="md" className="text-center text-sm text-danger">
            {error}
          </Card>
        )}

        <Card padding="lg" className="flex flex-col gap-3">
          <Input
            label="Your name"
            value={name}
            maxLength={16}
            placeholder="Ana"
            onChange={(e) => setName(e.currentTarget.value)}
          />
          <Button
            size="lg"
            fullWidth
            loading={status === 'connecting'}
            disabled={name.trim() === ''}
            onClick={() => onHost(name.trim())}
          >
            Host a new room
          </Button>
        </Card>

        <Card padding="lg" className="flex flex-col gap-3">
          <Input
            label="Room code"
            value={joinCode}
            maxLength={6}
            placeholder="ABC234"
            className="font-mono uppercase tracking-[0.3em]"
            onChange={(e) => setJoinCode(e.currentTarget.value.toUpperCase())}
          />
          <Button
            size="lg"
            fullWidth
            variant="secondary"
            loading={status === 'connecting'}
            disabled={name.trim() === '' || joinCode.trim().length < 4}
            onClick={() => onJoin(joinCode.trim(), name.trim())}
          >
            Join a room
          </Button>
        </Card>
      </div>
    );
  }

  const board = leaderboard(state);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs uppercase tracking-[0.2em] text-muted">Room</span>
          <button
            type="button"
            className="flex items-center gap-1.5 rounded-xl bg-surface px-3 py-1.5 font-mono text-lg font-bold tracking-[0.2em] text-fg"
            aria-label={`Room code ${code}. Copy it.`}
            onClick={async () => {
              setCopied(await copyToClipboard(code ?? ''));
              window.setTimeout(() => setCopied(false), 2000);
            }}
          >
            {code}
            <Copy className="size-3.5 text-muted" aria-hidden />
          </button>
          {copied && <span className="text-xs text-success">Copied</span>}
        </div>
        <Button variant="ghost" size="sm" leadingIcon={<LogOut />} onClick={onLeave}>
          Leave
        </Button>
      </div>

      {state.phase === 'lobby' ? (
        <Card padding="lg" className="flex flex-col gap-4">
          <p className="text-center text-sm text-muted">
            {state.players.length === 1
              ? 'Waiting for players to join…'
              : `${state.players.length} in the room.`}
          </p>
          <ul className="flex flex-wrap justify-center gap-2">
            {state.players.map((p) => (
              <li key={p.id}>
                <span
                  className="flex items-center gap-2 rounded-full border border-border px-3 py-1.5 text-sm"
                  style={{ borderColor: p.color }}
                >
                  <span aria-hidden>{p.emoji}</span>
                  <span className="text-fg">{p.name}</span>
                  {p.host && <Badge size="sm">Host</Badge>}
                  {!p.connected && <span className="text-xs text-muted">away</span>}
                  {isHost && !p.host && (
                    <button
                      type="button"
                      aria-label={`Remove ${p.name}`}
                      className="text-muted hover:text-danger"
                      onClick={() => onKick(p.id)}
                    >
                      <UserX className="size-4" />
                    </button>
                  )}
                </span>
              </li>
            ))}
          </ul>
          {isHost ? (
            <Button
              size="xl"
              fullWidth
              leadingIcon={<Play className="fill-current" />}
              onClick={onStart}
            >
              Start the game
            </Button>
          ) : (
            <p className="text-center text-sm text-muted">The host starts when everyone is in.</p>
          )}
        </Card>
      ) : (
        <>
          {children}
          <Card padding="md">
            <ul className="flex flex-col gap-1.5">
              {board.map((p, i) => (
                <li key={p.id} className="flex items-center gap-2 text-sm">
                  <span className="w-5 text-center font-mono text-xs text-muted">{i + 1}</span>
                  <span aria-hidden>{p.emoji}</span>
                  <span className={p.connected ? 'text-fg' : 'text-muted'}>{p.name}</span>
                  {state.phase === 'question' && p.answered && (
                    <Badge tone="success" size="sm">
                      in
                    </Badge>
                  )}
                  <span className="ml-auto font-mono text-fg">{p.score.toLocaleString()}</span>
                </li>
              ))}
            </ul>
          </Card>
        </>
      )}
    </div>
  );
}
