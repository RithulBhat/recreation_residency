import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { getPack } from '@/lib/catalog';
import type { TrackRecord } from '@/stats/types';
import { AlbumArt } from '@/components/AlbumArt';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { cn } from '@/components/ui/cn';
import { absoluteTime, clipLabel, relativeTime } from './format';

export interface HistoryListProps {
  /** The persisted per-track history, keyed by Deezer track id. */
  tracks: Record<number, TrackRecord>;
  /** Rows per page. Default 50. */
  pageSize?: number;
  className?: string;
}

function matches(track: TrackRecord, needle: string): boolean {
  if (needle === '') return true;
  return (
    track.title.toLowerCase().includes(needle) ||
    track.artist.toLowerCase().includes(needle)
  );
}

/** "Songs you've met" — every track the player has ever heard, newest first. */
export function HistoryList({ tracks, pageSize = 50, className }: HistoryListProps) {
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(pageSize);

  const all = useMemo(
    () => Object.values(tracks).sort((a, b) => b.lastSeen - a.lastSeen),
    [tracks],
  );

  const needle = query.trim().toLowerCase();
  const filtered = useMemo(() => all.filter((t) => matches(t, needle)), [all, needle]);
  const visible = filtered.slice(0, limit);

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <div className="flex flex-wrap items-center gap-3">
        <Input
          type="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setLimit(pageSize);
          }}
          placeholder="Search your songs…"
          aria-label="Search your song history"
          leadingIcon={<Search />}
          containerClassName="min-w-48 flex-1"
        />
        <p className="font-mono text-xs tabular text-muted">
          {filtered.length === all.length
            ? `${all.length} ${all.length === 1 ? 'song' : 'songs'}`
            : `${filtered.length} of ${all.length}`}
        </p>
      </div>

      {visible.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted">
          {all.length === 0 ? 'No songs yet — play a round.' : `Nothing matches “${query.trim()}”.`}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {visible.map((t) => {
            const pack = t.packId ? getPack(t.packId) : undefined;
            const acc = t.timesSeen > 0 ? t.timesCorrect / t.timesSeen : 0;
            const fast = t.fastestClip !== null && t.fastestClip <= 0.5;
            return (
              <li key={t.trackId} className="glass flex items-center gap-3 rounded-3xl p-2 pr-3">
                <AlbumArt
                  src={t.cover}
                  alt={`${t.title} by ${t.artist}`}
                  blur={0}
                  size={44}
                  rounded="xl"
                  emoji={pack?.emoji ?? '🎵'}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-fg">{t.title}</p>
                  <p className="truncate text-xs text-muted">
                    {t.artist}
                    {pack && <span className="hidden sm:inline"> · {pack.emoji} {pack.name}</span>}
                  </p>
                </div>
                <div className="hidden shrink-0 text-right sm:block">
                  <p className="font-mono text-[10px] tabular text-muted" title={absoluteTime(t.lastSeen)}>
                    {relativeTime(t.lastSeen)}
                  </p>
                </div>
                {t.fastestClip !== null && (
                  <Badge tone={fast ? 'accent' : 'neutral'} size="sm" className="shrink-0">
                    {clipLabel(t.fastestClip)}
                  </Badge>
                )}
                <div className="w-14 shrink-0 text-right">
                  <p
                    className={cn(
                      'font-mono text-sm tabular',
                      t.timesCorrect === 0 ? 'text-danger' : acc >= 0.5 ? 'text-success' : 'text-fg',
                    )}
                  >
                    {t.timesCorrect}/{t.timesSeen}
                  </p>
                  <p className="font-mono text-[10px] uppercase tracking-wider text-muted">named</p>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {filtered.length > visible.length && (
        <Button
          variant="secondary"
          onClick={() => setLimit((n) => n + pageSize)}
          className="self-center"
        >
          Show {Math.min(pageSize, filtered.length - visible.length)} more
        </Button>
      )}
    </div>
  );
}
