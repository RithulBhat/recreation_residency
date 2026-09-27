/**
 * Screenshot harness for the choice-shaped stages. DEV ONLY — nothing imports it, so it is not in
 * any bundle (Vite builds from the root `index.html`; this page is served straight off the dev
 * server at `/src/components/scoutPuzzles/__harness__/index.html`).
 *
 * It drives the boards exactly as the Play screen will — `buildPool`'s subjects off the REAL baked
 * dataset, `buildStages`' rungs — which is the point: the screenshots show real names, real numbers
 * and real ESPN headshots rather than a fixture's idea of them.
 *
 * URL parameters
 *   ?state=board   every mode at a middle rung (the default)
 *   ?state=rung0   every mode at rung 0 — the hardest thing the round ever shows
 *   ?state=reveal  every mode with the answer out
 *   ?state=ladder&mode=oddOneOut   one mode, every rung of a four-try ladder
 *   ?theme=midnight|vinyl|y2k|daylight
 *   ?width=720     clamp each board to the Play screen's hero width
 */

import { StrictMode, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import '@/index.css';
import playersJson from '@/data/nfl/players.json';
import statlinesJson from '@/data/nfl/statlines.json';
import teamsJson from '@/data/nfl/teams.json';
import { SCOUT_PUZZLE_MODES, buildPuzzleIndex, buildScoutPuzzleSpecs, type ScoutPuzzleDataset } from '@/scout/puzzles';
import { buildStages } from '@/scout/stages';
import { buildPuzzleSubject } from '@/scout/subjects';
import { scoutMode } from '@/scout/packs';
import type { NflPlayer, NflTeam, ScoutPuzzleMode, ScoutStage, ScoutSubject, StatLine } from '@/scout/types';
import { ScoutPuzzleStage } from '../PuzzleStage';

const dataset: ScoutPuzzleDataset = {
  players: playersJson as unknown as NflPlayer[],
  teams: teamsJson as unknown as NflTeam[],
  statLines: statlinesJson as unknown as StatLine[],
};

const params = new URLSearchParams(window.location.search);
const theme = params.get('theme') ?? 'midnight';
const state = params.get('state') ?? 'board';
const width = params.get('width');
const seed = params.get('seed') ?? 'harness-2026';
const only = params.get('mode') as ScoutPuzzleMode | null;
const TRIES = 4;

document.documentElement.dataset.theme = theme;

interface Round {
  mode: ScoutPuzzleMode;
  subject: ScoutSubject;
  stages: ScoutStage[];
}

function buildRounds(): Round[] {
  const index = buildPuzzleIndex(dataset);
  const specs = buildScoutPuzzleSpecs({
    dataset,
    index,
    modes: only ? [only] : [...SCOUT_PUZZLE_MODES],
    difficulty: 'any',
    seed,
    playerEligible: (p) => p.fame >= 70,
    limit: 4,
  });
  const out: Round[] = [];
  for (const mode of only ? [only] : SCOUT_PUZZLE_MODES) {
    const spec = specs.find((s) => s.mode === mode);
    if (!spec) continue;
    const subject = buildPuzzleSubject(spec);
    if (!subject) continue;
    out.push({ mode, subject, stages: buildStages(mode, subject, TRIES) });
  }
  return out;
}

function Board({ round, rung, revealed }: { round: Round; rung: number; revealed: boolean }) {
  const info = scoutMode(round.mode);
  return (
    <section className="min-w-0" style={width === null ? undefined : { maxWidth: `${width}px` }}>
      <h2 className="mb-2 font-mono text-[11px] uppercase tracking-[0.16em] text-muted">
        {info?.emoji} {info?.name} · rung {rung + 1}/{round.stages.length}
        {revealed ? ' · revealed' : ''}
      </h2>
      <ScoutPuzzleStage
        mode={round.mode}
        subject={round.subject}
        stage={round.stages[rung]}
        revealed={revealed}
        onChoose={() => undefined}
        hotkeys={false}
      />
      <ul className="mt-2 flex flex-wrap gap-1.5">
        {round.stages[rung].clues.map((c) => (
          <li key={`${c.label}:${c.value}`} className="rounded-lg border border-border bg-surface px-2 py-1 text-[11px] text-muted">
            <span className="font-mono uppercase tracking-[0.1em]">{c.label}</span>: <span className="text-fg">{c.value}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Harness() {
  const rounds = useMemo(buildRounds, []);
  const middle = Math.min(TRIES - 1, 2);
  return (
    <main className="min-h-screen bg-bg p-6 text-fg">
      <h1 className="mb-1 font-display text-xl font-bold">Highlight Scout · choice-shaped stages</h1>
      <p className="mb-5 text-sm text-muted">
        theme <code className="font-mono">{theme}</code> · state <code className="font-mono">{state}</code> · seed{' '}
        <code className="font-mono">{seed}</code>
      </p>
      {state === 'ladder' ? (
        <div className="grid gap-6 xl:grid-cols-2">
          {rounds.flatMap((round) =>
            round.stages.map((_, rung) => (
              <Board key={`${round.mode}-${rung}`} round={round} rung={rung} revealed={false} />
            )),
          )}
          {rounds.map((round) => (
            <Board key={`${round.mode}-reveal`} round={round} rung={round.stages.length - 1} revealed />
          ))}
        </div>
      ) : (
        <div className="grid gap-6 xl:grid-cols-2">
          {rounds.map((round) => (
            <Board
              key={round.mode}
              round={round}
              rung={state === 'rung0' ? 0 : state === 'reveal' ? round.stages.length - 1 : middle}
              revealed={state === 'reveal'}
            />
          ))}
        </div>
      )}
    </main>
  );
}

const host = document.getElementById('root');
if (host) {
  createRoot(host).render(
    <StrictMode>
      <Harness />
    </StrictMode>,
  );
}
