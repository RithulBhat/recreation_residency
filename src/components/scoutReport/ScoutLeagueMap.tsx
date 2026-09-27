import { Check, Star } from 'lucide-react';
import type { ScoutReport, ScoutTeamHeat } from '@/scout/report';
import { Badge } from '@/components/ui/Badge';
import { cn } from '@/components/ui/cn';
import { groupTeamsByDivision, pct, teamCellLabel, teamSpineStyle, teamTintStyle } from './format';

export interface ScoutLeagueMapProps {
  report: ScoutReport;
  className?: string;
}

function TeamCell({ team, mostScouted }: { team: ScoutTeamHeat; mostScouted: boolean }) {
  const cold = team.seen === 0;
  return (
    <li
      title={teamCellLabel(team)}
      style={teamTintStyle(team)}
      className={cn(
        'relative flex min-h-[3.75rem] flex-col justify-between overflow-hidden rounded-2xl border p-1.5 sm:min-h-[4.5rem] sm:p-2',
        cold ? 'border-dashed border-border bg-surface/30' : 'border-border-strong shadow-card',
      )}
      data-testid="scout-map-cell"
      data-team={team.abbr}
      data-known={team.correct > 0 ? 'yes' : 'no'}
    >
      <span className="sr-only">{teamCellLabel(team)}</span>

      <span className="flex items-start justify-between gap-1" aria-hidden>
        <span className={cn('font-mono text-[11px] font-bold leading-none tracking-tight sm:text-xs', cold ? 'text-muted' : 'text-fg')}>
          {team.abbr}
        </span>
        {mostScouted ? (
          <Star className="size-3 shrink-0 fill-current text-warn" aria-hidden />
        ) : (
          <span className="text-[11px] leading-none sm:text-xs" aria-hidden>
            {team.emoji}
          </span>
        )}
      </span>

      <span className="flex items-end justify-between gap-1" aria-hidden>
        <span
          className={cn(
            'font-mono text-xs font-semibold leading-none tabular sm:text-sm',
            cold ? 'text-muted/60' : 'text-fg',
          )}
        >
          {cold ? '—' : pct(team.accuracy)}
        </span>
        <span className="hidden font-mono text-[9px] leading-none tabular text-muted sm:inline">
          {cold ? '' : `${team.correct}/${team.seen}`}
        </span>
      </span>

      <span className="absolute inset-x-0 bottom-0 h-1 bg-border/40" aria-hidden>
        <span className="block h-full rounded-r-full transition-[width] duration-700 ease-out" style={teamSpineStyle(team)} />
      </span>
    </li>
  );
}

/**
 * All 32 franchises as a league map — the page's centrepiece.
 *
 * Each cell is washed in the club's OWN colour, at an opacity set by how much of that roster you can
 * name, with a solid bar of the same colour along the bottom for the exact share. The wash tops out
 * well below full strength on purpose: a cell must stay readable in every theme whether the club
 * plays in navy or in gold, so knowledge is carried by the bar, never by contrast. Divisions you have
 * swept clean get a tick; the franchise you have seen most gets a star.
 */
export function ScoutLeagueMap({ report, className }: ScoutLeagueMapProps) {
  const conferences = groupTeamsByDivision(report.teams);
  const mostScouted = report.teams.reduce<ScoutTeamHeat | null>(
    (top, t) => (t.seen > 0 && (top === null || t.seen > top.seen) ? t : top),
    null,
  );

  return (
    <div className={cn('glass relative overflow-hidden rounded-4xl p-4 sm:p-6', className)} data-testid="scout-league-map">
      <div
        className="pointer-events-none absolute -right-24 -top-24 size-64 rounded-full bg-accent-2 opacity-15 blur-3xl"
        aria-hidden
      />

      <div className="relative mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="font-display text-lg font-bold text-fg">
          {report.teamsKnown === 0 ? (
            'Thirty-two rosters, none of them named yet.'
          ) : (
            <>
              <span className="text-gradient">{report.teamsKnown} of 32</span> franchises on your map
            </>
          )}
        </p>
        <div className="flex items-center gap-2">
          {report.divisionsSwept.length > 0 && (
            <Badge tone="success" size="sm">
              <Check className="size-3" aria-hidden />
              {report.divisionsSwept.length} swept
            </Badge>
          )}
          <span className="hidden items-center gap-3 font-mono text-[10px] uppercase tracking-wider text-muted sm:flex">
            <span className="flex items-center gap-1.5">
              <span className="size-3 rounded border border-dashed border-border" aria-hidden />
              never faced
            </span>
            <span className="flex items-center gap-1.5">
              <span className="relative size-3 overflow-hidden rounded border border-border-strong bg-surface-strong" aria-hidden>
                <span className="absolute inset-x-0 bottom-0 h-1/2 bg-accent" />
              </span>
              share named
            </span>
          </span>
        </div>
      </div>

      <div className="relative grid gap-4 lg:grid-cols-2 lg:gap-6">
        {conferences.map((conf) => (
          <section key={conf.conference} aria-label={`${conf.conference} franchises`}>
            <div className="mb-2 flex items-baseline justify-between gap-2 border-b border-border pb-1.5">
              <h3 className="font-display text-sm font-black uppercase tracking-[0.18em] text-fg">{conf.conference}</h3>
              <span className="font-mono text-[11px] tabular text-muted">{conf.known}/16 named</span>
            </div>
            <div className="flex flex-col gap-2.5">
              {conf.divisions.map((div) => (
                <div key={div.key}>
                  <div className="mb-1 flex items-center gap-1.5">
                    <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
                      {div.name.replace(`${conf.conference} `, '')}
                    </span>
                    {div.swept && (
                      <span className="inline-flex items-center gap-0.5 font-mono text-[10px] font-bold text-success">
                        <Check className="size-2.5" aria-hidden />
                        swept
                      </span>
                    )}
                    <span className="h-px flex-1 bg-border" aria-hidden />
                  </div>
                  <ul className="grid grid-cols-4 gap-1.5 sm:gap-2">
                    {div.teams.map((team) => (
                      <TeamCell key={team.teamId} team={team} mostScouted={mostScouted?.teamId === team.teamId} />
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>

      <p className="relative mt-4 text-xs text-muted">
        {report.teamsSeen === 0
          ? 'Play the Gauntlet — one subject per franchise — and this whole board lights up in a single run.'
          : `${report.teamsSeen} franchises scouted, ${report.teamsKnown} of them named. Each cell is washed in the club's own colour; the bar underneath is the share of their subjects you got.`}
      </p>
    </div>
  );
}
