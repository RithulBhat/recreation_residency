import { useRef, useState } from 'react';
import { Download, HardDriveDownload, Trash2, Upload } from 'lucide-react';
import { useStatsStore } from '@/store/statsStore';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { toast } from '@/components/ui/Toast';
import { cn } from '@/components/ui/cn';

export interface DataToolsProps {
  className?: string;
}

function fileName(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `songooner-stats-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.json`;
}

/** Export / import / reset the local stats blob. Everything stays in this browser. */
export function DataTools({ className }: DataToolsProps) {
  const exportStats = useStatsStore((s) => s.export);
  const importStats = useStatsStore((s) => s.import);
  const reset = useStatsStore((s) => s.reset);
  const games = useStatsStore((s) => s.totals.games);
  const trackCount = useStatsStore((s) => Object.keys(s.tracks).length);
  const achievementCount = useStatsStore((s) => s.achievements.length);

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
      toast({ title: 'Stats exported', description: fileName(), tone: 'success' });
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
        toast({ title: 'Stats imported', description: file.name, tone: 'success' });
      } else {
        toast({ title: "That file didn't look right", description: 'Expecting a Songooner stats export.', tone: 'danger' });
      }
    } catch {
      toast({ title: "Couldn't read that file", tone: 'danger' });
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <div className={cn('glass rounded-4xl p-4 sm:p-6', className)}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 font-display text-base font-bold text-fg">
            <HardDriveDownload className="size-4 text-accent" aria-hidden />
            Your data
          </h3>
          <p className="mt-1 text-sm text-muted">
            Everything lives in this browser only — no account, no server. Take a backup before you clear it.
          </p>
          <p className="mt-1 font-mono text-xs tabular text-muted">
            {games} games · {trackCount} songs · {achievementCount} achievements
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" leadingIcon={<Download />} onClick={onExport}>
            Export
          </Button>
          <Button
            variant="secondary"
            leadingIcon={<Upload />}
            loading={busy}
            onClick={() => fileRef.current?.click()}
          >
            Import
          </Button>
          <Button variant="danger" leadingIcon={<Trash2 />} onClick={() => setConfirmOpen(true)}>
            Reset
          </Button>
        </div>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        className="sr-only"
        aria-label="Import a Songooner stats file"
        onChange={(e) => void onPickFile(e.target.files?.[0])}
      />

      <Dialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Erase every stat?"
        description="Your rank, streaks, achievements and song history all go. This cannot be undone."
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmOpen(false)}>
              Keep them
            </Button>
            <Button
              variant="danger"
              leadingIcon={<Trash2 />}
              onClick={() => {
                reset();
                setConfirmOpen(false);
                toast({ title: 'Stats reset', description: 'Fresh start. Level 1 again.', tone: 'warn' });
              }}
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
