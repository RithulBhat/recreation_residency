import { useState } from 'react';
import { Ghost } from 'lucide-react';
import { cn } from '@/components/ui/cn';
import { pct } from './summary';
import { scoutNemeses, type ScoutNemesis, type ScoutSubjectRecord } from './scoutAggregate';

export interface ScoutNemesisListProps {
  subjects: Readonly<Record<string, ScoutSubjectRecord>>;
  limit?: number;
  className?: string;
}

/**
 * The headshot/logo, or the initials when ESPN has no asset. Images come from the CORS-enabled CDN
 * and are transparent PNGs, so they sit on a tinted tile rather than a white box.
 */
function SubjectFace({ record }: { record: ScoutSubjectRecord }) {
  const [broken, setBroken] = useState(false);
  const initials = record.name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0] ?? '')
    .join('')
    .toUpperCase();

  return (
    <span className="grid size-11 shrink-0 place-items-center overflow-hidden rounded-2xl bg-surface-strong">
      {record.image && !broken ? (
        <img
          src={record.image}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setBroken(true)}
          className="size-full object-contain object-top"
        />
      ) : (
        <span className="font-mono text-xs font-bold text-muted" aria-hidden>
          {initials}
        </span>
      )}
    </span>
  );
}

function Row({ n, worst }: { n: ScoutNemesis; worst: number }) {
  return (
    <li className="flex items-center gap-3">
      <SubjectFace record={n} />
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-1.5">
          <span className="min-w-0 truncate text-sm font-semibold text-fg">{n.name}</span>
          {n.teamAbbr && <span className="font-mono text-[10px] uppercase text-muted">{n.teamAbbr}</span>}
        </span>
        <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-surface-strong" aria-hidden>
          <span
            className="block h-full rounded-full bg-danger"
            style={{ width: `${Math.max((n.misses / Math.max(worst, 1)) * 100, 6)}%` }}
          />
        </span>
      </span>
      <span className="shrink-0 text-right">
        <span className="block font-mono text-sm tabular text-danger">
          {n.misses} {n.misses === 1 ? 'miss' : 'misses'}
        </span>
        <span className="block font-mono text-[10px] tabular text-muted">
          {pct(n.accuracy)} of {n.timesSeen}
        </span>
      </span>
    </li>
  );
}

/** The subjects that keep beating you — most misses first. */
export function ScoutNemesisList({ subjects, limit = 8, className }: ScoutNemesisListProps) {
  const rows = scoutNemeses(subjects, limit);
  const worst = rows.reduce((m, r) => Math.max(m, r.misses), 1);

  return (
    <div className={cn('glass rounded-4xl p-4 sm:p-6', className)} data-testid="scout-nemeses">
      <h3 className="mb-3 flex items-center gap-2 font-display text-base font-bold text-fg">
        <Ghost className="size-4 text-danger" aria-hidden />
        They keep beating you
      </h3>
      {rows.length === 0 ? (
        <p className="text-sm text-muted">
          Nothing has beaten you yet. Either you are very good, or you have not played enough.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((n) => (
            <Row key={n.key} n={n} worst={worst} />
          ))}
        </ul>
      )}
    </div>
  );
}
