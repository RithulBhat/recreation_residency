/**
 * `/duel` — the online duel lobby.
 *
 * Two devices, one room code, one seeded playlist. The lobby only sets the race up: it hosts or
 * joins a `useOnlineDuel` session, agrees on settings + a track pool, counts down, then hands the
 * resolved pool to the game store and sends both players to `/play`.
 *
 * The session lives in a module store (see src/net/useOnlineDuel.ts), so leaving this screen does
 * NOT end the duel — only the explicit "Leave" button does.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { motion, useReducedMotion } from 'motion/react';
import {
  ArrowRight,
  Check,
  Globe,
  Hourglass,
  LogOut,
  RefreshCw,
  Send,
  Smartphone,
  Swords,
  TriangleAlert,
  Zap,
} from 'lucide-react';
import type { GameMode, GameSettings } from '@/types';
import { GO_LINGER_MS, sanitizeRoomCodeInput, useOnlineDuel } from '@/net';
import { PoolError, loadPool, startLoadedGame } from '@/lib/startGame';
import { applyPresetToSettings, findPreset, normalizeSettings } from '@/game/presets';
import { useGameStore } from '@/store/gameStore';
import { useSettingsStore } from '@/store/settingsStore';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Kbd } from '@/components/ui/Kbd';
import { cn } from '@/components/ui/cn';
import { SectionHeading } from '@/components/SectionHeading';
import { Footer } from '@/components/Footer';
import {
  CountdownOverlay,
  DUEL_ROUND_OPTIONS,
  DuelConfigPanel,
  DuelSummary,
  HowOnlineDuels,
  IdentityPicker,
  PlayerSlot,
  RoomCodeCard,
  StatusPill,
  cleanName,
  loadLook,
  saveLook,
  toPlayerConfig,
  type DuelLook,
} from '@/components/duel';

/** Seconds of 'connecting' before we suggest a hotspot / same-device fallback. */
const SLOW_CONNECT_MS = 10_000;
/**
 * How long after `startAt` the "GO" frame may still be shown. The store already drops `countdown`
 * to null a second in; this is the belt-and-braces guard so a stale 0 can never cover the lobby.
 */
const GO_VISIBLE_MS = GO_LINGER_MS + 500;

type Stage = 'choose' | 'online';

/** Online duels are two solo races, so the same-device multiplayer modes collapse to classic. */
function soloMode(mode: GameMode): GameMode {
  return mode === 'duel' || mode === 'party' ? 'classic' : mode;
}

/** Keep the rounds control honest: snap a stray draft value onto one of the offered counts. */
function snapRounds(settings: GameSettings): GameSettings {
  if (settings.mode === 'blitz' || settings.mode === 'survival') return settings;
  if ((DUEL_ROUND_OPTIONS as readonly number[]).includes(settings.rounds)) return settings;
  const nearest = DUEL_ROUND_OPTIONS.reduce((best, r) =>
    Math.abs(r - settings.rounds) < Math.abs(best - settings.rounds) ? r : best,
  );
  return { ...settings, rounds: nearest };
}

function initialDraft(settings: GameSettings): GameSettings {
  return snapRounds(
    normalizeSettings({ ...settings, mode: soloMode(settings.mode), players: [], seed: undefined, daily: undefined }),
  );
}

