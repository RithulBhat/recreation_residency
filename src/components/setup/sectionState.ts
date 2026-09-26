/** Remembered open/closed state of the collapsible setup sections (`sg:setup-sections`). */

const KEY = 'sg:setup-sections';

export function readOpenState(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: Record<string, boolean> = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v === 'boolean') out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

export function writeOpenState(id: string, open: boolean): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...readOpenState(), [id]: open }));
  } catch {
    /* private mode / quota — forget it */
  }
}
