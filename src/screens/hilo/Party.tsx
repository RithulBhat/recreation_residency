import { useCallback, useMemo } from 'react';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { PartyShell } from '@/components/party/PartyShell';
import { HiloCard } from '@/components/hilo/HiloCard';
import { usePartyRoom } from '@/arcade/party';
import { createRng } from '@/game/rng';
import { buildSequence, directionOf } from '@/arcade/pairing';
import { resolveRunPool } from '@/hilo/pool';
import { measureFor } from '@/hilo/measure';
import { DEFAULT_SETTINGS, reconcile } from '@/hilo/settings';

const PARTY_ROUNDS = 10;
/** Points per correct call, flat — a party race is about the streak, not a curve. */
const POINTS = 100;

export default function HiloParty() {
  const party = usePartyRoom();

  const settings = useMemo(
    () => reconcile({ ...DEFAULT_SETTINGS, format: 'rounds', rounds: PARTY_ROUNDS }),
    [],
  );

  /** Everyone rebuilds the identical chain from the shared seed — the race is genuinely fair. */
  const chain = useMemo(() => {
    const seed = party.state?.seed;
    if (!seed) return [];
    const pool = resolveRunPool(settings.packIds, createRng(seed)).items;
    return buildSequence(pool, settings.difficulty, PARTY_ROUNDS + 1, createRng(seed)).steps.map(
      (s) => s.item,
    );
  }, [party.state?.seed, settings]);

  const index = party.state?.round ?? 0;
  const from = chain[index];
  const to = chain[index + 1];
  const phase = party.state?.phase;
  const isHost = party.state?.players.find((p) => p.id === party.selfId)?.host === true;
  const me = party.state?.players.find((p) => p.id === party.selfId);

  // 1 means "higher", 0 means "lower" — the room only carries numbers.
  const answer = from && to ? (directionOf(from.value, to.value) === 'lower' ? 0 : 1) : null;

  const pick = useCallback(
    (higher: boolean) => {
      const value = higher ? 1 : 0;
      if (party.role === 'host') {
        party.apply({ type: 'answer', playerId: party.selfId ?? '', value });
      } else {
        party.send({ type: 'answer', value });
      }
    },
    [party],
  );

  const reveal = useCallback(() => {
    const state = party.state;
    if (!state || answer === null) return;
    const scores: Record<string, number> = {};
    for (const [playerId, value] of Object.entries(state.answers)) {
      scores[playerId] = value === answer ? POINTS : 0;
    }
    party.apply({ type: 'score', scores });
    party.apply({ type: 'reveal', by: party.selfId ?? '' });
  }, [party, answer]);

  return (
    <PartyShell
      game="hilo"
      title="Higher or Lower — Party"
      status={party.status}
      error={party.error}
      code={party.code}
      selfId={party.selfId}
      state={party.state}
      onHost={(name) => void party.host('hilo', { name, emoji: '📈', color: '#22d3ee' })}
      onJoin={(code, name) => void party.join(code, { name, emoji: '📈', color: '#22d3ee' })}
      onStart={() =>
        party.apply({
          type: 'start',
          by: party.selfId ?? '',
          settings,
          seed: `party-${party.code}-${Date.now()}`,
          totalRounds: PARTY_ROUNDS,
        })
      }
      onKick={(playerId) => party.apply({ type: 'kick', by: party.selfId ?? '', playerId })}
      onLeave={party.leave}
    >
      {from && to && (
        <Card padding="lg" className="flex flex-col gap-3">
          <span className="text-center font-mono text-xs uppercase tracking-[0.2em] text-muted">
            Round {index + 1} of {party.state?.totalRounds}
          </span>
          <div className="flex flex-col items-stretch gap-2 sm:flex-row">
            <HiloCard item={from} measure={measureFor(from)} />
            <div className="flex items-center justify-center px-2 font-mono text-xs uppercase tracking-[0.2em] text-muted">
              vs
            </div>
            <HiloCard
              item={to}
              measure={measureFor(to)}
              hidden={phase !== 'reveal'}
              revealing={phase === 'reveal'}
            />
          </div>

          {phase === 'reveal' ? (
            isHost && (
              <Button fullWidth size="lg" onClick={() => party.apply({ type: 'advance', by: party.selfId ?? '' })}>
                Next pair
              </Button>
            )
          ) : me?.answered ? (
            <>
              <p className="text-center text-sm text-muted">Locked in. Waiting for everyone else…</p>
              {isHost && (
                <Button fullWidth size="lg" variant="secondary" onClick={reveal}>
                  Reveal now
                </Button>
              )}
            </>
          ) : (
            <div className="flex gap-2">
              <Button size="xl" fullWidth leadingIcon={<ArrowUp />} onClick={() => pick(true)}>
                Higher
              </Button>
              <Button size="xl" fullWidth leadingIcon={<ArrowDown />} onClick={() => pick(false)}>
                Lower
              </Button>
            </div>
          )}
        </Card>
      )}

      {phase === 'finished' && (
        <Card padding="lg" className="text-center">
          <p className="font-display text-xl font-bold text-fg">Chain complete.</p>
          <p className="text-sm text-muted">Standings below. The host can start another race.</p>
        </Card>
      )}
    </PartyShell>
  );
}