export default function Duel() {
  const duel = useOnlineDuel();
  const navigate = useNavigate();
  const reduce = useReducedMotion();
  const [params] = useSearchParams();

  const storedName = useSettingsStore((s) => s.playerName);
  const setPlayerName = useSettingsStore((s) => s.setPlayerName);
  const storedSettings = useSettingsStore((s) => s.settings);

  const linkedCode = sanitizeRoomCodeInput(params.get('join') ?? '');

  const [stage, setStage] = useState<Stage>(() => (linkedCode.length === 6 ? 'online' : 'choose'));
  const [name, setName] = useState(storedName);
  const [look, setLook] = useState<DuelLook>(() => loadLook());
  const [codeInput, setCodeInput] = useState(linkedCode);
  const [draft, setDraft] = useState<GameSettings>(() => initialDraft(storedSettings));
  const [presetId, setPresetId] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [poolError, setPoolError] = useState<string | null>(null);
  const [slow, setSlow] = useState(false);

  const me = useMemo(() => toPlayerConfig(name, look), [name, look]);
  const nameOk = cleanName(name).length > 0;
  const codeOk = codeInput.length === 6;
  const inRoom = duel.status !== 'idle';
  const opponentName = duel.opponent?.name ?? 'your opponent';

  /* ----------------------------------------------------- persistence */

  useEffect(() => {
    const id = window.setTimeout(() => setPlayerName(name), 400);
    return () => window.clearTimeout(id);
  }, [name, setPlayerName]);

  useEffect(() => {
    saveLook(look);
  }, [look]);

  /* ----------------------------------------------------- session effects */

  // "Still connecting…" nudge — most failures here are networks that block WebRTC.
  useEffect(() => {
    if (duel.status !== 'connecting') {
      setSlow(false);
      return;
    }
    const id = window.setTimeout(() => setSlow(true), SLOW_CONNECT_MS);
    return () => window.clearTimeout(id);
  }, [duel.status]);

  // Handing off to /play. Both peers do this when their local countdown hits zero.
  const startedRef = useRef(false);
  const sawCountdownRef = useRef(false);
  const { countdown, initPayload } = duel;

  useEffect(() => {
    if (countdown !== null && countdown > 0) sawCountdownRef.current = true;
  }, [countdown]);

  useEffect(() => {
    if (countdown !== 0 || !initPayload || startedRef.current) return;
    // Guard a mid-game revisit of the lobby: only a countdown we actually watched starts a game.
    const fresh = sawCountdownRef.current || (duel.startAt !== null && Date.now() - duel.startAt < 6000);
    if (!fresh) return;
    startedRef.current = true;
    const live = useGameStore.getState().state;
    const sameGame = live.settings.seed === initPayload.settings.seed && live.status !== 'idle' && live.status !== 'finished';
    if (!sameGame) startLoadedGame(initPayload);
    navigate('/play');
  }, [countdown, initPayload, duel.startAt, navigate]);

  /* ----------------------------------------------------- actions */

  const onHost = useCallback(() => {
    setPlayerName(name);
    setPoolError(null);
    duel.host(me);
  }, [duel, me, name, setPlayerName]);

  const onJoin = useCallback(() => {
    if (!codeOk) return;
    setPlayerName(name);
    setPoolError(null);
    duel.join(codeInput, me);
  }, [codeInput, codeOk, duel, me, name, setPlayerName]);

  const onRetry = useCallback(() => {
    if (duel.role === 'guest') {
      duel.join(duel.code ?? codeInput, me);
      return;
    }
    duel.host(me);
  }, [codeInput, duel, me]);

  const onLeave = useCallback(() => {
    duel.leave();
    setSending(false);
    setPoolError(null);
    setStage(linkedCode.length === 6 ? 'online' : 'choose');
  }, [duel, linkedCode]);

  const onPresetPick = useCallback((id: string) => {
    const preset = findPreset(id);
    if (!preset) return;
    setPresetId(id);
    setDraft((d) => snapRounds(applyPresetToSettings(d, preset)));
  }, []);

  const onDraftChange = useCallback((next: GameSettings) => {
    setPresetId(null);
    setDraft(next);
  }, []);

  const onSendConfig = useCallback(async () => {
    setSending(true);
    setPoolError(null);
    try {
      const { settings, tracks } = await loadPool({ ...draft, mode: soloMode(draft.mode), seed: undefined });
      duel.sendInit(settings, tracks);
    } catch (e) {
      const message =
        e instanceof PoolError ? e.message : e instanceof Error ? e.message : "Couldn't load songs for this setup.";
      setPoolError(message);
    } finally {
      setSending(false);
    }
  }, [draft, duel]);

  /* ----------------------------------------------------- pieces */

  const rise = reduce
    ? {}
    : { initial: { opacity: 0, y: 14 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.45, ease: [0.16, 1, 0.3, 1] as const } };

  const errorCard = duel.error ? (
    <Card
      padding="md"
      className="border-danger/35 bg-danger/10"
      role="alert"
      data-testid="duel-error"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-danger/20 text-danger">
          <TriangleAlert className="size-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-fg">{duel.error}</div>
          <p className="mt-0.5 text-xs text-muted">
            Room codes expire when the host closes the tab. Double-check the code, or start a fresh room.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={onRetry} leadingIcon={<RefreshCw />}>
            Try again
          </Button>
          <Button variant="ghost" size="sm" onClick={onLeave}>
            Back
          </Button>
        </div>
      </div>
    </Card>
  ) : null;

  const slowCard =
    slow && duel.status === 'connecting' ? (
      <Card padding="md" className="border-warn/30 bg-warn/10" data-testid="duel-slow">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-warn/20 text-warn">
            <Hourglass className="size-5" aria-hidden />
          </span>
          <p className="min-w-0 flex-1 text-sm text-fg">
            Still connecting… some networks block peer-to-peer. Try a phone hotspot or play same-device.
          </p>
          <Button variant="secondary" size="sm" to="/setup?mode=duel" leadingIcon={<Smartphone />}>
            Same device
          </Button>
        </div>
      </Card>
    ) : null;

  /**
   * The overlay is for the 3-2-1 and the "GO" frame only. Anything else (a finished race, a lobby
   * revisited with the browser Back button) must leave the page usable.
   */
  const showCountdown =
    countdown !== null && (countdown > 0 || (duel.startAt !== null && Date.now() - duel.startAt < GO_VISIBLE_MS));

  /* ----------------------------------------------------- render */

  return (
    <div className="flex flex-col gap-5 sm:gap-10">
      <SectionHeading
        eyebrow="Head to head"
        title={<>Duel a <span className="text-gradient">friend</span></>}
        description="Two devices, one room code. Identical songs in identical order — most points wins."
        size="lg"
        as="h1"
        action={
          inRoom ? <StatusPill status={duel.status} latencyMs={duel.latencyMs} className="hidden sm:flex" /> : undefined
        }
      />

      {!inRoom && stage === 'choose' && (
        <motion.div {...rise} className="grid gap-3 sm:grid-cols-2 sm:gap-4">
          <button
            type="button"
            onClick={() => setStage('online')}
            className="group relative overflow-hidden rounded-4xl border border-border p-5 text-left transition-[border-color,box-shadow] hover:border-border-strong hover:shadow-glow sm:min-h-64 sm:p-7"
            style={{ background: 'linear-gradient(160deg, color-mix(in oklab, var(--sg-accent) 26%, var(--sg-bg-elevated)) 0%, color-mix(in oklab, var(--sg-accent) 6%, var(--sg-bg-elevated)) 65%)' }}
            data-testid="duel-online"
          >
            <span aria-hidden className="pointer-events-none absolute -right-10 -top-12 size-40 rounded-full bg-accent opacity-40 blur-3xl transition-opacity group-hover:opacity-70" />
            <span className="relative flex h-full flex-col gap-3">
              <span className="grid size-12 place-items-center rounded-2xl bg-accent/20 text-accent [&>svg]:size-6">
                <Globe />
              </span>
              <span className="flex items-center gap-2">
                <span className="font-display text-xl font-black text-fg">Online</span>
                <Badge tone="gradient" size="sm">
                  Room code
                </Badge>
              </span>
              <span className="text-sm text-muted">
                Two phones, two sofas, one playlist. Send a code and race the same songs at the same second.
              </span>
              <span className="mt-auto inline-flex items-center gap-1.5 pt-2 text-sm font-semibold text-accent">
                Set up a room
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
              </span>
            </span>
          </button>

          <Link
            to="/setup?mode=duel"
            className="glass group flex flex-col gap-3 rounded-4xl p-5 no-underline transition-[border-color,box-shadow] hover:border-border-strong hover:shadow-glow sm:min-h-64 sm:p-7"
            data-testid="duel-same-device"
          >
            <span className="grid size-12 place-items-center rounded-2xl bg-surface-strong text-fg [&>svg]:size-6">
              <Smartphone />
            </span>
            <span className="font-display text-xl font-black text-fg">Same device</span>
            <span className="text-sm text-muted">
              One phone between you. Buzz in first and steal the round — no connection needed.
            </span>
            <span className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-2 pt-2">
              <span className="inline-flex items-center gap-2 text-xs text-muted">
                Buzzers <Kbd size="sm">A</Kbd> and <Kbd size="sm">L</Kbd>
              </span>
              <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-fg">
                Grab one phone
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
              </span>
            </span>
          </Link>
        </motion.div>
      )}

      {!inRoom && stage === 'online' && (
        <motion.div {...rise} className="flex flex-col gap-6">
          <Card padding="lg" className="rounded-4xl">
            <h2 className="mb-4 font-display text-lg font-bold text-fg">Who are you?</h2>
            <IdentityPicker name={name} onNameChange={setName} look={look} onLookChange={setLook} />
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card padding="lg" className="flex flex-col gap-3 rounded-4xl" accent="#a855f7">
              <span className="grid size-11 place-items-center rounded-2xl bg-accent/20 text-accent [&>svg]:size-5">
                <Swords />
              </span>
              <h3 className="font-display text-lg font-bold text-fg">Create a room</h3>
              <p className="text-sm text-muted">
                You pick the packs and the rules, then share a six-character code.
              </p>
              <Button
                variant="glow"
                size="lg"
                className="mt-1"
                disabled={!nameOk}
                onClick={onHost}
                leadingIcon={<Zap />}
                data-testid="duel-create"
              >
                Create room
              </Button>
              {!nameOk && (
                <p className="text-xs font-medium text-muted" role="status">
                  Pick a name first.
                </p>
              )}
            </Card>

            <Card
              padding="lg"
              className={cn('flex flex-col gap-3 rounded-4xl', linkedCode.length === 6 && 'ring-2 ring-accent')}
            >
              <span className="grid size-11 place-items-center rounded-2xl bg-surface-strong text-fg [&>svg]:size-5">
                <ArrowRight />
              </span>
              <h3 className="font-display text-lg font-bold text-fg">Join a room</h3>
              <p className="text-sm text-muted">Got a code? Type it in — the host sets the rules.</p>
              <Input
                value={codeInput}
                onChange={(e) => setCodeInput(sanitizeRoomCodeInput(e.target.value))}
                onPaste={(e) => {
                  e.preventDefault();
                  setCodeInput(sanitizeRoomCodeInput(e.clipboardData.getData('text')));
                }}
                placeholder="ABC123"
                aria-label="Room code"
                inputMode="text"
                autoCapitalize="characters"
                autoComplete="off"
                spellCheck={false}
                size="xl"
                className="text-center font-display font-black uppercase tracking-[0.35em]"
                data-testid="duel-code-input"
              />
              <Button
                variant="primary"
                size="lg"
                disabled={!nameOk || !codeOk}
                onClick={onJoin}
                leadingIcon={<ArrowRight />}
                data-testid="duel-join"
              >
                Join room
              </Button>
              {(!nameOk || !codeOk) && (
                <p className="text-xs font-medium text-muted" role="status">
                  {!nameOk ? 'Pick a name first.' : 'Enter the six-character code.'}
                </p>
              )}
            </Card>
          </div>

          <div>
            <Button variant="ghost" size="sm" onClick={() => setStage('choose')}>
              Back to duel options
            </Button>
          </div>
        </motion.div>
      )}

      {inRoom && (
        <motion.div {...rise} className="flex flex-col gap-6">
          {errorCard}
          {slowCard}

          <Card padding="lg" className="rounded-4xl">
            <div className="flex flex-col gap-6">
              <div className="flex items-start justify-between gap-3">
                <StatusPill status={duel.status} latencyMs={duel.latencyMs} className="sm:hidden" />
                <p className="hidden max-w-xs text-xs leading-relaxed text-muted sm:block">
                  One opponent per room. The code works for as long as this tab stays open.
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onLeave}
                  leadingIcon={<LogOut />}
                  className="ml-auto text-muted"
                  data-testid="duel-leave"
                >
                  Leave
                </Button>
              </div>

              {duel.code && <RoomCodeCard code={duel.code} compact={!duel.isHost} />}

              <div className="mx-auto flex w-full max-w-2xl items-stretch gap-2 sm:gap-4">
                <PlayerSlot player={duel.me} role={duel.isHost ? 'Host' : 'Guest'} you />
                <div className="grid shrink-0 place-items-center px-1">
                  <span className="font-display text-xs font-black uppercase tracking-[0.2em] text-muted">vs</span>
                </div>
                <PlayerSlot
                  player={duel.opponent}
                  role={duel.isHost ? 'Guest' : 'Host'}
                  ready={duel.isHost ? duel.opponentReady : undefined}
                  emptyLabel={duel.isHost ? 'Waiting for a challenger' : 'Finding the host'}
                />
              </div>
            </div>
          </Card>

          {duel.isHost ? (
            <Card padding="lg" className="rounded-4xl">
              <h2 className="mb-4 font-display text-lg font-bold text-fg">Set the race</h2>
              <DuelConfigPanel
                draft={draft}
                onChange={onDraftChange}
                presetId={presetId}
                onPresetPick={onPresetPick}
                disabled={sending}
              />

              {poolError && (
                <p className="mt-4 rounded-2xl border border-danger/35 bg-danger/10 px-3 py-2 text-sm text-fg" role="alert">
                  {poolError}
                </p>
              )}

              <div className="mt-5 flex flex-col gap-3">
                <Button
                  variant={duel.initPayload ? 'secondary' : 'primary'}
                  size="lg"
                  loading={sending}
                  disabled={!duel.connected || sending}
                  onClick={() => void onSendConfig()}
                  leadingIcon={<Send />}
                  data-testid="duel-send-config"
                >
                  {duel.initPayload ? 'Resend setup' : 'Send config'}
                </Button>

                {!duel.connected && (
                  <p className="text-xs text-muted">
                    Share the code — the setup is locked in once your opponent walks into the room.
                  </p>
                )}

                {duel.connected && duel.initPayload && !duel.opponentReady && (
                  <p className="flex items-start gap-2 text-sm text-muted" data-testid="duel-await-ready">
                    <Hourglass className="mt-0.5 size-4 shrink-0 animate-pulse-soft" aria-hidden />
                    Waiting for {opponentName} to ready up…
                  </p>
                )}

                {duel.connected && duel.opponentReady && (
                  <>
                    <p className="inline-flex items-center gap-2 text-sm font-semibold text-success">
                      <Check className="size-4" aria-hidden /> {opponentName} is ready.
                    </p>
                    <Button
                      variant="glow"
                      size="xl"
                      onClick={duel.start}
                      leadingIcon={<Swords />}
                      data-testid="duel-start"
                    >
                      Start duel
                    </Button>
                  </>
                )}
              </div>
            </Card>
          ) : (
            <Card padding="lg" className="rounded-4xl">
              <h2 className="mb-4 font-display text-lg font-bold text-fg">The host&rsquo;s setup</h2>
              {duel.initPayload ? (
                <>
                  <DuelSummary settings={duel.initPayload.settings} />
                  {duel.myReady ? (
                    <p className="mt-5 flex items-start gap-2 text-sm font-semibold text-success" data-testid="duel-guest-ready">
                      <Check className="mt-0.5 size-4 shrink-0" aria-hidden />
                      You&rsquo;re ready — waiting for {opponentName} to start the race.
                    </p>
                  ) : (
                    <Button
                      variant="glow"
                      size="xl"
                      className="mt-5"
                      onClick={duel.ready}
                      leadingIcon={<Check />}
                      data-testid="duel-ready"
                    >
                      Ready
                    </Button>
                  )}
                </>
              ) : (
                <p className="flex items-start gap-2 text-sm text-muted" data-testid="duel-await-config">
                  <Hourglass className="mt-0.5 size-4 shrink-0 animate-pulse-soft" aria-hidden />
                  {duel.connected
                    ? `Waiting for ${opponentName} to choose the packs and rules…`
                    : 'Knocking on the room door…'}
                </p>
              )}
            </Card>
          )}
        </motion.div>
      )}

      <HowOnlineDuels />
      <Footer className="mt-0" />

      {showCountdown && (
        <CountdownOverlay seconds={duel.countdown ?? 0} me={duel.me} opponent={duel.opponent} />
      )}
    </div>
  );
}
