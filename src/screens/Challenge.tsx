import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { Home, Link2, Play, Swords, TriangleAlert } from 'lucide-react';
import type { ChallengePayload, Pack } from '@/types';
import { challengeSettings, decodeChallenge } from '@/game/challenge';
import { getPack } from '@/lib/catalog';
import { loadCustomPacks } from '@/lib/customPacks';
import { loadPool, loadTracksByIds, startLoadedGame } from '@/lib/startGame';
import { formatScore } from '@/stats/share';
import { useResultStore } from '@/store/resultStore';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { MODE_LABEL, clipSummary, modifierLabels, roundsSummary } from '@/components/setup/summary';

/** A challenge needs at least this many exact tracks; fewer → rebuild the pool from the packs. */
const MIN_EXACT_TRACKS = 3;

async function acceptChallenge(payload: ChallengePayload): Promise<void> {
  const settings = challengeSettings(payload);
  let tracks = payload.trackIds && payload.trackIds.length > 0 ? await loadTracksByIds(payload.trackIds) : [];
  if (tracks.length < MIN_EXACT_TRACKS) tracks = (await loadPool(settings)).tracks;
  // The result store needs both fields; a nameless or scoreless link just isn't a "beat my score" run.
  const by = payload.by?.trim();
  useResultStore.getState().setChallenger(by && typeof payload.score === 'number' ? { by, score: payload.score } : null);
  startLoadedGame({ settings, tracks });
}

/** `#/c/<code>` — decode, show who challenged you, accept → same songs, same rules. */
export default function Challenge() {
  const { code = '' } = useParams();
  const navigate = useNavigate();
  const payload = useMemo(() => decodeChallenge(code), [code]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const packs = useMemo(() => {
    loadCustomPacks();
    if (!payload) return [];
    return payload.settings.packIds.map((id) => ({ id, pack: getPack(id) }));
  }, [payload]);

  if (!payload) {
    return (
      <div className="mx-auto max-w-lg py-10">
        <Card padding="lg">
          <EmptyState
            icon={<Link2 />}
            title="This challenge link is broken"
            description="The code could not be read — it may have been cut off when it was copied. Ask your friend to send it again."
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <Button to="/" variant="secondary" leadingIcon={<Home />}>
                  Home
                </Button>
                <Button to="/setup" leadingIcon={<Play className="fill-current" />}>
                  Play anyway
                </Button>
              </div>
            }
          />
        </Card>
      </div>
    );
  }

  const settings = challengeSettings(payload);
  const by = payload.by?.trim() || null;
  const hasExact = (payload.trackIds?.length ?? 0) >= MIN_EXACT_TRACKS;
  const missing = packs.filter((p) => !p.pack);
  const blocked = !hasExact && missing.length === packs.length;
  const mods = modifierLabels(settings.modifiers);

  const accept = async () => {
    setLoading(true);
    setError(null);
    try {
      await acceptChallenge(payload);
      navigate('/play');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the challenge.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 py-4 sm:py-8">
      <Card padding="lg" glow className="overflow-hidden">
        <div className="pointer-events-none absolute -right-20 -top-20 size-64 rounded-full bg-accent-3 opacity-20 blur-3xl" aria-hidden />
        <div className="pointer-events-none absolute -bottom-24 -left-16 size-64 rounded-full bg-accent-2 opacity-15 blur-3xl" aria-hidden />
        <div className="relative flex flex-col gap-5">
          <div className="flex items-start gap-4">
            <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-gradient-accent text-accent-fg shadow-glow" aria-hidden>
              <Swords className="size-7" />
            </span>
            <div className="min-w-0">
              <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-accent">Challenge</div>
              <h1 className="mt-1 font-display text-2xl font-black leading-tight text-fg sm:text-3xl" id="challenge-title">
                {by ? (
                  <>
                    <span className="text-gradient">{by}</span> challenged you
                  </>
                ) : (
                  'A friend challenged you'
                )}
              </h1>
              {typeof payload.score === 'number' && (
                <p className="mt-1 text-sm text-muted">
                  They scored <span className="font-mono text-base font-bold tabular text-fg">{formatScore(payload.score)}</span> pts. Beat it.
                </p>
              )}
            </div>
          </div>

          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div className="rounded-2xl bg-surface p-3">
              <dt className="text-[11px] font-semibold uppercase tracking-wider text-muted">Rules</dt>
              <dd className="mt-1 font-semibold text-fg">
                {MODE_LABEL[settings.mode]} · {roundsSummary(settings)} · {clipSummary(settings)}
              </dd>
              {mods.length > 0 && <dd className="mt-0.5 text-xs text-muted">{mods.join(' · ')}</dd>}
            </div>
            <div className="rounded-2xl bg-surface p-3">
              <dt className="text-[11px] font-semibold uppercase tracking-wider text-muted">Songs</dt>
              <dd className="mt-1 font-semibold text-fg">
                {hasExact ? `The exact same ${payload.trackIds?.length ?? 0} tracks` : 'Same packs, same seed'}
              </dd>
              <dd className="mt-0.5 text-xs text-muted">Difficulty: {settings.difficulty}</dd>
            </div>
          </dl>

          <div>
            <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted">Packs</div>
            <ul className="flex flex-wrap gap-2" aria-label="Packs">
              {packs.map(({ id, pack }) => (
                <li key={id}>
                  {pack ? <PackChip pack={pack} /> : <Badge tone="warn" icon={<TriangleAlert />}>{id} · not on this device</Badge>}
                </li>
              ))}
            </ul>
            {missing.length > 0 && !hasExact && (
              <p className="mt-2 text-xs text-warn">
                {blocked ? 'None of these packs exist here and the link carries no track list, so it cannot be played.' : 'Unknown packs are skipped; the pool will be built from the rest.'}
              </p>
            )}
          </div>

          {error && (
            <p className="text-sm font-semibold text-danger" role="alert">
              {error}
            </p>
          )}

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Button variant="glow" size="xl" leadingIcon={<Play className="fill-current" />} loading={loading} disabled={blocked} onClick={() => void accept()} className="w-full sm:w-auto" data-testid="accept-challenge">
              {loading ? 'Loading songs…' : error ? 'Try again' : 'Accept'}
            </Button>
            <Link to="/" className="px-2 py-2 text-center text-sm font-semibold text-muted hover:text-fg">
              Maybe later
            </Link>
          </div>
        </div>
      </Card>
    </div>
  );
}

function PackChip({ pack }: { pack: Pack }) {
  return (
    <span
      className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border px-3 text-sm font-semibold text-fg"
      style={{ background: `color-mix(in oklab, ${pack.accent} 22%, var(--sg-surface))` }}
    >
      <span aria-hidden>{pack.emoji}</span>
      {pack.name}
    </span>
  );
}
