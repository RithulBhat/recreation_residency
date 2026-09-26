import { useEffect, useState, type FormEvent } from 'react';
import { Link2, Plus, Search, Star } from 'lucide-react';
import type { ArtistSummary, Pack } from '@/types';
import { packFromAlbum, packFromArtist, packFromPlaylist, packFromSearch, parseDeezerUrl } from '@/lib/catalog';
import { getAlbumTracks, getPlaylist, jsonp, schedule, searchArtists } from '@/lib/deezer';
import { registerCustomPack } from '@/lib/customPacks';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { toast } from '@/components/ui/Toast';

type Tool = 'artist' | 'link' | 'search';

export interface CustomPackToolsProps {
  /** Called with the freshly registered pack (already selected by the caller if desired). */
  onAdd: (pack: Pack) => void;
}

interface DzArtist {
  id?: number;
  name?: string;
  picture_medium?: string;
  nb_fan?: number;
}

function compactFans(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M fans`;
  if (n >= 1000) return `${Math.round(n / 1000)}k fans`;
  return n > 0 ? `${n} fans` : '';
}

async function packFromUrl(url: string): Promise<Pack> {
  const ref = parseDeezerUrl(url);
  if (!ref) throw new Error('That does not look like a Deezer playlist, album or artist link.');
  if (ref.kind === 'playlist') return packFromPlaylist(await getPlaylist(ref.id));
  if (ref.kind === 'album') {
    const tracks = await getAlbumTracks(ref.id);
    return packFromAlbum(ref.id, tracks[0]?.album);
  }
  const raw = await schedule(() => jsonp<DzArtist>(`https://api.deezer.com/artist/${ref.id}`));
  return packFromArtist({ id: ref.id, name: raw.name ?? `Artist ${ref.id}`, picture: raw.picture_medium ?? '', fans: raw.nb_fan ?? 0 });
}

/** "Any artist" search, Deezer link paste, free-text search — each registers a custom pack. */
export function CustomPackTools({ onAdd }: CustomPackToolsProps) {
  const [tool, setTool] = useState<Tool>('artist');
  const [query, setQuery] = useState('');
  const [artists, setArtists] = useState<ArtistSummary[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Debounced artist search (300 ms).
  useEffect(() => {
    if (tool !== 'artist') return;
    const q = query.trim();
    if (q.length < 2) {
      setArtists([]);
      setBusy(false);
      return;
    }
    let alive = true;
    setBusy(true);
    setError(null);
    const timer = window.setTimeout(() => {
      searchArtists(q, 8)
        .then((list) => {
          if (!alive) return;
          setArtists(list);
          setBusy(false);
        })
        .catch(() => {
          if (!alive) return;
          setError('Could not reach Deezer. Check your connection.');
          setBusy(false);
        });
    }, 300);
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [query, tool]);

  const add = (pack: Pack) => {
    const registered = registerCustomPack(pack);
    onAdd(registered);
    toast.success(`${registered.emoji} ${registered.name} added`, 'Ready to play — it is in your packs now.');
    setQuery('');
    setArtists([]);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    if (!q || tool === 'artist') return;
    if (tool === 'search') {
      add(packFromSearch(q));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      add(await packFromUrl(q));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load that link.');
    } finally {
      setBusy(false);
    }
  };

  const switchTool = (next: Tool) => {
    setTool(next);
    setQuery('');
    setArtists([]);
    setError(null);
  };

  const placeholder = tool === 'artist' ? 'Try "Arijit Singh" or "Taylor Swift"' : tool === 'link' ? 'https://www.deezer.com/playlist/…' : '"90s rock ballads", "anime openings"…';
  const label = tool === 'artist' ? 'Any artist' : tool === 'link' ? 'Deezer playlist, album or artist link' : 'Search term';

  return (
    <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-3" aria-label="Build a custom pack">
      <SegmentedControl<Tool>
        aria-label="Custom pack source"
        size="sm"
        fullWidth
        value={tool}
        onChange={switchTool}
        options={[
          { value: 'artist', label: 'Any artist', icon: <Star /> },
          { value: 'link', label: 'Deezer link', icon: <Link2 /> },
          { value: 'search', label: 'Search term', icon: <Search /> },
        ]}
      />
      <Input
        type={tool === 'link' ? 'url' : 'search'}
        inputMode={tool === 'link' ? 'url' : 'search'}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={placeholder}
        aria-label={label}
        label={label}
        error={error}
        hint={tool === 'artist' ? 'Builds a pack from their top 100 tracks.' : tool === 'link' ? 'Paste a share link from the Deezer app or site.' : 'Whatever Deezer finds for the phrase — up to 100 songs.'}
        leadingIcon={tool === 'artist' ? <Star /> : tool === 'link' ? <Link2 /> : <Search />}
        trailing={
          tool !== 'artist' ? (
            <Button type="submit" size="sm" loading={busy} disabled={!query.trim()} leadingIcon={<Plus />}>
              Add
            </Button>
          ) : undefined
        }
      />

      {tool === 'artist' && (
        <div aria-live="polite">
          {busy && <p className="px-1 text-xs text-muted">Searching Deezer…</p>}
          {!busy && query.trim().length >= 2 && artists.length === 0 && !error && <p className="px-1 text-xs text-muted">No artists found.</p>}
          {artists.length > 0 && (
            <ul className="grid gap-1.5 sm:grid-cols-2" aria-label="Artist results">
              {artists.map((a) => (
                <li key={a.id}>
                  <button
                    type="button"
                    onClick={() => add(packFromArtist(a))}
                    className="glass flex w-full items-center gap-3 rounded-2xl p-2 pr-3 text-left transition-colors hover:bg-surface-strong"
                  >
                    {a.picture ? (
                      <img src={a.picture} alt="" className="size-11 shrink-0 rounded-full object-cover" loading="lazy" />
                    ) : (
                      <span className="grid size-11 shrink-0 place-items-center rounded-full bg-surface-strong text-lg" aria-hidden>
                        ⭐
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-fg">{a.name}</span>
                      <span className="block truncate text-xs text-muted">{compactFans(a.fans) || 'Top tracks'}</span>
                    </span>
                    <Plus className="size-4 shrink-0 text-accent" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </form>
  );
}
