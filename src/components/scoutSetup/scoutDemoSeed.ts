/**
 * DEV-ONLY sample history for the Scout stats screen (`#/scout/stats?demo=1`), so the page can be
 * reviewed without grinding out twenty runs. Loaded through a dynamic import behind
 * `import.meta.env.DEV` and deliberately NOT re-exported from the barrel, so it never ships.
 *
 * It writes `ScoutGameRecord`s straight into `@/store/scoutResultStore` — the same ledger the play
 * screen fills — so what the stats page renders here is exactly what it renders in a real session.
 *
 * Deterministic: same seed → same fixture, which keeps screenshots comparable.
 */

import { createRng } from '@/game/rng';
import { todayISO } from '@/game/challenge';
import { loadScoutBundle } from '@/scout/data';
import { ALL_SCOUT_MODES } from '@/scout/subjects';
import { addDays } from '@/components/daily/dailyMath';
import { useScoutResultStore, type ScoutGameRecord, type ScoutRoundRecord } from '@/store/scoutResultStore';
import type { NflPlayer, NflTeam, ScoutDifficulty, ScoutMode } from '@/scout/types';

const DEMO_PACKS: readonly string[] = [
  'superstars',
  'pos-qb',
  'pos-wr',
  'div-afc-west',
  'team-kc',
  'franchises-all',
  'rookies',
  'deep-cuts',
];

const DIFFICULTIES: readonly ScoutDifficulty[] = ['any', 'star', 'starter', 'deepCut'];

type Rng = ReturnType<typeof createRng>;

function glyph(verdict: ScoutRoundRecord['verdict']): string {
  if (verdict === 'correct') return '🟩';
  if (verdict === 'close') return '🟨';
  if (verdict === 'skipped' || verdict === 'timeout') return '⬜';
  return '🟥';
}

function gridOf(rounds: readonly ScoutRoundRecord[]): string {
  const glyphs = rounds.map((r) => glyph(r.verdict));
  const lines: string[] = [];
  for (let i = 0; i < glyphs.length; i += 10) lines.push(glyphs.slice(i, i + 10).join(''));
  return lines.join('\n');
}

/** Replace the Scout ledger with a plausible 22-session history. */
export async function seedScoutDemoStats(): Promise<void> {
  const rng = createRng('scout-demo-v1');
  const today = todayISO();

  let players: NflPlayer[] = [];
  let teams: NflTeam[] = [];
  try {
    const bundle = await loadScoutBundle();
    players = bundle.players.filter((p) => p.fame >= 55).slice(0, 160);
    teams = [...bundle.teams];
  } catch {
    /* the chunk may fail offline — the history still renders, just without real names */
  }

  const pickSubject = (r: Rng, mode: ScoutMode): { kind: 'player' | 'team'; id: string; name: string } => {
    const wantsTeam = mode === 'teamTrivia' || mode === 'logoZoom';
    if (wantsTeam && teams.length > 0) {
      const t = teams[r.int(0, teams.length - 1)]!;
      return { kind: 'team', id: t.id, name: t.displayName };
    }
    if (players.length > 0) {
      const p = players[r.int(0, players.length - 1)]!;
      return { kind: 'player', id: p.id, name: p.name };
    }
    return { kind: 'player', id: `demo-${r.int(1, 999)}`, name: 'Unknown Player' };
  };

  const records: ScoutGameRecord[] = [];
  for (let i = 0; i < 22; i++) {
    const mixModes = rng.next() < 0.2;
    const mode = ALL_SCOUT_MODES[rng.int(0, ALL_SCOUT_MODES.length - 1)]!;
    const tries = rng.int(3, 6);
    const played = rng.pick([8, 10, 10, 12]);
    const finishedAt = Date.now() - i * 86_400_000 - rng.int(0, 20_000_000);

    const rounds: ScoutRoundRecord[] = [];
    for (let index = 0; index < played; index++) {
      const roundMode = mixModes ? ALL_SCOUT_MODES[rng.int(0, ALL_SCOUT_MODES.length - 1)]! : mode;
      const subject = pickSubject(rng, roundMode);
      const roll = rng.next();
      const verdict: ScoutRoundRecord['verdict'] =
        roll < 0.55 ? 'correct' : roll < 0.72 ? 'close' : roll < 0.92 ? 'wrong' : 'skipped';
      const won = verdict === 'correct';
      const triesUsed = won ? rng.int(1, tries) : tries;
      rounds.push({
        index,
        mode: roundMode,
        kind: subject.kind,
        subjectId: subject.id,
        name: subject.name,
        verdict,
        triesUsed,
        score: won ? rng.int(380, 1320) : 0,
        ms: rng.int(4_000, 38_000),
      });
    }

    const correctRounds = rounds.filter((r) => r.verdict === 'correct');
    const record: ScoutGameRecord = {
      id: `demo-${i}`,
      finishedAt,
      durationMs: rounds.reduce((n, r) => n + r.ms, 0),
      mode,
      mixModes,
      packIds: rng.shuffle(DEMO_PACKS).slice(0, rng.int(1, 3)),
      difficulty: DIFFICULTIES[rng.int(0, DIFFICULTIES.length - 1)]!,
      tries,
      played,
      correct: correctRounds.length,
      close: rounds.filter((r) => r.verdict === 'close').length,
      score: correctRounds.reduce((n, r) => n + r.score, 0),
      bestStreak: rng.int(1, Math.max(1, correctRounds.length)),
      avgTryWhenRight:
        correctRounds.length === 0
          ? 0
          : Math.round((correctRounds.reduce((n, r) => n + r.triesUsed, 0) / correctRounds.length) * 100) / 100,
      grid: gridOf(rounds),
      rounds,
    };
    if (i < 9) record.daily = addDays(today, -i);
    records.push(record);
  }

  records.sort((a, b) => b.finishedAt - a.finishedAt);
  useScoutResultStore.setState({ records });
}
