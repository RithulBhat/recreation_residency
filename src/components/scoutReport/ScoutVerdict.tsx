import { useState } from 'react';
import { Check, Copy, Gavel, Play } from 'lucide-react';
import { MIN_SCOUT_REPORT_ROUNDS, type ScoutReport } from '@/scout/report';
import { R } from '@/routes';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { cn } from '@/components/ui/cn';
import { drillTarget, pct } from './format';

export interface ScoutVerdictProps {
  report: ScoutReport;
  className?: string;
}

/** Size ramp: the first judgement is the loudest thing on the page, the rest step down once. */
const LINE_SIZE = [
  'text-[1.75rem] leading-[1.1] sm:text-4xl lg:text-5xl',
  'text-xl leading-tight sm:text-2xl lg:text-3xl',
] as const;

/**
 * The verdict — honest lines out of `scoutVerdict`, given the weight they deserve.
 *
 * Strength lines take the accent gradient, weaknesses go danger-red, and the coverage line drops to
 * a mono footnote. With fewer than `MIN_SCOUT_REPORT_ROUNDS` graded rounds the pure layer refuses to
 * judge, so this renders that refusal as the headline plus a progress bar towards it — the section
 * is never hidden, because "not enough tape" is itself worth telling.
 */
export function ScoutVerdict({ report, className }: ScoutVerdictProps) {
  const [copied, setCopied] = useState(false);
  const judgements = report.verdict.filter((l) => l.tone !== 'coverage');
  const coverage = report.verdict.find((l) => l.tone === 'coverage');
  const played = Math.min(report.rounds, MIN_SCOUT_REPORT_ROUNDS);
  const drill = drillTarget(report.weakest);

  const copy = () => {
    void navigator.clipboard
      ?.writeText(report.verdictLine)
      .then(() => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => {
        /* clipboard blocked — the text is on screen anyway */
      });
  };

  return (
    <div
      className={cn('glass noise relative overflow-hidden rounded-5xl p-5 sm:p-8 lg:p-10', className)}
      data-testid="scout-verdict"
    >
      <div
        className="pointer-events-none absolute -right-24 -top-28 size-72 rounded-full bg-accent-3 opacity-20 blur-3xl"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -bottom-32 -left-20 size-72 rounded-full bg-accent opacity-15 blur-3xl"
        aria-hidden
      />

      <div className="relative flex flex-wrap items-center justify-between gap-3">
        <div className="eyebrow-readable flex items-center gap-2">
          <Gavel className="size-3.5" aria-hidden />
          The verdict
        </div>
        {report.enoughData && report.verdictLine !== '' && (
          <Button
            variant="ghost"
            size="sm"
            leadingIcon={copied ? <Check /> : <Copy />}
            onClick={copy}
            data-testid="scout-verdict-copy"
          >
            {copied ? 'Copied' : 'Copy verdict'}
          </Button>
        )}
      </div>

      <div className="relative mt-4 border-l-2 border-accent/40 pl-4 sm:mt-5 sm:pl-6">
        <div className="flex flex-col gap-2 sm:gap-3">
          {judgements.map((line, i) => (
            <p
              key={line.text}
              className={cn(
                'font-display font-black tracking-tight text-balance',
                LINE_SIZE[i === 0 ? 0 : 1],
                line.tone === 'strength' && 'text-gradient',
                line.tone === 'weakness' && 'text-danger',
                (line.tone === 'balanced' || line.tone === 'insufficient') && 'text-fg',
              )}
            >
              {line.text}
            </p>
          ))}
        </div>
      </div>

      {!report.enoughData ? (
        <div className="relative mt-6 flex flex-col gap-4 sm:mt-7 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0 flex-1 sm:max-w-md">
            <ProgressBar
              value={played / MIN_SCOUT_REPORT_ROUNDS}
              size="md"
              label={`${played} of ${MIN_SCOUT_REPORT_ROUNDS} rounds towards a verdict`}
              showValue
            />
            <p className="mt-2 text-sm text-muted">
              The card stays quiet until the numbers can carry it. Twenty graded rounds — two standard runs — and it
              starts naming your strongest room and your blind spot.
            </p>
          </div>
          <Button variant="glow" to={R.scout.setup} leadingIcon={<Play className="fill-current" />}>
            Play a run
          </Button>
        </div>
      ) : (
        <div className="relative mt-6 flex flex-col gap-4 sm:mt-7 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
          {report.strongest && (
            <Badge tone="success">
              Sharpest · {report.strongest.label} {pct(report.strongest.accuracy)}
            </Badge>
          )}
          {report.weakest && report.weakest !== report.strongest && (
            <Badge tone="danger">
              Weakest · {report.weakest.label} {pct(report.weakest.accuracy)}
            </Badge>
          )}
          {coverage && (
            <span className="font-mono text-xs tabular text-muted" data-testid="scout-verdict-coverage">
              {coverage.text}
            </span>
          )}
          </div>
          {drill && (
            <Button
              variant="glow"
              to={`${R.scout.setup}?packs=${drill.packId}`}
              leadingIcon={<Play className="fill-current" />}
              className="shrink-0"
              data-testid="scout-verdict-drill"
            >
              {drill.label}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
