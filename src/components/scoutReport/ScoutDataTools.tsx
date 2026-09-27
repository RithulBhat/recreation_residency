import { useRef, useState } from 'react';
import { Download, HardDriveDownload, Trash2, Upload } from 'lucide-react';
import { useScoutStatsStore } from '@/store/scoutStatsStore';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { toast } from '@/components/ui/Toast';
import { cn } from '@/components/ui/cn';

export interface ScoutDataToolsProps {
  /** Ran after a confirmed reset — the screen uses it to drop `?demo=1` so nothing re-seeds. */
  onAfterReset?: () => void;
  className?: string;
}

function fileName(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `highlight-scout-stats-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.json`;
}

/**
 * Export / import / reset the Scout ledger (`sg:scout-stats`).
 *
 * Songooner's stats live in a different key and are untouched by everything here. Reset sits behind a
 * confirm because it takes the rank, the badges and every per-subject row with it.
 */
export function ScoutDataTools({ onAfterReset, className }: ScoutDataToolsProps) {
  const exportStats = useScoutStatsStore((s) => s.export);
  const importStats = useScoutStatsStore((s) => s.import);
  const reset = useScoutStatsStore((s) => s.reset);
  const runs = useScoutStatsStore((s) => s.runs.length);
  const subjects = useScoutStatsStore((s) => Object.keys(s.subjects).length);
  const badges = useScoutStatsStore((s) => s.achievements.length);
  const dailies = useScoutStatsStore((s) => Object.keys(s.daily).length);

  const fileRef = useRef<HTMLInputElement>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const onExport = () => {
    try {
      const blob = new Blob([exportStats()], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName();
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast({ title: 'Scouting record exported', description: fileName(), tone: 'success' });
    } catch {
      toast({ title: "Couldn't export", description: 'Your browser blocked the download.', tone: 'danger' });
    }
  };

  const onPickFile = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      const text = await file.text();
      const ok = importStats(text);
      if (ok) {
        toast({ title: 'Scouting record imported', description: file.name, tone: 'success' });
      } else {
        toast({
          title: "That file didn't look right",
          description: 'Expecting a Highlight Scout stats export.',
          tone: 'danger',
        });
      }
    } catch {
      toast({ title: "Couldn't read that file", tone: 'danger' });
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <div className={cn('glass rounded-4xl p-4 sm:p-6', className)} data-testid="scout-data-tools">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 font-display text-base font-bold text-fg">
            <HardDriveDownload className="size-4 text-accent" aria-hidden />
            Your data
          </h3>
          <p className="mt-1 max-w-prose text-sm text-muted">
            This record lives in this browser only — no account, no server. Songooner's stats are a separate ledger and
            stay put. Take a backup before you clear anything.
          </p>
          <p className="mt-1 font-mono text-xs tabular text-muted">
            {runs} runs · {subjects} subjects · {badges} badges · {dailies} dailies
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" leadingIcon={<Download />} onClick={onExport} data-testid="scout-export">
            Export
          </Button>
          <Button
            variant="secondary"
            leadingIcon={<Upload />}
            loading={busy}
            onClick={() => fileRef.current?.click()}
            data-testid="scout-import"
          >
            Import
          </Button>
          <Button variant="danger" leadingIcon={<Trash2 />} onClick={() => setConfirmOpen(true)} data-testid="scout-reset">
            Reset
          </Button>
        </div>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        className="sr-only"
        aria-label="Import a Highlight Scout stats file"
        onChange={(e) => void onPickFile(e.target.files?.[0])}
      />

      <Dialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Erase your scouting record?"
        description="Your rank, badges, league map and every per-subject row go. This cannot be undone."
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmOpen(false)}>
              Keep it
            </Button>
            <Button
              variant="danger"
              leadingIcon={<Trash2 />}
              onClick={() => {
                reset();
                setConfirmOpen(false);
                onAfterReset?.();
                toast({ title: 'Scouting record reset', description: 'Back to Waterboy.', tone: 'warn' });
              }}
              data-testid="scout-reset-confirm"
            >
              Erase everything
            </Button>
          </>
        }
      >
        <p className="text-sm text-muted">
          Tip: hit <strong className="font-semibold text-fg">Export</strong> first — the file re-imports in one click.
        </p>
      </Dialog>
    </div>
  );
}
