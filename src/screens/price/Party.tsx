import { useCallback, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { NumberTicker } from '@/components/ui/NumberTicker';
import { PartyShell } from '@/components/party/PartyShell';
import { PriceKeypad } from '@/components/price/PriceKeypad';
import { usePartyRoom } from '@/arcade/party';
import { poolFrom } from '@/arcade/content';
import { createRng } from '@/game/rng';
import { formatValue } from '@/arcade/units';
import { pricePool } from '@/data/price';
import { selectItems } from '@/price/engine';
import { scoreGuess } from '@/price/scoring';
import { DEFAULT_SETTINGS, reconcile } from '@/price/settings';
import { describeMiss } from '@/price/miss';
import type { PriceSettings } from '@/price/types';

const PARTY_ROUNDS = 8;

export default function PriceParty() {
  const party = usePartyRoom();
  const [entry, setEntry] = useState('');

  const settings: PriceSettings = useMemo(
    () => reconcile({ ...DEFAULT_SETTINGS, rounds: PARTY_ROUNDS, timer: 30 }),
    [],
  );

  /**
   * Every peer rebuilds the same run from the shared seed rather than being sent the items.
   * The wire carries answers and scores only, so a client cannot read the next price out of a
   * packet before it has been asked for it.
   */
  const items = useMemo(() => {
    const seed = party.state?.seed;
    if (!seed) return [];
    return selectItems(poolFrom(pricePool(settings.packIds)), { ...settings, seed }, createRng(seed));
  }, [party.state?.seed, settings]);

  const round = party.state ? items[party.state.round] : undefined;
  const phase = party.state?.phase;
  const isHost = party.state?.players.find((p) => p.id === party.selfId)?.host === true;
  const me = party.state?.players.find((p) => p.id === party.selfId);

  /** Host only: score everybody's guess, then move the room to the reveal. */
  const reveal = useCallback(() => {
    const state = party.state;
    if (!state || !round) return;
    const scores: Record<string, number> = {};
    for (const [playerId, value] of Object.entries(state.answers)) {
      scores[playerId] = scoreGuess({
        guess: value,
        answer: round.value,
        scoring: settings.scoring,
        timer: settings.timer,
        elapsedMs: 0,
        speedBonus: false,
        streak: 0,
        streakMultiplier: false,
        hintsUsed: 0,
      }).total;
    }
    party.apply({ type: 'score', scores });
    party.apply({ type: 'reveal', by: party.selfId ?? '' });
  }, [party, round, settings]);

  const submit = useCallback(() => {
    const value = Number(entry);
    if (!Number.isFinite(value)) return;
    if (party.role === 'host') {
      party.apply({ type: 'answer', playerId: party.selfId ?? '', value });
    } else {
      party.send({ type: 'answer', value });
    }
    setEntry('');
  }, [entry, party]);

  return (
    <PartyShell
      game="price"
      title="Price Guess — Party"
      status={party.status}
      error={party.error}
      code={party.code}
      selfId={party.selfId}
      state={party.state}
      onHost={(name) => void party.host('price', { name, emoji: '💸', color: '#fbbf24' })}
      onJoin={(code, name) => void party.join(code, { name, emoji: '💸', color: '#fbbf24' })}
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
      {round && (
        <Card padding="lg" className="flex flex-col items-center gap-3 text-center">
          <span className="font-mono text-xs uppercase tracking-[0.2em] text-muted">
            Round {(party.state?.round ?? 0) + 1} of {party.state?.totalRounds}
          </span>
          <span className="text-5xl leading-none" aria-hidden>
            {round.emoji ?? '📦'}
          </span>
          <h2 className="font-display text-xl font-bold text-fg">{round.name}</h2>
          {round.blurb && <p className="text-sm text-muted">{round.blurb}</p>}
          <Badge tone="warn" size="sm">
            Approximate
          </Badge>

          {phase === 'reveal' ? (
            <>
              <NumberTicker
                value={round.value}
                prefix="$"
                className="font-display text-4xl font-bold text-accent"
              />
              <ul className="flex w-full flex-col gap-1">
                {party.state?.players.map((p) => {
                  const guess = party.state?.answers[p.id];
                  return (
                    <li key={p.id} className="flex items-center gap-2 text-sm">
                      <span aria-hidden>{p.emoji}</span>
                      <span className="text-fg">{p.name}</span>
                      <span className="ml-auto font-mono text-muted">
                        {guess === undefined
                          ? 'no guess'
                          : `${formatValue(guess, 'usd')} · ${describeMiss(guess, round.value)?.text ?? 'exact'}`}
                      </span>
                    </li>
                  );
                })}
              </ul>
              {isHost && (
                <Button fullWidth size="lg" onClick={() => party.apply({ type: 'advance', by: party.selfId ?? '' })}>
                  Next item
                </Button>
              )}
            </>
          ) : me?.answered ? (
            <>
              <p className="text-sm text-muted">Locked in. Waiting for everyone else…</p>
              {isHost && (
                <Button fullWidth size="lg" variant="secondary" onClick={reveal}>
                  Reveal now
                </Button>
              )}
            </>
          ) : (
            <PriceKeypad
              className="w-full"
              value={entry}
              onChange={setEntry}
              onSubmit={submit}
            />
          )}
        </Card>
      )}

      {phase === 'finished' && (
        <Card padding="lg" className="text-center">
          <p className="font-display text-xl font-bold text-fg">That&rsquo;s the lot.</p>
          <p className="text-sm text-muted">Standings below. The host can start another round.</p>
        </Card>
      )}
    </PartyShell>
  );
}
